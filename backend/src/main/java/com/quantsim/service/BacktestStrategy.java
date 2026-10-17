package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.quantsim.dto.BacktestDtos.CustomCondition;
import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.exception.BusinessException;

/**
 * 回测策略词汇表: 每个策略是一个常量体, 自带参数解析 (parse)、指标准备 (prepare)、
 * 信号 (signal) / 目标仓位 (targetShares) 与调参网格 (grid)。
 * 新增策略 = 新增一个常量体, 不再需要同时改引擎/调参器/响应组装的多处 switch
 * (2026-10 之前这些逻辑抹在 BacktestEngine/BacktestTuner/BacktestService 三个文件里)。
 * 模拟循环本身 (资金/费用/成交) 在 BacktestEngine, 策略只回答"今天目标持仓多少"。
 */
public enum BacktestStrategy {

    MA_CROSS {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int fast = intParam(r.fastWindow(), DEFAULT_FAST, MIN_FAST, MAX_FAST, "快线窗口");
            int slow = intParam(r.slowWindow(), DEFAULT_SLOW, MIN_SLOW, MAX_SLOW, "慢线窗口");
            if (fast >= slow) {
                throw new BusinessException("快线窗口必须小于慢线窗口");
            }
            return maCrossParams(fast, slow, pos);
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            if (i + 1 < sp.slow()) {
                return 0;
            }
            double fast = ma(ctx.prefix, i, sp.fast());
            double slow = ma(ctx.prefix, i, sp.slow());
            return fast > slow ? 1 : fast < slow ? -1 : 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int fast : TUNE_FAST) {
                for (int slow : TUNE_SLOW) {
                    if (fast >= slow) {
                        continue;
                    }
                    points.add(new GridPoint(maCrossParams(fast, slow, DEFAULT_POSITION_PCT),
                            fast, slow, params("fast", fast, "slow", slow)));
                }
            }
            return new Grid(List.of("fast", "slow"), points);
        }
    },

    MOMENTUM {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int lookback = intParam(r.lookbackDays(),
                    DEFAULT_LOOKBACK, MIN_LOOKBACK, MAX_LOOKBACK, "动量回看天数");
            return momentumParams(lookback, pos);
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            if (i < sp.lookback()) {
                return 0;
            }
            double past = ctx.closes[i - sp.lookback()];
            return ctx.closes[i] > past ? 1 : ctx.closes[i] < past ? -1 : 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int lb : TUNE_LOOKBACK) {
                points.add(new GridPoint(momentumParams(lb, DEFAULT_POSITION_PCT), lb, 0,
                        params("lookback", lb)));
            }
            return new Grid(List.of("lookback"), points);
        }
    },

    MEAN_REVERSION {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int win = intParam(r.maWindow(), DEFAULT_MA_WINDOW, MIN_MA_WINDOW, MAX_MA_WINDOW, "均值窗口");
            double th = r.threshold() == null ? DEFAULT_THRESHOLD : r.threshold().doubleValue();
            if (th < MIN_THRESHOLD || th > MAX_THRESHOLD) {
                throw new BusinessException("偏离阈值须在 " + MIN_THRESHOLD + " ~ " + MAX_THRESHOLD + " 之间");
            }
            return meanRevParams(win, th, pos);
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            if (i + 1 < sp.maWindow()) {
                return 0;
            }
            double m = ma(ctx.prefix, i, sp.maWindow());
            if (ctx.closes[i] < m * (1 - sp.threshold())) {
                return 1;
            }
            if (ctx.closes[i] > m * (1 + sp.threshold())) {
                return -1;
            }
            return 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int win : TUNE_MA) {
                for (double th : TUNE_TH) {
                    points.add(new GridPoint(meanRevParams(win, th, DEFAULT_POSITION_PCT), win, th,
                            params("maWindow", win, "threshold", th)));
                }
            }
            return new Grid(List.of("maWindow", "threshold"), points);
        }
    },

    RSI {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int period = intParam(r.rsiPeriod(), DEFAULT_RSI_PERIOD, MIN_RSI_PERIOD, MAX_RSI_PERIOD, "RSI 周期");
            int buy = intParam(r.rsiBuy(), DEFAULT_RSI_BUY, MIN_RSI_BUY, MAX_RSI_BUY, "RSI 买入阈值");
            int sell = intParam(r.rsiSell(), DEFAULT_RSI_SELL, MIN_RSI_SELL, MAX_RSI_SELL, "RSI 卖出阈值");
            return rsiParams(period, buy, sell, pos);
        }

        @Override
        void prepare(StrategyParams sp, Ctx ctx) {
            ctx.rsi = IndicatorMath.rsi(ctx.closes, sp.maWindow());
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            double v = ctx.rsi[i];
            if (Double.isNaN(v)) {
                return 0;
            }
            // fast=买入阈值 slow=卖出阈值 (见 rsiParams)
            if (v < sp.fast()) {
                return 1;
            }
            if (v > sp.slow()) {
                return -1;
            }
            return 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int period : TUNE_RSI_PERIOD) {
                for (int buy : TUNE_RSI_BUY) {
                    int sell = 100 - buy;
                    points.add(new GridPoint(rsiParams(period, buy, sell, DEFAULT_POSITION_PCT), period, buy,
                            params("rsiPeriod", period, "rsiBuy", buy, "rsiSell", sell)));
                }
            }
            return new Grid(List.of("rsiPeriod", "rsiBuy"), points);
        }
    },

    MACD {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int fast = intParam(r.macdFast(), DEFAULT_MACD_FAST, MIN_MACD_FAST, MAX_MACD_FAST, "MACD 快线");
            int slow = intParam(r.macdSlow(), DEFAULT_MACD_SLOW, MIN_MACD_SLOW, MAX_MACD_SLOW, "MACD 慢线");
            int signal = intParam(r.macdSignal(),
                    DEFAULT_MACD_SIGNAL, MIN_MACD_SIGNAL, MAX_MACD_SIGNAL, "MACD 信号线");
            if (fast >= slow) {
                throw new BusinessException("MACD 快线必须小于慢线");
            }
            return macdParams(fast, slow, signal, pos);
        }

        @Override
        void prepare(StrategyParams sp, Ctx ctx) {
            ctx.macdHist = IndicatorMath.macdHist(ctx.closes, sp.fast(), sp.slow(), sp.signalWin());
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            double h = ctx.macdHist[i];
            if (Double.isNaN(h)) {
                return 0;
            }
            return h > 0 ? 1 : h < 0 ? -1 : 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int fast : TUNE_MACD_FAST) {
                for (int slow : TUNE_MACD_SLOW) {
                    if (fast >= slow) {
                        continue;
                    }
                    points.add(new GridPoint(
                            macdParams(fast, slow, DEFAULT_MACD_SIGNAL, DEFAULT_POSITION_PCT), fast, slow,
                            params("macdFast", fast, "macdSlow", slow, "macdSignal", DEFAULT_MACD_SIGNAL)));
                }
            }
            return new Grid(List.of("macdFast", "macdSlow"), points);
        }
    },

    BOLL {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int win = intParam(r.bollWindow(), DEFAULT_BOLL_WIN, MIN_BOLL_WIN, MAX_BOLL_WIN, "布林窗口");
            double k = r.bollK() == null ? DEFAULT_BOLL_K : r.bollK().doubleValue();
            if (k < MIN_BOLL_K || k > MAX_BOLL_K) {
                throw new BusinessException("带宽倍数须在 " + MIN_BOLL_K + " ~ " + MAX_BOLL_K + " 之间");
            }
            return bollParams(win, k, pos);
        }

        @Override
        void prepare(StrategyParams sp, Ctx ctx) {
            ctx.boll = IndicatorMath.bollinger(ctx.closes, sp.maWindow(), sp.k());
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            if (ctx.boll == null || Double.isNaN(ctx.boll[1][i])) {
                return 0;
            }
            if (ctx.closes[i] < ctx.boll[2][i]) {
                return 1;
            }
            if (ctx.closes[i] > ctx.boll[0][i]) {
                return -1;
            }
            return 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int win : TUNE_BOLL_WIN) {
                for (double k : TUNE_BOLL_K) {
                    points.add(new GridPoint(bollParams(win, k, DEFAULT_POSITION_PCT), win, k,
                            params("bollWindow", win, "bollK", k)));
                }
            }
            return new Grid(List.of("bollWindow", "bollK"), points);
        }
    },

    GRID {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            double pct = r.gridPct() == null ? DEFAULT_GRID_PCT : r.gridPct().doubleValue() / 100.0;
            if (pct < MIN_GRID_PCT || pct > MAX_GRID_PCT) {
                throw new BusinessException("网格间距须在 1% ~ 20% 之间");
            }
            int levels = intParam(r.gridLevels(),
                    DEFAULT_GRID_LEVELS, MIN_GRID_LEVELS, MAX_GRID_LEVELS, "网格层数");
            return gridParams(pct, levels, pos);
        }

        /** 网格按价格档位连续调仓, 不走 +1/-1 信号。 */
        @Override
        Integer targetShares(StrategyParams sp, Ctx ctx, DayState st) {
            double gridBase = ctx.closes[0];
            double steps = (gridBase - ctx.closes[st.i()]) / (gridBase * sp.threshold());
            double frac = Math.max(0, Math.min(1, steps / sp.levels()));
            return wholeShares(st.equityNow().doubleValue() * frac * sp.positionPct() / 100.0,
                    ctx.closes[st.i()], st.lotSize());
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (double pct : TUNE_GRID_PCT) {
                for (int levels : TUNE_GRID_LEVELS) {
                    points.add(new GridPoint(gridParams(pct, levels, DEFAULT_POSITION_PCT), pct * 100, levels,
                            params("gridPct", pct * 100, "gridLevels", levels)));
                }
            }
            return new Grid(List.of("gridPct", "gridLevels"), points);
        }
    },

    TURTLE {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            int entry = intParam(r.turtleEntry(),
                    DEFAULT_TURTLE_ENTRY, MIN_TURTLE_ENTRY, MAX_TURTLE_ENTRY, "入场突破日数");
            int exit = intParam(r.turtleExit(),
                    DEFAULT_TURTLE_EXIT, MIN_TURTLE_EXIT, MAX_TURTLE_EXIT, "离场突破日数");
            return turtleParams(entry, exit, pos);
        }

        @Override
        void prepare(StrategyParams sp, Ctx ctx) {
            ctx.donchianHigh = IndicatorMath.donchianHigh(ctx.closes, sp.fast());
            ctx.donchianLow = IndicatorMath.donchianLow(ctx.closes, sp.slow());
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            double hi = ctx.donchianHigh[i];
            double lo = ctx.donchianLow[i];
            if (!Double.isNaN(hi) && ctx.closes[i] > hi) {
                return 1;
            }
            if (!Double.isNaN(lo) && ctx.closes[i] < lo) {
                return -1;
            }
            return 0;
        }

        @Override
        Grid grid() {
            List<GridPoint> points = new ArrayList<>();
            for (int entry : TUNE_TURTLE_ENTRY) {
                for (int exit : TUNE_TURTLE_EXIT) {
                    points.add(new GridPoint(turtleParams(entry, exit, DEFAULT_POSITION_PCT), entry, exit,
                            params("turtleEntry", entry, "turtleExit", exit)));
                }
            }
            return new Grid(List.of("turtleEntry", "turtleExit"), points);
        }
    },

    DCA {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            // 定投: lookbackDays 复用为投入间隔 (交易日)
            int interval = intParam(r.lookbackDays(), 5, 2, 60, "定投间隔");
            return new StrategyParams(0, 0, interval, 0, 0, 0, 0, 0, pos, null, null,
                    "every " + interval + "d" + posLabel(pos));
        }

        /** 定投: 每 lookback 天投一期 (预算 = 初始资金均分), 只买不卖, 纪律代替择时。 */
        @Override
        Integer targetShares(StrategyParams sp, Ctx ctx, DayState st) {
            if (st.i() % sp.lookback() != 0) {
                return null;
            }
            double tranche = st.initial().doubleValue() * sp.positionPct() / 100.0
                    / (st.n() / sp.lookback() + 1);
            int add = wholeShares(Math.min(tranche, st.cash().doubleValue()),
                    ctx.closes[st.i()], st.lotSize());
            return add > 0 ? st.shares() + add : null;
        }
    },

    BUY_HOLD {
        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            return i == 0 ? 1 : 0;
        }
    },

    CUSTOM {
        @Override
        StrategyParams parse(RunRequest r) {
            int pos = positionPct(r);
            List<Rule> buy = compileRules(r.buyConditions(), "买入");
            List<Rule> sell = compileRules(r.sellConditions(), "卖出");
            return new StrategyParams(0, 0, 0, 0, 0, 0, 0, 0, pos, buy, sell,
                    "买[" + rulesLabel(buy) + "] 卖[" + rulesLabel(sell) + "]" + posLabel(pos));
        }

        /** 自定义规则引用到的指标按默认参数准备 (规则字段没有参数位)。 */
        @Override
        void prepare(StrategyParams sp, Ctx ctx) {
            if (usesField(sp, CustomField.RSI)) {
                ctx.rsi = IndicatorMath.rsi(ctx.closes, DEFAULT_RSI_PERIOD);
            }
            if (usesField(sp, CustomField.MACD_HIST)) {
                ctx.macdHist = IndicatorMath.macdHist(ctx.closes,
                        DEFAULT_MACD_FAST, DEFAULT_MACD_SLOW, DEFAULT_MACD_SIGNAL);
            }
            if (usesField(sp, CustomField.BOLL_UP) || usesField(sp, CustomField.BOLL_MID)
                    || usesField(sp, CustomField.BOLL_LOW)) {
                ctx.boll = IndicatorMath.bollinger(ctx.closes, DEFAULT_BOLL_WIN, DEFAULT_BOLL_K);
            }
        }

        @Override
        int signal(StrategyParams sp, Ctx ctx, int i) {
            if (allMatch(sp.buyRules(), ctx, i)) {
                return 1;
            }
            if (allMatch(sp.sellRules(), ctx, i)) {
                return -1;
            }
            return 0;
        }
    };

    // ---------- 策略挂钩 (每个常量体按需覆写) ----------

    /** 参数解析 + 校验; 默认 (BUY_HOLD) 无参数。 */
    StrategyParams parse(RunRequest r) {
        return new StrategyParams(0, 0, 0, 0, 0, 0, 0, 0, 100, null, null, "");
    }

    /** 本策略需要的指标在模拟前算好放进 Ctx; 默认不需要额外指标。 */
    void prepare(StrategyParams sp, Ctx ctx) {
    }

    /** +1 建仓 / -1 清仓 / 0 保持。窗口数据不足时不动作。 */
    int signal(StrategyParams sp, Ctx ctx, int i) {
        return 0;
    }

    /**
     * 当日目标持仓 (null = 不动作)。默认由 signal 推导:
     * +1 -> 满目标 (只加仓不减仓: 持续 +1 信号下不因净值回落而反复剁仓), -1 -> 清仓。
     * GRID/DCA 不走信号, 直接覆写本方法。
     */
    Integer targetShares(StrategyParams sp, Ctx ctx, DayState st) {
        int signal = signal(sp, ctx, st.i());
        if (signal > 0) {
            int tgt = wholeShares(st.equityNow().doubleValue() * sp.positionPct() / 100.0,
                    ctx.closes[st.i()], st.lotSize());
            return Math.max(st.shares(), tgt);
        }
        return signal < 0 ? 0 : null;
    }

    /** 自动调参网格; 默认不支持。 */
    Grid grid() {
        throw new BusinessException("该策略不支持自动调参");
    }

    /** 指标上下文: closes/prefix 公共构建, 策略各自 prepare 所需指标。 */
    Ctx buildCtx(StrategyParams sp, double[] closes) {
        Ctx ctx = new Ctx();
        ctx.closes = closes;
        ctx.prefix = new double[closes.length + 1];
        for (int i = 0; i < closes.length; i++) {
            ctx.prefix[i + 1] = ctx.prefix[i] + closes[i];
        }
        prepare(sp, ctx);
        return ctx;
    }

    // ---------- 词汇表 ----------

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

    /** 自定义条件编译结果: rightField 为 null 时右侧取常数 rightValue。 */
    record Rule(CustomField left, CustomOp op, CustomField rightField, double rightValue) {}

    record StrategyParams(int fast, int slow, int lookback, int maWindow, double threshold,
            int signalWin, double k, int levels, int positionPct,
            List<Rule> buyRules, List<Rule> sellRules, String label) {}

    /** simulate 单日可见的账面状态 (targetShares 钩子的输入)。 */
    record DayState(int i, int n, BigDecimal equityNow, BigDecimal cash,
                    int shares, int lotSize, BigDecimal initial) {}

    record GridPoint(StrategyParams params, double x, double y, Map<String, BigDecimal> bestParams) {}

    record Grid(List<String> paramKeys, List<GridPoint> points) {}

    /** 指标上下文: 按策略/自定义规则按需计算, 供 signal 与 fieldValue 共用。 */
    static final class Ctx {
        double[] closes;
        double[] prefix;
        double[] rsi;
        double[] macdHist;
        double[][] boll;
        double[] donchianHigh;
        double[] donchianLow;
    }

    // 各策略参数默认值与合法范围
    static final int DEFAULT_FAST = 5, MIN_FAST = 2, MAX_FAST = 60;
    static final int DEFAULT_SLOW = 20, MIN_SLOW = 5, MAX_SLOW = 120;
    static final int DEFAULT_LOOKBACK = 10, MIN_LOOKBACK = 2, MAX_LOOKBACK = 60;
    static final int DEFAULT_MA_WINDOW = 20, MIN_MA_WINDOW = 5, MAX_MA_WINDOW = 60;
    static final double DEFAULT_THRESHOLD = 0.05, MIN_THRESHOLD = 0.01, MAX_THRESHOLD = 0.20;
    static final int DEFAULT_RSI_PERIOD = 14, MIN_RSI_PERIOD = 5, MAX_RSI_PERIOD = 30;
    static final int DEFAULT_RSI_BUY = 30, MIN_RSI_BUY = 10, MAX_RSI_BUY = 45;
    static final int DEFAULT_RSI_SELL = 70, MIN_RSI_SELL = 55, MAX_RSI_SELL = 90;
    static final int DEFAULT_MACD_FAST = 12, MIN_MACD_FAST = 5, MAX_MACD_FAST = 20;
    static final int DEFAULT_MACD_SLOW = 26, MIN_MACD_SLOW = 15, MAX_MACD_SLOW = 60;
    static final int DEFAULT_MACD_SIGNAL = 9, MIN_MACD_SIGNAL = 3, MAX_MACD_SIGNAL = 20;
    static final int DEFAULT_BOLL_WIN = 20, MIN_BOLL_WIN = 10, MAX_BOLL_WIN = 60;
    static final double DEFAULT_BOLL_K = 2.0, MIN_BOLL_K = 1.0, MAX_BOLL_K = 4.0;
    static final double DEFAULT_GRID_PCT = 0.05, MIN_GRID_PCT = 0.01, MAX_GRID_PCT = 0.20;
    static final int DEFAULT_GRID_LEVELS = 5, MIN_GRID_LEVELS = 2, MAX_GRID_LEVELS = 10;
    static final int DEFAULT_TURTLE_ENTRY = 20, MIN_TURTLE_ENTRY = 10, MAX_TURTLE_ENTRY = 60;
    static final int DEFAULT_TURTLE_EXIT = 10, MIN_TURTLE_EXIT = 5, MAX_TURTLE_EXIT = 30;
    static final int DEFAULT_POSITION_PCT = 100, MIN_POSITION_PCT = 10, MAX_POSITION_PCT = 100;
    static final int MAX_CUSTOM_CONDITIONS = 5;

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

    // ---------- 参数工厂 (label 是入榜展示的参数摘要) ----------

    static StrategyParams maCrossParams(int fast, int slow, int pos) {
        return new StrategyParams(fast, slow, 0, 0, 0, 0, 0, 0, pos, null, null,
                "fast=" + fast + ",slow=" + slow + posLabel(pos));
    }

    static StrategyParams momentumParams(int lookback, int pos) {
        return new StrategyParams(0, 0, lookback, 0, 0, 0, 0, 0, pos, null, null,
                "lookback=" + lookback + posLabel(pos));
    }

    static StrategyParams meanRevParams(int win, double th, int pos) {
        return new StrategyParams(0, 0, 0, win, th, 0, 0, 0, pos, null, null,
                "ma=" + win + ",th=" + BigDecimal.valueOf(th).stripTrailingZeros().toPlainString() + posLabel(pos));
    }

    static StrategyParams rsiParams(int period, int buy, int sell, int pos) {
        return new StrategyParams(buy, sell, 0, period, 0, 0, 0, 0, pos, null, null,
                "rsi=" + period + ",buy<" + buy + ",sell>" + sell + posLabel(pos));
    }

    static StrategyParams macdParams(int fast, int slow, int signal, int pos) {
        return new StrategyParams(fast, slow, 0, 0, 0, signal, 0, 0, pos, null, null,
                "macd=" + fast + "/" + slow + "/" + signal + posLabel(pos));
    }

    static StrategyParams bollParams(int win, double k, int pos) {
        return new StrategyParams(0, 0, 0, win, 0, 0, k, 0, pos, null, null,
                "boll=" + win + ",k=" + BigDecimal.valueOf(k).stripTrailingZeros().toPlainString() + posLabel(pos));
    }

    static StrategyParams gridParams(double pct, int levels, int pos) {
        return new StrategyParams(0, 0, 0, 0, pct, 0, 0, levels, pos, null, null,
                "grid=" + BigDecimal.valueOf(pct * 100).stripTrailingZeros().toPlainString()
                        + "%,levels=" + levels + posLabel(pos));
    }

    static StrategyParams turtleParams(int entry, int exit, int pos) {
        return new StrategyParams(entry, exit, 0, 0, 0, 0, 0, 0, pos, null, null,
                "turtle=" + entry + "/" + exit + posLabel(pos));
    }

    private static String posLabel(int pos) {
        return pos == 100 ? "" : ",pos=" + pos + "%";
    }

    // ---------- 公共小工具 ----------

    private static int positionPct(RunRequest r) {
        return intParam(r.positionPct(), DEFAULT_POSITION_PCT, MIN_POSITION_PCT, MAX_POSITION_PCT, "仓位比例");
    }

    private static int intParam(Integer value, int def, int min, int max, String name) {
        int v = value == null ? def : value;
        if (v < min || v > max) {
            throw new BusinessException(name + "须在 " + min + " ~ " + max + " 之间");
        }
        return v;
    }

    /** value 金额按 price 换算成整手股数。 */
    static int wholeShares(double value, double price, int lotSize) {
        if (price <= 0 || value <= 0) {
            return 0;
        }
        int shares = (int) (value / price);
        return shares / lotSize * lotSize;
    }

    private static Map<String, BigDecimal> params(Object... kv) {
        Map<String, BigDecimal> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], new BigDecimal(String.valueOf(kv[i + 1])));
        }
        return map;
    }

    // ---------- 自定义条件编译与求值 ----------

    private static List<Rule> compileRules(List<CustomCondition> conditions, String side) {
        if (conditions == null || conditions.isEmpty()) {
            throw new BusinessException("自定义策略至少需要一条" + side + "条件");
        }
        if (conditions.size() > MAX_CUSTOM_CONDITIONS) {
            throw new BusinessException(side + "条件最多 " + MAX_CUSTOM_CONDITIONS + " 条");
        }
        List<Rule> rules = new ArrayList<>(conditions.size());
        for (CustomCondition c : conditions) {
            CustomField left = Enums.parse(c.left(), CustomField.class, "字段");
            CustomOp op = Enums.parse(c.op(), CustomOp.class, "算子");
            boolean hasField = c.rightField() != null && !c.rightField().isBlank();
            if (hasField == (c.rightValue() != null)) {
                throw new BusinessException(side + "条件右侧须为字段或常数（二选一）");
            }
            CustomField rightField = hasField ? Enums.parse(c.rightField(), CustomField.class, "字段") : null;
            double rightValue = hasField ? 0
                    : c.rightValue().setScale(4, RoundingMode.HALF_UP).doubleValue();
            rules.add(new Rule(left, op, rightField, rightValue));
        }
        return rules;
    }

    private static String rulesLabel(List<Rule> rules) {
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

    private static boolean usesField(StrategyParams sp, CustomField f) {
        return containsField(sp.buyRules(), f) || containsField(sp.sellRules(), f);
    }

    private static boolean containsField(List<Rule> rules, CustomField f) {
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

    private static boolean allMatch(List<Rule> rules, Ctx ctx, int i) {
        for (Rule r : rules) {
            if (!match(r, ctx, i)) {
                return false;
            }
        }
        return true;
    }

    private static boolean match(Rule r, Ctx ctx, int i) {
        double l = fieldValue(r.left(), ctx, i);
        double rv = rightValue(r, ctx, i);
        if (Double.isNaN(l) || Double.isNaN(rv)) {
            return false;
        }
        switch (r.op()) {
            case GT -> { return l > rv; }
            case LT -> { return l < rv; }
            default -> {
                if (i < 1) {
                    return false;
                }
                double lp = fieldValue(r.left(), ctx, i - 1);
                double rp = rightValue(r, ctx, i - 1);
                if (Double.isNaN(lp) || Double.isNaN(rp)) {
                    return false;
                }
                return r.op() == CustomOp.CROSS_UP
                        ? lp <= rp && l > rv
                        : lp >= rp && l < rv;
            }
        }
    }

    private static double rightValue(Rule r, Ctx ctx, int i) {
        return r.rightField() == null ? r.rightValue() : fieldValue(r.rightField(), ctx, i);
    }

    /** 字段在第 i 天的取值; 窗口数据不足时返回 NaN (条件视为不成立)。 */
    private static double fieldValue(CustomField f, Ctx ctx, int i) {
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

    private static double ma(double[] prefix, int i, int window) {
        return (prefix[i + 1] - prefix[i + 1 - window]) / window;
    }
}
