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

    /** 初始资金 1000: 买入 100 股 @10 = 名义 1000 (100%), 规模闸恒满足, 只测价差逻辑。 */
    private static final BigDecimal CASH_1000 = new BigDecimal("1000");

    @Test
    void strikeNeedsExactPairWithGap() {
        assertTrue(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.3, 100)), CASH_1000));
        // 价差不足 3% / 顺序颠倒 / 笔数不对 都不算
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.2, 100)), CASH_1000));
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.SELL, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.BUY, 9, 100)), CASH_1000));
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100)), CASH_1000));
    }

    @Test
    void strikeRejectsTokenSizedBuy() {
        // 初始资金 10000: 买 100 股 @10 = 1000 (10%) < 30% 规模闸, 价差再漂亮也不算
        assertFalse(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.5, 100)),
                new BigDecimal("10000")));
        // 同资金买 300 股 = 3000 (30%) 达标
        assertTrue(DailyRules.strikeHit(List.of(
                tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 300),
                tx("2026-01-05", TradeTransaction.Direction.SELL, 10.5, 300)),
                new BigDecimal("10000")));
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
        String reason = "MA5 上穿 MA20 顺势买入"; // ≥8 字的认真理由
        GameDtos.JournalEntry good = new GameDtos.JournalEntry(LocalDate.now(), "BUY", reason, BigDecimal.ONE);
        GameDtos.JournalEntry bad = new GameDtos.JournalEntry(LocalDate.now(), "BUY", reason, new BigDecimal("-1"));
        assertTrue(DailyRules.auditHit(List.of(good, good, good, bad, bad)));
        assertFalse(DailyRules.auditHit(List.of(good, bad, bad, bad, bad)));
        assertFalse(DailyRules.auditHit(List.of()));
    }

    @Test
    void auditIgnoresTokenReasons() {
        // 敷衍理由 (<8 字) 不计入样本: 全是短理由 = 没有有效样本, 不过
        GameDtos.JournalEntry lazy = new GameDtos.JournalEntry(LocalDate.now(), "BUY", "买", BigDecimal.ONE);
        assertFalse(DailyRules.auditHit(List.of(lazy, lazy, lazy)));
        // 长短混合: 只有长理由那条进样本 (正结果 → 过)
        GameDtos.JournalEntry serious = new GameDtos.JournalEntry(
                LocalDate.now(), "BUY", "跌破支撑位止损离场观望", BigDecimal.ONE);
        GameDtos.JournalEntry lazyBad = new GameDtos.JournalEntry(
                LocalDate.now(), "BUY", "卖", new BigDecimal("-1"));
        assertTrue(DailyRules.auditHit(List.of(serious, lazyBad, lazyBad)));
    }

    @Test
    void lyingFlatNoLongerPasses() {
        // 零交易 + 利息带来的小正收益: WATCH/NOCHASE/BELT/HALF/IRONSTOP 全部不再白给
        BigDecimal tinyGain = new BigDecimal("0.0006");
        BigDecimal cash = new BigDecimal("100000");
        List<DailyPrice> window = List.of(day("2026-01-01", 10), day("2026-01-02", 9));
        for (DailyRules.Rule rule : List.of(DailyRules.Rule.WATCH, DailyRules.Rule.NOCHASE,
                DailyRules.Rule.BELT, DailyRules.Rule.HALF, DailyRules.Rule.IRONSTOP)) {
            GameDtos.DailyRuleResult r = DailyRules.evaluate(rule, tinyGain,
                    new BigDecimal("-0.10"), BigDecimal.ZERO, cash, List.of(), List.of(), window);
            assertFalse(r.passed(), rule + " 零交易不应通过");
            assertEquals(0, r.stars());
        }
    }

    @Test
    void halfTargetFloorsAtZeroInBearWindows() {
        // 熊市 (hold=-10%): 目标 = max(-5%, 0) = 0, 有交易且收益 +1% → 过
        List<TradeTransaction> txs = List.of(tx("2026-01-01", TradeTransaction.Direction.BUY, 10, 100));
        GameDtos.DailyRuleResult win = DailyRules.evaluate(DailyRules.Rule.HALF,
                new BigDecimal("0.01"), new BigDecimal("-0.10"), BigDecimal.ZERO,
                new BigDecimal("100000"), txs, List.of(), null);
        assertTrue(win.passed());
        // 有交易但收益 -1% < 0 → 不过 (老口径 -1% > -5% 会放行)
        GameDtos.DailyRuleResult lose = DailyRules.evaluate(DailyRules.Rule.HALF,
                new BigDecimal("-0.01"), new BigDecimal("-0.10"), BigDecimal.ZERO,
                new BigDecimal("100000"), txs, List.of(), null);
        assertFalse(lose.passed());
    }

    @Test
    void starsGradePassQuality() {
        // 过但没跑赢持有 → 1 星; 跑赢 → 2 星; 跑赢且回撤 ≤5% → 3 星
        assertEquals(1, DailyRules.stars(true, new BigDecimal("0.02"),
                new BigDecimal("0.05"), BigDecimal.ZERO));
        assertEquals(2, DailyRules.stars(true, new BigDecimal("0.08"),
                new BigDecimal("0.05"), new BigDecimal("0.08")));
        assertEquals(3, DailyRules.stars(true, new BigDecimal("0.08"),
                new BigDecimal("0.05"), new BigDecimal("0.03")));
        assertEquals(0, DailyRules.stars(false, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ZERO));
    }
}
