package com.quantsim.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * 盲测擂台的周盐 (commit-reveal): 窗口种子 = SHA(周) XOR 盐。
 * 盐在该周首次报名/看榜时服务端随机生成, 赛中不下发; 周结束揭晓时随榜公布,
 * 任何人可用公开算法 + 盐复算三段窗口验证赛果 (可审计的保密)。
 */
@Getter
@Setter
@Entity
@Table(name = "blind_week_salts")
public class BlindWeekSalt {

    @Id
    @Column(name = "week_idx")
    private Integer weekIdx;

    @Column(nullable = false)
    private long salt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
