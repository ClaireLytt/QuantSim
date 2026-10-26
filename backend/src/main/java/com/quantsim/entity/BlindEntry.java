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

/** 盲测赛报名: configJson = 回测策略配置 (RunRequest 形), 报名即锁死不可改。 */
@Getter
@Setter
@Entity
@Table(name = "blind_entries")
public class BlindEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "entry_id")
    private Long entryId;

    @Column(name = "week_idx", nullable = false)
    private int weekIdx;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "config_json", nullable = false, length = 2000)
    private String configJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
