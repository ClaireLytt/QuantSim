package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.UserPoints;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserPointsRepository;

/**
 * 「我的交易人生」聚合口径单测 (纯 Mock, 零 Spring 零数据库):
 * 几何连乘 / 胜率 / 峰谷回撤 / 空账户零态 / 逐日曲线缩放拼接 / 均价法逐笔配对
 * 在这里钉死, 改口径必须同步这些用例。
 */
class MeSummaryServiceTest {

    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final UserPointsRepository points = mock(UserPointsRepository.class);
    private final TransactionRepository txRepo = mock(TransactionRepository.class);
    private final MeSummaryService service =
            new MeSummaryService(sessions, points, txRepo, new ObjectMapper());

    private GameSession settled(String rate, LocalDate date) {
        GameSession s = new GameSession();
        s.setFinalReturnRate(new BigDecimal(rate));
        s.setCreatedAt(date.atTime(12, 0));
        s.setInitialCash(new BigDecimal("100000"));
        return s;
    }

    private void given(GameSession... list) {
        when(sessions.findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                anyLong(), any())).thenReturn(List.of(list));
        when(points.findById(anyLong())).thenReturn(Optional.empty());
        when(txRepo.findByUserAndSessionStatus(anyLong(), any())).thenReturn(List.of());
    }

    @Test
    void 几何连乘_先涨一成再跌一成净值为99000() {
        given(settled("0.1000", LocalDate.of(2026, 10, 1)),
                settled("-0.1000", LocalDate.of(2026, 10, 2)));

        var r = service.summary(1L);
        assertThat(r.virtualAssets()).isEqualByComparingTo("99000.00");
        assertThat(r.cumulativeReturn()).isEqualByComparingTo("-0.0100");
        assertThat(r.winRate()).isEqualByComparingTo("0.5000"); // 2 局 1 胜
        // 峰 110000 → 谷 99000: 回撤 11000/110000 = 10%
        assertThat(r.maxDrawdown()).isEqualByComparingTo("0.1000");
        assertThat(r.curve()).hasSize(2);
        assertThat(r.curve().get(0).value()).isEqualByComparingTo("110000.00");
    }

    @Test
    void 一路上涨_回撤为零且曲线时间升序() {
        given(settled("0.0500", LocalDate.of(2026, 10, 1)),
                settled("0.0200", LocalDate.of(2026, 10, 3)));

        var r = service.summary(1L);
        assertThat(r.maxDrawdown()).isEqualByComparingTo("0");
        assertThat(r.winRate()).isEqualByComparingTo("1.0000");
        assertThat(r.virtualAssets()).isEqualByComparingTo("107100.00"); // 105000 * 1.02
        assertThat(r.curve().get(1).date()).isAfter(r.curve().get(0).date());
    }

    @Test
    void 空账户_全零不伪造数据() {
        given();

        var r = service.summary(1L);
        assertThat(r.settledCount()).isZero();
        assertThat(r.virtualAssets()).isEqualByComparingTo("100000");
        assertThat(r.cumulativeReturn()).isEqualByComparingTo("0");
        assertThat(r.winRate()).isEqualByComparingTo("0");
        assertThat(r.closedTrades()).isZero();
        assertThat(r.tradeWinRate()).isEqualByComparingTo("0");
        assertThat(r.curve()).isEmpty();
    }

    @Test
    void 签到连续天数透传自UserPoints() {
        given();
        UserPoints up = new UserPoints();
        up.setSignInStreak(7);
        when(points.findById(anyLong())).thenReturn(Optional.of(up));

        assertThat(service.summary(1L).signInStreak()).isEqualTo(7);
    }

    // ---------- P2: 逐日曲线缩放拼接 ----------

    @Test
    void 落库逐日曲线按入局前净值缩放拼接_回撤在日粒度上算() {
        // 第 1 局本金 10 万, 曲线 10万→12万→9万→11万 (结算收益 +10%, 局内最深回撤 25%)
        GameSession g1 = settled("0.1000", LocalDate.of(2026, 10, 1));
        g1.setEquityCurve("[[\"2026-10-01\",100000],[\"2026-10-02\",120000],"
                + "[\"2026-10-03\",90000],[\"2026-10-06\",110000]]");
        // 第 2 局无曲线 (老对局) → 回退结算日单点
        GameSession g2 = settled("0.0100", LocalDate.of(2026, 10, 10));
        given(g1, g2);

        var r = service.summary(1L);
        // 曲线 = 4 个逐日点 + 1 个回退单点
        assertThat(r.curve()).hasSize(5);
        assertThat(r.curve().get(1).value()).isEqualByComparingTo("120000.00");
        // 局内峰 12 万 → 谷 9 万: 回撤 25% (单点口径只能看到 0, 日粒度才抓得到)
        assertThat(r.maxDrawdown()).isEqualByComparingTo("0.2500");
        // 净值链仍按 finalReturnRate 几何连乘: 110000 * 1.01
        assertThat(r.virtualAssets()).isEqualByComparingTo("111100.00");
    }

    @Test
    void 第二局曲线按前局净值缩放_本金五万翻倍映射到人生净值() {
        GameSession g1 = settled("0.1000", LocalDate.of(2026, 10, 1)); // 净值到 11 万
        GameSession g2 = settled("0.2000", LocalDate.of(2026, 10, 10));
        g2.setInitialCash(new BigDecimal("50000")); // 本金 5 万的局
        g2.setEquityCurve("[[\"2026-10-10\",50000],[\"2026-10-11\",60000]]");
        given(g1, g2);

        var r = service.summary(1L);
        // 5 万本金局的 6 万, 缩放系数 110000/50000=2.2 → 人生净值 132000
        assertThat(r.curve().get(r.curve().size() - 1).value()).isEqualByComparingTo("132000.00");
    }

    @Test
    void 坏曲线JSON回退单点不拖垮整页() {
        GameSession g = settled("0.0500", LocalDate.of(2026, 10, 1));
        g.setEquityCurve("not-json");
        given(g);

        var r = service.summary(1L);
        assertThat(r.curve()).hasSize(1);
        assertThat(r.virtualAssets()).isEqualByComparingTo("105000.00");
    }

    // ---------- P2: 均价法逐笔配对 ----------

    private TradeTransaction tx(long sessionId, String dir, String price, int shares, String fee) {
        TradeTransaction t = new TradeTransaction();
        t.setSessionId(sessionId);
        t.setStockId(1L);
        t.setDirection(TradeTransaction.Direction.valueOf(dir));
        t.setPrice(new BigDecimal(price));
        t.setShares(shares);
        t.setFee(new BigDecimal(fee));
        return t;
    }

    @Test
    void 均价法_加仓摊薄后一次平仓盈利记一胜() {
        // 10 买 100 股 + 12 买 100 股 → 均价 11; 13 卖 200 股: pnl = 2*200 - 0 > 0
        var stats = MeSummaryService.pairTrades(List.of(
                tx(1, "BUY", "10", 100, "0"),
                tx(1, "BUY", "12", 100, "0"),
                tx(1, "SELL", "13", 200, "0")));
        assertThat(stats.closed()).isEqualTo(1);
        assertThat(stats.wins()).isEqualTo(1);
    }

    @Test
    void 均价法_手续费吃掉价差记一负() {
        // 10 买 (费 50 摊进成本 → 均价 10.5), 10.6 卖 100 股但费 20: pnl = 0.1*100 - 20 < 0
        var stats = MeSummaryService.pairTrades(List.of(
                tx(1, "BUY", "10", 100, "50"),
                tx(1, "SELL", "10.6", 100, "20")));
        assertThat(stats.closed()).isEqualTo(1);
        assertThat(stats.wins()).isZero();
    }

    @Test
    void 均价法_部分平仓各算一次_不同局不互配() {
        var stats = MeSummaryService.pairTrades(List.of(
                tx(1, "BUY", "10", 200, "0"),
                tx(1, "SELL", "11", 100, "0"),  // 胜
                tx(1, "SELL", "9", 100, "0"),   // 负
                tx(2, "SELL", "10", 100, "0"),  // 另一局开空仓, 不与局 1 配对
                tx(2, "BUY", "8", 100, "0")));  // 平空: 10-8 > 0 胜
        assertThat(stats.closed()).isEqualTo(3);
        assertThat(stats.wins()).isEqualTo(2);
    }

    @Test
    void 均价法_反手只对平掉部分计一次平仓() {
        // 多 100 → 卖 150: 平 100 (胜) + 反手空 50; 再买 50 平空 (12 卖开空 → 11 买回, 胜)
        var stats = MeSummaryService.pairTrades(List.of(
                tx(1, "BUY", "10", 100, "0"),
                tx(1, "SELL", "12", 150, "0"),
                tx(1, "BUY", "11", 50, "0")));
        assertThat(stats.closed()).isEqualTo(2);
        assertThat(stats.wins()).isEqualTo(2);
    }
}
