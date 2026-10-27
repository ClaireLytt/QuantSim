package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
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
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.SeedChallengeEntryRepository;
import com.quantsim.repository.SeedChallengeRepository;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.DailyChallengeRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.EventScenarioRepository;
import com.quantsim.repository.EventTimelineRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.RoomMemberRepository;
import com.quantsim.repository.RoomRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserPointsRepository;
import com.quantsim.repository.UserProgressRepository;
import com.quantsim.repository.UserRepository;

/**
 * 集成测试公共 fixture 基类。
 * 为什么存在: 清库 / 造数 / http helper 曾在 8 个 @SpringBootTest 类里各复制一份
 * (deleteAll 全仓 112 处), 改一次外键顺序要同步改 8 处, 且各类的清理 repo 集合
 * 互为子集、极易漏删导致跨套件外键残留 (BacktestStrategyIntegrationTest 的注释就是在还这个债)。
 * 现在清理顺序只在 {@link #clean()} 一处维护: 按外键依赖从子表到父表取各类清理集合的并集。
 * 注意: 本类故意不加 @SpringBootTest —— 各子类的费用/ticks 等 properties 是测试语义的一部分,
 * 必须留在子类注解里。
 */
abstract class IntegrationTestSupport {

    /**
     * 统一压缩 Hikari 池: 每个 properties 组合各起一个 Spring context, 各自的连接池
     * (默认 10 条) 存活到 JVM 结束并相互叠加 —— 测试类一多就压爆 MySQL max_connections
     * (本地与 CI 先后中招 "Too many connections", 见 issue_recode/1.md 2026-10-17)。
     * 集成测试串行执行, 每 context 4 条连接绰绰有余; 新增测试类不再逼近上限。
     */
    @org.springframework.test.context.DynamicPropertySource
    static void capConnectionPool(org.springframework.test.context.DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "4");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "0");
    }

    @Autowired protected TestRestTemplate rest;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected CacheManager cacheManager;

    @Autowired protected BacktestResultRepository backtestRepository;
    @Autowired protected PendingOrderRepository orderRepository;
    @Autowired protected PositionRepository positionRepository;
    @Autowired protected SessionStockRepository sessionStockRepository;
    @Autowired protected RoomMemberRepository roomMemberRepository;
    @Autowired protected RoomRepository roomRepository;
    @Autowired protected DailyChallengeRepository dailyChallengeRepository;
    @Autowired protected SeedChallengeEntryRepository seedChallengeEntryRepository;
    @Autowired protected com.quantsim.repository.WeeklyVoteRepository weeklyVoteRepository;
    @Autowired protected com.quantsim.repository.BlindEntryRepository blindEntryRepositorySupport;
    @Autowired protected SeedChallengeRepository seedChallengeRepository;
    @Autowired protected UserProgressRepository userProgressRepository;
    @Autowired protected TransactionRepository transactionRepository;
    @Autowired protected AccountRepository accountRepository;
    @Autowired protected GameSessionRepository sessionRepository;
    @Autowired protected com.quantsim.repository.PointsLedgerRepository pointsLedgerRepository;
    @Autowired protected UserPointsRepository userPointsRepository;
    @Autowired protected UserRepository userRepository;
    @Autowired protected EventTimelineRepository timelineRepository;
    @Autowired protected EventScenarioRepository scenarioRepository;
    @Autowired protected DailyIndicatorRepository indicatorRepository;
    @Autowired protected DailyPredictionRepository predictionRepository;
    @Autowired protected DailyPriceRepository priceRepository;
    @Autowired protected StockRepository stockRepository;

    /**
     * 全量清库 + 清缓存: 测试套件共用一个库, 上一套件最后一个用例的残留
     * (如组合模式的 positions) 会卡住本套件的外键, 所以必须删全集而不是本套件用到的子集。
     * 顺序 = 外键依赖从引用方到被引用方; 新增表时只需在这里插入一行。
     */
    @BeforeEach
    void cleanDatabase() {
        clean();
    }

    protected void clean() {
        weeklyVoteRepository.deleteAll();
        blindEntryRepositorySupport.deleteAll();
        seedChallengeEntryRepository.deleteAll();
        seedChallengeRepository.deleteAll();
        backtestRepository.deleteAll();
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
        pointsLedgerRepository.deleteAll();
        userPointsRepository.deleteAll();
        userRepository.deleteAll();
        timelineRepository.deleteAll();
        scenarioRepository.deleteAll();
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

    // ---------- seed helpers ----------

    /** 只建股票行 (行情由调用方自造, 如正弦波/自定义价格序列)。 */
    protected Stock seedStock(String code, String name, Market market) {
        Stock stock = new Stock();
        stock.setCode(code);
        stock.setName(name);
        stock.setIndustry("测试");
        stock.setMarket(market);
        return stockRepository.save(stock);
    }

    /**
     * 最通用的平价股票: days 根均匀 K 线 (open=close, high=close+1, low=close-1) + 每日预测。
     * 均匀价格让随机起点不影响断言; probUp 决定 AI 行为 (0.5=观望, 0.8=全仓)。
     * predModel 为 null 时不造预测行。
     */
    protected Stock seedFlatStock(String code, String name, Market market, LocalDate firstDay,
                                  int days, String close, AiLevel predModel, String probUp) {
        Stock stock = seedStock(code, name, market);
        BigDecimal c = new BigDecimal(close);
        for (int i = 0; i < days; i++) {
            savePrice(stock.getStockId(), firstDay.plusDays(i), c);
            if (predModel != null) {
                savePrediction(stock.getStockId(), firstDay.plusDays(i), predModel, probUp);
            }
        }
        return stock;
    }

    /** 单日 K 线: open=close, high=close+1, low=close-1, 量恒定。 */
    protected void savePrice(Long stockId, LocalDate day, BigDecimal close) {
        DailyPrice p = new DailyPrice();
        p.setStockId(stockId);
        p.setTradeDate(day);
        p.setOpen(close);
        p.setHigh(close.add(BigDecimal.ONE));
        p.setLow(close.subtract(BigDecimal.ONE));
        p.setClose(close);
        p.setVolume(10000L);
        priceRepository.save(p);
    }

    /** 单日预测, 方向恒 UP (方向文案不参与断言, probUp 才是行为开关)。 */
    protected void savePrediction(Long stockId, LocalDate day, AiLevel model, String probUp) {
        DailyPrediction pred = new DailyPrediction();
        pred.setStockId(stockId);
        pred.setTradeDate(day);
        pred.setModel(model.getModel());
        pred.setProbUp(new BigDecimal(probUp));
        pred.setPredictedDirection("UP");
        predictionRepository.save(pred);
    }

    // ---------- http helpers ----------

    protected ResponseEntity<String> postJson(String path, String body) {
        return postJson(path, body, null);
    }

    protected ResponseEntity<String> postJson(String path, String body, String cookie) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (cookie != null) {
            headers.add(HttpHeaders.COOKIE, cookie);
        }
        return rest.postForEntity(path, new HttpEntity<>(body, headers), String.class);
    }

    protected ResponseEntity<String> get(String path, String cookie) {
        HttpHeaders headers = new HttpHeaders();
        if (cookie != null) {
            headers.add(HttpHeaders.COOKIE, cookie);
        }
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    protected JsonNode json(ResponseEntity<String> resp) {
        try {
            return objectMapper.readTree(resp.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("响应不是 JSON: " + resp.getBody(), e);
        }
    }

    /** 注册并返回会话 Cookie (注册即登录)。 */
    protected String register(String username) {
        ResponseEntity<String> resp = postJson("/api/auth/register",
                "{\"username\":\"" + username + "\",\"password\":\"secret66\"}", null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return sessionCookie(resp);
    }

    protected String sessionCookie(ResponseEntity<String> resp) {
        List<String> cookies = resp.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertThat(cookies).isNotNull();
        return cookies.stream().filter(c -> c.startsWith("JSESSIONID"))
                .map(c -> c.split(";", 2)[0])
                .findFirst().orElseThrow();
    }
}
