package com.quantsim.config;

import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 缺省为空 = 不开 CORS (前后端同源); 跨域部署时用环境变量配显式白名单, 严禁 *。 */
    @Value("${app.cors.allowed-origins:}")
    private String[] allowedOrigins;

    @Value("${spring.web.resources.static-locations}")
    private String[] staticLocations;

    /**
     * 静态资源缓存策略: HTML 永远 no-cache (入口页拿不到新版本, JS/CSS 的 ?v= 就全白搭),
     * 其余静态文件短缓存 + 以 ?v= 手动失效。覆盖默认 handler, 顺序在前优先匹配。
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/", "/index.html", "/*.html")
                .addResourceLocations(staticLocations)
                .setCacheControl(CacheControl.noCache());
        registry.addResourceHandler("/**")
                .addResourceLocations(staticLocations)
                .setCacheControl(CacheControl.maxAge(1, TimeUnit.HOURS));
    }

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
