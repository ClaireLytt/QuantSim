package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

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
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.Room;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyChallengeRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.RoomMemberRepository;
import com.quantsim.repository.RoomRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserProgressRepository;
import com.quantsim.repository.UserRepository;

/**
 * 竞技层集成测试: 每日挑战确定性与限次 / 房间生命周期与防剧透 / 赛季筛选 / 新闻事件下发。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class CompetitiveIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;

    @Autowired PendingOrderRepository orderRepository;
    @Autowired PositionRepository positionRepository;
    @Autowired SessionStockRepository sessionStockRepository;
    @Autowired RoomMemberRepository roomMemberRepository;
    @Autowired RoomRepository roomRepository;
    @Autowired DailyChallengeRepository dailyChallengeRepository;
    @Autowired UserProgressRepository userProgressRepository;
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
        orderRepository.deleteAll();
        positionRepository.deleteAll();
        sessionStockRepository.deleteAll();
        roomMemberRepository.deleteAll();
        roomRepository.deleteAll();
        dailyChallengeRepository.deleteAll();
        userProgressRepository.deleteAll();
        transactionRepository.deleteAll();
        accountRepository.deleteAll();
        sessionRepository.deleteAll();
        userRepository.deleteAll();
        indicatorRepository.deleteAll();
        predictionRepository.deleteAll();
        priceRepository.deleteAll();
        stockRepository.deleteAll();
        cacheManager.getCache("stockData").clear();
        var news = cacheManager.getCache("newsByDate");
        if (news != null) {
            news.clear();
        }
    }

    private Stock seedStock(String code, LocalDate firstDay, int days) {
        Stock stock = new Stock();
        stock.setCode(code);
        stock.setName("测试股" + code);
        stock.setIndustry("测试");
        stock.setMarket(Market.STOCK);
        stock = stockRepository.save(stock);
        for (int i = 0; i < days; i++) {
            DailyPrice p = new DailyPrice();
            p.setStockId(stock.getStockId());
            p.setTradeDate(firstDay.plusDays(i));
            p.setOpen(new BigDecimal("10.00"));
            p.setHigh(new BigDecimal("11.00"));
            p.setLow(new BigDecimal("9.00"));
            p.setClose(new BigDecimal("10.00"));
            p.setVolume(10000L);
            priceRepository.save(p);

            DailyPrediction pred = new DailyPrediction();
            pred.setStockId(stock.getStockId());
            pred.setTradeDate(firstDay.plusDays(i));
            pred.setModel(AiLevel.NORMAL.getModel());
            pred.setProbUp(new BigDecimal("0.5000"));
            pred.setPredictedDirection("UP");
            predictionRepository.save(pred);
        }
        return stock;
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
    void dailyChallengeIsDeterministicAndOncePerDay() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        seedStock("000002", LocalDate.of(2024, 1, 1), 12);
        String alice = register("每日甲");
        String bob = register("每日乙");

        // 未登录 401
        assertThat(get("/api/daily/today", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // 两人看到同一题目
        JsonNode a = json(get("/api/daily/today", alice));
        JsonNode b = json(get("/api/daily/today", bob));
        assertThat(a.path("stockCode").asText()).isEqualTo(b.path("stockCode").asText());
        assertThat(a.path("played").asBoolean()).isFalse();

        // 两人开局: 同股同起始日
        JsonNode startA = json(postJson("/api/daily/start", "{}", alice));
        JsonNode startB = json(postJson("/api/daily/start", "{}", bob));
        assertThat(startA.path("stockCode").asText()).isEqualTo(startB.path("stockCode").asText());
        assertThat(startA.path("startDate").asText()).isEqualTo(startB.path("startDate").asText());
        assertThat(startA.path("mode").asText()).isEqualTo("DAILY");

        // 同一人当天第二局被拒
        ResponseEntity<String> again = postJson("/api/daily/start", "{}", alice);
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 结算后进入每日榜, 且不进经典排行榜
        long sidA = startA.path("sessionId").asLong();
        postJson("/api/game/" + sidA + "/settle", "{}", alice);
        JsonNode board = json(get("/api/daily/leaderboard", alice));
        assertThat(board).hasSize(1);
        assertThat(board.get(0).path("username").asText()).isEqualTo("每日甲");
        JsonNode classic = json(get("/api/leaderboard", null));
        assertThat(classic.findValuesAsText("username")).doesNotContain("每日甲");
    }

    @Test
    void roomLifecycleWithHiddenReturnsAndSettle() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("房主");
        String bob = register("房客");

        // 建房
        JsonNode room = json(postJson("/api/rooms", "{\"aiLevel\":\"NORMAL\"}", alice));
        String code = room.path("code").asText();
        assertThat(code).hasSize(6);
        assertThat(room.path("status").asText()).isEqualTo("OPEN");

        // 加入 + 两人开局: 同股同起始日
        json(postJson("/api/rooms/" + code + "/join", "{}", bob));
        JsonNode playA = json(postJson("/api/rooms/" + code + "/play", "{}", alice));
        JsonNode playB = json(postJson("/api/rooms/" + code + "/play", "{}", bob));
        assertThat(playA.path("stockCode").asText()).isEqualTo(playB.path("stockCode").asText());
        assertThat(playA.path("startDate").asText()).isEqualTo(playB.path("startDate").asText());
        assertThat(playA.path("mode").asText()).isEqualTo("ROOM");
        // play 幂等: 再点返回同一对局
        assertThat(json(postJson("/api/rooms/" + code + "/play", "{}", alice))
                .path("sessionId").asLong()).isEqualTo(playA.path("sessionId").asLong());

        // 甲先结算: OPEN 期间收益率隐藏
        postJson("/api/game/" + playA.path("sessionId").asLong() + "/settle", "{}", alice);
        JsonNode view = json(get("/api/rooms/" + code, alice));
        assertThat(view.path("status").asText()).isEqualTo("OPEN");
        for (JsonNode m : view.path("standings")) {
            assertThat(m.path("returnRate").isNull()).isTrue();
        }

        // 乙结算 -> 全员完成 -> SETTLED, 收益率公开
        postJson("/api/game/" + playB.path("sessionId").asLong() + "/settle", "{}", bob);
        JsonNode settled = json(get("/api/rooms/" + code, bob));
        assertThat(settled.path("status").asText()).isEqualTo("SETTLED");
        for (JsonNode m : settled.path("standings")) {
            assertThat(m.path("returnRate").isNull()).isFalse();
        }
    }

    @Test
    void expiredRoomForceSettlesMembers() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("过期房主");
        JsonNode roomJson = json(postJson("/api/rooms", "{}", alice));
        String code = roomJson.path("code").asText();
        long sid = json(postJson("/api/rooms/" + code + "/play", "{}", alice)).path("sessionId").asLong();

        // 回拨到期时间
        Room room = roomRepository.findByCode(code).orElseThrow();
        room.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        roomRepository.save(room);

        JsonNode view = json(get("/api/rooms/" + code, alice));
        assertThat(view.path("status").asText()).isEqualTo("SETTLED");
        assertThat(sessionRepository.findById(sid).orElseThrow().getStatus().name()).isEqualTo("SETTLED");
    }

    @Test
    void seasonFilterOnLeaderboard() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        ResponseEntity<String> start = postJson("/api/game/start",
                "{\"username\":\"赛季玩家\",\"aiLevel\":\"EASY\"}", null);
        long sid = json(start).path("sessionId").asLong();
        postJson("/api/game/" + sid + "/settle", "{}", null);

        JsonNode seasonsArr = json(get("/api/leaderboard/seasons", null));
        assertThat(seasonsArr.isArray()).isTrue();
        assertThat(seasonsArr.size()).isGreaterThanOrEqualTo(1);
        String current = seasonsArr.get(0).asText();

        // 当季能查到, 一个不存在的赛季查不到
        assertThat(json(get("/api/leaderboard?season=" + current, null)).size()).isEqualTo(1);
        assertThat(json(get("/api/leaderboard?season=1999-01", null)).size()).isZero();
    }

    @Test
    void tickDeliversNewsOnEventDate() {
        // 行情覆盖 2024-09-24 (内置 A股 事件日): 9 根 K 线, 起点只能落在 09-22/23,
        // 最多两次推进必然揭示 09-24
        seedStock("000001", LocalDate.of(2024, 9, 18), 9);
        long sid = json(postJson("/api/game/start",
                "{\"username\":\"新闻玩家\",\"aiLevel\":\"NORMAL\"}", null)).path("sessionId").asLong();

        boolean sawNews = false;
        for (int i = 0; i < 2 && !sawNews; i++) {
            JsonNode tick = json(postJson("/api/game/" + sid + "/tick", "{}", null));
            if (tick.path("news").size() > 0) {
                sawNews = true;
                JsonNode item = tick.path("news").get(0);
                assertThat(item.path("titleZh").asText()).isNotBlank();
                assertThat(item.path("titleEn").asText()).isNotBlank();
            }
            if (tick.path("settled").asBoolean()) {
                break;
            }
        }
        assertThat(sawNews).isTrue();
    }
}
