package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.quantsim.entity.TradeTransaction;

/** 持仓数量/加权成本的成交推演, 支持负持仓 (做空)。 */
public final class PositionMath {

    private PositionMath() {}

    public record Fill(int shares, BigDecimal avgCost) {}

    /**
     * 把一笔成交应用到 (shares, avgCost):
     * 同向加仓 -> 加权平均成本; 减仓不改成本; 平掉归零; 穿越零点 -> 剩余仓位成本 = 本笔成交价。
     */
    public static Fill apply(int curShares, BigDecimal curCost,
                             TradeTransaction.Direction direction, BigDecimal price, int qty) {
        int delta = direction == TradeTransaction.Direction.BUY ? qty : -qty;
        int newShares = curShares + delta;
        if (newShares == 0) {
            return new Fill(0, BigDecimal.ZERO);
        }
        boolean sameSide = curShares == 0 || (curShares > 0) == (newShares > 0);
        if (!sameSide) {
            // 穿越零点: 原仓位全部了结, 剩余部分按本笔价格开新仓
            return new Fill(newShares, price);
        }
        boolean increasing = Math.abs(newShares) > Math.abs(curShares);
        if (!increasing) {
            // 减仓不改成本
            return new Fill(newShares, curCost);
        }
        // 同向加仓: 绝对数量加权平均
        BigDecimal oldValue = curCost.multiply(BigDecimal.valueOf(Math.abs(curShares)));
        BigDecimal addValue = price.multiply(BigDecimal.valueOf(qty));
        BigDecimal avg = oldValue.add(addValue)
                .divide(BigDecimal.valueOf(Math.abs(newShares)), 2, RoundingMode.HALF_UP);
        return new Fill(newShares, avg);
    }
}
