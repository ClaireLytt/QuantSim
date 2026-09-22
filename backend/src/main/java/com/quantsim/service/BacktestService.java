package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

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
import com.quantsim.dto.BacktestDtos.TuneRequest;
import com.quantsim.dto.BacktestDtos.TuneResponse;
import com.quantsim.entity.BacktestResult;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.StockRepository;

import lombok.RequiredArgsConstructor;

/**
 * 策略回测竞技场: 玩家配置经典策略在整段历史数据上回测,
 * 交易规则与游戏一致 (收盘价成交、按市场整手交易、全仓进出、无杠杆做空)。
 */
@Service
@RequiredArgsConstructor
public class BacktestService {

    public enum Strategy { MA_CROSS, MOMENTUM, MEAN_REVERSION, BUY_HOLD, CUSTOM }

    /** 自定义策略可选字段。 */
    public enum CustomField {
        CLOSE("收盘"), MA5("MA5"), MA20("MA20"), PCT_CHANGE("涨幅");

        final String label;

        CustomField(String label) { this.label = label; }
    }

    /** 自定义策略比较算子。 */
    public enum CustomOp {
        GT(">"), LT("<"), CROSS_UP("↑"), CROSS_DOWN("↓");

        final String label;

        CustomOp(String label) { this.label = label; }
    }

    private static final double TRADING_DAYS_PER_YEAR = 252.0;

    // 各策略参数默认值与合法范围
    private static final int DEFAULT_FAST = 5, MIN_FAST = 2, MAX_FAST = 60;
    private static final int DEFAULT_SLOW = 20, MIN_SLOW = 5, MAX_SLOW = 120;
    private static final int DEFAULT_LOOKBACK = 10, MIN_LOOKBACK = 2, MAX_LOOKBACK = 60;
    private static final int DEFAULT_MA_WINDOW = 20, MIN_MA_WINDOW = 5, MAX_MA_WINDOW = 60;
    private static final double DEFAULT_THRESHOLD = 0.05, MIN_THRESHOLD = 0.01, MAX_THRESHOLD = 0.20;
    private static final int MAX_CUSTOM_CONDITIONS = 5;

    // 自动调参网格 (均在合法参数范围内)
    private static final int[] TUNE_FAST = {3, 5, 8, 10, 15, 20};
    private static final int[] TUNE_SLOW = {10, 20, 30, 40, 60, 90};
    private static final int[] TUNE_LOOKBACK = {2, 3, 5, 8, 10, 15, 20, 30, 45, 60};
    private static final int[] TUNE_MA = {10, 15, 20, 30, 45, 60};
    private static final double[] TUNE_TH = {0.02, 0.03, 0.05, 0.08, 0.12};

    private final StockRepository stockRepository;
    private final UserService userService;
    private final BacktestResultRepository backtestRepository;
    private final MarketDataService marketData;
    private final GameProperties props;

