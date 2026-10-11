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

@Getter
@Setter
@Entity
@Table(name = "transactions")
public class TradeTransaction {

    public enum Direction { BUY, SELL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "tx_id")
    private Long txId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** 标的 ID; 旧数据为 null (单股模式回退到会话主标的) */
    @Column(name = "stock_id")
    private Long stockId;

    @Column(name = "trade_date", nullable = false)
    private LocalDate tradeDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Direction direction;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    private Integer shares;

    /** 本笔总费用 (佣金+印花税) */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal fee = BigDecimal.ZERO;

    /** 交易理由 (限制条件玩法; 用户文本, 前端只能 textContent 渲染) */
    @Column(length = 100)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
