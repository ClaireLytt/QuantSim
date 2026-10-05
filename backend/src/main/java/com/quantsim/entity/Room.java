package com.quantsim.entity;

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

/** 好友房间: 同一隐藏行情 (stock + start_date) 的异步对战。 */
@Getter
@Setter
@Entity
@Table(name = "rooms")
public class Room {

    public enum Status { OPEN, SETTLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Long roomId;

    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(name = "creator_user_id", nullable = false)
    private Long creatorUserId;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "ai_level", nullable = false, length = 16)
    private String aiLevel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Status status = Status.OPEN;

    @Column(name = "max_players", nullable = false)
    private int maxPlayers = 8;

    /** A股真实规则 (T+1/涨跌停): 建房固化, 全员同规则才可比 */
    @Column(name = "real_rules", nullable = false)
    private boolean realRules = false;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
