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

/** 组合模式的分标的持仓; shares 为负即做空。 */
@Getter
@Setter
@Entity
@Table(name = "positions")
public class Position {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "position_id")
    private Long positionId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(nullable = false)
    private Integer shares = 0;

    @Column(name = "avg_cost", nullable = false, precision = 10, scale = 2)
    private BigDecimal avgCost = BigDecimal.ZERO;
}
