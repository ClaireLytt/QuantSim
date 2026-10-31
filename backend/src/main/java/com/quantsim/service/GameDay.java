package com.quantsim.service;

import com.quantsim.entity.Account;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.MarketDataService.StockData;
import com.quantsim.service.OrderService.FillSummary;
import java.math.BigDecimal;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 一日推进 (GameDay): 「推进一天发生什么」这套编排的唯一定义。
 *
 * 步骤顺序即业务口径, 不可重排 (GameDayTest 用时序断言钉死):
 *   ① AI 按今日 (旧) 收盘价交易 —— 只用已揭晓数据, 推日后再调就是未来函数;
 *   ② 推进交易日;
 *   ③ 隔夜资金计息 —— 公式收口在资金重放 (LedgerReplay.dailyInterest), 必须先于撮合,
 *      否则当日成交会改变计息基数;
 *   ④ 用新揭晓的 OHLC 撮合挂单 (挂单撮合模块);
 *   ⑤ 进阶模式保证金检查, 净值归零强平。
 *
 * 事务边界留在门面 (GameService.tick 的 @Transactional), 本组件是事务内被调方 ——
 * 与 GameStartService/GameAiService 的拆分约定一致。结算触发 (或有) 仍由门面决定,
 * 不在本模块 (结算编排是另一条缝, 见架构评审候选③)。
 */
@Service
@RequiredArgsConstructor
public class GameDay {

    private final GameAiService gameAi;
    private final OrderService orderService;
    private final TradeEngine tradeEngine;
    private final LedgerReplay ledger;
    private final AiOpponent aiOpponent;

    /** 一日推进的全部产物: 门面据此组装 TickResponse, 不再自己编排。 */
    public record DayResult(int aiTradeShares, FillSummary fills,
                            boolean liquidatedNow, int daysElapsed,
                            BigDecimal interestToday) { }

    /** 把 session 从当前交易日推进到 next。调用方持有 session/account 悲观锁。 */
    public DayResult advance(GameSession session, Account account, StockData sd, DailyPrice next) {
        // ① AI 在推进前用今日预测决策, 按今日收盘价成交 (只用已揭晓的数据, 无未来泄漏)
        int aiTradeShares = gameAi.applyAiTrade(session, sd);

        // ② 推进交易日
        session.setCurrentTradeDate(next.getTradeDate());
        session.setDaysElapsed(session.getDaysElapsed() + 1);

        // ③④ 新交易日揭晓后: 隔夜资金计息 -> 撮合挂单
        BigDecimal interestToday = accrueInterest(session, account);
        FillSummary fills = orderService.fillOrders(session, account);

        // ⑤ 进阶模式保证金检查
        boolean liquidatedNow = false;
        if (session.isAdvanced() && !session.isLiquidated()) {
            Map<Long, BigDecimal> closes = tradeEngine.currentCloses(session);
            if (tradeEngine.equity(session, account, closes).signum() <= 0) {
                forceLiquidate(session, account, closes);
                liquidatedNow = true;
            }
        }
        return new DayResult(aiTradeShares, fills, liquidatedNow, session.getDaysElapsed(),
                interestToday);
    }

    /**
     * 隔夜资金计息: 公式/舍入收口在 LedgerReplay.dailyInterest (结算曲线与 undo 重放同一内核,
     * 天然同口径)。玩家与 AI 一起计, AI 的账走 AiOpponent。返回玩家侧今日利息 (下发给前端,
     * 让现金机会成本可见)。
     */
    private BigDecimal accrueInterest(GameSession session, Account account) {
        BigDecimal interest = ledger.dailyInterest(account.getCashBalance());
        if (interest.signum() != 0) {
            account.setCashBalance(account.getCashBalance().add(interest));
            account.setInterestTotal(account.getInterestTotal().add(interest));
        }
        aiOpponent.accrue(session);
        return interest;
    }

    /** 净值归零强平: 全部持仓按现价了结 (含费用), 现金落定。 */
    private void forceLiquidate(GameSession session, Account account, Map<Long, BigDecimal> closes) {
        for (Map.Entry<Long, Integer> e : tradeEngine.sharesByStock(session, account).entrySet()) {
            int shares = e.getValue();
            if (shares == 0) {
                continue;
            }
            BigDecimal price = closes.getOrDefault(e.getKey(), BigDecimal.ZERO);
            if (price.signum() <= 0) {
                continue; // 无有效价格时不能按 0 元"平仓"毁掉仓位
            }
            TradeTransaction.Direction dir = shares > 0
                    ? TradeTransaction.Direction.SELL : TradeTransaction.Direction.BUY;
            tradeEngine.execute(session, account, e.getKey(), dir, price, Math.abs(shares));
        }
        session.setLiquidated(true);
    }
}
