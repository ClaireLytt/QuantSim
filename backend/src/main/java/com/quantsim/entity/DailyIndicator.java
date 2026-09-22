package com.quantsim.entity;

import java.math.BigDecimal;
import java.time.LocalDate;

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
@Table(name = "daily_indicator")
public class DailyIndicator {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(name = "trade_date", nullable = false)
    private LocalDate tradeDate;

    @Column(precision = 10, scale = 2)
    private BigDecimal ma5;

    @Column(precision = 10, scale = 2)
    private BigDecimal ma20;

    @Column(precision = 10, scale = 4)
    private BigDecimal volatility;

    @Column(name = "pct_change", precision = 10, scale = 4)
    private BigDecimal pctChange;
}
