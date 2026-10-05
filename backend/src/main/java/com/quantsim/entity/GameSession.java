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

    /** 限制条件: 本局交易笔数上限 (null = 不限), 开局固化 */
    @Column(name = "max_trades")
    private Integer maxTrades;

    /** 限制条件: 每笔交易必须写一句理由 (复盘与结果对照) */
    @Column(name = "require_reason", nullable = false)
    private boolean requireReason = false;

    /** 事件回放场景 id (仅 EVENT 模式); 结算时据此揭晓场景与大事记 */
    @Column(name = "scenario_id")
    private Long scenarioId;

    /** 行为偏差诊断报告 (结算时计算一次, JSON; 见 BiasAnalysisService) */
    @Column(name = "bias_report", columnDefinition = "TEXT")
    private String biasReport;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
