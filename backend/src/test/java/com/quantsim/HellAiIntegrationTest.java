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
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PendingOrderRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.RoomMemberRepository;
import com.quantsim.repository.RoomRepository;
import com.quantsim.repository.DailyChallengeRepository;
import com.quantsim.repository.UserProgressRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserRepository;
import com.quantsim.service.DataRefreshService;

/**
 * 地狱 AI 与置信度调仓: MLP 模型预测可用, 高难度 AI 按置信度分级建仓;
 * 顺带验证 DataRefreshService 桩命令执行与默认关闭。
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
        // 刷新服务桩命令 (echo 任意平台可用)
        "quantsim.refresh.enabled=false",
        "quantsim.refresh.command=cmd /c echo refresh-stub-ok",
        "quantsim.refresh.workdir=.",
})
class HellAiIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;
    @Autowired DataRefreshService refreshService;
    @Autowired com.quantsim.config.RefreshProperties refreshProperties;

    @Autowired PendingOrderRepository orderRepository;
    @Autowired PositionRepository cleanupPositionRepository;
    @Autowired SessionStockRepository cleanupSessionStockRepository;
    @Autowired RoomMemberRepository cleanupRoomMemberRepository;
    @Autowired RoomRepository cleanupRoomRepository;
    @Autowired DailyChallengeRepository cleanupDailyChallengeRepository;
    @Autowired UserProgressRepository cleanupUserProgressRepository;
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
        // 同 BacktestStrategyIntegrationTest: 共库测试需全量清理子表残留
        orderRepository.deleteAll();
        cleanupPositionRepository.deleteAll();
        cleanupSessionStockRepository.deleteAll();
        cleanupRoomMemberRepository.deleteAll();
        cleanupRoomRepository.deleteAll();
        cleanupDailyChallengeRepository.deleteAll();
        cleanupUserProgressRepository.deleteAll();
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

    private void seed(String probUp) {
        Stock stock = new Stock();
        stock.setCode("000001");
        stock.setName("测试股");
        stock.setIndustry("测试");
        stock.setMarket(Market.STOCK);
        stock = stockRepository.save(stock);

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

            DailyPrediction pred = new DailyPrediction();
            pred.setStockId(stock.getStockId());
            pred.setTradeDate(d.plusDays(i));
            pred.setModel(AiLevel.HELL.getModel());
            pred.setProbUp(new BigDecimal(probUp));
            pred.setPredictedDirection("UP");
            predictionRepository.save(pred);
        }
    }

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

    private int aiSharesAfterOneTick(String probUp) {
        clean();
        seed(probUp);
        ResponseEntity<String> start = postJson("/api/game/start",
                "{\"username\":\"地狱测试\",\"aiLevel\":\"HELL\"}");
        assertThat(start.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(start).path("aiLevel").asText()).isEqualTo("HELL");
        long sid = json(start).path("sessionId").asLong();
        JsonNode tick = json(postJson("/api/game/" + sid + "/tick", "{}"));
        return tick.path("status").path("ai").path("shares").asInt();
    }

    @Test
    void hellAiSizesPositionByConfidence() {
        // probUp=0.95 -> 目标仓位 100%: 10 万 @10 全仓 = 10000 股
        int fullShares = aiSharesAfterOneTick("0.9500");
        assertThat(fullShares).isEqualTo(10000);

        // probUp=0.575 -> 目标仓位 (0.575-0.5)/0.15 = 50%: 约 5000 股
        int halfShares = aiSharesAfterOneTick("0.5750");
        assertThat(halfShares).isBetween(4500, 5500);
        assertThat(halfShares).isLessThan(fullShares);

        // probUp=0.50 -> 目标 0 仓
        int zeroShares = aiSharesAfterOneTick("0.5000");
        assertThat(zeroShares).isZero();
    }

    @Test
    void refreshServiceRunsStubAndToggleOff() {
        // 生产默认开启 (上线保鲜), 测试环境显式关闭 —— 验证开关生效
        assertThat(refreshProperties.isEnabled()).isFalse();
        // 桩命令执行成功并清缓存
        assertThat(refreshService.refreshNow()).isTrue();
    }

    @Test
    void advisorDisabledWithoutApiKeyWhenNotConfigured() {
        seed("0.8000");
        long sid = json(postJson("/api/game/start",
                "{\"username\":\"地狱测试\",\"aiLevel\":\"HELL\"}")).path("sessionId").asLong();
        ResponseEntity<String> resp = postJson("/api/game/" + sid + "/advisor?lang=zh", "{}");
        // 配了 ANTHROPIC_API_KEY 的环境会真调 (可能 200/400), 未配置则明确 400
        if (System.getenv("ANTHROPIC_API_KEY") == null || System.getenv("ANTHROPIC_API_KEY").isBlank()) {
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }
}
