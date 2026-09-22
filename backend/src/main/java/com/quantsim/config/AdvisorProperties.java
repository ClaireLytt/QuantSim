package com.quantsim.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "quantsim.advisor")
public class AdvisorProperties {
    /** Anthropic API Key, 未配置时顾问功能自动禁用 */
    private String apiKey = "";
    private String apiUrl = "https://api.anthropic.com/v1/messages";
    private String model = "claude-haiku-4-5-20251001";
    private int maxTokens = 500;
    /** 提供给 Agent 的近期 K 线天数 */
    private int recentDays = 20;
    private int timeoutSeconds = 30;
}
