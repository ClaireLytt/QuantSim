package com.quantsim.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 积分账户: 余额/道具/连胜/签到/转盘/每日任务, 服务端权威 (防前端改存档)。 */
@Getter
@Setter
@Entity
@Table(name = "user_points")
public class UserPoints {

    /** 每日任务位标记 */
    public static final int TASK_SETTLE = 1;
    public static final int TASK_BACKTEST = 2;
    public static final int TASK_DAILY = 4;
    public static final int TASK_REBORN = 8;
    public static final int TASK_CHEST = 16;
    public static final int TASK_FAMOUS = 32;
    public static final int TASK_CASE = 64;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private int balance;

    @Column(name = "item_peek", nullable = false)
    private int itemPeek;

    @Column(name = "item_undo", nullable = false)
    private int itemUndo;

    @Column(name = "item_fast", nullable = false)
    private int itemFast;

    @Column(name = "win_streak", nullable = false)
    private int winStreak;

    @Column(name = "last_sign_in")
    private LocalDate lastSignIn;

    /** 连续签到天数 (昨日也签过则 +1, 断签归 1); 服务端权威, 跨设备一致 */
    @Column(name = "sign_in_streak", nullable = false)
    private int signInStreak;

    @Column(name = "last_spin")
    private LocalDate lastSpin;

    @Column(name = "task_date")
    private LocalDate taskDate;

    @Column(name = "task_flags", nullable = false)
    private int taskFlags;

    /** 当日已计分的结算局数 (随 task_date 一起跨零点归零): 基础分前 N 局全额, 之后衰减防刷 */
    @Column(name = "settle_count", nullable = false)
    private int settleCount;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
