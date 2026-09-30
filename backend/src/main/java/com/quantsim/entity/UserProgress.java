package com.quantsim.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 学堂/成长进度的云端副本, 一人一行, 内容即前端 qs_progress 的整份 JSON。 */
@Getter
@Setter
@Entity
@Table(name = "user_progress")
public class UserProgress {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Lob
    @Column(name = "progress_json", nullable = false, columnDefinition = "TEXT")
    private String progressJson;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
