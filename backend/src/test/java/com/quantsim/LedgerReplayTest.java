package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.config.GameProperties;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.LedgerReplay;

/**
 * 资金重放内核的纯单元测试 (不起 Spring): 计息顺序/舍入/现金流算术的不变量在这里锁死。
 * tick 计息、undo 重建、结算曲线三个调用方共用此内核, 这里的断言就是三方一致性的证明。
 */
class LedgerReplayTest {

    private static final LocalDate D1 = LocalDate.of(2024, 1, 2);
    private static final LocalDate D2 = LocalDate.of(2024, 1, 3);
    private static final LocalDate D3 = LocalDate.of(2024, 1, 4);

    private LedgerReplay ledger(double cashRate, double borrowRate) {
        GameProperties props = new GameProperties();
        props.setCashRateAnnual(cashRate);
        props.setBorrowRateAnnual(borrowRate);
        return new LedgerReplay(props);
    }

    private TradeTransaction tx(LocalDate day, TradeTransaction.Direction dir,
                                String price, int shares, String fee, Long stockId) {
        TradeTransaction t = new TradeTransaction();
        t.setTradeDate(day);
        t.setDirection(dir);
        t.setPrice(new BigDecimal(price));
        t.setShares(shares);
        t.setFee(new BigDecimal(fee));
        t.setStockId(stockId);
        return t;
    }

    @Test
    void 首日不计息_次日起先计息再过当日流水() {
        LedgerReplay ledger = ledger(0.252, 0.252); // 年化 25.2% / 252 = 日息 0.1%
        BigDecimal initial = new BigDecimal("100000.00");
        // D2 买入 100 股 × 100 元, 费 5 元
        List<TradeTransaction> txs = List.of(
                tx(D2, TradeTransaction.Direction.BUY, "100.00", 100, "5.00", 1L));
        List<LedgerReplay.Snapshot> snaps = ledger.replay(initial, List.of(D1, D2, D3), txs, 1L);

        // D1: 无息无流水
        assertThat(snaps.get(0).cash()).isEqualByComparingTo("100000.00");
        assertThat(snaps.get(0).interestTotal()).isEqualByComparingTo("0");
        // D2: 先计息 100000×0.001=100, 再买入 -10005 => 90095
        assertThat(snaps.get(1).cash()).isEqualByComparingTo("90095.00");
        assertThat(snaps.get(1).interestTotal()).isEqualByComparingTo("100.00");
        // D3: 90095×0.001=90.10 (HALF_UP 两位)
        assertThat(snaps.get(2).cash()).isEqualByComparingTo("90185.10");
        assertThat(snaps.get(2).interestTotal()).isEqualByComparingTo("190.10");
        // 持仓: 100 股, 均价含费 (口径由 PositionMath 决定, 这里锁股数)
        assertThat(snaps.get(2).fills().get(1L).shares()).isEqualTo(100);
    }

    @Test
    void 透支现金按融资利率付息() {
        LedgerReplay ledger = ledger(0.0, 0.252); // 正现金不生息, 透支日息 0.1%
        BigDecimal initial = new BigDecimal("1000.00");
        // D1 买入超出现金: 现金转负
        List<TradeTransaction> txs = List.of(
                tx(D1, TradeTransaction.Direction.BUY, "100.00", 100, "0.00", 1L));
        List<LedgerReplay.Snapshot> snaps = ledger.replay(initial, List.of(D1, D2), txs, 1L);

        assertThat(snaps.get(0).cash()).isEqualByComparingTo("-9000.00");
        // D2: -9000×0.001 = -9.00 付息
        assertThat(snaps.get(1).cash()).isEqualByComparingTo("-9009.00");
        assertThat(snaps.get(1).interestTotal()).isEqualByComparingTo("-9.00");
    }

    @Test
    void 利率为零时利息关闭() {
        LedgerReplay ledger = ledger(0.0, 0.0);
        List<LedgerReplay.Snapshot> snaps = ledger.replay(
                new BigDecimal("50000.00"), List.of(D1, D2, D3), List.of(), 1L);
        assertThat(snaps.get(2).cash()).isEqualByComparingTo("50000.00");
        assertThat(snaps.get(2).interestTotal()).isEqualByComparingTo("0");
    }

    @Test
    void 缺stockId的旧流水归属默认标的() {
        LedgerReplay ledger = ledger(0.0, 0.0);
        List<TradeTransaction> txs = List.of(
                tx(D1, TradeTransaction.Direction.BUY, "10.00", 200, "1.00", null));
        List<LedgerReplay.Snapshot> snaps =
                ledger.replay(new BigDecimal("10000.00"), List.of(D1), txs, 7L);
        assertThat(snaps.get(0).fills()).containsOnlyKeys(7L);
        assertThat(snaps.get(0).fills().get(7L).shares()).isEqualTo(200);
        assertThat(snaps.get(0).cash()).isEqualByComparingTo("7999.00");
    }

    @Test
    void 买卖往返后持仓清零_现金只差费用() {
        LedgerReplay ledger = ledger(0.0, 0.0);
        List<TradeTransaction> txs = List.of(
                tx(D1, TradeTransaction.Direction.BUY, "20.00", 100, "2.00", 1L),
                tx(D2, TradeTransaction.Direction.SELL, "20.00", 100, "3.00", 1L));
        List<LedgerReplay.Snapshot> snaps =
                ledger.replay(new BigDecimal("10000.00"), List.of(D1, D2), txs, 1L);
        assertThat(snaps.get(1).fills().get(1L).shares()).isZero();
        assertThat(snaps.get(1).cash()).isEqualByComparingTo("9995.00");
    }
}
