package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.FilledOrder;
import com.quantsim.dto.GameDtos.OrderInfo;
import com.quantsim.entity.Account;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.PendingOrder;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 挂单: 下/撤/列 + 「下一天」时按次日 OHLC 撮合。
 * 撮合规则 (p = 触发价, 次日 bar):
 *   LIMIT_BUY:   low ≤ p 时成交, 成交价 min(open, p)   —— 跳空低开按更优的开盘价
 *   LIMIT_SELL:  high ≥ p 时成交, 成交价 max(open, p)
 *   STOP_LOSS:   low ≤ p 时卖出, 成交价 min(open, p)   —— 跳空破位按开盘价止损
 *   TAKE_PROFIT: high ≥ p 时卖出, 成交价 max(open, p)
 *   TRAIL_STOP:  触发同 STOP_LOSS, 但每个未触发交易日把 p 上移到 max(p, 收盘*(1-trailPct%))
 * 成交时现金/持仓不足 -> 自动撤单 (不做资金冻结)。
 */
@Service
@RequiredArgsConstructor
public class OrderService {

    private final PendingOrderRepository orderRepository;
    private final com.quantsim.repository.TransactionRepository transactionRepository;
    private final MarketDataService marketData;
    private final TradeEngine tradeEngine;
    private final GameProperties props;

    public record FillSummary(List<FilledOrder> filled, int autoCancelled) {}

    /** 在挂单数 (限制模式下与已成交一起占笔数预算)。 */
    public long countOpen(Long sessionId) {
        return orderRepository.countBySessionIdAndStatus(sessionId, PendingOrder.Status.OPEN);
    }

    @Transactional
    public OrderInfo place(GameSession session, Long stockId, String type, BigDecimal price, int shares,
                           BigDecimal trailPct, String reason) {
        PendingOrder.Type orderType = Enums.parse(type, PendingOrder.Type.class, "挂单类型");
        StockData sd = marketData.load(stockId);
        if (orderType == PendingOrder.Type.TRAIL_STOP) {
            // 移动止损按跟踪距离下单, 初始触发价从当日收盘推出, 忽略传入 price
            if (trailPct == null || trailPct.doubleValue() < 1 || trailPct.doubleValue() > 30) {
                throw new BusinessException("移动止损跟踪距离需在 1% ~ 30% 之间");
            }
            DailyPrice bar = sd.bar(session.getCurrentTradeDate());
            if (bar == null) {
                throw new BusinessException("当前交易日行情缺失");
            }
            price = trailTrigger(bar.getClose(), trailPct);
        } else {
            trailPct = null;
            if (price == null || price.signum() <= 0) {
                throw new BusinessException("触发价必须大于 0");
            }
            if (price.stripTrailingZeros().scale() > 2) {
                throw new BusinessException("触发价最多两位小数");
            }
            price = price.setScale(2, RoundingMode.UNNECESSARY);
        }
        int lotSize = sd.stock().getMarket().getLotSize();
        if (shares <= 0 || shares % lotSize != 0) {
            throw new BusinessException("数量必须为 " + lotSize + " 的整数倍（整手交易）");
        }
        if (orderRepository.countBySessionIdAndStatus(session.getSessionId(), PendingOrder.Status.OPEN)
                >= props.getMaxOpenOrders()) {
            throw new BusinessException("挂单数已达上限 " + props.getMaxOpenOrders() + " 笔");
        }

        PendingOrder order = new PendingOrder();
        order.setSessionId(session.getSessionId());
        order.setStockId(stockId);
        order.setOrderType(orderType);
        order.setTriggerPrice(price);
        order.setShares(shares);
        order.setTrailPct(trailPct);
        order.setReason(reason); // 交易日志模式下挂单时写的理由, 成交时随流水落库
        order.setPlacedDate(session.getCurrentTradeDate());
        order = orderRepository.save(order);
        return toInfo(session, order, sd.stock().getCode());
    }

