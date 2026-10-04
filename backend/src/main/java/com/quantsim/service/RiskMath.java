package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * 资金曲线风险指标: 结算复盘与回测竞技场共用同一套口径。
 * 输入统一为逐日净值序列 (首点通常是初始资金), 指标无意义时返回 null
 * (样本不足、波动为 0、没有亏损日等), 由前端渲染为 "--"。
 */
public final class RiskMath {

    public static final double TRADING_DAYS_PER_YEAR = 252.0;

    /** 指标统一保留 4 位小数, 与回测竞技场一致。 */
    private static final int SCALE = 4;

    /** 日收益样本太少时均值/方差没有统计意义, 一律返回 null。 */
    private static final int MIN_RETURNS = 2;

    private static final double EPS = 1e-12;

    private RiskMath() {
    }

    /**
     * 逐日简单收益率。净值可能被打到 0 以下 (进阶模式爆仓),
     * 此时比值失去意义, 跳过以前一日为非正值的样本对。
     */
    public static double[] dailyReturns(List<BigDecimal> equity) {
        if (equity == null || equity.size() < 2) {
            return new double[0];
        }
        double[] buf = new double[equity.size() - 1];
        int n = 0;
        for (int i = 1; i < equity.size(); i++) {
            double prev = equity.get(i - 1).doubleValue();
            if (prev <= 0) {
                continue;
            }
            buf[n++] = equity.get(i).doubleValue() / prev - 1;
        }
        double[] returns = new double[n];
        System.arraycopy(buf, 0, returns, 0, n);
        return returns;
    }

    /** 最大回撤 (正数, 0.15 表示曾从峰值回撤 15%)。 */
    public static BigDecimal maxDrawdown(List<BigDecimal> equity) {
        if (equity == null || equity.isEmpty()) {
            return null;
        }
        double peak = equity.get(0).doubleValue();
        double maxDd = 0;
        for (BigDecimal e : equity) {
            double v = e.doubleValue();
            if (v > peak) {
                peak = v;
            } else if (peak > 0) {
                maxDd = Math.max(maxDd, (peak - v) / peak);
            }
        }
        return scaled(maxDd);
    }

    /** 年化波动率: std(日收益)*sqrt(252)。 */
    public static BigDecimal volatility(double[] returns) {
        if (returns.length < MIN_RETURNS) {
            return null;
        }
        return scaled(std(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR));
    }

    /** 年化夏普比率 (无风险利率取 0): mean(日收益)/std(日收益)*sqrt(252)。波动为 0 时无意义。 */
    public static BigDecimal sharpe(double[] returns) {
        if (returns.length < MIN_RETURNS) {
            return null;
        }
        double std = std(returns);
        if (std < EPS) {
            return null;
        }
        return scaled(mean(returns) / std * Math.sqrt(TRADING_DAYS_PER_YEAR));
    }

    /**
     * 年化索提诺比率: 分母只计下行波动 sqrt(mean(min(r,0)^2))。
     * 夏普把上涨的波动也算作"风险", 索提诺只惩罚亏损日——没有亏损日时无意义。
     */
    public static BigDecimal sortino(double[] returns) {
        if (returns.length < MIN_RETURNS) {
            return null;
        }
        double downSq = 0;
        boolean hasLoss = false;
        for (double r : returns) {
            if (r < 0) {
                downSq += r * r;
                hasLoss = true;
            }
        }
        double downside = Math.sqrt(downSq / returns.length);
        if (!hasLoss || downside < EPS) {
            return null;
        }
        return scaled(mean(returns) / downside * Math.sqrt(TRADING_DAYS_PER_YEAR));
    }

    /** 日胜率: 正收益日 / 有涨跌的交易日 (空仓躺平的零收益日不计入)。 */
    public static BigDecimal winRate(double[] returns) {
        int wins = 0;
        int nonZero = 0;
        for (double r : returns) {
            if (Math.abs(r) < EPS) {
                continue;
            }
            nonZero++;
            if (r > 0) {
                wins++;
            }
        }
        if (nonZero == 0) {
            return null;
        }
        return scaled((double) wins / nonZero);
    }

    /** 盈亏比: 平均盈利日收益 / 平均亏损日跌幅。全胜或全败时无意义。 */
    public static BigDecimal profitLossRatio(double[] returns) {
        double winSum = 0;
        double lossSum = 0;
        int wins = 0;
        int losses = 0;
        for (double r : returns) {
            if (r > EPS) {
                winSum += r;
                wins++;
            } else if (r < -EPS) {
                lossSum += -r;
                losses++;
            }
        }
        if (wins == 0 || losses == 0) {
            return null;
        }
        return scaled((winSum / wins) / (lossSum / losses));
    }

    private static double mean(double[] xs) {
        double m = 0;
        for (double x : xs) {
            m += x;
        }
        return m / xs.length;
    }

    /** 样本标准差 (分母 n-1), 与回测竞技场原实现一致。 */
    private static double std(double[] xs) {
        double m = mean(xs);
        double var = 0;
        for (double x : xs) {
            var += (x - m) * (x - m);
        }
        return Math.sqrt(var / (xs.length - 1));
    }

    private static BigDecimal scaled(double v) {
        return BigDecimal.valueOf(v).setScale(SCALE, RoundingMode.HALF_UP);
    }
}
