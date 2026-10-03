package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.TradeTransaction.Direction;
import com.quantsim.service.PositionMath;
import com.quantsim.service.PositionMath.Fill;

/** 仓位推演纯单元测试: 加权成本 / 减仓不改成本 / 归零 / 穿越零点 (做空)。 */
class PositionMathTest {

    @Test
    void buyFromFlatSetsCostToPrice() {
        Fill f = PositionMath.apply(0, BigDecimal.ZERO, Direction.BUY, new BigDecimal("10.00"), 100);
        assertThat(f.shares()).isEqualTo(100);
        assertThat(f.avgCost()).isEqualByComparingTo("10.00");
    }

    @Test
    void addToPositionAveragesCost() {
        // 100 股 @10 + 100 股 @12 -> 200 股 @11
        Fill f = PositionMath.apply(100, new BigDecimal("10.00"), Direction.BUY, new BigDecimal("12.00"), 100);
        assertThat(f.shares()).isEqualTo(200);
        assertThat(f.avgCost()).isEqualByComparingTo("11.00");
    }

    @Test
    void reducingKeepsCost() {
        Fill f = PositionMath.apply(200, new BigDecimal("11.00"), Direction.SELL, new BigDecimal("15.00"), 100);
        assertThat(f.shares()).isEqualTo(100);
        assertThat(f.avgCost()).isEqualByComparingTo("11.00");
    }

    @Test
    void closingResetsCostToZero() {
        Fill f = PositionMath.apply(100, new BigDecimal("11.00"), Direction.SELL, new BigDecimal("15.00"), 100);
        assertThat(f.shares()).isZero();
        assertThat(f.avgCost()).isEqualByComparingTo("0");
    }

    @Test
    void crossingZeroReopensAtTradePrice() {
        // 持 100 股卖 300: 平掉 100, 反手做空 200, 空头成本 = 本笔成交价
        Fill f = PositionMath.apply(100, new BigDecimal("10.00"), Direction.SELL, new BigDecimal("13.00"), 300);
        assertThat(f.shares()).isEqualTo(-200);
        assertThat(f.avgCost()).isEqualByComparingTo("13.00");
    }

    @Test
    void shortAddAveragesByAbsoluteShares() {
        // 空 100 @10, 再空 100 @14 -> 空 200 @12
        Fill f = PositionMath.apply(-100, new BigDecimal("10.00"), Direction.SELL, new BigDecimal("14.00"), 100);
        assertThat(f.shares()).isEqualTo(-200);
        assertThat(f.avgCost()).isEqualByComparingTo("12.00");
    }

    @Test
    void shortCoverKeepsCost() {
        Fill f = PositionMath.apply(-200, new BigDecimal("12.00"), Direction.BUY, new BigDecimal("9.00"), 100);
        assertThat(f.shares()).isEqualTo(-100);
        assertThat(f.avgCost()).isEqualByComparingTo("12.00");
    }
}
