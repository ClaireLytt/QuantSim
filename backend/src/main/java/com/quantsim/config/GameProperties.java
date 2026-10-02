package com.quantsim.config;

import java.math.BigDecimal;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "quantsim.game")
public class GameProperties {
    private BigDecimal initialCash = new BigDecimal("100000");
    private int totalTicks = 20;
    private int historyDays = 60;
    private int minHistoryDays = 60;
    private int leaderboardSize = 20;
    private int backtestMinDays = 30;
    private double aiBuyThreshold = 0.55;
    private double aiSellThreshold = 0.45;
    private int maxOpenOrders = 5;       // 每局同时挂单上限
    private double maxLeverage = 2.0;    // 进阶模式最大杠杆 (敞口/净值)
    private int portfolioSize = 3;       // 组合模式标的数
    private double cashRateAnnual = 0.015;   // 闲置现金年化利率 (货基口径, 0 关闭)
    private double borrowRateAnnual = 0.05;  // 进阶模式透支的年化融资成本
    private int dcaIntervalDays = 5;         // 定投基准的投入间隔 (交易日)
    private int guestStartPerMinute = 6;     // 游客开局 IP 限频 (防 findOrCreate 刷库), 集成测试放宽
}
