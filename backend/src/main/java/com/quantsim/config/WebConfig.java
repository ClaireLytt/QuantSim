package com.quantsim.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 缺省为空 = 不开 CORS (前后端同源); 跨域部署时用环境变量配显式白名单, 严禁 *。 */
    @Value("${app.cors.allowed-origins:}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins == null || allowedOrigins.length == 0
                || (allowedOrigins.length == 1 && allowedOrigins[0].isBlank())) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowCredentials(true)
                .allowedMethods("GET", "POST");
    }
}
