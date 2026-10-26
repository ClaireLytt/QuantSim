package com.quantsim.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "stocks")
public class Stock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "stock_id")
    private Long stockId;

    @Column(nullable = false, unique = true, length = 32)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(length = 50)
    private String industry;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Market market = Market.STOCK;

    /** 事件回放场景专用标的: 不进研究所/回测/随机开局等任何公开列表 (防比对泄题) */
    @Column(nullable = false)
    private boolean hidden = false;

    /** 退市标的 (E11 幸存者实验专用): 恒与 hidden=1 搭配——出所有对局/榜单, 只供实验室调取 */
    @Column(nullable = false)
    private boolean delisted = false;

    @Column(name = "delist_date")
    private java.time.LocalDate delistDate;
}
