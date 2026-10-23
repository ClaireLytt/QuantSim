package com.quantsim.service;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.PendingOrder;
import com.quantsim.entity.TradeTransaction;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 挂单撮合: 「这张挂单今天怎么处理」这条决策矩阵的唯一定义。
 *
 * 为什么按单张出决策而不是整批纯化: 循环内先成交的单会改变持仓, 后面的保护单
 * 要按"最新"持仓钳制数量 —— 顺序耦合本身是业务语义, 由适配器 (OrderService.fillOrders)
 * 逐单取数后再问本模块。
 *
 * 为什么闸门顺序在这里而不在适配器: 触发 → ratchet → reduce-only 钳制 → 真实规则
 * (今天不能成交, 继续挂) → 笔数预算 (作废而不是静默超限) → validate (作废)。
 * realRules 先于预算: 被封板/T+1 拦下的单不消耗也不触发预算作废 —— 这个顺序差异
 * 是历史行为, 挪位置会把"明天还能成交的单"错杀, 由 OrderMatchingTest 钉死。
 *
 * 依赖外部裁决的四问收敛成 {@link Gates}, 适配器用闭包供给, 测试用常量假件 ——
 * 决策矩阵因此可以零 Spring 零数据库表驱动验证。
 */
public final class OrderMatching {

    private OrderMatching() { }

    /** 挂单视图: 决策需要知道的全部字段, 与 JPA 实体解耦。 */
    public record OrderView(PendingOrder.Type type, BigDecimal triggerPrice,
                            int shares, BigDecimal trailPct) {

        public static OrderView of(PendingOrder o) {
            return new OrderView(o.getOrderType(), o.getTriggerPrice(), o.getShares(), o.getTrailPct());
        }
    }

    /** 外部裁决四问; 适配器以当前单为闭包实现, 单测给常量。 */
    public interface Gates {

        /** 当前持仓股数 (仅 advanced 模式的保护卖单会问)。 */
        int currentPositionShares();

        /** 真实规则 (封板/T+1) 是否拦下这笔成交 (仅 realRules 模式会问)。 */
        boolean realRulesBlocked(TradeTransaction.Direction dir, int shares);

        /** 笔数预算是否已耗尽。 */
        boolean budgetExhausted();

        /** 资金/杠杆校验, 通过返回 null。 */
        String validateError(TradeTransaction.Direction dir, BigDecimal price, int shares);
    }

    /** 决策封闭集。 */
    public sealed interface Decision {
        /** 未触发 (或今天不能成交), 继续挂。 */
        record Keep() implements Decision { }
        /** 移动止损未触发且收盘走高: 触发价只升不降。 */
        record Ratchet(BigDecimal newTrigger) implements Decision { }
        /** 作废, 带原因 (落库行为相同, 原因供测试与未来审计区分)。 */
        record Cancel(CancelReason reason) implements Decision { }
        /** 按价与数量成交 (数量可能被 reduce-only 钳小)。 */
        record Fill(TradeTransaction.Direction dir, BigDecimal price, int shares) implements Decision { }
    }

    public enum CancelReason { POSITION_GONE, BUDGET_EXHAUSTED, REJECTED }

    /** 单张挂单在当日 bar 下的处理决策。bar 缺失由适配器先行跳过, 不进本矩阵。 */
    public static Decision decide(OrderView view, DailyPrice bar,
                                  boolean advanced, boolean realRules, Gates gates) {
        BigDecimal price = fillPrice(view, bar);
        if (price == null) {
            // 未触发: 移动止损把触发价上移到 max(当前, 收盘*(1-trail%)), 只升不降
            if (view.type() == PendingOrder.Type.TRAIL_STOP) {
                BigDecimal ratchet = trailTrigger(bar.getClose(), view.trailPct());
                if (ratchet.compareTo(view.triggerPrice()) > 0) {
                    return new Decision.Ratchet(ratchet);
                }
            }
            return new Decision.Keep();
        }
        TradeTransaction.Direction dir = view.type() == PendingOrder.Type.LIMIT_BUY
                ? TradeTransaction.Direction.BUY : TradeTransaction.Direction.SELL; // TRAIL_STOP 是卖单
        // 止损/止盈/移动止损是平仓保护单 (reduce-only)。进阶模式的 validate 只做净值/杠杆
        // 约束不查持仓, 挂单后手动清仓再触发会穿越零点开空 (保护单变开空单);
        // 仓位已清自动撤单, 多头缩水只平剩余。普通模式 validate 本就拒绝超卖, 行为不变。
        int shares = view.shares();
        if (advanced && dir == TradeTransaction.Direction.SELL
                && view.type() != PendingOrder.Type.LIMIT_SELL) {
            int cur = gates.currentPositionShares();
            if (cur <= 0) {
                return new Decision.Cancel(CancelReason.POSITION_GONE);
            }
            shares = Math.min(shares, cur);
        }
        // 真实规则只是"今天不能成交", 继续挂到明天。判定必须用 clamp 后的 shares
        // (与 validate/execute 同一数量口径), 否则可部分平仓的保护单会被 T+1 整单拒绝而永远挂着
        if (realRules && gates.realRulesBlocked(dir, shares)) {
            return new Decision.Keep();
        }
        if (gates.budgetExhausted()) {
            // 笔数预算已耗尽, 作废而不是静默超限
            return new Decision.Cancel(CancelReason.BUDGET_EXHAUSTED);
        }
        if (gates.validateError(dir, price, shares) != null) {
            return new Decision.Cancel(CancelReason.REJECTED);
        }
        return new Decision.Fill(dir, price, shares);
    }

    /** 触发判定与成交价: 买向挂单低点触达按 min(开盘, 触发价), 卖向高点触达按 max。 */
    public static BigDecimal fillPrice(OrderView view, DailyPrice bar) {
        BigDecimal p = view.triggerPrice();
        return switch (view.type()) {
            case LIMIT_BUY, STOP_LOSS, TRAIL_STOP ->
                    bar.getLow().compareTo(p) <= 0 ? bar.getOpen().min(p) : null;
            case LIMIT_SELL, TAKE_PROFIT -> bar.getHigh().compareTo(p) >= 0 ? bar.getOpen().max(p) : null;
        };
    }

    /** 移动止损触发价: 收盘 × (1 - trail%), 两位 HALF_UP。下单初始化与逐日上移同用一个公式。 */
    public static BigDecimal trailTrigger(BigDecimal close, BigDecimal trailPct) {
        return close.multiply(BigDecimal.ONE.subtract(trailPct.movePointLeft(2)))
                .setScale(2, RoundingMode.HALF_UP);
    }
}
