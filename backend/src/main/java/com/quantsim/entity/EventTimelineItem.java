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

/** 事件回放场景的大事记: 只在结算后揭晓 (文本会暴露真实时间, 进行中绝不下发)。 */
@Getter
@Setter
@Entity
@Table(name = "event_timeline")
public class EventTimelineItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "scenario_id", nullable = false)
    private Long scenarioId;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(nullable = false, length = 8)
    private String severity;

    @Column(name = "title_zh", nullable = false, length = 128)
    private String titleZh;

    @Column(name = "title_en", nullable = false, length = 128)
    private String titleEn;

    @Column(name = "body_zh", nullable = false, length = 512)
    private String bodyZh;

    @Column(name = "body_en", nullable = false, length = 512)
    private String bodyEn;
}
