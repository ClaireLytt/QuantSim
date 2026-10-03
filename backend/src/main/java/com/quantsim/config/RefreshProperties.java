package com.quantsim.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 行情自动更新: 定时调用数据管道 refresh.py (默认关闭)。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "quantsim.refresh")
public class RefreshProperties {
    private boolean enabled = false;
    private String cron = "0 30 2 * * *";
    private String command = "python refresh.py";
    private String workdir = "../data-pipeline";
    private int timeoutMinutes = 30;
}