    @Transactional(readOnly = true)
    public List<StockInfo> listStocks() {
        return stockRepository.findAll(Sort.by("code")).stream()
                .map(s -> new StockInfo(s.getCode(), s.getName(), s.getMarket().name()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ArenaEntry> arenaLeaderboard() {
        return backtestRepository.findArenaLeaderboard(PageRequest.of(0, props.getLeaderboardSize())).stream()
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
    public RunResponse run(RunRequest request) {
        Strategy strategy = parseStrategy(request.strategy());
        Stock stock = stockRepository.findByCode(request.stockCode().trim())
                .orElseThrow(() -> new NotFoundException("股票不存在: " + request.stockCode()));
        List<DailyPrice> prices = marketData.load(stock.getStockId()).prices();
        int minDays = props.getBacktestMinDays();
        if (prices.size() < minDays) {
            throw new BusinessException("该股票历史数据不足 " + minDays + " 天，无法回测");
        }
        int lotSize = stock.getMarket().getLotSize();

        StrategyParams sp = resolveParams(strategy, request);
        Simulation sim = simulate(strategy, sp, prices, lotSize);

        BigDecimal initial = props.getInitialCash();
        int n = prices.size();
        BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
        BigDecimal annualReturn = annualize(sim.finalEquity, initial, n);
        BigDecimal sharpe = sharpeRatio(sim.equity);
        BigDecimal maxDd = maxDrawdown(sim.equity);
        BigDecimal winRate = sim.roundTrips > 0
                ? BigDecimal.valueOf((double) sim.wins / sim.roundTrips).setScale(4, RoundingMode.HALF_UP)
                : null;

        // 买入持有基准曲线 (同规则: 首日收盘整手全仓)
        BigDecimal[] holdCurve = buyAndHoldCurve(prices, initial, lotSize);
        BigDecimal holdReturn = TradeMath.returnRate(holdCurve[n - 1], initial);

        User user = userService.findOrCreate(request.username().trim());
        BacktestResult result = new BacktestResult();
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
                holdReturn, curve);
    }

    /** 网格搜索最优参数 (先看总收益, 平手比夏普), 再用最优参数正式回测入榜。 */
    @Transactional
    public TuneResponse tune(TuneRequest request) {
        Strategy strategy = parseStrategy(request.strategy());
        Stock stock = stockRepository.findByCode(request.stockCode().trim())
                .orElseThrow(() -> new NotFoundException("股票不存在: " + request.stockCode()));
        List<DailyPrice> prices = marketData.load(stock.getStockId()).prices();
        int minDays = props.getBacktestMinDays();
        if (prices.size() < minDays) {
            throw new BusinessException("该股票历史数据不足 " + minDays + " 天，无法回测");
        }
        int lotSize = stock.getMarket().getLotSize();

        List<StrategyParams> grid = buildGrid(strategy);
        BigDecimal initial = props.getInitialCash();
        StrategyParams best = null;
        BigDecimal bestReturn = null;
        BigDecimal bestSharpe = null;
        for (StrategyParams sp : grid) {
            Simulation sim = simulate(strategy, sp, prices, lotSize);
            BigDecimal totalReturn = TradeMath.returnRate(sim.finalEquity, initial);
            BigDecimal sharpe = sharpeRatio(sim.equity);
            if (best == null || better(totalReturn, sharpe, bestReturn, bestSharpe)) {
                best = sp;
                bestReturn = totalReturn;
                bestSharpe = sharpe;
            }
        }

        RunRequest bestRun = switch (strategy) {
            case MA_CROSS -> new RunRequest(request.username(), request.stockCode(), strategy.name(),
                    best.fast(), best.slow(), null, null, null, null, null);
            case MOMENTUM -> new RunRequest(request.username(), request.stockCode(), strategy.name(),
                    null, null, best.lookback(), null, null, null, null);
            default -> new RunRequest(request.username(), request.stockCode(), strategy.name(),
                    null, null, null, best.maWindow(), BigDecimal.valueOf(best.threshold()), null, null);
        };
        RunResponse result = run(bestRun);
        return new TuneResponse(strategy.name(), grid.size(),
                strategy == Strategy.MA_CROSS ? best.fast() : null,
                strategy == Strategy.MA_CROSS ? best.slow() : null,
                strategy == Strategy.MOMENTUM ? best.lookback() : null,
                strategy == Strategy.MEAN_REVERSION ? best.maWindow() : null,
                strategy == Strategy.MEAN_REVERSION ? BigDecimal.valueOf(best.threshold()) : null,
                result);
    }

    private boolean better(BigDecimal ret, BigDecimal sharpe, BigDecimal bestRet, BigDecimal bestSharpe) {
        int cmp = ret.compareTo(bestRet);
        if (cmp != 0) {
            return cmp > 0;
        }
        return sharpe != null && (bestSharpe == null || sharpe.compareTo(bestSharpe) > 0);
    }

    private List<StrategyParams> buildGrid(Strategy strategy) {
        List<StrategyParams> grid = new ArrayList<>();
        switch (strategy) {
            case MA_CROSS -> {
                for (int fast : TUNE_FAST) {
                    for (int slow : TUNE_SLOW) {
                        if (fast < slow) {
                            grid.add(new StrategyParams(fast, slow, 0, 0, 0, null, null,
                                    "fast=" + fast + ",slow=" + slow));
                        }
                    }
                }
            }
            case MOMENTUM -> {
                for (int lb : TUNE_LOOKBACK) {
                    grid.add(new StrategyParams(0, 0, lb, 0, 0, null, null, "lookback=" + lb));
                }
            }
            case MEAN_REVERSION -> {
                for (int win : TUNE_MA) {
                    for (double th : TUNE_TH) {
                        grid.add(new StrategyParams(0, 0, 0, win, th, null, null,
                                "ma=" + win + ",th=" + BigDecimal.valueOf(th).stripTrailingZeros().toPlainString()));
                    }
                }
            }
            default -> throw new BusinessException("自动调参仅支持 MA_CROSS / MOMENTUM / MEAN_REVERSION");
        }
        return grid;
    }

    // ---------- 策略模拟 ----------

    /** 自定义条件编译结果: rightField 为 null 时右侧取常数 rightValue。 */
    private record Rule(CustomField left, CustomOp op, CustomField rightField, double rightValue) {}

    private record StrategyParams(int fast, int slow, int lookback, int maWindow, double threshold,
            List<Rule> buyRules, List<Rule> sellRules, String label) {}

    private static final class Simulation {
        BigDecimal[] equity;
        BigDecimal finalEquity;
        int tradeCount;
        int roundTrips;
        int wins;
    }

    private Simulation simulate(Strategy strategy, StrategyParams sp, List<DailyPrice> prices, int lotSize) {
        int n = prices.size();
        double[] closes = new double[n];
        double[] prefix = new double[n + 1];
        for (int i = 0; i < n; i++) {
            closes[i] = prices.get(i).getClose().doubleValue();
            prefix[i + 1] = prefix[i] + closes[i];
        }

        BigDecimal cash = props.getInitialCash();
        int shares = 0;
        BigDecimal positionCost = BigDecimal.ZERO;
        Simulation sim = new Simulation();
        sim.equity = new BigDecimal[n];

        for (int i = 0; i < n; i++) {
            int signal = signal(strategy, sp, closes, prefix, i);
            BigDecimal close = prices.get(i).getClose();
            if (signal > 0) {
                int bought = TradeMath.maxWholeShares(cash, close, lotSize);
                if (bought > 0) {
                    BigDecimal amount = close.multiply(BigDecimal.valueOf(bought));
                    cash = cash.subtract(amount);
                    shares += bought;
                    positionCost = positionCost.add(amount);
                    sim.tradeCount++;
                }
            } else if (signal < 0 && shares > 0) {
                BigDecimal proceeds = close.multiply(BigDecimal.valueOf(shares));
                cash = cash.add(proceeds);
                shares = 0;
                sim.tradeCount++;
                sim.roundTrips++;
                if (proceeds.compareTo(positionCost) > 0) {
                    sim.wins++;
                }
                positionCost = BigDecimal.ZERO;
            }
            sim.equity[i] = cash.add(close.multiply(BigDecimal.valueOf(shares)));
        }
        sim.finalEquity = sim.equity[n - 1];
        return sim;
    }

    /** +1 建仓 / -1 清仓 / 0 保持。窗口数据不足时不动作。 */
    private int signal(Strategy strategy, StrategyParams sp, double[] closes, double[] prefix, int i) {
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
            case BUY_HOLD -> {
                return i == 0 ? 1 : 0;
            }
            case CUSTOM -> {
                if (allMatch(sp.buyRules(), closes, prefix, i)) return 1;
                if (allMatch(sp.sellRules(), closes, prefix, i)) return -1;
                return 0;
            }
        }
        return 0;
    }

    private boolean allMatch(List<Rule> rules, double[] closes, double[] prefix, int i) {
        for (Rule r : rules) {
            if (!match(r, closes, prefix, i)) {
                return false;
            }
        }
        return true;
    }

    private boolean match(Rule r, double[] closes, double[] prefix, int i) {
        double l = fieldValue(r.left(), closes, prefix, i);
        double rv = rightValue(r, closes, prefix, i);
        if (Double.isNaN(l) || Double.isNaN(rv)) {
            return false;
        }
        switch (r.op()) {
            case GT -> { return l > rv; }
            case LT -> { return l < rv; }
            default -> {
                if (i < 1) return false;
                double lp = fieldValue(r.left(), closes, prefix, i - 1);
                double rp = rightValue(r, closes, prefix, i - 1);
                if (Double.isNaN(lp) || Double.isNaN(rp)) return false;
                return r.op() == CustomOp.CROSS_UP
                        ? lp <= rp && l > rv
                        : lp >= rp && l < rv;
            }
        }
    }

    private double rightValue(Rule r, double[] closes, double[] prefix, int i) {
        return r.rightField() == null ? r.rightValue() : fieldValue(r.rightField(), closes, prefix, i);
    }

    /** 字段在第 i 天的取值; 窗口数据不足时返回 NaN (条件视为不成立)。 */
    private double fieldValue(CustomField f, double[] closes, double[] prefix, int i) {
        switch (f) {
            case CLOSE -> { return closes[i]; }
            case MA5 -> { return i + 1 >= 5 ? ma(prefix, i, 5) : Double.NaN; }
            case MA20 -> { return i + 1 >= 20 ? ma(prefix, i, 20) : Double.NaN; }
            case PCT_CHANGE -> {
                return i >= 1 && closes[i - 1] != 0 ? closes[i] / closes[i - 1] - 1 : Double.NaN;
            }
        }
        return Double.NaN;
    }

    private double ma(double[] prefix, int i, int window) {
        return (prefix[i + 1] - prefix[i + 1 - window]) / window;
    }

    private BigDecimal[] buyAndHoldCurve(List<DailyPrice> prices, BigDecimal initial, int lotSize) {
        BigDecimal startClose = prices.get(0).getClose();
        int shares = TradeMath.maxWholeShares(initial, startClose, lotSize);
        BigDecimal cash = initial.subtract(startClose.multiply(BigDecimal.valueOf(shares)));
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
        double annual = Math.pow(growth, TRADING_DAYS_PER_YEAR / days) - 1;
        return BigDecimal.valueOf(annual).setScale(4, RoundingMode.HALF_UP);
    }

    /** 年化夏普比率 (无风险利率取 0): mean(日收益)/std(日收益)*sqrt(252)。波动为 0 时无意义, 返回 null。 */
    private BigDecimal sharpeRatio(BigDecimal[] equity) {
        int n = equity.length;
        if (n < 3) {
            return null;
        }
        double[] returns = new double[n - 1];
        for (int i = 1; i < n; i++) {
            returns[i - 1] = equity[i].doubleValue() / equity[i - 1].doubleValue() - 1;
        }
        double mean = 0;
        for (double r : returns) {
            mean += r;
        }
        mean /= returns.length;
        double var = 0;
        for (double r : returns) {
            var += (r - mean) * (r - mean);
        }
        var /= (returns.length - 1);
        double std = Math.sqrt(var);
        if (std < 1e-12) {
            return null;
        }
        double sharpe = mean / std * Math.sqrt(TRADING_DAYS_PER_YEAR);
        return BigDecimal.valueOf(sharpe).setScale(4, RoundingMode.HALF_UP);
    }

    /** 最大回撤 (正数, 0.15 表示曾从峰值回撤 15%)。 */
    private BigDecimal maxDrawdown(BigDecimal[] equity) {
        double peak = equity[0].doubleValue();
        double maxDd = 0;
        for (BigDecimal e : equity) {
            double v = e.doubleValue();
            if (v > peak) {
                peak = v;
            } else if (peak > 0) {
                maxDd = Math.max(maxDd, (peak - v) / peak);
            }
        }
        return BigDecimal.valueOf(maxDd).setScale(4, RoundingMode.HALF_UP);
    }

    // ---------- 参数解析 ----------

    private Strategy parseStrategy(String raw) {
        try {
            return Strategy.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(
                    "未知策略: " + raw + "（可选 MA_CROSS / MOMENTUM / MEAN_REVERSION / BUY_HOLD / CUSTOM）");
        }
    }

    private StrategyParams resolveParams(Strategy strategy, RunRequest r) {
        switch (strategy) {
            case MA_CROSS -> {
                int fast = intParam(r.fastWindow(), DEFAULT_FAST, MIN_FAST, MAX_FAST, "快线窗口");
                int slow = intParam(r.slowWindow(), DEFAULT_SLOW, MIN_SLOW, MAX_SLOW, "慢线窗口");
                if (fast >= slow) {
                    throw new BusinessException("快线窗口必须小于慢线窗口");
                }
                return new StrategyParams(fast, slow, 0, 0, 0, null, null,
                        "fast=" + fast + ",slow=" + slow);
            }
            case MOMENTUM -> {
                int lookback = intParam(r.lookbackDays(),
                        DEFAULT_LOOKBACK, MIN_LOOKBACK, MAX_LOOKBACK, "动量回看天数");
                return new StrategyParams(0, 0, lookback, 0, 0, null, null, "lookback=" + lookback);
            }
            case MEAN_REVERSION -> {
                int win = intParam(r.maWindow(),
                        DEFAULT_MA_WINDOW, MIN_MA_WINDOW, MAX_MA_WINDOW, "均值窗口");
                double th = r.threshold() == null ? DEFAULT_THRESHOLD : r.threshold().doubleValue();
                if (th < MIN_THRESHOLD || th > MAX_THRESHOLD) {
                    throw new BusinessException("偏离阈值须在 " + MIN_THRESHOLD + " ~ " + MAX_THRESHOLD + " 之间");
                }
                return new StrategyParams(0, 0, 0, win, th, null, null,
                        "ma=" + win + ",th=" + BigDecimal.valueOf(th).stripTrailingZeros().toPlainString());
            }
            case CUSTOM -> {
                List<Rule> buy = compileRules(r.buyConditions(), "买入");
                List<Rule> sell = compileRules(r.sellConditions(), "卖出");
                return new StrategyParams(0, 0, 0, 0, 0, buy, sell,
                        "买[" + rulesLabel(buy) + "] 卖[" + rulesLabel(sell) + "]");
            }
            default -> {
                return new StrategyParams(0, 0, 0, 0, 0, null, null, "");
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
            throw new BusinessException("未知字段: " + raw + "（可选 CLOSE / MA5 / MA20 / PCT_CHANGE）");
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
