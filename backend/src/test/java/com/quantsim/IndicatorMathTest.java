package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

import com.quantsim.service.IndicatorMath;

/** 指标数学单测: 用手算/可推导序列验证 RSI / EMA / MACD / 布林 / 唐奇安。 */
class IndicatorMathTest {

    @Test
    void rsiOnMonotonicSeries() {
        // 一路上涨: 无下跌 -> RSI = 100
        double[] up = new double[20];
        for (int i = 0; i < up.length; i++) {
            up[i] = 10 + i;
        }
        double[] rsi = IndicatorMath.rsi(up, 14);
        assertThat(rsi[13]).isNaN();
        assertThat(rsi[14]).isEqualTo(100.0);
        assertThat(rsi[19]).isEqualTo(100.0);

        // 一路下跌 -> RSI = 0
        double[] down = new double[20];
        for (int i = 0; i < down.length; i++) {
            down[i] = 100 - i;
        }
        double[] rsiDown = IndicatorMath.rsi(down, 14);
        assertThat(rsiDown[19]).isCloseTo(0.0, within(1e-9));

        // 横盘 -> 涨跌均为 0, 定义为 50
        double[] flat = new double[20];
        java.util.Arrays.fill(flat, 10);
        assertThat(IndicatorMath.rsi(flat, 14)[19]).isEqualTo(50.0);
    }

    @Test
    void emaWarmupAndConvergence() {
        double[] v = {1, 2, 3, 4, 5, 6};
        double[] ema3 = IndicatorMath.ema(v, 3);
        assertThat(ema3[0]).isNaN();
        assertThat(ema3[1]).isNaN();
        assertThat(ema3[2]).isEqualTo(2.0); // (1+2+3)/3 起步
        // k=0.5: ema[3] = 4*0.5 + 2*0.5 = 3
        assertThat(ema3[3]).isCloseTo(3.0, within(1e-9));
        assertThat(ema3[4]).isCloseTo(4.0, within(1e-9));
    }

    @Test
    void macdHistSignsFollowTrend() {
        // 前段横盘后段陡涨: 涨段中 DIF 上穿 DEA, 柱应转正
        double[] closes = new double[60];
        for (int i = 0; i < 30; i++) {
            closes[i] = 100;
        }
        for (int i = 30; i < 60; i++) {
            closes[i] = 100 + (i - 29) * 2;
        }
        double[] hist = IndicatorMath.macdHist(closes, 12, 26, 9);
        assertThat(hist[20]).isNaN(); // 26+9-2 之前不足
        assertThat(hist[59]).isGreaterThan(0);
    }

    @Test
    void bollingerBandsOnFlatAndKnownSeries() {
        double[] flat = new double[25];
        java.util.Arrays.fill(flat, 10);
        double[][] boll = IndicatorMath.bollinger(flat, 20, 2);
        assertThat(boll[1][18]).isNaN();
        // 横盘: 标准差 0, 三轨重合
        assertThat(boll[0][20]).isCloseTo(10.0, within(1e-9));
        assertThat(boll[1][20]).isCloseTo(10.0, within(1e-9));
        assertThat(boll[2][20]).isCloseTo(10.0, within(1e-9));
    }

    @Test
    void donchianChannels() {
        double[] closes = {1, 2, 3, 4, 5, 4, 3, 2, 1, 6};
        double[] hi = IndicatorMath.donchianHigh(closes, 3);
        double[] lo = IndicatorMath.donchianLow(closes, 3);
        assertThat(hi[2]).isNaN();
        assertThat(hi[3]).isEqualTo(3.0); // 前 3 日 (1,2,3) 最高
        assertThat(hi[9]).isEqualTo(3.0); // 前 3 日 (3,2,1) 最高
        assertThat(lo[9]).isEqualTo(1.0);
    }
}
