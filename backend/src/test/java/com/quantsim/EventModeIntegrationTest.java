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
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.EventScenario;
import com.quantsim.entity.EventTimelineItem;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.EventScenarioRepository;
import com.quantsim.repository.EventTimelineRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserPointsRepository;
import com.quantsim.repository.UserRepository;

/**
 * 事件回放模式集成测试: 防剧透全覆盖 (日期平移/标的匿名/无新闻/研究所不可见),
 * 结算揭晓场景与时间线, catalog 不泄密, 普通开局拿不到 EVENT。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        "quantsim.game.guest-start-per-minute=10000",
        "quantsim.game.cash-rate-annual=0",
        "quantsim.game.borrow-rate-annual=0",
        "quantsim.auth.per-minute=10000",
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class EventModeIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;

    @Autowired PendingOrderRepository orderRepository;
    @Autowired TransactionRepository transactionRepository;
    @Autowired AccountRepository accountRepository;
    @Autowired GameSessionRepository sessionRepository;
    @Autowired UserPointsRepository userPointsRepository;
    @Autowired UserRepository userRepository;
    @Autowired DailyPriceRepository priceRepository;
    @Autowired com.quantsim.repository.DailyIndicatorRepository indicatorRepository;
    @Autowired com.quantsim.repository.DailyPredictionRepository predictionRepository;
    @Autowired StockRepository stockRepository;
    @Autowired EventScenarioRepository scenarioRepository;
    @Autowired EventTimelineRepository timelineRepository;

    @BeforeEach
    void clean() {
        orderRepository.deleteAll();
        transactionRepository.deleteAll();
        accountRepository.deleteAll();
        sessionRepository.deleteAll();
        userPointsRepository.deleteAll();
        userRepository.deleteAll();
        timelineRepository.deleteAll();
        scenarioRepository.deleteAll();
        indicatorRepository.deleteAll();
        predictionRepository.deleteAll();
        priceRepository.deleteAll();
        stockRepository.deleteAll();
        cacheManager.getCache("stockData").clear();
    }

    /** 伪造一个 2015 场景: hidden 标的 + 窗口行情 + 时间线。 */
    private EventScenario seedScenario() {
        Stock stock = new Stock();
        stock.setCode("600519@TEST_2015");
        stock.setName("测试茅台");
        stock.setMarket(Market.STOCK);
        stock.setHidden(true);
        stock = stockRepository.save(stock);
        // 2015-05-01 起 40 根连续日历日 K 线 (min-history-days=5, total-ticks=3, 窗口富余)
        LocalDate first = LocalDate.of(2015, 5, 1);
        for (int i = 0; i < 40; i++) {
            DailyPrice p = new DailyPrice();
            p.setStockId(stock.getStockId());
            p.setTradeDate(first.plusDays(i));
            p.setOpen(new BigDecimal("10.00"));
            p.setHigh(new BigDecimal("10.50"));
            p.setLow(new BigDecimal("9.50"));
            p.setClose(new BigDecimal("10.00"));
            p.setVolume(10000L);
            priceRepository.save(p);
        }
        EventScenario sc = new EventScenario();
        sc.setCode("TEST_2015");
        sc.setNameZh("2015测试股灾");
        sc.setNameEn("2015 Test Crash");
        sc.setMarket("STOCK");
        sc.setWindowStart(LocalDate.of(2015, 5, 10));
        sc.setWindowEnd(LocalDate.of(2015, 6, 9));
        sc.setTickers("600519");
        sc.setForceRealRules(true);
        sc.setDifficulty("HARD");
        sc = scenarioRepository.save(sc);

        EventTimelineItem ti = new EventTimelineItem();
        ti.setScenarioId(sc.getId());
        ti.setEventDate(LocalDate.of(2015, 6, 1));
        ti.setSeverity("HIGH");
        ti.setTitleZh("测试大事件");
        ti.setTitleEn("Test Event");
        ti.setBodyZh("测试正文");
        ti.setBodyEn("Test body");
        timelineRepository.save(ti);
        return sc;
    }

    // ---------- http helpers ----------

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

    private String register(String username) {
        ResponseEntity<String> resp = postJson("/api/auth/register",
                "{\"username\":\"" + username + "\",\"password\":\"secret66\"}", null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return resp.getHeaders().get(HttpHeaders.SET_COOKIE).stream()
                .filter(c -> c.startsWith("JSESSIONID"))
                .map(c -> c.split(";", 2)[0])
                .findFirst().orElseThrow();
    }

    // ---------- 用例 ----------

    @Test
    void eventModeHidesEverythingAndRevealsAtSettle() {
        seedScenario();
        String alice = register("回放甲");

        // 未登录 401 (AuthFilter 保护 /api/event)
        assertThat(get("/api/event/catalog", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // catalog 只给筛选维度, 不泄露场景名/窗口/标的
        String catalogBody = get("/api/event/catalog", alice).getBody();
        assertThat(catalogBody).doesNotContain("2015").doesNotContain("600519").doesNotContain("TEST");

        // 开局: 日期平移 + 标的匿名 + realRules 按场景强制开启
        JsonNode start = json(postJson("/api/event/start", "{\"market\":\"STOCK\"}", alice));
        long sid = start.path("sessionId").asLong();
        assertThat(start.path("mode").asText()).isEqualTo("EVENT");
        assertThat(start.path("stockCode").asText()).isEqualTo("???");
        assertThat(start.path("startDate").asText()).startsWith("2000-");
        assertThat(start.path("realRules").asBoolean()).isTrue();
        assertThat(sessionRepository.findById(sid).orElseThrow().getScenarioId()).isNotNull();

        // K 线不带 2015 真实日期
        JsonNode history = json(get("/api/game/" + sid + "/history", alice));
        for (JsonNode k : history.path("klines")) {
            assertThat(k.path("tradeDate").asText()).doesNotStartWith("2015");
        }

        // 推进: 无新闻, 日期仍是虚拟纪元
        JsonNode tick = json(postJson("/api/game/" + sid + "/tick", "{}", alice));
        assertThat(tick.path("news")).isEmpty();
        assertThat(tick.path("currentTradeDate").asText()).startsWith("2000-");

        // 他人访问被 404 (requireAccess)
        String bob = register("回放乙");
        assertThat(get("/api/game/" + sid + "/status", bob).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        // 结算: 揭晓场景名 + 真实窗口 + 时间线 (真实日期)
        JsonNode settle = json(postJson("/api/game/" + sid + "/settle", "{}", alice));
        assertThat(settle.path("stockCode").asText()).isEqualTo("600519@TEST_2015");
        JsonNode reveal = settle.path("eventReveal");
        assertThat(reveal.path("nameZh").asText()).isEqualTo("2015测试股灾");
        assertThat(reveal.path("realStartDate").asText()).startsWith("2015-");
        assertThat(reveal.path("timeline")).hasSize(1);
        assertThat(reveal.path("timeline").get(0).path("date").asText()).isEqualTo("2015-06-01");
    }

    @Test
    void hiddenScenarioStockLeaksNowhere() {
        seedScenario();
        String alice = register("防漏甲");

        // 研究所历史: hidden 标的按不存在处理
        assertThat(get("/api/lab/history/600519@TEST_2015", alice).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        // 普通开局拿不到 EVENT 模式 (白名单外), 也抽不到 hidden 标的
        ResponseEntity<String> badMode = postJson("/api/game/start",
                "{\"username\":\"防漏甲\",\"mode\":\"EVENT\"}", alice);
        assertThat(badMode.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // 全市场随机开局: 池子里只有 hidden 标的时应报"无可用标的"而不是把它抽出来
        ResponseEntity<String> randomStart = postJson("/api/game/start",
                "{\"username\":\"防漏甲\"}", alice);
        assertThat(randomStart.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
