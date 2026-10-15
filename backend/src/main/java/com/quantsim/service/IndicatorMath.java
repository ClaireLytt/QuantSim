package com.quantsim.service;

/**
 * 回测用技术指标 (基于收盘序列的内存计算, 不依赖 daily_indicator 表)。
 * 全部返回与输入等长的数组, 暖机期内值为 NaN。
 */
public final class IndicatorMath {

    private IndicatorMath() {}

    /** Wilder RSI (0~100)。 */
    public static double[] rsi(double[] closes, int period) {
        int n = closes.length;
        double[] out = new double[n];
        java.util.Arrays.fill(out, Double.NaN);
        if (n <= period) {
            return out;
        }
        double gain = 0;
        double loss = 0;
        for (int i = 1; i <= period; i++) {
            double d = closes[i] - closes[i - 1];
            if (d > 0) {
                gain += d;
            } else {
                loss -= d;
            }
        }
        double avgGain = gain / period;
        double avgLoss = loss / period;
        out[period] = toRsi(avgGain, avgLoss);
        for (int i = period + 1; i < n; i++) {
            double d = closes[i] - closes[i - 1];
            avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
            out[i] = toRsi(avgGain, avgLoss);
        }
        return out;
    }

    private static double toRsi(double avgGain, double avgLoss) {
        if (avgLoss == 0) {
            return avgGain == 0 ? 50 : 100;
        }
        return 100 - 100 / (1 + avgGain / avgLoss);
    }

    /** 指数移动平均, 前 period-1 天为 NaN, 第 period 天用简单均值起步。 */
    public static double[] ema(double[] values, int period) {
        int n = values.length;
        double[] out = new double[n];
        java.util.Arrays.fill(out, Double.NaN);
        if (n < period) {
            return out;
        }
        double sum = 0;
        for (int i = 0; i < period; i++) {
            sum += values[i];
        }
        out[period - 1] = sum / period;
        double k = 2.0 / (period + 1);
        for (int i = period; i < n; i++) {
            out[i] = values[i] * k + out[i - 1] * (1 - k);
        }
        return out;
    }

    /** MACD 完整输出: [0]=DIF (快慢 EMA 差) [1]=DEA (DIF 的 signal 期 EMA), 柱 = DIF-DEA。 */
    public static double[][] macd(double[] closes, int fast, int slow, int signal) {
        int n = closes.length;
        double[] emaFast = ema(closes, fast);
        double[] emaSlow = ema(closes, slow);
        double[] dif = new double[n];
        double[] dea = new double[n];
        java.util.Arrays.fill(dif, Double.NaN);
        java.util.Arrays.fill(dea, Double.NaN);
        int difStart = slow - 1;
        for (int i = difStart; i < n; i++) {
            dif[i] = emaFast[i] - emaSlow[i];
        }
        if (n - difStart >= signal) {
            double sum = 0;
            for (int i = difStart; i < difStart + signal; i++) {
                sum += dif[i];
            }
            double d = sum / signal;
            dea[difStart + signal - 1] = d;
            double k = 2.0 / (signal + 1);
            for (int i = difStart + signal; i < n; i++) {
                d = dif[i] * k + d * (1 - k);
                dea[i] = d;
            }
        }
        return new double[][] { dif, dea };
    }

    /** MACD 柱 (DIF - DEA): 由 macd() 派生, 不再重复一份 EMA 递推。 */
    public static double[] macdHist(double[] closes, int fast, int slow, int signal) {
        double[][] md = macd(closes, fast, slow, signal);
        double[] hist = new double[closes.length];
        for (int i = 0; i < hist.length; i++) {
            hist[i] = md[0][i] - md[1][i]; // 任一为 NaN 时结果自然为 NaN, 与原实现一致
        }
        return hist;
    }

    /** 布林带: [0]=上轨 [1]=中轨 [2]=下轨, 中轨为 window 日均线, 带宽 k 倍标准差。 */
    public static double[][] bollinger(double[] closes, int window, double k) {
        int n = closes.length;
        double[][] out = new double[3][n];
        for (double[] row : out) {
            java.util.Arrays.fill(row, Double.NaN);
        }
        double sum = 0;
        double sumSq = 0;
        for (int i = 0; i < n; i++) {
            sum += closes[i];
            sumSq += closes[i] * closes[i];
            if (i >= window) {
                sum -= closes[i - window];
                sumSq -= closes[i - window] * closes[i - window];
            }
            if (i + 1 >= window) {
                double mean = sum / window;
                double var = Math.max(0, sumSq / window - mean * mean);
                double std = Math.sqrt(var);
                out[0][i] = mean + k * std;
                out[1][i] = mean;
                out[2][i] = mean - k * std;
            }
        }
        return out;
    }

    /** 唐奇安通道上沿: 前 window 天 (不含当天) 的最高收盘; 不足为 NaN。 */
    public static double[] donchianHigh(double[] closes, int window) {
        int n = closes.length;
        double[] out = new double[n];
        java.util.Arrays.fill(out, Double.NaN);
        for (int i = window; i < n; i++) {
            double max = Double.NEGATIVE_INFINITY;
            for (int j = i - window; j < i; j++) {
                max = Math.max(max, closes[j]);
            }
            out[i] = max;
        }
        return out;
    }

    /** 唐奇安通道下沿: 前 window 天 (不含当天) 的最低收盘。 */
    public static double[] donchianLow(double[] closes, int window) {
        int n = closes.length;
        double[] out = new double[n];
        java.util.Arrays.fill(out, Double.NaN);
        for (int i = window; i < n; i++) {
            double min = Double.POSITIVE_INFINITY;
            for (int j = i - window; j < i; j++) {
                min = Math.min(min, closes[j]);
            }
            out[i] = min;
        }
        return out;
    }
}
