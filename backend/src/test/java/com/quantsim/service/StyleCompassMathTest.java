package com.quantsim.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.TradeTransaction;


/** 风格罗盘的 FIFO 配对口径测试 (纯函数, 不碰库)。 */
class StyleCompassMathTest {

    private TradeTransaction tx(String date, TradeTransaction.Direction dir, double price, int shares) {
        TradeTransaction t = new TradeTransaction();
        t.setTradeDate(LocalDate.parse(date));
        t.setDirection(dir);
        t.setPrice(BigDecimal.valueOf(price));
        t.setShares(shares);
        return t;
    }

    @Test
    void fifoPairingAndPartialFill() {
        StyleCompassService.Acc acc = new StyleCompassService.Acc();
        // 买 100 (D0) + 买 100 (D2), 卖 150 (D5): 先配 D0 的 100 (持 5 天), 再配 D2 的 50 (持 3 天)
        StyleCompassService.accumulate(acc, List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-03", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-06", TradeTransaction.Direction.SELL, 11, 150)
        ), new BigDecimal("10000"));
        assertEquals(2, acc.lots);
        assertEquals(5 + 3, acc.holdDaySum, 1e-9);
        // 买入规模: 两笔各 1000/10000 = 0.1
        assertEquals(2, acc.buys);
        assertEquals(0.2, acc.sizeSum, 1e-9);
    }

    @Test
    void nakedShortIsSkipped() {
        StyleCompassService.Acc acc = new StyleCompassService.Acc();
        // 裸卖 (无库存) 不产生持仓样本; 之后的买入照常计入规模样本
        StyleCompassService.accumulate(acc, List.of(
                tx("2026-01-01", TradeTransaction.Direction.SELL, 10, 100),
                tx("2026-01-02", TradeTransaction.Direction.BUY, 10, 50)
        ), new BigDecimal("10000"));
        assertEquals(0, acc.lots);
        assertEquals(1, acc.buys);
    }

    @Test
    void zeroInitialCashIsIgnored() {
        StyleCompassService.Acc acc = new StyleCompassService.Acc();
        StyleCompassService.accumulate(acc, List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100)
        ), BigDecimal.ZERO);
        assertEquals(0, acc.buys);
    }
}
