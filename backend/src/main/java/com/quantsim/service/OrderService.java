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
 * 成交时现金/持仓不足 -> 自动撤单 (不做资金冻结)。
 */
@Service
@RequiredArgsConstructor
public class OrderService {

    private final PendingOrderRepository orderRepository;
    private final MarketDataService marketData;
    private final TradeEngine tradeEngine;
    private final GameProperties props;

    public record FillSummary(List<FilledOrder> filled, int autoCancelled) {}

    @Transactional
    public OrderInfo place(GameSession session, Long stockId, String type, BigDecimal price, int shares) {
        PendingOrder.Type orderType;
        try {
            orderType = PendingOrder.Type.valueOf(type.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知挂单类型: " + type);
        }
        if (price == null || price.signum() <= 0) {
            throw new BusinessException("触发价必须大于 0");
        }
        if (price.stripTrailingZeros().scale() > 2) {
            throw new BusinessException("触发价最多两位小数");
        }
        StockData sd = marketData.load(stockId);
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
        order.setTriggerPrice(price.setScale(2, RoundingMode.UNNECESSARY));
        order.setShares(shares);
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

    /** tick 推进到新交易日后调用: 用当日 (新揭示的) OHLC 撮合全部 OPEN 挂单。 */
    public FillSummary fillOrders(GameSession session, Account account) {
        List<PendingOrder> open =
                orderRepository.findBySessionIdAndStatusOrderByCreatedAtAsc(
                        session.getSessionId(), PendingOrder.Status.OPEN);
        List<FilledOrder> filled = new ArrayList<>();
        int cancelled = 0;
        for (PendingOrder order : open) {
            StockData sd = marketData.load(order.getStockId());
            DailyPrice bar = sd.bar(session.getCurrentTradeDate());
            if (bar == null) {
                continue;
            }
            BigDecimal fillPrice = fillPrice(order, bar);
            if (fillPrice == null) {
                continue; // 未触发, 继续挂
            }
            TradeTransaction.Direction dir = order.getOrderType() == PendingOrder.Type.LIMIT_BUY
                    ? TradeTransaction.Direction.BUY : TradeTransaction.Direction.SELL;
            String error = tradeEngine.validate(session, account, order.getStockId(),
                    dir, fillPrice, order.getShares());
            if (error != null) {
                order.setStatus(PendingOrder.Status.CANCELLED);
                cancelled++;
            } else {
                tradeEngine.execute(session, account, order.getStockId(), dir, fillPrice, order.getShares());
                order.setStatus(PendingOrder.Status.FILLED);
                order.setFilledDate(session.getCurrentTradeDate());
                order.setFilledPrice(fillPrice);
                filled.add(new FilledOrder(order.getOrderType().name(), fillPrice,
                        order.getShares(), BlindDates.maskCode(session, sd.stock().getCode())));
            }
            orderRepository.save(order);
        }
        return new FillSummary(filled, cancelled);
    }

    private BigDecimal fillPrice(PendingOrder order, DailyPrice bar) {
        BigDecimal p = order.getTriggerPrice();
        return switch (order.getOrderType()) {
            case LIMIT_BUY, STOP_LOSS -> bar.getLow().compareTo(p) <= 0 ? bar.getOpen().min(p) : null;
            case LIMIT_SELL, TAKE_PROFIT -> bar.getHigh().compareTo(p) >= 0 ? bar.getOpen().max(p) : null;
        };
    }

    /** 竞技模式挂单日期与标的代码同样脱敏, 与 K 线口径一致。 */
    private OrderInfo toInfo(GameSession session, PendingOrder o, String stockCode) {
        return new OrderInfo(o.getOrderId(), o.getOrderType().name(), o.getTriggerPrice(),
                o.getShares(), o.getStatus().name(), BlindDates.maskCode(session, stockCode),
                BlindDates.mask(session, o.getPlacedDate()),
                BlindDates.mask(session, o.getFilledDate()), o.getFilledPrice());
    }
}
