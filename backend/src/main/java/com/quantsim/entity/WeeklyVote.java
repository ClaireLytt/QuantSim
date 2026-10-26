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

/** 实验室周报课题投票 (E20): 每人每周一票可改票, choice = HOLD(效应或有)/BREAK(更像噪声)。 */
@Getter
@Setter
@Entity
@Table(name = "weekly_votes")
public class WeeklyVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "vote_id")
    private Long voteId;

    @Column(name = "week_idx", nullable = false)
    private int weekIdx;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "choice", nullable = false, length = 8)
    private String choice;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
