package com.quantsim.entity;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * 事件回放场景: 一段真实历史窗口 + 候选标的。候选的行情挂在 hidden 股票行上
 * (code = "真实代码@场景code"), 不进任何公开列表, 防止玩家比对形态提前定位窗口。
 */
@Getter
@Setter
@Entity
@Table(name = "event_scenarios")
public class EventScenario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String code;

    @Column(name = "name_zh", nullable = false, length = 64)
    private String nameZh;

    @Column(name = "name_en", nullable = false, length = 64)
    private String nameEn;

    @Column(nullable = false, length = 8)
    private String market;

    @Column(name = "window_start", nullable = false)
    private LocalDate windowStart;

    @Column(name = "window_end", nullable = false)
    private LocalDate windowEnd;

    /** 候选标的的真实行情代码, 逗号分隔 */
    @Column(nullable = false, length = 255)
    private String tickers;

    /** A股场景强制真实规则: 涨跌停/T+1 正是剧情本体 */
    @Column(name = "force_real_rules", nullable = false)
    private boolean forceRealRules = false;

    @Column(nullable = false, length = 16)
    private String difficulty = "NORMAL";

    @Column(nullable = false)
    private boolean enabled = true;
}
