package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.BacktestDtos.ArenaEntry;
import com.quantsim.dto.BacktestDtos.DuelFinalEntry;
import com.quantsim.dto.BacktestDtos.EquityPoint;
import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.dto.BacktestDtos.RunResponse;
import com.quantsim.dto.BacktestDtos.StockInfo;
import com.quantsim.dto.BacktestDtos.TunePoint;
import com.quantsim.dto.BacktestDtos.TuneRequest;
import com.quantsim.dto.BacktestDtos.TuneResponse;
import com.quantsim.entity.BacktestResult;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.service.BacktestEngine.Simulation;
import com.quantsim.service.BacktestEngine.Strategy;
import com.quantsim.service.BacktestEngine.StrategyParams;
import com.quantsim.service.BacktestTuner.Grid;
import com.quantsim.service.BacktestTuner.GridPoint;

import lombok.RequiredArgsConstructor;

/**
 * 策略回测竞技场门面: 玩家配置经典/自定义策略在整段历史数据上回测。
 * 模拟内核在 BacktestEngine, 调参网格在 BacktestTuner; 本类负责行情加载、
 * 入榜落库、积分任务与榜单查询 (职责拆分见 2026-10 拆分记录)。
 */
@Service
@RequiredArgsConstructor
public class BacktestService {

