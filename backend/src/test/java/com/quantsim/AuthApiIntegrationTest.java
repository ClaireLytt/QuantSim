package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.entity.User;
import com.quantsim.repository.UserProgressRepository;
import com.quantsim.repository.UserRepository;

/**
 * 账户体系集成测试: 注册 / 登录 / 游客名认领 / 会话 Cookie / 进度同步 / 受保护路径 401。
 * 依赖与 GameApiIntegrationTest 相同的本地 MySQL 测试库。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.auth.per-minute=10000",
})
class AuthApiIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired UserRepository userRepository;
    @Autowired UserProgressRepository progressRepository;

    @BeforeEach
    void clean() {
        progressRepository.deleteAll();
        userRepository.findByUsername("认领我").ifPresent(u -> deleteUserCascade(u));
        userRepository.findByUsername("auth用户").ifPresent(u -> deleteUserCascade(u));
    }

    private void deleteUserCascade(User u) {
        // 本测试的用户没有对局/回测数据, 直接删行即可
        userRepository.delete(u);
    }

    // ---------- helpers ----------

    private ResponseEntity<String> postJson(String path, String body, String cookie) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (cookie != null) {
            headers.add(HttpHeaders.COOKIE, cookie);
        }
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }

    private ResponseEntity<String> get(String path, String cookie) {
        HttpHeaders headers = new HttpHeaders();
        if (cookie != null) {
            headers.add(HttpHeaders.COOKIE, cookie);
        }
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private JsonNode json(ResponseEntity<String> resp) {
        try {
            return objectMapper.readTree(resp.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("响应不是 JSON: " + resp.getBody(), e);
        }
    }

    private String sessionCookie(ResponseEntity<String> resp) {
        List<String> cookies = resp.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertThat(cookies).isNotNull();
        return cookies.stream().filter(c -> c.startsWith("JSESSIONID"))
                .map(c -> c.split(";", 2)[0])
                .findFirst().orElseThrow();
    }

    // ---------- 用例 ----------

    @Test
    void registerLoginAndMe() {
        // 注册即登录
        ResponseEntity<String> reg = postJson("/api/auth/register",
                "{\"username\":\"auth用户\",\"password\":\"secret66\"}", null);
        assertThat(reg.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(reg).path("user").path("username").asText()).isEqualTo("auth用户");
        String cookie = sessionCookie(reg);

        // 会话内 me 可见
        JsonNode me = json(get("/api/auth/me", cookie));
        assertThat(me.path("user").path("username").asText()).isEqualTo("auth用户");

        // 无会话时 me 返回 user=null (200)
        JsonNode anon = json(get("/api/auth/me", null));
        assertThat(anon.path("user").isNull()).isTrue();

        // 重复注册被拒
        ResponseEntity<String> dup = postJson("/api/auth/register",
                "{\"username\":\"auth用户\",\"password\":\"another8\"}", null);
        assertThat(dup.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 错误密码登录被拒
        ResponseEntity<String> bad = postJson("/api/auth/login",
                "{\"username\":\"auth用户\",\"password\":\"wrongpw\"}", null);
        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 正确密码登录
        ResponseEntity<String> login = postJson("/api/auth/login",
                "{\"username\":\"auth用户\",\"password\":\"secret66\"}", null);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);

        // 登出后 me 变 null
        String cookie2 = sessionCookie(login);
        postJson("/api/auth/logout", "{}", cookie2);
        assertThat(json(get("/api/auth/me", cookie2)).path("user").isNull()).isTrue();
    }

    @Test
    void registerClaimsLegacyGuestRow() {
        // 先造一个无密码的游客行
        User guest = new User();
        guest.setUsername("认领我");
        Long guestId = userRepository.save(guest).getUserId();

        // 游客行不能直接登录
        ResponseEntity<String> login = postJson("/api/auth/login",
                "{\"username\":\"认领我\",\"password\":\"secret66\"}", null);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 注册同名 = 认领同一行 (userId 不变)
        ResponseEntity<String> reg = postJson("/api/auth/register",
                "{\"username\":\"认领我\",\"password\":\"secret66\"}", null);
        assertThat(reg.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(reg).path("user").path("userId").asLong()).isEqualTo(guestId);
        assertThat(userRepository.findByUsername("认领我").orElseThrow().getPasswordHash()).isNotBlank();
    }

    @Test
    void progressRoundTripAndAuthGuard() {
        // 未登录访问受保护路径 -> 401
        assertThat(get("/api/me/progress", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/me/games", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        String cookie = sessionCookie(postJson("/api/auth/register",
                "{\"username\":\"auth用户\",\"password\":\"secret66\"}", null));

        // 初始无进度
        assertThat(json(get("/api/me/progress", cookie)).path("progressJson").isNull()).isTrue();

        // 上传并读回
        ResponseEntity<String> save = postJson("/api/me/progress",
                "{\"progressJson\":\"{\\\"xp\\\":42}\"}", cookie);
        assertThat(save.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(get("/api/me/progress", cookie)).path("progressJson").asText()).contains("42");

        // 战绩历史接口可用 (空列表)
        ResponseEntity<String> games = get("/api/me/games", cookie);
        assertThat(games.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(games).isArray()).isTrue();
    }
}
