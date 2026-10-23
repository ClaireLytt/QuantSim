package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.quantsim.entity.Account;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.service.MarketDataService.StockData;
import com.quantsim.service.OrderService.FillSummary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/**
 * 一日推进的时序单测。注意: 这是"只验外部行为"原则的声明式例外 ——
 * 步骤顺序本身就是业务口径 (AI 推日后决策 = 未来函数; 撮合先于计息 = 改变计息基数),
 * 所以用协作者时序断言把顺序钉死, 谁重排谁红。
 */
class GameDayTest {

    private final GameAiService gameAi = mock(GameAiService.class);
    private final OrderService orderService = mock(OrderService.class);
    private final TradeEngine tradeEngine = mock(TradeEngine.class);
    private final LedgerReplay ledger = mock(LedgerReplay.class);
    private final AiOpponent aiOpponent = mock(AiOpponent.class);
    private final GameDay gameDay = new GameDay(gameAi, orderService, tradeEngine, ledger, aiOpponent);

    private static final LocalDate OLD = LocalDate.of(2026, 1, 5);
    private static final LocalDate NEW = LocalDate.of(2026, 1, 6);

    private GameSession session() {
        GameSession s = new GameSession();
        s.setCurrentTradeDate(OLD);
        s.setDaysElapsed(3);
        return s;
    }

    private Account account() {
        Account a = new Account();
        a.setCashBalance(new BigDecimal("100000.00"));
        a.setInterestTotal(BigDecimal.ZERO);
        return a;
    }

    private DailyPrice next() {
        DailyPrice p = new DailyPrice();
        p.setTradeDate(NEW);
        return p;
    }

    private void stubQuiet() {
        when(ledger.dailyInterest(any())).thenReturn(BigDecimal.ZERO);
        when(orderService.fillOrders(any(), any())).thenReturn(new FillSummary(List.of(), 0));
    }

    @Test
    void AI决策先于推日_看到的还是旧交易日() {
        stubQuiet();
        GameSession s = session();
        // 在 AI 被调用的瞬间断言日期未推进 —— 推日后再调 AI 就是未来函数
        when(gameAi.applyAiTrade(any(), any())).thenAnswer(inv -> {
            assertThat(((GameSession) inv.getArgument(0)).getCurrentTradeDate()).isEqualTo(OLD);
            return 0;
        });
        gameDay.advance(s, account(), mock(StockData.class), next());
        assertThat(s.getCurrentTradeDate()).isEqualTo(NEW); // 推进本身发生了
        assertThat(s.getDaysElapsed()).isEqualTo(4);
    }

    @Test
    void 利息先于撮合_且AI账同步计息() {
        stubQuiet();
        gameDay.advance(session(), account(), mock(StockData.class), next());
        InOrder order = inOrder(ledger, aiOpponent, orderService);
        order.verify(ledger).dailyInterest(any());
        order.verify(aiOpponent).accrue(any());
        order.verify(orderService).fillOrders(any(), any());
    }

    @Test
    void 保证金检查后于撮合_仅进阶模式触发() {
        stubQuiet();
        GameSession s = session();
        s.setAdvanced(true);
        when(tradeEngine.currentCloses(any())).thenReturn(Map.of());
        when(tradeEngine.equity(any(), any(), any())).thenReturn(BigDecimal.ONE); // 未穿仓
        gameDay.advance(s, account(), mock(StockData.class), next());
        InOrder order = inOrder(orderService, tradeEngine);
        order.verify(orderService).fillOrders(any(), any());
        order.verify(tradeEngine).equity(any(), any(), any());
    }

    @Test
    void 普通模式不做保证金检查_结果透传() {
        stubQuiet();
        when(gameAi.applyAiTrade(any(), any())).thenReturn(200);
        GameDay.DayResult r = gameDay.advance(session(), account(), mock(StockData.class), next());
        assertThat(r.aiTradeShares()).isEqualTo(200);
        assertThat(r.liquidatedNow()).isFalse();
        assertThat(r.daysElapsed()).isEqualTo(4);
    }

    @Test
    void 利息入账_现金与累计利息同步增加() {
        when(orderService.fillOrders(any(), any())).thenReturn(new FillSummary(List.of(), 0));
        when(ledger.dailyInterest(any())).thenReturn(new BigDecimal("3.42"));
        Account a = account();
        gameDay.advance(session(), a, mock(StockData.class), next());
        assertThat(a.getCashBalance()).isEqualByComparingTo("100003.42");
        assertThat(a.getInterestTotal()).isEqualByComparingTo("3.42");
    }
}
