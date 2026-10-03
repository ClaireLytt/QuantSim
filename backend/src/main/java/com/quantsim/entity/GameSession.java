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
@Table(name = "game_sessions")
public class GameSession {

    public enum Status { IN_PROGRESS, SETTLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "current_trade_date", nullable = false)
    private LocalDate currentTradeDate;

    @Column(name = "days_elapsed", nullable = false)
    private int daysElapsed = 0;

    // AI 对手的虚拟仓位: 与玩家同股同起点, 按模型置信度自动交易
    @Column(name = "ai_cash", nullable = false, precision = 12, scale = 2)
    private BigDecimal aiCash = BigDecimal.ZERO;

    @Column(name = "ai_shares", nullable = false)
    private int aiShares = 0;

    @Column(name = "ai_model", nullable = false, length = 16)
    private String aiModel = AiLevel.EASY.getModel();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.IN_PROGRESS;

    @Column(name = "initial_cash", nullable = false, precision = 12, scale = 2)
    private BigDecimal initialCash;

    @Column(name = "final_return_rate", precision = 10, scale = 4)
    private BigDecimal finalReturnRate;

    /** 结算时的年化夏普 (夏普榜用); 样本不足时为 null */
    @Column(name = "final_sharpe", precision = 10, scale = 4)
    private BigDecimal finalSharpe;

    @Column(nullable = false, length = 16)
    private String mode = "CLASSIC";

    @Column(nullable = false)
    private boolean advanced = false;

    /** A股真实规则: T+1 (当日买入不可卖) + 涨跌停封板限制 */
    @Column(name = "real_rules", nullable = false)
    private boolean realRules = false;

    @Column(nullable = false)
    private boolean liquidated = false;

    /** 赛季 "YYYY-MM", 创建时盖章 */
    @Column(length = 7)
    private String season;

    /** 每日挑战日期 (仅 DAILY 模式) */
    @Column(name = "challenge_date")
    private LocalDate challengeDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
