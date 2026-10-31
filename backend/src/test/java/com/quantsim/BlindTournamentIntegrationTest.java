package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.BlindEntry;
import com.quantsim.entity.Market;
import com.quantsim.repository.BlindEntryRepository;
import com.quantsim.repository.UserRepository;

/** 盲测赛: 报名锁死 / 当周封榜 / 过去周揭晓并按 最差50+均值50 计分。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.auth.per-minute=10000",
})
class BlindTournamentIntegrationTest extends IntegrationTestSupport {

    @org.springframework.beans.factory.annotation.Autowired
    BlindEntryRepository blindEntryRepository;
    @org.springframework.beans.factory.annotation.Autowired
    UserRepository userRepo2;

    private static final String CONFIG = "{\"strategy\":\"MA_CROSS\",\"fastWindow\":5,\"slowWindow\":20}";

    @Test
    void submitLocksAndPastWeekReveals() {
        seedFlatStock("600100", "盲测股", Market.STOCK, LocalDate.of(2024, 1, 1), 200,
                "10.00", AiLevel.NORMAL, "0.5000");
        String alice = register("盲测甲");

        // 未登录 400; 坏配置 400
        assertThat(postJson("/api/blind/submit", CONFIG, null).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(postJson("/api/blind/submit", "{\"strategy\":\"NOPE\"}", alice).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        // 报名成功, 重复报名被锁
        JsonNode sub = json(postJson("/api/blind/submit", CONFIG, alice));
        assertThat(sub.path("players").asInt()).isEqualTo(1);
        assertThat(postJson("/api/blind/submit", CONFIG, alice).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        // 当周封榜: 只见人数不见任何数字
        JsonNode cur = json(get("/api/blind/board", alice));
        assertThat(cur.path("revealed").asBoolean()).isFalse();
        assertThat(cur.path("players").asInt()).isEqualTo(1);
        assertThat(cur.path("rows").size()).isZero();
        assertThat(cur.path("joined").asBoolean()).isTrue();
        // commit-reveal (审计创意22): 赛中盐绝不下发, 窗口无法本地预计算
        assertThat(cur.path("salt").isNull()).isTrue();

        // 过去周: 直接种一条上周报名, 看榜应揭晓且三窗计分
        Long uid = userRepo2.findAll().get(0).getUserId();
        int lastWeek = cur.path("week").asInt() - 1;
        BlindEntry e = new BlindEntry();
        e.setWeekIdx(lastWeek);
        e.setUserId(uid);
        e.setConfigJson(CONFIG);
        blindEntryRepository.save(e);
        JsonNode past = json(get("/api/blind/board?week=" + lastWeek, alice));
        assertThat(past.path("revealed").asBoolean()).isTrue();
        assertThat(past.path("rows").size()).isEqualTo(1);
        JsonNode row = past.path("rows").get(0);
        assertThat(row.path("windows").size()).isEqualTo(3);
        // score = 0.5*worst + 0.5*mean 的口径校验
        double worst = row.path("worst").asDouble();
        double mean = row.path("mean").asDouble();
        assertThat(row.path("score").asDouble()).isCloseTo(0.5 * worst + 0.5 * mean,
                org.assertj.core.data.Offset.offset(1e-6));
        // 揭晓周公布盐 (reveal 半边, 供复算审计), 且窗口在盐固化后确定——两次看榜结果一致
        assertThat(past.path("salt").isNull()).isFalse();
        JsonNode again = json(get("/api/blind/board?week=" + lastWeek, alice));
        assertThat(again.path("rows").get(0).path("windows")).isEqualTo(row.path("windows"));
    }

    /** 审计创意23: 足够久远的周揭晓时追加第四段"周结束后的真实行情" (报名时尚未发生)。 */
    @Test
    void pastWeekWithPostDeadlineDataGetsFourthWindow() {
        seedFlatStock("600100", "盲测股", Market.STOCK, LocalDate.of(2024, 1, 1), 200,
                "10.00", AiLevel.NORMAL, "0.5000");
        String alice = register("盲测乙");
        Long uid = userRepo2.findAll().get(0).getUserId();
        // 2024-03-04 所在周: 周结束日后行情还有 100+ 根, 第四段 (20 根) 必然可取
        int oldWeek = (int) Math.floorDiv(LocalDate.of(2024, 3, 4).toEpochDay() - 4, 7);
        BlindEntry e = new BlindEntry();
        e.setWeekIdx(oldWeek);
        e.setUserId(uid);
        e.setConfigJson(CONFIG);
        blindEntryRepository.save(e);
        JsonNode past = json(get("/api/blind/board?week=" + oldWeek, alice));
        assertThat(past.path("revealed").asBoolean()).isTrue();
        assertThat(past.path("rows").get(0).path("windows").size()).isEqualTo(4);
    }
}
