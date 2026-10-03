package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.BacktestDtos.ArenaEntry;
import com.quantsim.dto.BacktestDtos.CustomCondition;
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
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.StockRepository;

import lombok.RequiredArgsConstructor;

/**
 * 策略回测竞技场: 玩家配置经典/自定义策略在整段历史数据上回测。
 * 交易规则与游戏一致: 收盘价成交、整手交易、无做空; 费用与对局同口径 (FeeCalculator);
 * 仓位比例 positionPct 决定每次建仓动用净值的百分比 (默认 100 = 全仓)。
 */
@Service
@RequiredArgsConstructor
public class BacktestService {

    public enum Strategy { MA_CROSS, MOMENTUM, MEAN_REVERSION, RSI, MACD, BOLL, GRID, TURTLE, DCA, BUY_HOLD, CUSTOM }

    /** 自定义策略可选字段。 */
    public enum CustomField {
        CLOSE("收盘"), MA5("MA5"), MA20("MA20"), PCT_CHANGE("涨幅"),
        RSI("RSI"), MACD_HIST("MACD柱"), BOLL_UP("布林上轨"), BOLL_MID("布林中轨"), BOLL_LOW("布林下轨");

        final String label;

        CustomField(String label) { this.label = label; }
    }

    /** 自定义策略比较算子。 */
    public enum CustomOp {
        GT(">"), LT("<"), CROSS_UP("↑"), CROSS_DOWN("↓");

        final String label;

        CustomOp(String label) { this.label = label; }
    }


    // 各策略参数默认值与合法范围
    private static final int DEFAULT_FAST = 5, MIN_FAST = 2, MAX_FAST = 60;
    private static final int DEFAULT_SLOW = 20, MIN_SLOW = 5, MAX_SLOW = 120;
    private static final int DEFAULT_LOOKBACK = 10, MIN_LOOKBACK = 2, MAX_LOOKBACK = 60;
    private static final int DEFAULT_MA_WINDOW = 20, MIN_MA_WINDOW = 5, MAX_MA_WINDOW = 60;
    private static final double DEFAULT_THRESHOLD = 0.05, MIN_THRESHOLD = 0.01, MAX_THRESHOLD = 0.20;
    private static final int DEFAULT_RSI_PERIOD = 14, MIN_RSI_PERIOD = 5, MAX_RSI_PERIOD = 30;
    private static final int DEFAULT_RSI_BUY = 30, MIN_RSI_BUY = 10, MAX_RSI_BUY = 45;
    private static final int DEFAULT_RSI_SELL = 70, MIN_RSI_SELL = 55, MAX_RSI_SELL = 90;
    private static final int DEFAULT_MACD_FAST = 12, MIN_MACD_FAST = 5, MAX_MACD_FAST = 20;
    private static final int DEFAULT_MACD_SLOW = 26, MIN_MACD_SLOW = 15, MAX_MACD_SLOW = 60;
    private static final int DEFAULT_MACD_SIGNAL = 9, MIN_MACD_SIGNAL = 3, MAX_MACD_SIGNAL = 20;
    private static final int DEFAULT_BOLL_WIN = 20, MIN_BOLL_WIN = 10, MAX_BOLL_WIN = 60;
    private static final double DEFAULT_BOLL_K = 2.0, MIN_BOLL_K = 1.0, MAX_BOLL_K = 4.0;
    private static final double DEFAULT_GRID_PCT = 0.05, MIN_GRID_PCT = 0.01, MAX_GRID_PCT = 0.20;
    private static final int DEFAULT_GRID_LEVELS = 5, MIN_GRID_LEVELS = 2, MAX_GRID_LEVELS = 10;
    private static final int DEFAULT_TURTLE_ENTRY = 20, MIN_TURTLE_ENTRY = 10, MAX_TURTLE_ENTRY = 60;
    private static final int DEFAULT_TURTLE_EXIT = 10, MIN_TURTLE_EXIT = 5, MAX_TURTLE_EXIT = 30;
    private static final int DEFAULT_POSITION_PCT = 100, MIN_POSITION_PCT = 10, MAX_POSITION_PCT = 100;
    private static final int MAX_CUSTOM_CONDITIONS = 5;

    // 自动调参网格 (均在合法参数范围内; 两参数策略可画热力图)
    private static final int[] TUNE_FAST = {3, 5, 8, 10, 15, 20};
    private static final int[] TUNE_SLOW = {10, 20, 30, 40, 60, 90};
    private static final int[] TUNE_LOOKBACK = {2, 3, 5, 8, 10, 15, 20, 30, 45, 60};
    private static final int[] TUNE_MA = {10, 15, 20, 30, 45, 60};
    private static final double[] TUNE_TH = {0.02, 0.03, 0.05, 0.08, 0.12};
    private static final int[] TUNE_RSI_PERIOD = {7, 10, 14, 21, 28};
    private static final int[] TUNE_RSI_BUY = {20, 25, 30, 35, 40};
    private static final int[] TUNE_BOLL_WIN = {10, 15, 20, 30, 45, 60};
    private static final double[] TUNE_BOLL_K = {1.5, 2.0, 2.5, 3.0};
    private static final double[] TUNE_GRID_PCT = {0.02, 0.03, 0.05, 0.08, 0.10};
    private static final int[] TUNE_GRID_LEVELS = {3, 5, 8};
    private static final int[] TUNE_TURTLE_ENTRY = {10, 15, 20, 30, 40, 55};
    private static final int[] TUNE_TURTLE_EXIT = {5, 10, 15, 20};
    private static final int[] TUNE_MACD_FAST = {8, 10, 12, 16};
    private static final int[] TUNE_MACD_SLOW = {17, 22, 26, 35, 45};

