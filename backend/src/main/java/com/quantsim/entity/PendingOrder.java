package com.quantsim.entity;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 挂单: 在「下一天」按次日 OHLC 撮合的限价/止损/止盈委托。 */
@Getter
@Setter
@Entity
@Table(name = "pending_orders")
public class PendingOrder {

    /** TRAIL_STOP: 移动止损, 触发价随收盘价上移 (trailPct 跟踪距离), 触发规则同 STOP_LOSS */
    public enum Type { LIMIT_BUY, LIMIT_SELL, STOP_LOSS, TAKE_PROFIT, TRAIL_STOP }

    public enum Status { OPEN, FILLED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Enumerated(EnumType.STRING)
    @Column(name = "order_type", nullable = false, length = 12)
    private Type orderType;

    @Column(name = "trigger_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal triggerPrice;

    @Column(nullable = false)
    private Integer shares;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Status status = Status.OPEN;

    @Column(name = "placed_date", nullable = false)
    private LocalDate placedDate;

    @Column(name = "filled_date")
    private LocalDate filledDate;

    @Column(name = "filled_price", precision = 10, scale = 2)
    private BigDecimal filledPrice;

    /** 移动止损跟踪百分比 (1~30); 其他类型为 null */
    @Column(name = "trail_pct", precision = 5, scale = 2)
    private BigDecimal trailPct;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
