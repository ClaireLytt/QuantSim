package com.quantsim.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.dto.BacktestDtos.TuneRequest;
import com.quantsim.exception.BusinessException;
import com.quantsim.service.BacktestEngine.Strategy;
import com.quantsim.service.BacktestEngine.StrategyParams;

/**
 * 自动调参网格: 每个策略的候选参数组合与"最优点 -> 正式回测请求"的重建函数。
 * 从 BacktestService 拆出的纯网格构造器 —— 不跑模拟, 模拟由调用方循环调 BacktestEngine。
 */
@Component
public class BacktestTuner {

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

    interface Rebuild extends java.util.function.Function<TuneRequest, RunRequest> {}

    record GridPoint(StrategyParams params, double x, double y,
                     Map<String, BigDecimal> bestParams, Rebuild rebuild) {}

    record Grid(List<String> paramKeys, List<GridPoint> points) {}

    /** 空 RunRequest 模板: 只带 username/stockCode/strategy, 由各策略填充自己的参数。 */
    private static RunRequest template(TuneRequest t, Strategy s) {
        return new RunRequest(t.username(), t.stockCode(), s.name(),
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    Grid buildGrid(Strategy strategy) {
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
                                BacktestEngine.maCrossParams(f, sl, BacktestEngine.DEFAULT_POSITION_PCT), f, sl,
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
                            BacktestEngine.momentumParams(l, BacktestEngine.DEFAULT_POSITION_PCT), l, 0,
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
                                BacktestEngine.meanRevParams(w, v, BacktestEngine.DEFAULT_POSITION_PCT), w, v,
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
                                BacktestEngine.rsiParams(pd, b, sell, BacktestEngine.DEFAULT_POSITION_PCT), pd, b,
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
                                BacktestEngine.macdParams(f, sl, BacktestEngine.DEFAULT_MACD_SIGNAL,
                                        BacktestEngine.DEFAULT_POSITION_PCT), f, sl,
                                params("macdFast", f, "macdSlow", sl, "macdSignal", BacktestEngine.DEFAULT_MACD_SIGNAL),
                                t -> withMacd(template(t, strategy), f, sl, BacktestEngine.DEFAULT_MACD_SIGNAL)));
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
                                BacktestEngine.bollParams(w, kv, BacktestEngine.DEFAULT_POSITION_PCT), w, kv,
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
                                BacktestEngine.gridParams(pv, lv, BacktestEngine.DEFAULT_POSITION_PCT), pv * 100, lv,
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
                                BacktestEngine.turtleParams(en, ex, BacktestEngine.DEFAULT_POSITION_PCT), en, ex,
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
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMomentum(RunRequest r, int lookback) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, lookback, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMeanRev(RunRequest r, int win, double th) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, win,
                BigDecimal.valueOf(th),
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withRsi(RunRequest r, int period, int buy, int sell) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, period, buy, sell, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withMacd(RunRequest r, int fast, int slow, int signal) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, fast, slow, signal, null, null, null, null, null, null, null, null);
    }

    private static RunRequest withBoll(RunRequest r, int win, double k) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, win, BigDecimal.valueOf(k),
                null, null, null, null, null, null);
    }

    private static RunRequest withGrid(RunRequest r, double pct, int levels) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                BigDecimal.valueOf(pct * 100), levels, null, null, null, null);
    }

    private static RunRequest withTurtle(RunRequest r, int entry, int exit) {
        return new RunRequest(r.username(), r.stockCode(), r.strategy(), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, entry, exit, null, null);
    }
}
