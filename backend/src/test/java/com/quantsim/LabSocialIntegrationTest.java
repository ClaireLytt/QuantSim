package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;

/** E11 退市表接口 + E20 周报投票: 退市标的可取不可玩 / 一人一周一票可改票。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.auth.per-minute=10000",
})
class LabSocialIntegrationTest extends IntegrationTestSupport {

    @Test
    void delistedStockIsFetchableButHiddenElsewhere() {
        Stock dead = seedFlatStock("300104", "乐视退", Market.STOCK, LocalDate.of(2024, 1, 1), 12,
                "10.00", AiLevel.NORMAL, "0.5000");
        dead.setHidden(true);
        dead.setDelisted(true);
        dead.setDelistDate(LocalDate.of(2024, 1, 16));
        stockRepository.save(dead);

        // 退市清单可见, 带退市日
        JsonNode list = json(get("/api/lab/delisted", null));
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).path("code").asText()).isEqualTo("300104");
        assertThat(list.get(0).path("delistDate").asText()).isEqualTo("2024-01-16");
        // 历史行情放行 (hidden 但 delisted)
        assertThat(get("/api/lab/history/300104", null).getStatusCode()).isEqualTo(HttpStatus.OK);
        // 回测/研究所的股票清单仍不含它 (hidden 过滤不动)
        JsonNode stocks = json(get("/api/backtest/stocks", null));
        stocks.forEach(s -> assertThat(s.path("code").asText()).isNotEqualTo("300104"));
    }

    @Test
    void weeklyVoteOncePerWeekAndChangeable() {
        String alice = register("投票甲");
        // 未登录 400 (业务拒绝)
        assertThat(postJson("/api/lab/weekly-vote", "{\"choice\":\"HOLD\"}", null)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // 无效选项
        assertThat(postJson("/api/lab/weekly-vote", "{\"choice\":\"MAYBE\"}", alice)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        JsonNode b1 = json(postJson("/api/lab/weekly-vote", "{\"choice\":\"HOLD\"}", alice));
        assertThat(b1.path("hold").asLong()).isEqualTo(1);
        assertThat(b1.path("mine").asText()).isEqualTo("HOLD");
        // 改票 = 覆盖, 不是加票
        JsonNode b2 = json(postJson("/api/lab/weekly-vote", "{\"choice\":\"BREAK\"}", alice));
        assertThat(b2.path("hold").asLong()).isEqualTo(0);
        assertThat(b2.path("brk").asLong()).isEqualTo(1);
        assertThat(b2.path("mine").asText()).isEqualTo("BREAK");
        // 游客能看分布, mine 为空
        JsonNode guest = json(get("/api/lab/weekly-vote", null));
        assertThat(guest.path("brk").asLong()).isEqualTo(1);
        assertThat(guest.path("mine").isNull() || guest.path("mine").asText().isEmpty()).isTrue();
    }
}
