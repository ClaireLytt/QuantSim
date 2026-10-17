package com.quantsim.service;

import java.math.BigDecimal;

import org.springframework.stereotype.Service;

import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.TradeTransaction;

import lombok.RequiredArgsConstructor;

/**
 * AI 对手的账房: session 上 aiCash/aiShares 两字段的唯一读写口。
 * 买/卖 (含费)、计息、估值、是否启用 —— 全部算术收口于此, 与玩家口径的一致性
 * 由 FeeCalculator 与 LedgerReplay 两个共享内核保证, 不再靠各调用方自己记得对照。
 * GameAiService 只负责决策 (预测→目标仓位), 本类只管账。
 */
@Service
@RequiredArgsConstructor
public class AiOpponent {

    private final FeeCalculator feeCalculator;
    private final LedgerReplay ledger;

    /** V2 迁移前创建的旧对局 ai_cash/ai_shares 均为 0, 视为无 AI 对手, 避免显示 -100% 收益。 */
    public boolean initialized(GameSession session) {
        return session.getAiCash().signum() > 0 || session.getAiShares() > 0;
    }

    /** AI 买入: 与玩家同费用口径, 现金可被费吃穿由决策层的 maxAffordableShares 保证不发生。 */
    void buy(GameSession session, Market market, BigDecimal close, int shares) {
        if (shares <= 0) {
            return;
        }
        BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
        session.setAiCash(session.getAiCash().subtract(gross).subtract(fee));
        session.setAiShares(session.getAiShares() + shares);
    }

    /** AI 卖出: 与玩家同费用口径。 */
    void sell(GameSession session, Market market, BigDecimal close, int shares) {
        if (shares <= 0) {
            return;
        }
        BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross);
        session.setAiCash(session.getAiCash().add(gross).subtract(fee));
        session.setAiShares(session.getAiShares() - shares);
    }

    /** 隔夜计息: 与玩家同公式同舍入 (LedgerReplay.dailyInterest); 未启用时不动账。 */
    public void accrue(GameSession session) {
        if (!initialized(session)) {
            return;
        }
        BigDecimal interest = ledger.dailyInterest(session.getAiCash());
        if (interest.signum() != 0) {
            session.setAiCash(session.getAiCash().add(interest));
        }
    }

    /** AI 净值 = 现金 + 持仓 × 给定收盘价 (结算揭晓价 / 当日现价都走这里)。 */
    public BigDecimal valueAt(GameSession session, BigDecimal close) {
        return session.getAiCash().add(close.multiply(BigDecimal.valueOf(session.getAiShares())));
    }
}
