package com.quantsim.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 行情自动更新: 定时调用数据管道 refresh.py (默认关闭)。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "quantsim.refresh")
public class RefreshProperties {
    // 注: cron 不在这里绑定——DataRefreshService 的 @Scheduled 直接读
    // ${quantsim.refresh.cron:...} 占位符, 字段放这只会造成默认值两处漂移。
    private boolean enabled = false;
    private String command = "python refresh.py";
    private String workdir = "../data-pipeline";
    private int timeoutMinutes = 30;
}
