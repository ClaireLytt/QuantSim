package com.quantsim.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 服务端全局密钥 (按用途一行): 盲局行情扰动等需要"攻击者不可复算"的种子源。 */
@Getter
@Setter
@Entity
@Table(name = "app_salts")
public class AppSalt {

    @Id
    @Column(length = 32)
    private String name;

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
