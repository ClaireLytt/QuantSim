package com.quantsim.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 每日挑战题目: 当日首个请求生成并固化, 全服共用同一 (标的, 起始日)。 */
@Getter
@Setter
@Entity
@Table(name = "daily_challenges")
public class DailyChallenge {

    @Id
    @Column(name = "challenge_date")
    private LocalDate challengeDate;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
