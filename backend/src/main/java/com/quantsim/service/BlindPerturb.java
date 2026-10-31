package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrice;
import com.quantsim.service.MarketDataService.StockData;

/**
 * 盲局行情不可逆扰动 (审计创意24 / P1-9 根治, 产品拍板 2026-10-27)。
 *
 * 威胁模型: 盲局日期脱敏 + 标的匿名后, K 线仍下发精确 OHLC/量; 乘以固定系数只能挡
 * 绝对价比对, 收益率序列 (pct-change) 是尺度不变指纹, 滑窗匹配无鉴权的
 * /api/lab/history 全库仍可唯一定位标的与真实窗口。
 *
 * 对策: 全局系数 × 逐日累计乘性噪声 (收益率序列本身被扰动) + O/H/L 独立抖动
 * (盘中形态指纹) + 成交量独立缩放加噪。扰动种子对 (标的, 起始日) 确定——同一
 * 每日挑战/房间/战书全员同一扰动序列, 榜单可比; 种子混入服务端密钥 (app_salts),
 * 攻击者无法本地重建映射。ma5/ma20/pct/RSI/MACD 全部按扰动后收盘重算, 对局内
 * 口径自洽; 交易/结算/重放都发生在扰动空间, 收益率量级不失真 (逐日噪声 ±0.4%)。
 *
 * 代价 (已接受): 盲局行情不再逐字等于真实历史, 结算揭晓的是真实标的与窗口,
 * 但曲线是"保密化"后的版本; volatility 列仅 lab 页使用, 盲局不载入, 置 null。
 */
public final class BlindPerturb {

    /** 全局缩放系数区间 (挡绝对价比对)。 */
    static final double FACTOR_MIN = 0.5;
    static final double FACTOR_SPAN = 1.5;
    /** 逐日累计乘性噪声幅度 (挡收益率序列指纹): ±0.4%/日。 */
    static final double DRIFT = 0.004;
    /** O/H/L 独立抖动 (挡盘中形态指纹): ±0.1%。 */
    static final double JITTER = 0.001;
    /** 成交量逐日噪声: ±5% (量的全局系数另抽)。 */
    static final double VOL_NOISE = 0.05;

    private BlindPerturb() {
    }

    /** 扰动种子: SHA-256(标的+起始日) 前 8 字节 XOR 服务端密钥。 */
    public static long seed(long secret, long stockId, LocalDate startDate) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256")
                    .digest(("QS-PERTURB:" + stockId + ":" + startDate).getBytes(StandardCharsets.UTF_8));
            long s = 0;
            for (int i = 0; i < 8; i++) {
                s = (s << 8) | (h[i] & 0xffL);
            }
            return s ^ secret;
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    /** 对整股数据做确定性扰动, 返回全新的只读副本 (绝不回写数据库)。 */
    public static StockData perturb(StockData sd, long seed) {
        Random rng = new Random(seed);
        double factor = FACTOR_MIN + rng.nextDouble() * FACTOR_SPAN;
        double volFactor = FACTOR_MIN + rng.nextDouble() * FACTOR_SPAN;
        int n = sd.prices().size();
        List<DailyPrice> prices = new ArrayList<>(n);
        double[] closes = new double[n];
        double drift = 1.0;
        for (int i = 0; i < n; i++) {
            DailyPrice p = sd.prices().get(i);
            drift *= 1 + (rng.nextDouble() * 2 - 1) * DRIFT;
            double r = factor * drift;
            BigDecimal open = money(p.getOpen().doubleValue() * r * jitter(rng));
            BigDecimal close = money(p.getClose().doubleValue() * r);
            BigDecimal high = money(p.getHigh().doubleValue() * r * jitter(rng));
            BigDecimal low = money(p.getLow().doubleValue() * r * jitter(rng));
            // 抖动/舍入后重夹 OHLC 不变式
            high = high.max(open).max(close);
            low = low.min(open).min(close);
            DailyPrice np = new DailyPrice();
            np.setStockId(p.getStockId());
            np.setTradeDate(p.getTradeDate());
            np.setOpen(open);
            np.setHigh(high);
            np.setLow(low);
            np.setClose(close);
            np.setVolume(p.getVolume() == null ? null : Math.max(1, Math.round(
                    p.getVolume() * volFactor * (1 + (rng.nextDouble() * 2 - 1) * VOL_NOISE))));
            prices.add(np);
            closes[i] = close.doubleValue();
        }
        // 指标按扰动后收盘重算 (与真实管道同公式), 对局内图表/AI/风格画像口径自洽
        Map<LocalDate, DailyIndicator> indicators = new HashMap<>();
        for (int i = 0; i < n; i++) {
            DailyIndicator ind = new DailyIndicator();
            ind.setStockId(prices.get(i).getStockId());
            ind.setTradeDate(prices.get(i).getTradeDate());
            ind.setMa5(i >= 4 ? mean(closes, i, 5) : null);
            ind.setMa20(i >= 19 ? mean(closes, i, 20) : null);
            if (i > 0 && closes[i - 1] > 0) {
                ind.setPctChange(BigDecimal.valueOf(closes[i] / closes[i - 1] - 1)
                        .setScale(4, RoundingMode.HALF_UP));
            }
            indicators.put(ind.getTradeDate(), ind);
        }
        return new StockData(sd.stock(), List.copyOf(prices), sd.indexByDate(),
                Map.copyOf(indicators), sd.predictionsByModel(),
                IndicatorMath.rsi(closes, 14), IndicatorMath.macd(closes, 12, 26, 9));
    }

    private static double jitter(Random rng) {
        return 1 + (rng.nextDouble() * 2 - 1) * JITTER;
    }

    /** 两位小数, 下限 0.01 (扰动不许造出零价/负价)。 */
    private static BigDecimal money(double v) {
        BigDecimal b = BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
        return b.compareTo(new BigDecimal("0.01")) < 0 ? new BigDecimal("0.01") : b;
    }

    private static BigDecimal mean(double[] closes, int endIdx, int window) {
        double sum = 0;
        for (int i = endIdx - window + 1; i <= endIdx; i++) {
            sum += closes[i];
        }
        return BigDecimal.valueOf(sum / window).setScale(4, RoundingMode.HALF_UP);
    }
}
