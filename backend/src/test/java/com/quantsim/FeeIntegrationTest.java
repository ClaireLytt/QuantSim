package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.Market;

/**
 * 费用集成测试: A 股佣金 (万 2.5, 最低 5 元) + 卖出印花税 (千 0.5) 的精确数学,
 * 以及结算基准与玩家同口径扣费的公平性。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        // 断言无摩擦资金数学: 现金计息同样归零 (与费用归零同理)
        "quantsim.game.guest-start-per-minute=10000",
        "quantsim.game.cash-rate-annual=0",
        "quantsim.game.borrow-rate-annual=0",
        "quantsim.fees.stock.commission-rate=0.00025",
        "quantsim.fees.stock.min-commission=5",
        "quantsim.fees.stock.stamp-tax-rate=0.0005",
})
class FeeIntegrationTest extends IntegrationTestSupport {

    @BeforeEach
    void seed() {
        // probUp=0.5: AI 全程观望, 不干扰现金断言
        seedFlatStock("000001", "测试股", Market.STOCK, LocalDate.of(2024, 1, 1), 12,
                "10.00", AiLevel.EASY, "0.5000");
    }

    @Test
    void buyAndSellChargeCommissionAndStampTax() {
        long sid = json(postJson("/api/game/start", "{\"username\":\"费用测试\",\"aiLevel\":\"EASY\"}"))
                .path("sessionId").asLong();

        // 买 100 股 @10: gross=1000, 佣金 0.25 -> 低于最低 5 元, 收 5; 现金 = 100000-1005
        ResponseEntity<String> buy = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":100}");
        assertThat(buy.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(buy).path("fee").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(json(buy).path("cashBalance").decimalValue()).isEqualByComparingTo("98995.00");

        // 卖 100 股 @10: 佣金 5 + 印花税 0.50; 现金 = 98995 + 1000 - 5.50
        ResponseEntity<String> sell = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"SELL\",\"price\":10,\"shares\":100}");
        assertThat(json(sell).path("fee").decimalValue()).isEqualByComparingTo("5.50");
        assertThat(json(sell).path("cashBalance").decimalValue()).isEqualByComparingTo("99989.50");

        // 累计费用出现在状态里
        JsonNode status = json(rest.getForEntity("/api/game/" + sid + "/status", String.class));
        assertThat(status.path("feesPaid").decimalValue()).isEqualByComparingTo("10.50");
    }

    @Test
    void benchmarksPayFeesToo() {
        long sid = json(postJson("/api/game/start", "{\"username\":\"费用测试\",\"aiLevel\":\"EASY\"}"))
                .path("sessionId").asLong();

        // 不交易直接结算: 玩家 0%; 买入持有基准在平价行情下只亏费用 -> 略小于 0
        JsonNode settle = json(postJson("/api/game/" + sid + "/settle", "{}"));
        assertThat(settle.path("returnRate").decimalValue()).isEqualByComparingTo("0.0000");
        double holdReturn = settle.path("holdReturnRate").decimalValue().doubleValue();
        assertThat(holdReturn).isLessThan(0.0);
        assertThat(holdReturn).isGreaterThan(-0.001);
    }

    @Test
    void largeTradeUsesRateNotMinimum() {
        long sid = json(postJson("/api/game/start", "{\"username\":\"费用测试\",\"aiLevel\":\"EASY\"}"))
                .path("sessionId").asLong();

        // 买 9900 股 @10: gross=99000, 佣金 99000×0.00025=24.75 (高于最低 5 元, 按费率收)
        ResponseEntity<String> buy = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":9900}");
        assertThat(buy.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(buy).path("fee").decimalValue()).isEqualByComparingTo("24.75");
        assertThat(json(buy).path("cashBalance").decimalValue()).isEqualByComparingTo("975.25");

        // 卖 9900 股 @10: 佣金 24.75 + 印花税 99000×0.0005=49.50 = 74.25
        ResponseEntity<String> sell = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"SELL\",\"price\":10,\"shares\":9900}");
        assertThat(json(sell).path("fee").decimalValue()).isEqualByComparingTo("74.25");
        assertThat(json(sell).path("cashBalance").decimalValue()).isEqualByComparingTo("99901.00");
    }

    @Test
    void feesAccumulateIntoSettleReturn() {
        long sid = json(postJson("/api/game/start", "{\"username\":\"费用测试\",\"aiLevel\":\"EASY\"}"))
                .path("sessionId").asLong();

        // 一买一卖 (100 股 @10, 费用 5 + 5.50), 平价行情下收益率 = -10.50/100000 = -0.0001 (4 位舍入)
        postJson("/api/game/" + sid + "/trade", "{\"direction\":\"BUY\",\"price\":10,\"shares\":100}");
        postJson("/api/game/" + sid + "/trade", "{\"direction\":\"SELL\",\"price\":10,\"shares\":100}");
        JsonNode settle = json(postJson("/api/game/" + sid + "/settle", "{}"));
        assertThat(settle.path("finalAssets").decimalValue()).isEqualByComparingTo("99989.50");
        assertThat(settle.path("returnRate").decimalValue()).isEqualByComparingTo("-0.0001");
    }
}
