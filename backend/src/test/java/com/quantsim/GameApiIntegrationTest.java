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
 * API 集成测试, 固化 TESTING.md 的核心用例。
 * 依赖本地 MySQL (root/root, 可用 QUANTSIM_DB_HOST/PORT/USER/PASSWORD 覆盖),
 * 自动创建独立测试库 quantsim_test, 由 Flyway 建表。
 * 游戏参数缩小: 5 天历史 + 3 天局长, 种子数据 12 根均匀 K 线保证结果确定。
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
        // 本测试断言的是无摩擦价格数学, 费用归零
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class GameApiIntegrationTest extends IntegrationTestSupport {

    @BeforeEach
    void seed() {
        // 12 根均匀 K 线: 无论随机起点在哪, 交易/结算结果都确定;
        // 每日预测 prob_up=0.80: AI 首次 tick 即全仓买入, 均匀价格下结果确定
        seedFlatStock("000001", "测试股", Market.STOCK, LocalDate.of(2024, 1, 1), 12,
                "10.00", AiLevel.EASY, "0.8000");
    }

    private long startGame(String username) throws Exception {
        ResponseEntity<String> resp = postJson("/api/game/start", "{\"username\":\"" + username + "\"}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return json(resp).get("sessionId").asLong();
    }

    // ---------- 开局 ----------

    @Test
    void startGame_returnsSessionAndConfig() throws Exception {
        ResponseEntity<String> resp = postJson("/api/game/start", "{\"username\":\"it_user\"}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode body = json(resp);
        assertThat(body.get("sessionId").asLong()).isPositive();
        assertThat(body.get("stockCode").asText()).isEqualTo("000001");
        assertThat(body.get("totalTicks").asInt()).isEqualTo(3);
        assertThat(body.get("initialCash").decimalValue()).isEqualByComparingTo("100000");
    }

    @Test
    void startGame_rejectsBlankAndOverlongUsername() throws Exception {
        assertThat(postJson("/api/game/start", "{\"username\":\"\"}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(postJson("/api/game/start", "{\"username\":\"" + "x".repeat(60) + "\"}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void startGame_trimsUsernameAndReusesUser() throws Exception {
        startGame("  it_trim  ");
        startGame("it_trim");
        assertThat(userRepository.count()).isEqualTo(1);
    }

    // ---------- 历史行情 ----------

    @Test
    void history_returnsWindowEndingAtStartDate() throws Exception {
        long id = startGame("it_hist");
        ResponseEntity<String> resp = rest.getForEntity("/api/game/" + id + "/history", String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode body = json(resp);
        JsonNode klines = body.get("klines");
        assertThat(klines.size()).isEqualTo(5);
        assertThat(klines.get(klines.size() - 1).get("tradeDate").asText())
                .isEqualTo(body.get("startDate").asText());
    }

    // ---------- 交易 ----------

    @Test
    void trade_buyAndSellUpdateAccount() throws Exception {
        long id = startGame("it_trade");

        JsonNode buy = json(postJson("/api/game/" + id + "/trade",
                "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100}"));
        assertThat(buy.get("cashBalance").decimalValue()).isEqualByComparingTo("99000.00");
        assertThat(buy.get("holdingShares").asInt()).isEqualTo(100);
        assertThat(buy.get("holdingCost").decimalValue()).isEqualByComparingTo("10.00");

        JsonNode sell = json(postJson("/api/game/" + id + "/trade",
                "{\"direction\":\"SELL\",\"price\":10.00,\"shares\":100}"));
        assertThat(sell.get("cashBalance").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(sell.get("holdingShares").asInt()).isZero();
        assertThat(sell.get("holdingCost").decimalValue()).isEqualByComparingTo("0");

        assertThat(transactionRepository.count()).isEqualTo(2);
    }

    @Test
    void trade_rejectsInvalidRequests() throws Exception {
        long id = startGame("it_rules");
        record Case(String body, String expectMsgPart) {}
        Case[] cases = {
                new Case("{\"direction\":\"BUY\",\"price\":10.00,\"shares\":50}", "整数倍"),
                new Case("{\"direction\":\"BUY\",\"price\":10.123,\"shares\":100}", "两位小数"),
                new Case("{\"direction\":\"BUY\",\"price\":20.00,\"shares\":100}", "收盘价"),
                new Case("{\"direction\":\"HOLD\",\"price\":10.00,\"shares\":100}", "BUY / SELL"),
                new Case("{\"direction\":\"BUY\",\"price\":10.00,\"shares\":20000}", "现金"),
                new Case("{\"direction\":\"SELL\",\"price\":10.00,\"shares\":100}", "持仓"),
        };
        for (Case c : cases) {
            ResponseEntity<String> resp = postJson("/api/game/" + id + "/trade", c.body());
            assertThat(resp.getStatusCode()).as(c.body()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(json(resp).get("message").asText()).as(c.body()).contains(c.expectMsgPart());
        }
    }

    // ---------- tick 与自动结算 ----------

    @Test
    void tick_advancesDayEmbedsStatusAndAutoSettles() throws Exception {
        long id = startGame("it_tick");

        JsonNode t1 = json(postJson("/api/game/" + id + "/tick", ""));
        assertThat(t1.get("daysElapsed").asInt()).isEqualTo(1);
        assertThat(t1.get("settled").asBoolean()).isFalse();
        assertThat(t1.get("newBar").get("close").decimalValue()).isEqualByComparingTo("10.00");
        // 内嵌账户快照
        assertThat(t1.get("status").get("cashBalance").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(t1.get("status").get("daysElapsed").asInt()).isEqualTo(1);

        json(postJson("/api/game/" + id + "/tick", ""));
        JsonNode t3 = json(postJson("/api/game/" + id + "/tick", ""));
        assertThat(t3.get("daysElapsed").asInt()).isEqualTo(3);
        assertThat(t3.get("settled").asBoolean()).isTrue();
        assertThat(t3.get("settleResult").get("finalAssets").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(t3.get("settleResult").get("returnRate").decimalValue()).isEqualByComparingTo("0");
        assertThat(t3.get("status").get("status").asText()).isEqualTo("SETTLED");

        // 结算后一切写操作拒绝
        assertThat(postJson("/api/game/" + id + "/tick", "").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(postJson("/api/game/" + id + "/trade",
                "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(postJson("/api/game/" + id + "/settle", "").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ---------- 结算与排行榜 ----------

    @Test
    void settle_withHoldingsAndLeaderboard() throws Exception {
        long id = startGame("it_settle");
        // 手动交易只按当日收盘价 (10.00) 成交
        postJson("/api/game/" + id + "/trade", "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100}");

        JsonNode settle = json(postJson("/api/game/" + id + "/settle", ""));
        // 现金 99000 + 100 股 × 收盘 10 = 100000, 收益率 0
        assertThat(settle.get("finalAssets").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(settle.get("returnRate").decimalValue()).isEqualByComparingTo("0.0000");

        JsonNode lb = json(rest.getForEntity("/api/leaderboard", String.class));
        assertThat(lb.isArray()).isTrue();
        assertThat(lb.size()).isEqualTo(1);
        assertThat(lb.get(0).get("username").asText()).isEqualTo("it_settle");
        assertThat(lb.get(0).get("stockName").asText()).isEqualTo("测试股");
    }

    /**
     * 回归 (审计 P0-1): 只有打满全程 (或强平) 的局才发结算积分 ——
     * 否则"秒开秒结"(开局无限流 + day-0 可结算) 每次白拿基础分, 积分经济可被脚本刷爆。
     */
    @Test
    void settle_awardsPointsOnlyWhenCompleted() throws Exception {
        // day-0 秒结: 允许结算但零积分
        long early = startGame("it_farm");
        JsonNode earlySettle = json(postJson("/api/game/" + early + "/settle", ""));
        assertThat(earlySettle.get("pointsEarned").asInt()).isZero();

        // 打满 total-ticks=3 自动结算: 正常计分 (基础 50 起)
        long full = startGame("it_farm");
        json(postJson("/api/game/" + full + "/tick", ""));
        json(postJson("/api/game/" + full + "/tick", ""));
        JsonNode last = json(postJson("/api/game/" + full + "/tick", ""));
        assertThat(last.get("settled").asBoolean()).isTrue();
        assertThat(last.get("settleResult").get("pointsEarned").asInt()).isGreaterThanOrEqualTo(50);
    }

    // ---------- AI 对手与策略基准 ----------

    @Test
    void aiOpponent_tradesOnPredictionAndSettleComparesStrategies() throws Exception {
        long id = startGame("it_ai");

        // 开局状态即带预测和 AI 仓位 (尚未交易)
        JsonNode st0 = json(rest.getForEntity("/api/game/" + id + "/status", String.class));
        assertThat(st0.get("prediction").get("direction").asText()).isEqualTo("UP");
        assertThat(st0.get("prediction").get("probUp").decimalValue()).isEqualByComparingTo("0.80");
        assertThat(st0.get("ai").get("cash").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(st0.get("ai").get("shares").asInt()).isZero();

        // 首次 tick: prob 0.80 ≥ 0.55, AI 按收盘 10 元全仓买入 100000/(10×100)=100 手 = 10000 股
        JsonNode t1 = json(postJson("/api/game/" + id + "/tick", ""));
        JsonNode ai1 = t1.get("status").get("ai");
        assertThat(ai1.get("shares").asInt()).isEqualTo(10000);
        assertThat(ai1.get("cash").decimalValue()).isEqualByComparingTo("0");
        assertThat(ai1.get("totalAssets").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(ai1.get("returnRate").decimalValue()).isEqualByComparingTo("0");

        // 满 3 天自动结算: 均匀价格下四种策略收益率全为 0
        json(postJson("/api/game/" + id + "/tick", ""));
        JsonNode settle = json(postJson("/api/game/" + id + "/tick", "")).get("settleResult");
        assertThat(settle.get("aiFinalAssets").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(settle.get("aiReturnRate").decimalValue()).isEqualByComparingTo("0");
        assertThat(settle.get("holdReturnRate").decimalValue()).isEqualByComparingTo("0");
        // 未种指标数据 → 均线策略全程空仓, 收益率 0
        assertThat(settle.get("maCrossReturnRate").decimalValue()).isEqualByComparingTo("0");
    }

    // ---------- 收盘价成交规则 ----------

    @Test
    void trade_rejectsInRangeNonClosePrice() throws Exception {
        long id = startGame("it_close");
        // 9.00 在当日 [9, 11] 区间内, 但不是收盘价 10.00 -> 拒绝 (防当日低买高卖无风险套利)
        ResponseEntity<String> resp = postJson("/api/game/" + id + "/trade",
                "{\"direction\":\"BUY\",\"price\":9.00,\"shares\":100}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(resp).get("message").asText()).contains("收盘价");
    }

    @Test
    void trade_acceptsExactClosePrice() throws Exception {
        long id = startGame("it_close_ok");
        // 10 与 10.00 数值相等即可 (compareTo 语义, 不因 scale 拒绝)
        ResponseEntity<String> resp = postJson("/api/game/" + id + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":100}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(resp).get("holdingShares").asInt()).isEqualTo(100);
    }

    // ---------- 枚举参数解析 ----------

    @Test
    void startGame_rejectsUnknownEnums() throws Exception {
        record EnumCase(String body, String expectMsgPart) {}
        EnumCase[] cases = {
                new EnumCase("{\"username\":\"it_enum\",\"market\":\"MOON\"}", "未知市场"),
                new EnumCase("{\"username\":\"it_enum\",\"aiLevel\":\"GOD\"}", "未知 AI 难度"),
                new EnumCase("{\"username\":\"it_enum\",\"mode\":\"WEIRD\"}", "未知模式"),
        };
        for (EnumCase c : cases) {
            ResponseEntity<String> resp = postJson("/api/game/start", c.body());
            assertThat(resp.getStatusCode()).as(c.body()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(json(resp).get("message").asText()).as(c.body()).contains(c.expectMsgPart());
        }
    }

    // ---------- 历史行情窗口 ----------

    @Test
    void history_returnsWindowAndGrowsWithTicks() throws Exception {
        long id = startGame("it_histgrow");
        JsonNode h0 = json(rest.getForEntity("/api/game/" + id + "/history", String.class));
        int before = h0.get("klines").size();
        assertThat(before).isGreaterThanOrEqualTo(5); // history-days=5

        postJson("/api/game/" + id + "/tick", "");
        JsonNode h1 = json(rest.getForEntity("/api/game/" + id + "/history", String.class));
        assertThat(h1.get("klines").size()).isEqualTo(before + 1);
        // 最后一根 K 线就是当前交易日
        String last = h1.get("klines").get(h1.get("klines").size() - 1).get("tradeDate").asText();
        assertThat(last).isEqualTo(h1.get("currentTradeDate").asText());
    }

    // ---------- 错误处理 ----------

    @Test
    void errorHandling_notFoundAndMalformedJson() throws Exception {
        assertThat(rest.getForEntity("/api/game/999999/status", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(rest.getForEntity("/api/nonexistent", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postJson("/api/game/start", "{bad json").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
