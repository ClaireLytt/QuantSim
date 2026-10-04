package com.quantsim.entity;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "accounts")
public class Account {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "account_id")
    private Long accountId;

    @Column(name = "session_id", nullable = false, unique = true)
    private Long sessionId;

    @Column(name = "cash_balance", nullable = false, precision = 12, scale = 2)
    private BigDecimal cashBalance;

    @Column(name = "holding_shares", nullable = false)
    private Integer holdingShares = 0;

    @Column(name = "holding_cost", nullable = false, precision = 10, scale = 2)
    private BigDecimal holdingCost = BigDecimal.ZERO;

    /** 累计利息: 正=闲置现金收益, 负=进阶模式透支的融资成本 */
    @Column(name = "interest_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal interestTotal = BigDecimal.ZERO;
}
