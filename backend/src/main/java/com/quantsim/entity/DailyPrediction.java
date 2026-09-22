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

/** 模型对某股某日给出的"次日涨跌"预测 (prob_up = 次日收盘高于当日收盘的概率)。 */
@Getter
@Setter
@Entity
@Table(name = "daily_prediction")
public class DailyPrediction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(name = "trade_date", nullable = false)
    private LocalDate tradeDate;

    @Column(name = "model", nullable = false, length = 16)
    private String model;

    @Column(name = "prob_up", nullable = false, precision = 5, scale = 4)
    private BigDecimal probUp;

    @Column(name = "predicted_direction", nullable = false, length = 4)
    private String predictedDirection;
}
