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
 * 内置历史事件库: 对局揭示到某个日历日时弹出的双语快讯。
 * market 与 stock_code 二选一或都空 (全市场事件)。
 */
@Getter
@Setter
@Entity
@Table(name = "news_events")
public class NewsEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(length = 10)
    private String market;

    @Column(name = "stock_code", length = 16)
    private String stockCode;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(length = 8)
    private String severity;

    @Column(name = "title_zh", nullable = false, length = 120)
    private String titleZh;

    @Column(name = "title_en", nullable = false, length = 120)
    private String titleEn;

    @Column(name = "body_zh", length = 500)
    private String bodyZh;

    @Column(name = "body_en", length = 500)
    private String bodyEn;
}
