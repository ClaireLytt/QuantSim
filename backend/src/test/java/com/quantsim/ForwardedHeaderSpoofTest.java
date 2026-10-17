package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * 回归: 按 IP 的限流不能被伪造的 X-Forwarded-For 绕过。
 * 曾经 forward-headers-strategy=framework 无条件信任 XFF (无可信代理校验),
 * 直连 8080 带随机 XFF 即可让登录爆破/游客刷库的每个请求都"换一个 IP"。
 * 默认部署 (同源/无反代) 必须忽略 XFF; 真有可信反代时用 QUANTSIM_FORWARD_HEADERS 显式开。
 * 本类收紧 auth 限频为 1/分钟: 两次不同 XFF 的注册, 第二次必须仍被同一 IP 桶拦下。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.auth.per-minute=1",
})
class ForwardedHeaderSpoofTest extends IntegrationTestSupport {

    private ResponseEntity<String> registerWithXff(String username, String xff) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.add("X-Forwarded-For", xff);
        return rest.postForEntity("/api/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"secret66\"}", headers),
                String.class);
    }

    @Test
    void spoofedXffCannotBypassIpRateLimit() {
        ResponseEntity<String> first = registerWithXff("xff甲", "1.2.3.4");
        assertThat(first.getStatusCode().value()).isEqualTo(200);
        // 换一个伪造 IP 立刻再来: 限频按真实 socket IP 计, 必须被拦 (400 频繁提示)
        ResponseEntity<String> second = registerWithXff("xff乙", "5.6.7.8");
        assertThat(second.getStatusCode().value())
                .as("伪造 XFF 不应绕过按 IP 限流")
                .isEqualTo(400);
    }
}
