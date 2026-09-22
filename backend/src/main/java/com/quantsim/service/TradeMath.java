package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** 交易通用计算: 收益率与整手可买股数, 供对局/回测/顾问共用。 */
public final class TradeMath {

    private TradeMath() {}

    /** (最终资产 - 初始资金) / 初始资金, 保留 4 位小数。 */
    public static BigDecimal returnRate(BigDecimal finalAssets, BigDecimal initial) {
        return finalAssets.subtract(initial).divide(initial, 4, RoundingMode.HALF_UP);
    }

    /** 按整手规则全仓可买入的最大股数 (手数 × 每手股数), 买不起一手时为 0。 */
    public static int maxWholeShares(BigDecimal cash, BigDecimal price, int lotSize) {
        return cash.divideToIntegralValue(price.multiply(BigDecimal.valueOf(lotSize)))
                .intValue() * lotSize;
    }
}
