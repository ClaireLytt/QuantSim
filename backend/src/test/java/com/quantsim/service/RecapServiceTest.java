package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.Account;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;

/**
 * 赛后复盘口径单测 (纯 Mock): 盈亏四分解以现金流恒等式对拍
 * (finalAssets − initialCash = realized + unrealized + interest, 费已在两侧内),
 * 外加样本不足/无亏损样本的显式降级与卖后走势事实。
 */
class RecapServiceTest {

    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final AccountRepository accounts = mock(AccountRepository.class);
    private final MarketDataService market = mock(MarketDataService.class);
    private final TradeEngine engine = mock(TradeEngine.class);
    private final RecapService service =
            new RecapService(sessions, txRepo, accounts, market, engine);

    private final GameSession session = new GameSession();
    private final Account account = new Account();

    private TradeTransaction tx(String dir, String price, int shares, String fee, LocalDate d) {
        TradeTransaction t = new TradeTransaction();
        t.setSessionId(9L);
        t.setStockId(1L);
        t.setDirection(TradeTransaction.Direction.valueOf(dir));
        t.setPrice(new BigDecimal(price));
        t.setShares(shares);
        t.setFee(new BigDecimal(fee));
        t.setTradeDate(d);
        return t;
    }

    /** 常规布景: 单票经典局已结算; closeAtSettle 为结算收盘 */
    private void given(List<TradeTransaction> txs, String closeAtSettle, String feesSum) {
        session.setSessionId(9L);
        session.setStockId(1L);
        session.setInitialCash(new BigDecimal("100000"));
        session.setStatus(GameSession.Status.SETTLED);
        session.setFinalReturnRate(new BigDecimal("0.0100"));
        session.setMode("CLASSIC");
        account.setInterestTotal(BigDecimal.ZERO);
        when(sessions.findById(9L)).thenReturn(Optional.of(session));
        when(accounts.findBySessionId(9L)).thenReturn(Optional.of(account));
        when(txRepo.findBySessionIdOrderByCreatedAtAsc(9L)).thenReturn(txs);
        when(txRepo.sumFeesBySessionId(9L)).thenReturn(new BigDecimal(feesSum));
        when(engine.currentCloses(any())).thenReturn(Map.of(1L, new BigDecimal(closeAtSettle)));
        // 行情: 20 日, 首日 2020-01-01; 卖出日 (01-03, idx=2) 收 110, idx=7 收 121 → 卖后 +10%
        List<DailyPrice> prices = new ArrayList<>();
        Map<LocalDate, Integer> idx = new java.util.HashMap<>();
        for (int i = 0; i < 20; i++) {
            DailyPrice p = new DailyPrice();
            LocalDate d = LocalDate.of(2020, 1, 1).plusDays(i);
            p.setTradeDate(d);
            BigDecimal c = new BigDecimal(i == 2 ? "110" : i == 7 ? "121" : "100");
            p.setOpen(c);
            p.setHigh(c);
            p.setLow(c);
            p.setClose(c);
            prices.add(p);
            idx.put(d, i);
        }
        Stock s = new Stock();
        s.setStockId(1L);
        s.setCode("600000");
        s.setName("测试股");
        when(market.load(anyLong())).thenReturn(new MarketDataService.StockData(
                s, prices, idx, Map.of(), Map.of(), new double[0], new double[0][0]));
    }

    @Test
    void 四分解现金流恒等式_部分平仓留敞口() {
        LocalDate d1 = LocalDate.of(2020, 1, 1);
        LocalDate d3 = LocalDate.of(2020, 1, 3);
        // 买 100@100 费5 (现金 -10005), 卖 60@110 费6 (现金 +6594) → 现金 96589
        given(List.of(tx("BUY", "100", 100, "5", d1), tx("SELL", "110", 60, "6", d3)),
                "108", "11");
        // finalAssets = 现金 96589 + 40×108 = 100909 (由现金流算出, 不抄实现)
        when(engine.equity(any(), any(), any())).thenReturn(new BigDecimal("100909.00"));

        var r = service.recap(9L);
        // 已实现 = (110 − 100.05)×60 − 6 = 591; 未实现 = (108 − 100.05)×40 = 318
        assertThat(r.realizedPnl()).isEqualByComparingTo("591.00");
        assertThat(r.unrealizedPnl()).isEqualByComparingTo("318.00");
        assertThat(r.feesTotal()).isEqualByComparingTo("11.00");
        // 恒等式: realized + unrealized + interest = finalAssets − initialCash
        assertThat(r.realizedPnl().add(r.unrealizedPnl()).add(r.interestTotal()))
                .isEqualByComparingTo(r.finalAssets().subtract(r.initialCash()));
        assertThat(r.openPositions()).hasSize(1);
        assertThat(r.openPositions().get(0).qty()).isEqualTo(40);
        // 卖出 1 笔, 卖后 5 日 110 → 121 = +10%
        assertThat(r.sellSamples()).isEqualTo(1);
        assertThat(r.sellAfterAvgPct()).isEqualByComparingTo("0.1000");
        // 经典单票局不展示集中度
        assertThat(r.concentration()).isNull();
        // 1 笔平仓 < 5: 样本不足显式标记
        assertThat(r.insufficientSample()).isTrue();
        assertThat(r.trades().get(0).holdDays()).isEqualTo(2);
    }

    @Test
    void 无平仓样本_胜率为null不编造零() {
        given(List.of(tx("BUY", "100", 100, "0", LocalDate.of(2020, 1, 1))), "100", "0");
        when(engine.equity(any(), any(), any())).thenReturn(new BigDecimal("100000.00"));

        var r = service.recap(9L);
        assertThat(r.closedCount()).isZero();
        assertThat(r.tradeWinRate()).isNull();
        assertThat(r.profitLossRatio()).isNull();
        assertThat(r.insufficientSample()).isTrue();
    }

    @Test
    void 无亏损样本_盈亏比null且noLoss标记() {
        given(List.of(
                tx("BUY", "100", 100, "0", LocalDate.of(2020, 1, 1)),
                tx("SELL", "110", 100, "0", LocalDate.of(2020, 1, 3))), "100", "0");
        when(engine.equity(any(), any(), any())).thenReturn(new BigDecimal("101000.00"));

        var r = service.recap(9L);
        assertThat(r.closedCount()).isEqualTo(1);
        assertThat(r.tradeWinRate()).isEqualByComparingTo("1.0000");
        assertThat(r.profitLossRatio()).isNull();
        assertThat(r.noLossSample()).isTrue();
    }

    @Test
    void 未结算对局拒绝复盘() {
        session.setSessionId(9L);
        session.setStatus(GameSession.Status.IN_PROGRESS);
        when(sessions.findById(9L)).thenReturn(Optional.of(session));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.recap(9L))
                .isInstanceOf(com.quantsim.exception.BusinessException.class);
    }
}
