package com.quantsim.service;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;

import lombok.RequiredArgsConstructor;

/**
 * 风格罗盘 (成长系统 A1): 从真实交易流水派生玩家的两轴风格坐标。
 * 横轴 = 平均持仓天数 (猎手-农夫), 纵轴 = 单笔买入占本金比 (轻刀-重剑)。
 * 口径: 最近 30 局已结算对局 (排除 INTRO 教学局), 买卖 FIFO 配对;
 * 进阶模式的裸卖开空不配对 (样本少且语义不同, 直接跳过, 不污染持仓时长)。
 * ≥10 局且 ≥10 个配对样本才 ready——风格是"活出来"的, 样本不足不出结论。
 */
@Service
@RequiredArgsConstructor
public class StyleCompassService {

    private static final int MIN_GAMES = 10;
    private static final int MIN_SAMPLES = 10;

    private final GameSessionRepository sessionRepository;
    private final TransactionRepository transactionRepository;

    public record StyleCompass(int games, int samples, boolean ready,
                               double avgHoldDays, double avgTradeSize) {}

    @Transactional(readOnly = true)
    public StyleCompass compass(Long userId) {
        if (userId == null) {
            return new StyleCompass(0, 0, false, 0, 0);
        }
        List<GameSession> sessions = sessionRepository
                .findTop30ByUserIdAndStatusAndModeNotOrderByCreatedAtDesc(
                        userId, GameSession.Status.SETTLED, "INTRO");
        Acc acc = new Acc();
        for (GameSession s : sessions) {
            accumulate(acc, transactionRepository.findBySessionIdOrderByCreatedAtAsc(s.getSessionId()),
                    s.getInitialCash());
        }
        boolean ready = sessions.size() >= MIN_GAMES && acc.lots >= MIN_SAMPLES;
        return new StyleCompass(sessions.size(), acc.lots, ready,
                acc.lots == 0 ? 0 : round2(acc.holdDaySum / acc.lots),
                acc.buys == 0 ? 0 : round2(acc.sizeSum / acc.buys));
    }

    /** 累加器: holdDaySum/lots 为 FIFO 配对的持仓天数样本, sizeSum/buys 为买入规模样本。 */
    static final class Acc {
        double holdDaySum;
        int lots;
        double sizeSum;
        int buys;
    }

    /** 单局流水聚合 (纯函数, 供单测): 买入入队, 卖出按 FIFO 弹出配对算持仓天数。 */
    static void accumulate(Acc acc, List<TradeTransaction> txs, BigDecimal initialCash) {
        if (initialCash == null || initialCash.signum() <= 0) {
            return;
        }
        record Lot(java.time.LocalDate date, int shares) {}
        Deque<Lot> inventory = new ArrayDeque<>();
        for (TradeTransaction tx : txs) {
            if (tx.getShares() == null || tx.getShares() <= 0 || tx.getPrice() == null) {
                continue;
            }
            if (tx.getDirection() == TradeTransaction.Direction.BUY) {
                inventory.addLast(new Lot(tx.getTradeDate(), tx.getShares()));
                acc.sizeSum += tx.getPrice().multiply(BigDecimal.valueOf(tx.getShares()))
                        .doubleValue() / initialCash.doubleValue();
                acc.buys++;
            } else {
                int remaining = tx.getShares();
                while (remaining > 0 && !inventory.isEmpty()) {
                    Lot lot = inventory.pollFirst();
                    int matched = Math.min(remaining, lot.shares());
                    acc.holdDaySum += ChronoUnit.DAYS.between(lot.date(), tx.getTradeDate());
                    acc.lots++;
                    remaining -= matched;
                    if (lot.shares() > matched) {
                        inventory.addFirst(new Lot(lot.date(), lot.shares() - matched));
                    }
                }
                // remaining > 0 = 裸卖开空, 按口径跳过
            }
        }
    }

    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
