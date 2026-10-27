package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.Market;

/**
 * 同局战书集成测试: 同码同局 / 一人一战 / 先交卷后揭晓 / SEED 匿名与不入榜。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        "quantsim.game.guest-start-per-minute=10000",
        "quantsim.auth.per-minute=10000",
})
class SeedChallengeIntegrationTest extends IntegrationTestSupport {

    private void settleFull(long sid, String cookie) {
        for (int i = 0; i < 3; i++) {
            postJson("/api/game/" + sid + "/tick", "{}", cookie);
        }
    }

    @Test
    void createAcceptRevealFlow() {
        seedFlatStock("600100", "战书股", Market.STOCK, LocalDate.of(2024, 1, 1), 12,
                "10.00", AiLevel.NORMAL, "0.5000");
        String alice = register("战书甲");
        String bob = register("战书乙");

        // 甲打完一局经典局并结算
        JsonNode start = json(postJson("/api/game/start", "{\"username\":\"战书甲\"}", alice));
        long sidA = start.path("sessionId").asLong();
        settleFull(sidA, alice);

        // 未登录不能立战书
        assertThat(postJson("/api/challenge/create", "{\"sessionId\":" + sidA + "}", null)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // 乙不能用甲的局立战书 (属主校验)
        assertThat(postJson("/api/challenge/create", "{\"sessionId\":" + sidA + "}", bob)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        String code = json(postJson("/api/challenge/create", "{\"sessionId\":" + sidA + "}", alice))
                .path("code").asText();
        assertThat(code).hasSize(10);

        // 乙应战: 同股同起始日, SEED 模式且标的匿名 (竞技脱敏)
        JsonNode acc = json(postJson("/api/challenge/" + code + "/accept", "{}", bob));
        assertThat(acc.path("mode").asText()).isEqualTo("SEED");
        assertThat(acc.path("stockCode").asText()).isNotEqualTo("600100");
        long sidB = acc.path("sessionId").asLong();
        // 一人一战: 重复应战被拒
        assertThat(postJson("/api/challenge/" + code + "/accept", "{}", bob)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 先交卷后揭晓: 乙未结算时看榜, 无任何收益数字
        JsonNode boardBefore = json(get("/api/challenge/" + code, bob));
        assertThat(boardBefore.path("players").asInt()).isEqualTo(2);
        assertThat(boardBefore.path("revealed").asBoolean()).isFalse();
        boardBefore.path("entries").forEach(e -> assertThat(e.path("returnRate").isNull()).isTrue());

        // 乙结算后揭晓: 全场收益可见
        settleFull(sidB, bob);
        JsonNode boardAfter = json(get("/api/challenge/" + code, bob));
        assertThat(boardAfter.path("revealed").asBoolean()).isTrue();
        boardAfter.path("entries").forEach(e -> {
            assertThat(e.path("settled").asBoolean()).isTrue();
            assertThat(e.path("returnRate").isNull()).isFalse();
        });

        // SEED 局不入公开资金榜
        JsonNode lb = json(get("/api/leaderboard", null));
        lb.forEach(row -> assertThat(row.path("sessionId").asLong()).isNotEqualTo(sidB));
    }

    /** 审计创意25: 已结算者能看到揭晓标的, 应战无时限 = 答案可以慢慢传; 超 72h 拒绝应战。 */
    @Test
    void acceptRejectedAfterWindowExpires() {
        seedFlatStock("600100", "战书股", Market.STOCK, LocalDate.of(2024, 1, 1), 12,
                "10.00", AiLevel.NORMAL, "0.5000");
        String alice = register("战书丙");
        String bob = register("战书丁");
        // created_at 列 updatable=false, 回拨旧行无效 —— 直接插一张 73 小时前的战书行
        com.quantsim.entity.SeedChallenge sc = new com.quantsim.entity.SeedChallenge();
        sc.setCode("EXPIREDAAA");
        sc.setCreatorUserId(userRepository.findByUsername("战书丙").orElseThrow().getUserId());
        sc.setStockId(stockRepository.findAll().get(0).getStockId());
        sc.setStartDate(LocalDate.of(2024, 1, 6));
        sc.setCreatedAt(java.time.LocalDateTime.now().minusHours(73));
        seedChallengeRepository.save(sc);
        String code = "EXPIREDAAA";
        org.springframework.http.ResponseEntity<String> resp =
                postJson("/api/challenge/" + code + "/accept", "{}", bob);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(resp).path("message").asText()).contains("过期");
    }
}
