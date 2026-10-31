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

    /** +1 利好 / -1 利空 / 0 中性 (同一事件可对不同标的相反, 见 V34) */
    @Column(nullable = false)
    private int direction;

    /** 0~1 市场已消化度: 高预期利好落地常见"卖事实" */
    @Column(precision = 3, scale = 2)
    private java.math.BigDecimal expectation;

    /** 传闻→证实/辟谣 链 id */
    @Column(name = "chain_id")
    private Long chainId;

    /** OFFICIAL / RUMOR */
    @Column(name = "source_tier", nullable = false, length = 8)
    private String sourceTier = "OFFICIAL";
}