    private final StockRepository stockRepository;
    private final UserService userService;
    private final BacktestResultRepository backtestRepository;
    private final MarketDataService marketData;
    private final FeeCalculator feeCalculator;
    private final GameProperties props;

    @Transactional(readOnly = true)
    public List<StockInfo> listStocks() {
        return stockRepository.findAll(Sort.by("code")).stream()
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
        Strategy strategy = parseStrategy(request.strategy());
        Stock stock = stockRepository.findByCode(request.stockCode().trim())
                .orElseThrow(() -> new NotFoundException("股票不存在: " + request.stockCode()));
        List<DailyPrice> prices = marketData.load(stock.getStockId()).prices();
        int minDays = props.getBacktestMinDays();
        if (prices.size() < minDays) {
            throw new BusinessException("该股票历史数据不足 " + minDays + " 天，无法回测");
        }
        Market market = stock.getMarket();

        StrategyParams sp = resolveParams(strategy, request);
        Simulation sim = simulate(strategy, sp, prices, market);

        BigDecimal initial = props.getInitialCash();
        int n = prices.size();
        BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
        BigDecimal annualReturn = annualize(sim.finalEquity, initial, n);
        BigDecimal sharpe = sharpeRatio(sim.equity);
        BigDecimal maxDd = maxDrawdown(sim.equity);
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
        BigDecimal[] holdCurve = buyAndHoldCurve(prices, initial, market);
        BigDecimal holdReturn = TradeMath.returnRate(holdCurve[n - 1], initial);

        // 已登录记会话身份; 游客昵称撞注册用户名会被拒 (防冒名入榜)
        User user = userService.resolve(request.username(), authUserId);
        BacktestResult result = new BacktestResult();
        result.setSeason(java.time.YearMonth.now(GameService.GAME_ZONE).toString());
        result.setUserId(user.getUserId());
        result.setStockId(stock.getStockId());
        result.setStrategy(strategy.name());
        result.setParams(sp.label);
        result.setStartDate(prices.get(0).getTradeDate());
        result.setEndDate(prices.get(n - 1).getTradeDate());
        result.setTotalReturn(totalReturn);
        result.setAnnualReturn(annualReturn);
        result.setSharpeRatio(sharpe);
        result.setMaxDrawdown(maxDd);
        result.setTradeCount(sim.tradeCount);
        result.setWinRate(winRate);
        backtestRepository.save(result);

        List<EquityPoint> curve = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            curve.add(new EquityPoint(prices.get(i).getTradeDate(), sim.equity[i], holdCurve[i]));
        }