    @Transactional(readOnly = true)
    public List<OrderInfo> list(GameSession session) {
        return orderRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId()).stream()
                .map(o -> toInfo(session, o, marketData.load(o.getStockId()).stock().getCode()))
                .toList();
    }

    @Transactional
    public void cancel(GameSession session, Long orderId) {
        PendingOrder order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("挂单不存在: " + orderId));
        if (!order.getSessionId().equals(session.getSessionId())) {
            throw new BusinessException("挂单不属于该对局");
        }
        if (order.getStatus() != PendingOrder.Status.OPEN) {
            throw new BusinessException("挂单已成交或已撤销");
        }
        order.setStatus(PendingOrder.Status.CANCELLED);
        orderRepository.save(order);
    }

    /** 结算时调用: 撤销全部 OPEN 挂单。不撤的话它们永远停在 OPEN (结算后 tick 被拒,
     *  没有任何路径再碰它们), /orders 列表与复盘会一直显示"挂着", 纯脏数据。 */
    public void cancelOpenOnSettle(Long sessionId) {
        for (PendingOrder order : orderRepository.findBySessionIdAndStatusOrderByCreatedAtAsc(
                sessionId, PendingOrder.Status.OPEN)) {
            order.setStatus(PendingOrder.Status.CANCELLED);
            orderRepository.save(order);
        }
    }

    /** tick 推进到新交易日后调用: 用当日 (新揭示的) OHLC 撮合全部 OPEN 挂单。 */
    public FillSummary fillOrders(GameSession session, Account account) {
        List<PendingOrder> open =
                orderRepository.findBySessionIdAndStatusOrderByCreatedAtAsc(
                        session.getSessionId(), PendingOrder.Status.OPEN);
        List<FilledOrder> filled = new ArrayList<>();
        int cancelled = 0;
        // 限制模式: 撮合同样受笔数上限约束 (下单时校验过预算, 但手动交易可能已把额度用掉)
        long txCount = session.getMaxTrades() == null ? 0
                : transactionRepository.countBySessionId(session.getSessionId());
        for (PendingOrder order : open) {
            StockData sd = marketData.load(order.getStockId());
            DailyPrice bar = sd.bar(session.getCurrentTradeDate());
            if (bar == null) {
                continue;
            }
            BigDecimal fillPrice = fillPrice(order, bar);
            if (fillPrice == null) {
                // 未触发: 移动止损把触发价上移到 max(当前, 收盘*(1-trail%)), 只升不降
                if (order.getOrderType() == PendingOrder.Type.TRAIL_STOP) {
                    BigDecimal ratchet = trailTrigger(bar.getClose(), order.getTrailPct());
                    if (ratchet.compareTo(order.getTriggerPrice()) > 0) {
                        order.setTriggerPrice(ratchet);
                        orderRepository.save(order);
                    }
                }
                continue; // 未触发, 继续挂
            }
            TradeTransaction.Direction dir = order.getOrderType() == PendingOrder.Type.LIMIT_BUY
                    ? TradeTransaction.Direction.BUY : TradeTransaction.Direction.SELL; // TRAIL_STOP 是卖单
            // 止损/止盈/移动止损是平仓保护单 (reduce-only)。进阶模式的 validate 只做净值/杠杆
            // 约束不查持仓, 挂单后手动清仓再触发会穿越零点开空 (保护单变开空单);
            // 仓位已清自动撤单, 多头缩水只平剩余。普通模式 validate 本就拒绝超卖, 行为不变。
            int fillShares = order.getShares();
            if (session.isAdvanced() && dir == TradeTransaction.Direction.SELL
                    && order.getOrderType() != PendingOrder.Type.LIMIT_SELL) {
                int cur = tradeEngine.position(session, account, order.getStockId()).shares();
                if (cur <= 0) {
                    order.setStatus(PendingOrder.Status.CANCELLED);
                    cancelled++;
                    orderRepository.save(order);
                    continue;
                }
                fillShares = Math.min(fillShares, cur);
            }
            // 真实规则 (封板/T+1) 只是"今天不能成交", 继续挂到明天, 不作废单处理
            if (session.isRealRules() && tradeEngine.realRulesError(session, account,
                    order.getStockId(), dir, order.getShares()) != null) {
                continue;
            }
            if (session.getMaxTrades() != null && txCount >= session.getMaxTrades()) {
                // 笔数预算已耗尽, 后续挂单作废而不是静默超限
                order.setStatus(PendingOrder.Status.CANCELLED);
                cancelled++;
                orderRepository.save(order);
                continue;
            }
            String error = tradeEngine.validate(session, account, order.getStockId(),
                    dir, fillPrice, fillShares);
            if (error != null) {
                order.setStatus(PendingOrder.Status.CANCELLED);
                cancelled++;
            } else {
                tradeEngine.execute(session, account, order.getStockId(), dir, fillPrice, fillShares,
                        order.getReason(), order.getOrderId());
                txCount++;
                order.setStatus(PendingOrder.Status.FILLED);
                order.setFilledDate(session.getCurrentTradeDate());
                order.setFilledPrice(fillPrice);
                filled.add(new FilledOrder(order.getOrderType().name(), fillPrice,
                        fillShares, BlindDates.maskCode(session, sd.stock().getCode()),
                        order.getReason())); // 带回下单理由, 前端成交日志才能还原交易日记
            }
            orderRepository.save(order);
        }
        return new FillSummary(filled, cancelled);
    }

    /** 移动止损触发价: 收盘 × (1 - trail%), 两位 HALF_UP。下单初始化与逐日上移同用一个公式。 */
    private BigDecimal trailTrigger(BigDecimal close, BigDecimal trailPct) {
        return close.multiply(BigDecimal.ONE.subtract(trailPct.movePointLeft(2)))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal fillPrice(PendingOrder order, DailyPrice bar) {
        BigDecimal p = order.getTriggerPrice();
        return switch (order.getOrderType()) {
            case LIMIT_BUY, STOP_LOSS, TRAIL_STOP ->
                    bar.getLow().compareTo(p) <= 0 ? bar.getOpen().min(p) : null;
            case LIMIT_SELL, TAKE_PROFIT -> bar.getHigh().compareTo(p) >= 0 ? bar.getOpen().max(p) : null;
        };
    }

    /** 竞技模式挂单日期与标的代码同样脱敏, 与 K 线口径一致。 */
    private OrderInfo toInfo(GameSession session, PendingOrder o, String stockCode) {
        return new OrderInfo(o.getOrderId(), o.getOrderType().name(), o.getTriggerPrice(),
                o.getShares(), o.getStatus().name(), BlindDates.maskCode(session, stockCode),
                BlindDates.mask(session, o.getPlacedDate()),
                BlindDates.mask(session, o.getFilledDate()), o.getFilledPrice(), o.getTrailPct());
    }
}
