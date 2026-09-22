package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserRepository;

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
})
class GameApiIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;

    @Autowired TransactionRepository transactionRepository;
    @Autowired AccountRepository accountRepository;
    @Autowired GameSessionRepository sessionRepository;
    @Autowired UserRepository userRepository;
    @Autowired DailyIndicatorRepository indicatorRepository;
    @Autowired DailyPredictionRepository predictionRepository;
    @Autowired DailyPriceRepository priceRepository;
    @Autowired StockRepository stockRepository;

    @BeforeEach
    void seed() {
        transactionRepository.deleteAll();
        accountRepository.deleteAll();
        sessionRepository.deleteAll();
        userRepository.deleteAll();
        indicatorRepository.deleteAll();
        predictionRepository.deleteAll();
        priceRepository.deleteAll();
        stockRepository.deleteAll();
        cacheManager.getCache("stockData").clear();

        Stock stock = new Stock();
        stock.setCode("000001");
        stock.setName("测试股");
        stock.setIndustry("测试");
        stock = stockRepository.save(stock);

        // 12 根均匀 K 线: 无论随机起点在哪, 交易/结算结果都确定
        LocalDate d = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < 12; i++) {
            DailyPrice p = new DailyPrice();
            p.setStockId(stock.getStockId());
            p.setTradeDate(d.plusDays(i));
            p.setOpen(new BigDecimal("10.00"));
            p.setHigh(new BigDecimal("11.00"));
            p.setLow(new BigDecimal("9.00"));
            p.setClose(new BigDecimal("10.00"));
            p.setVolume(10000L);
            priceRepository.save(p);

            // 每日预测 prob_up=0.80: AI 首次 tick 即全仓买入, 均匀价格下结果确定
            DailyPrediction pred = new DailyPrediction();
            pred.setStockId(stock.getStockId());
            pred.setTradeDate(d.plusDays(i));
            pred.setModel(AiLevel.EASY.getModel());
            pred.setProbUp(new BigDecimal("0.8000"));
            pred.setPredictedDirection("UP");
            predictionRepository.save(pred);
        }
    }

    // ---------- helpers ----------

    private ResponseEntity<String> postJson(String path, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }

    private JsonNode json(ResponseEntity<String> resp) throws Exception {
        return objectMapper.readTree(resp.getBody());
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
                new Case("{\"direction\":\"BUY\",\"price\":20.00,\"shares\":100}", "价格区间"),
                new Case("{\"direction\":\"HOLD\",\"price\":10.00,\"shares\":100}", "BUY 或 SELL"),
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
        postJson("/api/game/" + id + "/trade", "{\"direction\":\"BUY\",\"price\":9.00,\"shares\":100}");

        JsonNode settle = json(postJson("/api/game/" + id + "/settle", ""));
        // 现金 99100 + 100 股 × 收盘 10 = 100100, 收益率 0.001
        assertThat(settle.get("finalAssets").decimalValue()).isEqualByComparingTo("100100.00");
        assertThat(settle.get("returnRate").decimalValue()).isEqualByComparingTo("0.0010");

        JsonNode lb = json(rest.getForEntity("/api/leaderboard", String.class));
        assertThat(lb.isArray()).isTrue();
        assertThat(lb.size()).isEqualTo(1);
        assertThat(lb.get(0).get("username").asText()).isEqualTo("it_settle");
        assertThat(lb.get(0).get("stockName").asText()).isEqualTo("测试股");
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