        return new RunResponse(result.getBacktestId(), stock.getCode(), stock.getName(),
                strategy.name(), sp.label,
                prices.get(0).getTradeDate(), prices.get(n - 1).getTradeDate(), n,
                totalReturn, annualReturn, sharpe, maxDd, sim.tradeCount, winRate,
                holdReturn, volatility, sortino, dayWinRate, plRatio,
                inSampleReturn, outSampleReturn, curve);
    }

    /** 网格搜索最优参数 (先看总收益, 平手比夏普), 返回全网格供热力图, 再用最优参数正式回测入榜。 */
    @Transactional
    public TuneResponse tune(TuneRequest request, Long authUserId) {
        Strategy strategy = parseStrategy(request.strategy());
        Stock stock = stockRepository.findByCode(request.stockCode().trim())
                .orElseThrow(() -> new NotFoundException("股票不存在: " + request.stockCode()));
        List<DailyPrice> prices = marketData.load(stock.getStockId()).prices();
        int minDays = props.getBacktestMinDays();
        if (prices.size() < minDays) {
            throw new BusinessException("该股票历史数据不足 " + minDays + " 天，无法回测");
        }
        Market market = stock.getMarket();

        Grid grid = buildGrid(strategy);
        BigDecimal initial = props.getInitialCash();
        GridPoint best = null;
        BigDecimal bestReturn = null;
        BigDecimal bestSharpe = null;
        List<TunePoint> points = new ArrayList<>(grid.points.size());
        for (GridPoint gp : grid.points) {
            Simulation sim = simulate(strategy, gp.params, prices, market);
            BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
            BigDecimal sharpe = sharpeRatio(sim.equity);
            points.add(new TunePoint(gp.x, gp.y, totalReturn, sharpe));
            if (best == null || better(totalReturn, sharpe, bestReturn, bestSharpe)) {
                best = gp;
                bestReturn = totalReturn;
                bestSharpe = sharpe;
            }
        }

        RunResponse result = run(best.rebuild.apply(request), authUserId);
        StrategyParams bp = best.params;
        return new TuneResponse(strategy.name(), grid.points.size(),
                strategy == Strategy.MA_CROSS ? bp.fast() : null,
                strategy == Strategy.MA_CROSS ? bp.slow() : null,
                strategy == Strategy.MOMENTUM ? bp.lookback() : null,
                strategy == Strategy.MEAN_REVERSION ? bp.maWindow() : null,
                strategy == Strategy.MEAN_REVERSION ? BigDecimal.valueOf(bp.threshold()) : null,
                best.bestParams,
                grid.paramKeys,
                points,
                result);
    }

    private boolean better(BigDecimal ret, BigDecimal sharpe, BigDecimal bestRet, BigDecimal bestSharpe) {
        int cmp = ret.compareTo(bestRet);
        if (cmp != 0) {
            return cmp > 0;
        }
        return sharpe != null && (bestSharpe == null || sharpe.compareTo(bestSharpe) > 0);
    }

    // ---------- 调参网格 ----------

    private interface Rebuild extends java.util.function.Function<TuneRequest, RunRequest> {}

    private record GridPoint(StrategyParams params, double x, double y,
                             Map<String, BigDecimal> bestParams, Rebuild rebuild) {}

    private record Grid(List<String> paramKeys, List<GridPoint> points) {}

    /** 空 RunRequest 模板: 只带 username/stockCode/strategy, 由各策略填充自己的参数。 */
    private static RunRequest template(TuneRequest t, Strategy s) {
        return new RunRequest(t.username(), t.stockCode(), s.name(),
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private Grid buildGrid(Strategy strategy) {
        List<GridPoint> points = new ArrayList<>();
        switch (strategy) {
            case MA_CROSS -> {
                for (int fast : TUNE_FAST) {
                    for (int slow : TUNE_SLOW) {
                        if (fast >= slow) {
                            continue;
                        }
                        final int f = fast;
                        final int sl = slow;
                        points.add(new GridPoint(
                                maCrossParams(f, sl, DEFAULT_POSITION_PCT), f, sl,
                                params("fast", f, "slow", sl),
                                t -> withMaCross(template(t, strategy), f, sl)));
                    }
                }
                return new Grid(List.of("fast", "slow"), points);
            }
            case MOMENTUM -> {
                for (int lb : TUNE_LOOKBACK) {
                    final int l = lb;
                    points.add(new GridPoint(
                            momentumParams(l, DEFAULT_POSITION_PCT), l, 0,
                            params("lookback", l),
                            t -> withMomentum(template(t, strategy), l)));
                }
                return new Grid(List.of("lookback"), points);
            }
            case MEAN_REVERSION -> {
                for (int win : TUNE_MA) {
                    for (double th : TUNE_TH) {
                        final int w = win;
                        final double v = th;
                        points.add(new GridPoint(
                                meanRevParams(w, v, DEFAULT_POSITION_PCT), w, v,
                                params("maWindow", w, "threshold", v),
                                t -> withMeanRev(template(t, strategy), w, v)));
                    }
                }
                return new Grid(List.of("maWindow", "threshold"), points);
            }
            case RSI -> {
                for (int period : TUNE_RSI_PERIOD) {
                    for (int buy : TUNE_RSI_BUY) {
                        final int pd = period;
                        final int b = buy;
                        final int sell = 100 - buy;
                        points.add(new GridPoint(
                                rsiParams(pd, b, sell, DEFAULT_POSITION_PCT), pd, b,
                                params("rsiPeriod", pd, "rsiBuy", b, "rsiSell", sell),
                                t -> withRsi(template(t, strategy), pd, b, sell)));
                    }
                }
                return new Grid(List.of("rsiPeriod", "rsiBuy"), points);
            }
            case MACD -> {
                for (int fast : TUNE_MACD_FAST) {
                    for (int slow : TUNE_MACD_SLOW) {
                        if (fast >= slow) {
                            continue;
                        }
                        final int f = fast;
                        final int sl = slow;
                        points.add(new GridPoint(
                                macdParams(f, sl, DEFAULT_MACD_SIGNAL, DEFAULT_POSITION_PCT), f, sl,
                                params("macdFast", f, "macdSlow", sl, "macdSignal", DEFAULT_MACD_SIGNAL),
                                t -> withMacd(template(t, strategy), f, sl, DEFAULT_MACD_SIGNAL)));
                    }
                }
                return new Grid(List.of("macdFast", "macdSlow"), points);
            }
            case BOLL -> {
                for (int win : TUNE_BOLL_WIN) {
                    for (double k : TUNE_BOLL_K) {
                        final int w = win;
                        final double kv = k;
                        points.add(new GridPoint(
                                bollParams(w, kv, DEFAULT_POSITION_PCT), w, kv,
                                params("bollWindow", w, "bollK", kv),
                                t -> withBoll(template(t, strategy), w, kv)));
                    }
                }
                return new Grid(List.of("bollWindow", "bollK"), points);
            }
            case GRID -> {
                for (double pct : TUNE_GRID_PCT) {
                    for (int levels : TUNE_GRID_LEVELS) {
                        final double pv = pct;
                        final int lv = levels;
                        points.add(new GridPoint(
                                gridParams(pv, lv, DEFAULT_POSITION_PCT), pv * 100, lv,
                                params("gridPct", pv * 100, "gridLevels", lv),
                                t -> withGrid(template(t, strategy), pv, lv)));
                    }
                }
                return new Grid(List.of("gridPct", "gridLevels"), points);
            }
            case TURTLE -> {
                for (int entry : TUNE_TURTLE_ENTRY) {
                    for (int exit : TUNE_TURTLE_EXIT) {
                        final int en = entry;
                        final int ex = exit;
                        points.add(new GridPoint(
                                turtleParams(en, ex, DEFAULT_POSITION_PCT), en, ex,
                                params("turtleEntry", en, "turtleExit", ex),
                                t -> withTurtle(template(t, strategy), en, ex)));
                    }
                }
                return new Grid(List.of("turtleEntry", "turtleExit"), points);
            }
            default -> throw new BusinessException("该策略不支持自动调参");
        }
    }

    private static Map<String, BigDecimal> params(Object... kv) {
        Map<String, BigDecimal> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], new BigDecimal(String.valueOf(kv[i + 1])));
        }
        return map;
    }

    // tune 重建 RunRequest 的辅助 (record 无法逐字段改, 集中在这里避免散落 23 参调用)
    private static RunRequest withMaCross(RunRequest r, int fast, int slow) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), fast, slow, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMomentum(RunRequest r, int lookback) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, lookback, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMeanRev(RunRequest r, int win, double th) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, win,
                BigDecimal.valueOf(th),
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withRsi(RunRequest r, int period, int buy, int sell) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, period, buy, sell, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMacd(RunRequest r, int fast, int slow, int signal) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, fast, slow, signal, null, null, null, null, null, null, null);
    }

    private static RunRequest withBoll(RunRequest r, int win, double k) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, win, BigDecimal.valueOf(k),
                null, null, null, null, null);
    }

    private static RunRequest withGrid(RunRequest r, double pct, int levels) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                BigDecimal.valueOf(pct * 100), levels, null, null, null);
    }

    private static RunRequest withTurtle(RunRequest r, int entry, int exit) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, entry, exit, null);
    }

    // ---------- 策略模拟 ----------

    /** 自定义条件编译结果: rightField 为 null 时右侧取常数 rightValue。 */
    private record Rule(CustomField left, CustomOp op, CustomField rightField, double rightValue) {}

    private record StrategyParams(int fast, int slow, int lookback, int maWindow, double threshold,
            int signalWin, double k, int levels, int positionPct,
            List<Rule> buyRules, List<Rule> sellRules, String label) {}

    private static StrategyParams maCrossParams(int fast, int slow, int pos) {
        return new StrategyParams(fast, slow, 0, 0, 0, 0, 0, 0, pos, null, null,
                "fast=" + fast + ",slow=" + slow + posLabel(pos));
    }

    private static StrategyParams momentumParams(int lookback, int pos) {
        return new StrategyParams(0, 0, lookback, 0, 0, 0, 0, 0, pos, null, null,
                "lookback=" + lookback + posLabel(pos));
    }

    private static StrategyParams meanRevParams(int win, double th, int pos) {
        return new StrategyParams(0, 0, 0, win, th, 0, 0, 0, pos, null, null,
                "ma=" + win + ",th=" + BigDecimal.valueOf(th).stripTrailingZeros().toPlainString() + posLabel(pos));
    }

    private static StrategyParams rsiParams(int period, int buy, int sell, int pos) {
        return new StrategyParams(buy, sell, 0, period, 0, 0, 0, 0, pos, null, null,
                "rsi=" + period + ",buy<" + buy + ",sell>" + sell + posLabel(pos));
    }

    private static StrategyParams macdParams(int fast, int slow, int signal, int pos) {
        return new StrategyParams(fast, slow, 0, 0, 0, signal, 0, 0, pos, null, null,
                "macd=" + fast + "/" + slow + "/" + signal + posLabel(pos));
    }

    private static StrategyParams bollParams(int win, double k, int pos) {
        return new StrategyParams(0, 0, 0, win, 0, 0, k, 0, pos, null, null,
                "boll=" + win + ",k=" + BigDecimal.valueOf(k).stripTrailingZeros().toPlainString() + posLabel(pos));
    }

    private static StrategyParams gridParams(double pct, int levels, int pos) {
        return new StrategyParams(0, 0, 0, 0, pct, 0, 0, levels, pos, null, null,
                "grid=" + BigDecimal.valueOf(pct * 100).stripTrailingZeros().toPlainString()
                        + "%,levels=" + levels + posLabel(pos));
    }

    private static StrategyParams turtleParams(int entry, int exit, int pos) {
        return new StrategyParams(entry, exit, 0, 0, 0, 0, 0, 0, pos, null, null,
                "turtle=" + entry + "/" + exit + posLabel(pos));
    }

    private static String posLabel(int pos) {
        return pos == 100 ? "" : ",pos=" + pos + "%";
    }

    private static final class Simulation {
        BigDecimal[] equity;
        BigDecimal finalEquity;
        int tradeCount;
        int roundTrips;
        int wins;
    }

    /** 指标上下文: 按策略/自定义规则按需计算, 供 signal 与 fieldValue 共用。 */
    private static final class Ctx {
        double[] closes;
        double[] prefix;
        double[] rsi;
        double[] macdHist;
        double[][] boll;
        double[] donchianHigh;
        double[] donchianLow;
    }

    private Ctx buildCtx(Strategy strategy, StrategyParams sp, List<DailyPrice> prices) {
        int n = prices.size();
        Ctx ctx = new Ctx();
        ctx.closes = new double[n];
        ctx.prefix = new double[n + 1];
        for (int i = 0; i < n; i++) {
            ctx.closes[i] = prices.get(i).getClose().doubleValue();
            ctx.prefix[i + 1] = ctx.prefix[i] + ctx.closes[i];
        }
        boolean needRsi = strategy == Strategy.RSI || usesField(sp, CustomField.RSI);
        boolean needMacd = strategy == Strategy.MACD || usesField(sp, CustomField.MACD_HIST);
        boolean needBoll = strategy == Strategy.BOLL || usesField(sp, CustomField.BOLL_UP)
                || usesField(sp, CustomField.BOLL_MID) || usesField(sp, CustomField.BOLL_LOW);
        if (needRsi) {
            int period = strategy == Strategy.RSI ? sp.maWindow() : DEFAULT_RSI_PERIOD;
            ctx.rsi = IndicatorMath.rsi(ctx.closes, period);
        }
        if (needMacd) {
            int f = strategy == Strategy.MACD ? sp.fast() : DEFAULT_MACD_FAST;
            int sl = strategy == Strategy.MACD ? sp.slow() : DEFAULT_MACD_SLOW;
            int sig = strategy == Strategy.MACD ? sp.signalWin() : DEFAULT_MACD_SIGNAL;
            ctx.macdHist = IndicatorMath.macdHist(ctx.closes, f, sl, sig);
        }
        if (needBoll) {
            int win = strategy == Strategy.BOLL ? sp.maWindow() : DEFAULT_BOLL_WIN;
            double k = strategy == Strategy.BOLL ? sp.k() : DEFAULT_BOLL_K;
            ctx.boll = IndicatorMath.bollinger(ctx.closes, win, k);
        }
        if (strategy == Strategy.TURTLE) {
            ctx.donchianHigh = IndicatorMath.donchianHigh(ctx.closes, sp.fast());
            ctx.donchianLow = IndicatorMath.donchianLow(ctx.closes, sp.slow());
        }
        return ctx;
    }

    private boolean usesField(StrategyParams sp, CustomField f) {
        return containsField(sp.buyRules(), f) || containsField(sp.sellRules(), f);
    }

    private boolean containsField(List<Rule> rules, CustomField f) {
        if (rules == null) {
            return false;
        }
        for (Rule r : rules) {
            if (r.left() == f || r.rightField() == f) {
                return true;
            }
        }
        return false;
    }

    private Simulation simulate(Strategy strategy, StrategyParams sp, List<DailyPrice> prices, Market market) {
        int n = prices.size();
        int lotSize = market.getLotSize();
        Ctx ctx = buildCtx(strategy, sp, prices);

        BigDecimal cash = props.getInitialCash();
        int shares = 0;
        BigDecimal positionCost = BigDecimal.ZERO;
        Simulation sim = new Simulation();
        sim.equity = new BigDecimal[n];
        double posFraction = sp.positionPct() / 100.0;
        double gridBase = ctx.closes[0];

        for (int i = 0; i < n; i++) {
            BigDecimal close = prices.get(i).getClose();
            BigDecimal equityNow = cash.add(close.multiply(BigDecimal.valueOf(shares)));

            // 目标仓位: null = 不动作; 经典策略 +1 -> 满目标 / -1 -> 清仓; GRID 按价格档位连续调仓
            Integer targetShares = null;
            if (strategy == Strategy.GRID) {
                double steps = (gridBase - ctx.closes[i]) / (gridBase * sp.threshold());
                double frac = Math.max(0, Math.min(1, steps / sp.levels()));
                targetShares = wholeShares(equityNow.doubleValue() * frac * posFraction, ctx.closes[i], lotSize);
            } else if (strategy == Strategy.DCA) {
                // 定投: 每 lookback 天投一期 (预算 = 初始资金均分), 只买不卖, 纪律代替择时
                if (i % sp.lookback() == 0) {
                    double tranche = props.getInitialCash().doubleValue() * posFraction
                            / (n / sp.lookback() + 1);
                    int add = wholeShares(Math.min(tranche, cash.doubleValue()), ctx.closes[i], lotSize);
                    if (add > 0) {
                        targetShares = shares + add;
                    }
                }
            } else {
                int signal = signal(strategy, sp, ctx, i);
                if (signal > 0) {
                    // 只加仓不减仓: 持续 +1 信号下不因净值回落而反复剳仓
                    int tgt = wholeShares(equityNow.doubleValue() * posFraction, ctx.closes[i], lotSize);
                    targetShares = Math.max(shares, tgt);
                } else if (signal < 0) {
                    targetShares = 0;
                }
            }

            if (targetShares != null && targetShares != shares) {
                if (targetShares > shares) {
                    int want = targetShares - shares;
                    int affordable = maxAffordable(cash, close, lotSize, market);
                    int bought = Math.min(want, affordable);
                    if (bought > 0) {
                        BigDecimal gross = close.multiply(BigDecimal.valueOf(bought));
                        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
                        cash = cash.subtract(gross).subtract(fee);
                        shares += bought;
                        positionCost = positionCost.add(gross).add(fee);
                        sim.tradeCount++;
                    }
                } else {
                    int sell = shares - targetShares;
                    BigDecimal gross = close.multiply(BigDecimal.valueOf(sell));
                    BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross);
                    BigDecimal proceeds = gross.subtract(fee);
                    // 成本按卖出比例分摊
                    BigDecimal costPart = shares == 0 ? BigDecimal.ZERO
                            : positionCost.multiply(BigDecimal.valueOf(sell))
                                    .divide(BigDecimal.valueOf(shares), 2, RoundingMode.HALF_UP);
                    cash = cash.add(proceeds);
                    shares -= sell;
                    positionCost = positionCost.subtract(costPart);
                    sim.tradeCount++;
                    if (shares == 0) {
                        sim.roundTrips++;
                        if (proceeds.compareTo(costPart) > 0) {
                            sim.wins++;
                        }
                        positionCost = BigDecimal.ZERO;
                    }
                }
            }
            sim.equity[i] = cash.add(close.multiply(BigDecimal.valueOf(shares)));
        }
        sim.finalEquity = sim.equity[n - 1];
        return sim;
    }

    /** value 金额按 price 换算成整手股数。 */
    private static int wholeShares(double value, double price, int lotSize) {
        if (price <= 0 || value <= 0) {
            return 0;
        }
        int shares = (int) (value / price);
        return shares / lotSize * lotSize;
    }

    /** 现金能买到的最大整手数 (含买入费用)。 */
    private int maxAffordable(BigDecimal cash, BigDecimal price, int lotSize, Market market) {
        int shares = TradeMath.maxWholeShares(cash, price, lotSize);
        while (shares > 0) {
            BigDecimal gross = price.multiply(BigDecimal.valueOf(shares));
            BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
            if (gross.add(fee).compareTo(cash) <= 0) {
                break;
            }
            shares -= lotSize;
        }
        return Math.max(0, shares);
    }

    /** +1 建仓 / -1 清仓 / 0 保持。窗口数据不足时不动作。 */
    private int signal(Strategy strategy, StrategyParams sp, Ctx ctx, int i) {
        double[] closes = ctx.closes;
        double[] prefix = ctx.prefix;
        switch (strategy) {
            case MA_CROSS -> {
                if (i + 1 < sp.slow()) return 0;
                double fast = ma(prefix, i, sp.fast());
                double slow = ma(prefix, i, sp.slow());
                return fast > slow ? 1 : fast < slow ? -1 : 0;
            }
            case MOMENTUM -> {
                if (i < sp.lookback()) return 0;
                double past = closes[i - sp.lookback()];
                return closes[i] > past ? 1 : closes[i] < past ? -1 : 0;
            }
            case MEAN_REVERSION -> {
                if (i + 1 < sp.maWindow()) return 0;
                double m = ma(prefix, i, sp.maWindow());
                if (closes[i] < m * (1 - sp.threshold())) return 1;
                if (closes[i] > m * (1 + sp.threshold())) return -1;
                return 0;
            }
            case RSI -> {
                double v = ctx.rsi[i];
                if (Double.isNaN(v)) return 0;
                // fast=买入阈值 slow=卖出阈值 (见 rsiParams)
                if (v < sp.fast()) return 1;
                if (v > sp.slow()) return -1;
                return 0;
            }
            case MACD -> {
                double h = ctx.macdHist[i];
                if (Double.isNaN(h)) return 0;
                return h > 0 ? 1 : h < 0 ? -1 : 0;
            }
            case BOLL -> {
                if (ctx.boll == null || Double.isNaN(ctx.boll[1][i])) return 0;
                if (closes[i] < ctx.boll[2][i]) return 1;
                if (closes[i] > ctx.boll[0][i]) return -1;
                return 0;
            }
            case TURTLE -> {
                double hi = ctx.donchianHigh[i];
                double lo = ctx.donchianLow[i];
                if (!Double.isNaN(hi) && closes[i] > hi) return 1;
                if (!Double.isNaN(lo) && closes[i] < lo) return -1;
                return 0;
            }
            case BUY_HOLD -> {
                return i == 0 ? 1 : 0;
            }
            case CUSTOM -> {
                if (allMatch(sp.buyRules(), ctx, i)) return 1;
                if (allMatch(sp.sellRules(), ctx, i)) return -1;
                return 0;
            }
            case GRID -> {
                return 0; // GRID 在 simulate 里按档位直接给目标仓位
            }
        }
        return 0;
    }

    private boolean allMatch(List<Rule> rules, Ctx ctx, int i) {
        for (Rule r : rules) {
            if (!match(r, ctx, i)) {
                return false;
            }
        }
        return true;
    }

    private boolean match(Rule r, Ctx ctx, int i) {
        double l = fieldValue(r.left(), ctx, i);
        double rv = rightValue(r, ctx, i);
        if (Double.isNaN(l) || Double.isNaN(rv)) {
            return false;
        }
        switch (r.op()) {
            case GT -> { return l > rv; }
            case LT -> { return l < rv; }
            default -> {
                if (i < 1) return false;
                double lp = fieldValue(r.left(), ctx, i - 1);
                double rp = rightValue(r, ctx, i - 1);
                if (Double.isNaN(lp) || Double.isNaN(rp)) return false;
                return r.op() == CustomOp.CROSS_UP
                        ? lp <= rp && l > rv
                        : lp >= rp && l < rv;
            }
        }
    }

    private double rightValue(Rule r, Ctx ctx, int i) {
        return r.rightField() == null ? r.rightValue() : fieldValue(r.rightField(), ctx, i);
    }

    /** 字段在第 i 天的取值; 窗口数据不足时返回 NaN (条件视为不成立)。 */
    private double fieldValue(CustomField f, Ctx ctx, int i) {
        double[] closes = ctx.closes;
        double[] prefix = ctx.prefix;
        switch (f) {
            case CLOSE -> { return closes[i]; }
            case MA5 -> { return i + 1 >= 5 ? ma(prefix, i, 5) : Double.NaN; }
            case MA20 -> { return i + 1 >= 20 ? ma(prefix, i, 20) : Double.NaN; }
            case PCT_CHANGE -> {
                return i >= 1 && closes[i - 1] != 0 ? closes[i] / closes[i - 1] - 1 : Double.NaN;
            }
            case RSI -> { return ctx.rsi == null ? Double.NaN : ctx.rsi[i]; }
            case MACD_HIST -> { return ctx.macdHist == null ? Double.NaN : ctx.macdHist[i]; }
            case BOLL_UP -> { return ctx.boll == null ? Double.NaN : ctx.boll[0][i]; }
            case BOLL_MID -> { return ctx.boll == null ? Double.NaN : ctx.boll[1][i]; }
            case BOLL_LOW -> { return ctx.boll == null ? Double.NaN : ctx.boll[2][i]; }
        }
        return Double.NaN;
    }

    private double ma(double[] prefix, int i, int window) {
        return (prefix[i + 1] - prefix[i + 1 - window]) / window;
    }

    private BigDecimal[] buyAndHoldCurve(List<DailyPrice> prices, BigDecimal initial, Market market) {
        BigDecimal startClose = prices.get(0).getClose();
        int shares = maxAffordable(initial, startClose, market.getLotSize(), market);
        BigDecimal gross = startClose.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
        BigDecimal cash = initial.subtract(gross).subtract(fee);
        BigDecimal[] curve = new BigDecimal[prices.size()];
        for (int i = 0; i < prices.size(); i++) {
            curve[i] = cash.add(prices.get(i).getClose().multiply(BigDecimal.valueOf(shares)));
        }
        return curve;
    }

    // ---------- 指标计算 ----------

    private BigDecimal annualize(BigDecimal finalEquity, BigDecimal initial, int days) {
        if (days < 2) {
            return null;
        }
        double growth = finalEquity.doubleValue() / initial.doubleValue();
        double annual = Math.pow(growth, RiskMath.TRADING_DAYS_PER_YEAR / days) - 1;
        return BigDecimal.valueOf(annual).setScale(4, RoundingMode.HALF_UP);
    }

    /** 年化夏普比率, 口径与结算复盘共用 RiskMath (无风险利率取 0, 波动为 0 时 null)。 */
    private BigDecimal sharpeRatio(BigDecimal[] equity) {
        return RiskMath.sharpe(RiskMath.dailyReturns(Arrays.asList(equity)));
    }

    /** 最大回撤 (正数, 0.15 表示曾从峰值回撤 15%), 口径与结算复盘共用 RiskMath。 */
    private BigDecimal maxDrawdown(BigDecimal[] equity) {
        return RiskMath.maxDrawdown(Arrays.asList(equity));
    }

    // ---------- 参数解析 ----------

    private Strategy parseStrategy(String raw) {
        try {
            return Strategy.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知策略: " + raw
                    + "（可选 MA_CROSS / MOMENTUM / MEAN_REVERSION / RSI / MACD / BOLL / GRID / TURTLE"
                    + " / DCA / BUY_HOLD / CUSTOM）");
        }
    }

    private StrategyParams resolveParams(Strategy strategy, RunRequest r) {
        int pos = intParam(r.positionPct(), DEFAULT_POSITION_PCT, MIN_POSITION_PCT, MAX_POSITION_PCT, "仓位比例");
        switch (strategy) {
            case MA_CROSS -> {
                int fast = intParam(r.fastWindow(), DEFAULT_FAST, MIN_FAST, MAX_FAST, "快线窗口");
                int slow = intParam(r.slowWindow(), DEFAULT_SLOW, MIN_SLOW, MAX_SLOW, "慢线窗口");
                if (fast >= slow) {
                    throw new BusinessException("快线窗口必须小于慢线窗口");
                }
                return maCrossParams(fast, slow, pos);
            }
            case MOMENTUM -> {
                int lookback = intParam(r.lookbackDays(),
                        DEFAULT_LOOKBACK, MIN_LOOKBACK, MAX_LOOKBACK, "动量回看天数");
                return momentumParams(lookback, pos);
            }
            case MEAN_REVERSION -> {
                int win = intParam(r.maWindow(),
                        DEFAULT_MA_WINDOW, MIN_MA_WINDOW, MAX_MA_WINDOW, "均值窗口");
                double th = r.threshold() == null ? DEFAULT_THRESHOLD : r.threshold().doubleValue();
                if (th < MIN_THRESHOLD || th > MAX_THRESHOLD) {
                    throw new BusinessException("偏离阈值须在 " + MIN_THRESHOLD + " ~ " + MAX_THRESHOLD + " 之间");
                }
                return meanRevParams(win, th, pos);
            }
            case RSI -> {
                int period = intParam(r.rsiPeriod(), DEFAULT_RSI_PERIOD, MIN_RSI_PERIOD, MAX_RSI_PERIOD, "RSI 周期");
                int buy = intParam(r.rsiBuy(), DEFAULT_RSI_BUY, MIN_RSI_BUY, MAX_RSI_BUY, "RSI 买入阈值");
                int sell = intParam(r.rsiSell(), DEFAULT_RSI_SELL, MIN_RSI_SELL, MAX_RSI_SELL, "RSI 卖出阈值");
                return rsiParams(period, buy, sell, pos);
            }
            case MACD -> {
                int fast = intParam(r.macdFast(), DEFAULT_MACD_FAST, MIN_MACD_FAST, MAX_MACD_FAST, "MACD 快线");
                int slow = intParam(r.macdSlow(), DEFAULT_MACD_SLOW, MIN_MACD_SLOW, MAX_MACD_SLOW, "MACD 慢线");
                int signal = intParam(r.macdSignal(),
                        DEFAULT_MACD_SIGNAL, MIN_MACD_SIGNAL, MAX_MACD_SIGNAL, "MACD 信号线");
                if (fast >= slow) {
                    throw new BusinessException("MACD 快线必须小于慢线");
                }
                return macdParams(fast, slow, signal, pos);
            }
            case BOLL -> {
                int win = intParam(r.bollWindow(), DEFAULT_BOLL_WIN, MIN_BOLL_WIN, MAX_BOLL_WIN, "布林窗口");
                double k = r.bollK() == null ? DEFAULT_BOLL_K : r.bollK().doubleValue();
                if (k < MIN_BOLL_K || k > MAX_BOLL_K) {
                    throw new BusinessException("带宽倍数须在 " + MIN_BOLL_K + " ~ " + MAX_BOLL_K + " 之间");
                }
                return bollParams(win, k, pos);
            }
            case GRID -> {
                double pct = r.gridPct() == null ? DEFAULT_GRID_PCT
                        : r.gridPct().doubleValue() / 100.0;
                if (pct < MIN_GRID_PCT || pct > MAX_GRID_PCT) {
                    throw new BusinessException("网格间距须在 1% ~ 20% 之间");
                }
                int levels = intParam(r.gridLevels(),
                        DEFAULT_GRID_LEVELS, MIN_GRID_LEVELS, MAX_GRID_LEVELS, "网格层数");
                return gridParams(pct, levels, pos);
            }
            case TURTLE -> {
                int entry = intParam(r.turtleEntry(),
                        DEFAULT_TURTLE_ENTRY, MIN_TURTLE_ENTRY, MAX_TURTLE_ENTRY, "入场突破日数");
                int exit = intParam(r.turtleExit(),
                        DEFAULT_TURTLE_EXIT, MIN_TURTLE_EXIT, MAX_TURTLE_EXIT, "离场突破日数");
                return turtleParams(entry, exit, pos);
            }
            case DCA -> {
                // 定投: lookbackDays 复用为投入间隔 (交易日)
                int interval = intParam(r.lookbackDays(), 5, 2, 60, "定投间隔");
                return new StrategyParams(0, 0, interval, 0, 0, 0, 0, 0, pos, null, null,
                        "every " + interval + "d" + posLabel(pos));
            }
            case CUSTOM -> {
                List<Rule> buy = compileRules(r.buyConditions(), "买入");
                List<Rule> sell = compileRules(r.sellConditions(), "卖出");
                return new StrategyParams(0, 0, 0, 0, 0, 0, 0, 0, pos, buy, sell,
                        "买[" + rulesLabel(buy) + "] 卖[" + rulesLabel(sell) + "]" + posLabel(pos));
            }
            default -> {
                return new StrategyParams(0, 0, 0, 0, 0, 0, 0, 0, 100, null, null, "");
            }
        }
    }

    // ---------- 自定义条件编译 ----------

    private List<Rule> compileRules(List<CustomCondition> conditions, String side) {
        if (conditions == null || conditions.isEmpty()) {
            throw new BusinessException("自定义策略至少需要一条" + side + "条件");
        }
        if (conditions.size() > MAX_CUSTOM_CONDITIONS) {
            throw new BusinessException(side + "条件最多 " + MAX_CUSTOM_CONDITIONS + " 条");
        }
        List<Rule> rules = new ArrayList<>(conditions.size());
        for (CustomCondition c : conditions) {
            CustomField left = parseField(c.left());
            CustomOp op = parseOp(c.op());
            boolean hasField = c.rightField() != null && !c.rightField().isBlank();
            if (hasField == (c.rightValue() != null)) {
                throw new BusinessException(side + "条件右侧须为字段或常数（二选一）");
            }
            CustomField rightField = hasField ? parseField(c.rightField()) : null;
            double rightValue = hasField ? 0
                    : c.rightValue().setScale(4, RoundingMode.HALF_UP).doubleValue();
            rules.add(new Rule(left, op, rightField, rightValue));
        }
        return rules;
    }

    private CustomField parseField(String raw) {
        try {
            return CustomField.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知字段: " + raw
                    + "（可选 CLOSE / MA5 / MA20 / PCT_CHANGE / RSI / MACD_HIST / BOLL_UP / BOLL_MID / BOLL_LOW）");
        }
    }

    private CustomOp parseOp(String raw) {
        try {
            return CustomOp.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知算子: " + raw + "（可选 GT / LT / CROSS_UP / CROSS_DOWN）");
        }
    }

    private String rulesLabel(List<Rule> rules) {
        StringBuilder sb = new StringBuilder();
        for (Rule r : rules) {
            if (sb.length() > 0) {
                sb.append(" & ");
            }
            sb.append(r.left().label).append(r.op().label);
            sb.append(r.rightField() != null
                    ? r.rightField().label
                    : BigDecimal.valueOf(r.rightValue()).stripTrailingZeros().toPlainString());
        }
        return sb.toString();
    }

    private int intParam(Integer value, int def, int min, int max, String name) {
        int v = value == null ? def : value;
        if (v < min || v > max) {
            throw new BusinessException(name + "须在 " + min + " ~ " + max + " 之间");
        }
        return v;
    }
}
