package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

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
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.DailyChallengeRepository;
import com.quantsim.repository.RoomMemberRepository;
import com.quantsim.repository.RoomRepository;
import com.quantsim.repository.UserProgressRepository;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserRepository;

/**
 * 交易深度集成测试: 挂单撮合 / 做空强平 / 三股组合。
 * 费用归零, 价格数学确定。做空用例只造 9 根 K 线 (= min-history + ticks + 1),
 * 这样随机起点只有一个合法取值, 行情完全确定。
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
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
        "quantsim.fees.us.commission-rate=0",
        "quantsim.fees.us.min-commission=0",
        "quantsim.fees.us.stamp-tax-rate=0",
})
class TradingDepthIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;

    @Autowired PendingOrderRepository orderRepository;
    @Autowired RoomMemberRepository roomMemberRepository;
    @Autowired RoomRepository roomRepository;
    @Autowired DailyChallengeRepository dailyChallengeRepository;
    @Autowired UserProgressRepository userProgressRepository;
    @Autowired PositionRepository positionRepository;
    @Autowired SessionStockRepository sessionStockRepository;
    @Autowired TransactionRepository transactionRepository;
    @Autowired AccountRepository accountRepository;
    @Autowired GameSessionRepository sessionRepository;
    @Autowired UserRepository userRepository;
    @Autowired DailyIndicatorRepository indicatorRepository;
    @Autowired DailyPredictionRepository predictionRepository;
    @Autowired DailyPriceRepository priceRepository;
    @Autowired StockRepository stockRepository;

    @BeforeEach
    void clean() {
        roomMemberRepository.deleteAll();
        roomRepository.deleteAll();
        dailyChallengeRepository.deleteAll();
        userProgressRepository.deleteAll();
        orderRepository.deleteAll();
        positionRepository.deleteAll();
        sessionStockRepository.deleteAll();
        transactionRepository.deleteAll();
        accountRepository.deleteAll();
        sessionRepository.deleteAll();
        userRepository.deleteAll();
        indicatorRepository.deleteAll();
        predictionRepository.deleteAll();
        priceRepository.deleteAll();
        stockRepository.deleteAll();
        cacheManager.getCache("stockData").clear();
    }

    // ---------- seed helpers ----------

    private Stock seedStock(String code, String name, Market market) {
        Stock stock = new Stock();
        stock.setCode(code);
        stock.setName(name);
        stock.setIndustry("测试");
        stock.setMarket(market);
        return stockRepository.save(stock);
    }

    /** closes[i] 同时作为 open/close, high=close+1, low=close-1; 每天配 probUp=0.5 (AI 观望)。 */
    private void seedBars(Stock stock, String... closes) {
        LocalDate d = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < closes.length; i++) {
            BigDecimal close = new BigDecimal(closes[i]);
            DailyPrice p = new DailyPrice();
            p.setStockId(stock.getStockId());
            p.setTradeDate(d.plusDays(i));
            p.setOpen(close);
            p.setHigh(close.add(BigDecimal.ONE));
            p.setLow(close.subtract(BigDecimal.ONE));
            p.setClose(close);
            p.setVolume(10000L);
            priceRepository.save(p);

            DailyPrediction pred = new DailyPrediction();
            pred.setStockId(stock.getStockId());
            pred.setTradeDate(d.plusDays(i));
            pred.setModel(AiLevel.EASY.getModel());
            pred.setProbUp(new BigDecimal("0.5000"));
            pred.setPredictedDirection("UP");
            predictionRepository.save(pred);
        }
    }

    // ---------- http helpers ----------

    private ResponseEntity<String> postJson(String path, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }

    private JsonNode json(ResponseEntity<String> resp) {
        try {
            return objectMapper.readTree(resp.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("响应不是 JSON: " + resp.getBody(), e);
        }
    }

    private long startGame(String extraJson) {
        ResponseEntity<String> resp = postJson("/api/game/start",
                "{\"username\":\"深度测试\",\"aiLevel\":\"EASY\"" + extraJson + "}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return json(resp).path("sessionId").asLong();
    }

    private JsonNode tick(long sessionId) {
        ResponseEntity<String> resp = postJson("/api/game/" + sessionId + "/tick", "{}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return json(resp);
    }

    // ---------- 用例 ----------

    @Test
    void limitBuyFillsNextDayAndStopLossTriggers() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0), "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sid = startGame("");

        // 限价买: 触发价 9.50, 次日 low=9 触发, 成交价 min(open=10, 9.5)=9.5
        ResponseEntity<String> place = postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":9.5,\"shares\":100}");
        assertThat(place.getStatusCode()).isEqualTo(HttpStatus.OK);

        JsonNode tickRes = tick(sid);
        assertThat(tickRes.path("filledOrders")).hasSize(1);
        assertThat(tickRes.path("filledOrders").get(0).path("price").decimalValue())
                .isEqualByComparingTo("9.50");
        assertThat(tickRes.path("status").path("holdingShares").asInt()).isEqualTo(100);
        // 现金 = 100000 - 9.5*100
        assertThat(tickRes.path("status").path("cashBalance").decimalValue())
                .isEqualByComparingTo("99050.00");

        // 止损卖: 触发价 9.50, 次日必然触发
        postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"STOP_LOSS\",\"price\":9.5,\"shares\":100}");
        JsonNode tick2 = tick(sid);
        assertThat(tick2.path("filledOrders")).hasSize(1);
        assertThat(tick2.path("status").path("holdingShares").asInt()).isZero();
    }

    @Test
    void orderCancelAndAutoCancelOnInsufficientCash() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0), "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sid = startGame("");

        // 手动撤单
        ResponseEntity<String> place = postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":9.5,\"shares\":100}");
        long orderId = json(place).path("orderId").asLong();
        ResponseEntity<String> cancel = postJson("/api/game/" + sid + "/orders/" + orderId + "/cancel", "{}");
        assertThat(cancel.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(cancel).findValues("status")).allMatch(n -> n.asText().equals("CANCELLED"));

        // 先花光现金再挂大额买单 -> 次日资金不足自动撤销
        postJson("/api/game/" + sid + "/trade", "{\"direction\":\"BUY\",\"price\":10,\"shares\":9900}");
        postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":9.5,\"shares\":9900}");
        JsonNode tickRes = tick(sid);
        assertThat(tickRes.path("autoCancelledOrders").asInt()).isEqualTo(1);
        assertThat(tickRes.path("filledOrders")).isEmpty();
    }

    @Test
    void advancedShortThenForcedLiquidation() {
        // 9 根 K 线, 随机起点只可能是 idx 4/5 (close 均为 10); idx6 起暴涨到 1500,
        // 空头最多两次推进内净值必然击穿
        Stock stock = seedStock("TSLA", "特斯拉", Market.US);
        seedBars(stock, "10", "10", "10", "10", "10", "10", "1500", "1500", "1500");
        long sid = startGame(",\"market\":\"US\",\"advanced\":true");

        // 做空 100 股 @10 (US 1 股整手): 普通模式会被拒, 进阶模式放行
        ResponseEntity<String> shortSell = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"SELL\",\"price\":10,\"shares\":100}");
        assertThat(shortSell.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(shortSell).path("holdingShares").asInt()).isEqualTo(-100);

        // 暴涨日到来时: 空头净值 = 101000 - 100*1500 < 0 -> 强平并立即结算
        JsonNode tickRes = tick(sid);
        if (!tickRes.path("settled").asBoolean()) {
            tickRes = tick(sid);
        }
        assertThat(tickRes.path("liquidated").asBoolean()).isTrue();
        assertThat(tickRes.path("settled").asBoolean()).isTrue();
        assertThat(tickRes.path("settleResult").path("returnRate").decimalValue().doubleValue())
                .isLessThan(-0.9);
        assertThat(tickRes.path("status").path("holdingShares").asInt()).isZero();
    }

    @Test
    void shortRejectedWithoutAdvancedAndOverLeverageRejected() {
        Stock stock = seedStock("TSLA", "特斯拉", Market.US);
        seedBars(stock, "10", "10", "10", "10", "10", "10", "10", "10", "10");

        // 普通模式卖空被拒
        long plain = startGame(",\"market\":\"US\"");
        ResponseEntity<String> rejected = postJson("/api/game/" + plain + "/trade",
                "{\"direction\":\"SELL\",\"price\":10,\"shares\":100}");
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 进阶模式超过 2x 杠杆被拒: 净值 10 万, 敞口上限 20 万 = 2 万股 @10
        long adv = startGame(",\"market\":\"US\",\"advanced\":true");
        ResponseEntity<String> tooBig = postJson("/api/game/" + adv + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":25000}");
        assertThat(tooBig.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ResponseEntity<String> ok = postJson("/api/game/" + adv + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":15000}");
        assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void portfolioBuySellAndSettle() {
        Stock a = seedStock("000001", "甲股", Market.STOCK);
        Stock b = seedStock("000002", "乙股", Market.STOCK);
        Stock c = seedStock("000003", "丙股", Market.STOCK);
        String[] flat = { "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10" };
        seedBars(a, flat);
        seedBars(b, flat);
        seedBars(c, flat);

        ResponseEntity<String> startResp = postJson("/api/game/start",
                "{\"username\":\"深度测试\",\"aiLevel\":\"EASY\",\"mode\":\"PORTFOLIO\",\"market\":\"STOCK\"}");
        assertThat(startResp.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode start = json(startResp);
        long sid = start.path("sessionId").asLong();
        assertThat(start.path("mode").asText()).isEqualTo("PORTFOLIO");
        assertThat(start.path("stocks")).hasSize(3);

        // 分别买两只
        String codeA = start.path("stocks").get(0).path("code").asText();
        String codeB = start.path("stocks").get(1).path("code").asText();
        postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":100,\"stockCode\":\"" + codeA + "\"}");
        postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":200,\"stockCode\":\"" + codeB + "\"}");

        ResponseEntity<String> statusResp = rest.getForEntity("/api/game/" + sid + "/status", String.class);
        JsonNode status = json(statusResp);
        assertThat(status.path("positions")).hasSize(3);
        int totalShares = 0;
        for (JsonNode pos : status.path("positions")) {
            totalShares += pos.path("shares").asInt();
        }
        assertThat(totalShares).isEqualTo(300);
        // 净值 = 现金 + 持仓 = 初始 (无摩擦, 平价买入)
        assertThat(status.path("totalAssets").decimalValue()).isEqualByComparingTo("100000.00");

        // 非本局标的被拒
        ResponseEntity<String> alien = postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10,\"shares\":100,\"stockCode\":\"999999\"}");
        assertThat(alien.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 结算: 平价行情收益率为 0
        ResponseEntity<String> settle = postJson("/api/game/" + sid + "/settle", "{}");
        assertThat(settle.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(settle).path("returnRate").decimalValue()).isEqualByComparingTo("0.0000");
    }

    // ---------- 挂单校验与生命周期补充 ----------

    @Test
    void orderValidationRejectsBadInput() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0),
                "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sid = startGame("");

        record OrderCase(String body, String expectMsgPart) {}
        OrderCase[] cases = {
                new OrderCase("{\"orderType\":\"MARKET\",\"price\":9.5,\"shares\":100}", "未知挂单类型"),
                new OrderCase("{\"orderType\":\"LIMIT_BUY\",\"price\":0,\"shares\":100}", "触发价"),
                new OrderCase("{\"orderType\":\"LIMIT_BUY\",\"price\":9.555,\"shares\":100}", "两位小数"),
                new OrderCase("{\"orderType\":\"LIMIT_BUY\",\"price\":9.5,\"shares\":150}", "整数倍"),
        };
        for (OrderCase c : cases) {
            ResponseEntity<String> resp = postJson("/api/game/" + sid + "/orders", c.body());
            assertThat(resp.getStatusCode()).as(c.body()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(json(resp).path("message").asText()).as(c.body()).contains(c.expectMsgPart());
        }
    }

    @Test
    void openOrdersAreCapped() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0),
                "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sid = startGame("");

        // 默认上限 5 笔: 前 5 笔成功, 第 6 笔被拒
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> resp = postJson("/api/game/" + sid + "/orders",
                    "{\"orderType\":\"LIMIT_BUY\",\"price\":5,\"shares\":100}");
            assertThat(resp.getStatusCode()).as("第 %d 笔", i + 1).isEqualTo(HttpStatus.OK);
        }
        ResponseEntity<String> sixth = postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":5,\"shares\":100}");
        assertThat(sixth.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(sixth).path("message").asText()).contains("上限");
    }

    @Test
    void untriggeredOrderStaysOpenAcrossTicks() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0),
                "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sid = startGame("");

        // 触发价 5 远低于当日最低 9, 永远不会成交
        postJson("/api/game/" + sid + "/orders", "{\"orderType\":\"LIMIT_BUY\",\"price\":5,\"shares\":100}");
        JsonNode tickRes = tick(sid);
        assertThat(tickRes.path("filledOrders")).isEmpty();
        assertThat(tickRes.path("autoCancelledOrders").asInt()).isZero();

        JsonNode orders = json(rest.getForEntity("/api/game/" + sid + "/orders", String.class));
        assertThat(orders).hasSize(1);
        assertThat(orders.get(0).path("status").asText()).isEqualTo("OPEN");
    }

    @Test
    void cancelIsScopedToOwnSession() {
        seedStock("000001", "测试股", Market.STOCK);
        seedBars(stockRepository.findAll().get(0),
                "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10");
        long sidA = startGame("");
        long sidB = startGame("");

        long orderId = json(postJson("/api/game/" + sidA + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":5,\"shares\":100}")).path("orderId").asLong();

        // 用 B 对局去撤 A 的挂单: 拒绝, 且挂单仍然 OPEN
        ResponseEntity<String> resp = postJson("/api/game/" + sidB + "/orders/" + orderId + "/cancel", "{}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(resp).path("message").asText()).contains("不属于该对局");
        JsonNode orders = json(rest.getForEntity("/api/game/" + sidA + "/orders", String.class));
        assertThat(orders.get(0).path("status").asText()).isEqualTo("OPEN");

        // 本对局撤单成功
        ResponseEntity<String> ok = postJson("/api/game/" + sidA + "/orders/" + orderId + "/cancel", "{}");
        assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(ok).get(0).path("status").asText()).isEqualTo("CANCELLED");
    }
}
