package com.quantsim.service;

import com.quantsim.entity.GameSession;
import com.quantsim.entity.PendingOrder;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 交易预算: 「本局还能再交易几笔」这条规则的唯一定义。
 *
 * 口径有两个, 过去分别散在 GameService 与 OrderService 的注释里, 现在收口成命名方法:
 * - 新增口径 (下单/手动交易): 已成交 + 在挂单 共同占预算 —— 挂单不占预算的话,
 *   挂单就是绕过笔数上限的后门 ({@link Snapshot#used()})。
 * - 撮合口径 (fillOrders): 只数已成交 —— 该挂单自己占着的名额就是它的预算,
 *   成交只是 OPEN→FILLED 的名额转换, 不新占一笔 ({@link FillConsumer})。
 *
 * 纯策略核 (Snapshot/FillConsumer) 可直构, 表驱动单测零依赖; 本类只是取数适配器。
 */
@Service
@RequiredArgsConstructor
public class TradeBudget {

    private final TransactionRepository transactionRepository;
    private final PendingOrderRepository orderRepository;

    /** 新增口径的预算快照; 一次取数多次判定 (调用方省第二次 COUNT)。 */
    public Snapshot snapshot(GameSession session) {
        if (session.getMaxTrades() == null) {
            return Snapshot.UNLIMITED;
        }
        return new Snapshot(
                transactionRepository.countBySessionId(session.getSessionId()),
                orderRepository.countBySessionIdAndStatus(
                        session.getSessionId(), PendingOrder.Status.OPEN),
                session.getMaxTrades());
    }

    /** 撮合口径的消耗器: 只在限笔模式查一次已成交数, 之后边成交边记账。 */
    public FillConsumer beginFill(GameSession session) {
        long filled = session.getMaxTrades() == null ? 0
                : transactionRepository.countBySessionId(session.getSessionId());
        return new FillConsumer(filled, session.getMaxTrades());
    }

    /** 纯策略核: (已成交, 在挂单, 上限-或-null)。maxTrades 为 null = 本局不限笔。 */
    public record Snapshot(long filled, long open, Integer maxTrades) {

        static final Snapshot UNLIMITED = new Snapshot(0, 0, null);

        public boolean unlimited() {
            return maxTrades == null;
        }

        /** 新增口径的已用预算: 已成交 + 在挂单。 */
        public long used() {
            return filled + open;
        }

        /** 剩余可新增笔数; 不限笔返回 null (对外响应约定, 前端据此隐藏计数)。 */
        public Integer remaining() {
            return unlimited() ? null : (int) Math.max(0, maxTrades - used());
        }

        /** 本次新增成功后的剩余 (trade 响应用, 免得成交落库后再 COUNT 一次)。 */
        public Integer remainingAfterAdd() {
            return unlimited() ? null : (int) Math.max(0, maxTrades - used() - 1);
        }

        /** 不可再新增时抛业务异常; 文案与历史版本逐字一致 (集成测试断言过)。 */
        public void requireHeadroom() {
            if (!unlimited() && used() >= maxTrades) {
                throw new BusinessException(
                        "本局交易笔数已达上限 " + maxTrades + " 笔（在挂单也占用笔数）");
            }
        }
    }

    /**
     * 撮合消耗器。exhausted 在 validate 前查 (超限的单作废而非静默跳过),
     * consume 在 execute 成功后记 —— validate 失败的单不占预算, 与历史行为一致。
     */
    public static final class FillConsumer {

        private long filled;
        private final Integer maxTrades;

        FillConsumer(long filled, Integer maxTrades) {
            this.filled = filled;
            this.maxTrades = maxTrades;
        }

        /** 预算已耗尽? 不限笔恒 false。 */
        public boolean exhausted() {
            return maxTrades != null && filled >= maxTrades;
        }

        /** 一笔成交落账。 */
        public void consume() {
            filled++;
        }
    }
}
