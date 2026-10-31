package com.quantsim.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * 积分流水: 每次余额变动一行 (delta 正负均记, reason 标来源)。
 * 用途一是审计守恒 (Σdelta = balance 变动), 二是大额兑换校验
 * "非盲盒净收入" —— 盲盒返利 (reason=blindbox) 不计入兑换资格。
 */
@Getter
@Setter
@Entity
@Table(name = "points_ledger")
public class PointsLedger {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ledger_id")
    private Long ledgerId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private int delta;

    @Column(nullable = false, length = 32)
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