    private final StockRepository stockRepository;
    private final UserService userService;
    private final BacktestResultRepository backtestRepository;
    private final MarketDataService marketData;
    private final GameProperties props;
    private final PointsService pointsService;
    private final BacktestEngine engine;
    private final BacktestTuner tuner;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<StockInfo> listStocks() {
        return stockRepository.findByHiddenFalse(Sort.by("code")).stream()
                .map(s -> new StockInfo(s.getCode(), s.getName(), s.getMarket().name()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ArenaEntry> arenaLeaderboard(String season) {
        String filter = season == null || season.isBlank() ? null : season.trim();
        return backtestRepository.findArenaLeaderboard(filter, PageRequest.of(0, props.getLeaderboardSize())).stream()
                .map(row -> {
                    BacktestResult b = (BacktestResult) row[0];
                    return new ArenaEntry(b.getBacktestId(), (String) row[1],
                            (String) row[3], (String) row[2],
                            b.getStrategy(), b.getParams(), b.getTotalReturn(),
                            b.getSharpeRatio(), b.getMaxDrawdown(), b.getTradeCount());
                })
                .toList();
    }

    @Transactional
    public RunResponse run(RunRequest request, Long authUserId) {
        Strategy strategy = Enums.parse(request.strategy(), Strategy.class, "策略");
        Stock stock = loadVisibleStock(request.stockCode());
        List<DailyPrice> prices = loadPrices(stock);
        Market market = stock.getMarket();

        BigDecimal initial = props.getInitialCash();
        StrategyParams sp = engine.resolveParams(strategy, request);
        Simulation sim = engine.simulate(strategy, sp, prices, market, initial);

        int n = prices.size();
        BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
        BigDecimal annualReturn = engine.annualize(sim.finalEquity, initial, n);
        BigDecimal sharpe = engine.sharpeRatio(sim.equity);
        BigDecimal maxDd = engine.maxDrawdown(sim.equity);
        BigDecimal winRate = sim.roundTrips > 0
                ? BigDecimal.valueOf((double) sim.wins / sim.roundTrips).setScale(4, RoundingMode.HALF_UP)
                : null;

        // 与结算复盘同口径的扩展风险指标 (仅随响应下发, 不落库)
        double[] dailyReturns = RiskMath.dailyReturns(Arrays.asList(sim.equity));
        BigDecimal volatility = RiskMath.volatility(dailyReturns);
        BigDecimal sortino = RiskMath.sortino(dailyReturns);
        BigDecimal dayWinRate = RiskMath.winRate(dailyReturns);
        BigDecimal plRatio = RiskMath.profitLossRatio(dailyReturns);

        // 前 70% / 后 30% 分段收益: 两段差距悬殊往往意味着参数只拟合了前段行情 (过拟合预警)
        int split = (int) (n * 0.7);
        BigDecimal inSampleReturn = null;
        BigDecimal outSampleReturn = null;
        if (split >= 2 && n - split >= 2 && sim.equity[split - 1].signum() > 0) {
            inSampleReturn = TradeMath.returnRate(sim.equity[split - 1], initial);
            outSampleReturn = TradeMath.returnRate(sim.finalEquity, sim.equity[split - 1]);
        }

        // 买入持有基准曲线 (同规则: 首日收盘整手全仓, 含买入费用)
        BigDecimal[] holdCurve = engine.buyAndHoldCurve(prices, initial, market);
        BigDecimal holdReturn = TradeMath.returnRate(holdCurve[n - 1], initial);

        // 预回测 (策略擂台搭建页的试跑): 只返回结果, 不入榜不落库不发任务奖励,
        // 否则调参过程会刷出一串垃圾榜单记录
        Long backtestId = null;
        if (!Boolean.TRUE.equals(request.preview())) {
            // 已登录记会话身份; 游客昵称撞注册用户名会被拒 (防冒名入榜)
            User user = userService.resolve(request.username(), authUserId);
            BacktestResult result = new BacktestResult();
            result.setSeason(java.time.YearMonth.now(GameService.GAME_ZONE).toString());
            result.setUserId(user.getUserId());
            result.setStockId(stock.getStockId());
            result.setStrategy(strategy.name());
            result.setParams(sp.label());
            result.setStartDate(prices.get(0).getTradeDate());
            result.setEndDate(prices.get(n - 1).getTradeDate());
            result.setTotalReturn(totalReturn);
            result.setAnnualReturn(annualReturn);
            result.setSharpeRatio(sharpe);
            result.setMaxDrawdown(maxDd);
            result.setTradeCount(sim.tradeCount);
            result.setWinRate(winRate);
            result.setEquityCurve(sampleCurveJson(sim.equity)); // 擂台结算页对比用
            backtestRepository.save(result);
            pointsService.awardBacktest(user.getUserId()); // 每日任务: 首次回测 +20
            backtestId = result.getBacktestId();
        }

        List<EquityPoint> curve = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            curve.add(new EquityPoint(prices.get(i).getTradeDate(), sim.equity[i], holdCurve[i]));
        }

        return new RunResponse(backtestId, stock.getCode(), stock.getName(),
                strategy.name(), sp.label(),
                prices.get(0).getTradeDate(), prices.get(n - 1).getTradeDate(), n,
                totalReturn, annualReturn, sharpe, maxDd, sim.tradeCount, winRate,
                holdReturn, volatility, sortino, dayWinRate, plRatio,
                inSampleReturn, outSampleReturn, curve);
    }

    /** 网格搜索最优参数 (先看总收益, 平手比夏普), 返回全网格供热力图, 再用最优参数正式回测入榜。 */
    @Transactional
    public TuneResponse tune(TuneRequest request, Long authUserId) {
        Strategy strategy = Enums.parse(request.strategy(), Strategy.class, "策略");
        Stock stock = loadVisibleStock(request.stockCode());
        List<DailyPrice> prices = loadPrices(stock);
        Market market = stock.getMarket();

        Grid grid = tuner.buildGrid(strategy);
        BigDecimal initial = props.getInitialCash();
        GridPoint best = null;
        BigDecimal bestReturn = null;
        BigDecimal bestSharpe = null;
        List<TunePoint> points = new ArrayList<>(grid.points().size());
        for (GridPoint gp : grid.points()) {
            Simulation sim = engine.simulate(strategy, gp.params(), prices, market, initial);
            BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
            BigDecimal sharpe = engine.sharpeRatio(sim.equity);
            points.add(new TunePoint(gp.x(), gp.y(), totalReturn, sharpe));
            if (best == null || better(totalReturn, sharpe, bestReturn, bestSharpe)) {
                best = gp;
                bestReturn = totalReturn;
                bestSharpe = sharpe;
            }
        }

        RunResponse result = run(best.rebuild().apply(request), authUserId);
        StrategyParams bp = best.params();
        return new TuneResponse(strategy.name(), grid.points().size(),
                strategy == Strategy.MA_CROSS ? bp.fast() : null,
                strategy == Strategy.MA_CROSS ? bp.slow() : null,
                strategy == Strategy.MOMENTUM ? bp.lookback() : null,
                strategy == Strategy.MEAN_REVERSION ? bp.maWindow() : null,
                strategy == Strategy.MEAN_REVERSION ? BigDecimal.valueOf(bp.threshold()) : null,
                best.bestParams(),
                grid.paramKeys(),
                points,
                result);
    }

    /**
     * 擂台结算: 当前赛季综合分 TOP N (含降采样净值曲线, 旧记录曲线为 null)。
     * 综合分在服务端对全赛季算: 之前按原始收益预选 TOP N 再由前端打综合分,
     * 高夏普低回撤的真·综合冠军可能在预选就被挤掉。
     * 口径与前端 qsCompositeScores 一致: 100×(0.5×收益 + 0.3×夏普 + 0.2×回撤反向), 榜内 min-max 归一,
     * 缺失值 (旧记录 sharpe/drawdown 为 null) 记中性 0.5, 不白送也不冤枉。
     */
    @Transactional(readOnly = true)
    public List<DuelFinalEntry> duelFinal(int limit) {
        String season = java.time.YearMonth.now(GameService.GAME_ZONE).toString();
        List<Object[]> rows = backtestRepository.findArenaLeaderboard(season, PageRequest.of(0, 500));
        double[] r = normalize(rows, b -> b.getTotalReturn(), false);
        double[] s = normalize(rows, b -> b.getSharpeRatio(), false);
        double[] d = normalize(rows, b -> b.getMaxDrawdown(), true);
        record Scored(Object[] row, int score) {}
        List<Scored> scored = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            scored.add(new Scored(rows.get(i),
                    (int) Math.round(100 * (0.5 * r[i] + 0.3 * s[i] + 0.2 * d[i]))));
        }
        return scored.stream()
                .sorted(java.util.Comparator.comparingInt((Scored sc) -> sc.score).reversed())
                .limit(Math.min(Math.max(limit, 1), 10))
                .map(sc -> {
                    BacktestResult b = (BacktestResult) sc.row[0];
                    return new DuelFinalEntry(b.getBacktestId(), (String) sc.row[1], (String) sc.row[2],
                            (String) sc.row[3], b.getStrategy(), b.getParams(),
                            b.getTotalReturn(), b.getSharpeRatio(), b.getMaxDrawdown(),
                            sc.score, b.getEquityCurve());
                })
                .toList();
    }

    // ---------- helpers ----------

    /** 场景行情不对公开接口暴露 (防比对泄题, 同 LabController)。 */
    private Stock loadVisibleStock(String stockCode) {
        return stockRepository.findByCode(stockCode.trim())
                .filter(st -> !st.isHidden())
                .orElseThrow(() -> new NotFoundException("股票不存在: " + stockCode));
    }

    private List<DailyPrice> loadPrices(Stock stock) {
        List<DailyPrice> prices = marketData.load(stock.getStockId()).prices();
        int minDays = props.getBacktestMinDays();
        if (prices.size() < minDays) {
            throw new BusinessException("该股票历史数据不足 " + minDays + " 天，无法回测");
        }
        return prices;
    }

    /** 策略净值降采样成 ≤150 点的 JSON 数组 (结算页画多曲线够用, 控制行体积)。 */
    private String sampleCurveJson(BigDecimal[] equity) {
        try {
            int step = Math.max(1, (int) Math.ceil(equity.length / 150.0));
            List<BigDecimal> pts = new ArrayList<>();
            for (int i = 0; i < equity.length; i += step) {
                pts.add(equity[i].setScale(2, RoundingMode.HALF_UP));
            }
            if ((equity.length - 1) % step != 0) { // 终点必留, 但别和循环末点重复
                pts.add(equity[equity.length - 1].setScale(2, RoundingMode.HALF_UP));
            }
            return objectMapper.writeValueAsString(pts);
        } catch (Exception e) {
            return null; // 曲线是增值信息, 序列化失败不拖垮入榜
        }
    }

    private boolean better(BigDecimal ret, BigDecimal sharpe, BigDecimal bestRet, BigDecimal bestSharpe) {
        int cmp = ret.compareTo(bestRet);
        if (cmp != 0) {
            return cmp > 0;
        }
        return sharpe != null && (bestSharpe == null || sharpe.compareTo(bestSharpe) > 0);
    }

    /** 榜内 min-max 归一: null 记中性 0.5; invert=true 为"越小越好"(回撤)。 */
    private double[] normalize(List<Object[]> rows,
                               java.util.function.Function<BacktestResult, BigDecimal> get, boolean invert) {
        double lo = Double.POSITIVE_INFINITY;
        double hi = Double.NEGATIVE_INFINITY;
        Double[] vals = new Double[rows.size()];
        for (int i = 0; i < rows.size(); i++) {
            BigDecimal v = get.apply((BacktestResult) rows.get(i)[0]);
            if (v != null) {
                vals[i] = v.doubleValue();
                lo = Math.min(lo, vals[i]);
                hi = Math.max(hi, vals[i]);
            }
        }
        double[] out = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) {
            double n = (vals[i] == null || hi == lo) ? 0.5 : (vals[i] - lo) / (hi - lo);
            out[i] = invert ? 1 - n : n;
        }
        return out;
    }
}
