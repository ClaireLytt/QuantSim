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
}
