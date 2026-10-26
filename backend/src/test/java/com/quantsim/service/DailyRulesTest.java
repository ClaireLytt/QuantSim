package com.quantsim.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.dto.GameDtos;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.TradeTransaction;

/** 每日挑战规则 D1~D8: 轮换确定性 + 交易时闸 + 结算判定的口径测试。 */
class DailyRulesTest {

    private TradeTransaction tx(String date, TradeTransaction.Direction dir, double price, int shares) {
        TradeTransaction t = new TradeTransaction();
        t.setTradeDate(LocalDate.parse(date));
        t.setDirection(dir);
        t.setPrice(BigDecimal.valueOf(price));
        t.setShares(shares);
        return t;
    }

    private DailyPrice day(String date, double close) {
        DailyPrice p = new DailyPrice();
        p.setTradeDate(LocalDate.parse(date));
        p.setClose(BigDecimal.valueOf(close));
        return p;
    }

    @Test
    void rotationIsDeterministicAndCoversAllEight() {
        LocalDate d = LocalDate.of(2026, 10, 26);
        assertEquals(DailyRules.ruleFor(d), DailyRules.ruleFor(d)); // 同日恒同规则
        // 连续 8 天覆盖全部 8 条规则
        long distinct = java.util.stream.IntStream.range(0, 8)
                .mapToObj(i -> DailyRules.ruleFor(d.plusDays(i))).distinct().count();
        assertEquals(8, distinct);
    }

    @Test
    void watchGuardBlocksEarlyTicks() {
        assertNotNull(DailyRules.guardError(DailyRules.Rule.WATCH,
                TradeTransaction.Direction.BUY, 3, BigDecimal.TEN, null, null));
        assertNull(DailyRules.guardError(DailyRules.Rule.WATCH,
                TradeTransaction.Direction.BUY, 5, BigDecimal.TEN, null, null));
    }

    @Test
    void halfAndNoChaseGuards() {
        // 半仓线: 买入后仓位 51% 拒, 50% 放
        assertNotNull(DailyRules.guardError(DailyRules.Rule.HALF, TradeTransaction.Direction.BUY,
                9, BigDecimal.TEN, null, new BigDecimal("0.51")));
        assertNull(DailyRules.guardError(DailyRules.Rule.HALF, TradeTransaction.Direction.BUY,
                9, BigDecimal.TEN, null, new BigDecimal("0.50")));
        // 禁追高: 高于上笔买价拒, 等于放; 卖出方向永远放
        assertNotNull(DailyRules.guardError(DailyRules.Rule.NOCHASE, TradeTransaction.Direction.BUY,
                9, new BigDecimal("10.1"), BigDecimal.TEN, null));
        assertNull(DailyRules.guardError(DailyRules.Rule.NOCHASE, TradeTransaction.Direction.BUY,
                9, BigDecimal.TEN, BigDecimal.TEN, null));
        assertNull(DailyRules.guardError(DailyRules.Rule.NOCHASE, TradeTransaction.Direction.SELL,
                9, new BigDecimal("99"), BigDecimal.TEN, null));
    }

    @Test
    void strikeNeedsExactPairWithGap() {
        assertTrue(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.3, 100))));
        // 价差不足 3% / 顺序颠倒 / 笔数不对 都不算
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.2, 100))));
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.SELL, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.BUY, 9, 100))));
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100))));
    }

    @Test
    void ironStopDetectsHeldLoss() {
        // D1 买 @10, D2 收盘 9.4 (-6%) 仍持仓 → 违规
        assertTrue(DailyRules.ironStopViolated(
                List.of(tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100)),
                List.of(day("2026-01-01", 10), day("2026-01-02", 9.4))));
        // 同日清仓 → 不违规
        assertFalse(DailyRules.ironStopViolated(
                List.of(tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                        tx("2026-01-02", TradeTransaction.Direction.SELL, 9.4, 100)),
                List.of(day("2026-01-01", 10), day("2026-01-02", 9.4))));
        // 浮亏未到 -5% → 不违规
        assertFalse(DailyRules.ironStopViolated(
                List.of(tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100)),
                List.of(day("2026-01-01", 10), day("2026-01-02", 9.6))));
    }

    @Test
    void auditRateAtSixtyPercent() {
        GameDtos.JournalEntry good = new GameDtos.JournalEntry(LocalDate.now(), "BUY", "r", BigDecimal.ONE);
        GameDtos.JournalEntry bad = new GameDtos.JournalEntry(LocalDate.now(), "BUY", "r", new BigDecimal("-1"));
        assertTrue(DailyRules.auditHit(List.of(good, good, good, bad, bad)));
        assertFalse(DailyRules.auditHit(List.of(good, bad, bad, bad, bad)));
        assertFalse(DailyRules.auditHit(List.of()));
    }
}
