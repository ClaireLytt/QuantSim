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
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserRepository;

/**
 * 竞技场新策略集成测试: RSI/MACD/BOLL/GRID/TURTLE 可跑且指标合理,
 * 仓位比例留现金, 自动调参返回完整网格。行情用确定性的正弦波动 (适合网格/均值类策略)。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.auth.per-minute=10000",
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class BacktestStrategyIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper objectMapper;
    @Autowired CacheManager cacheManager;

    @Autowired BacktestResultRepository backtestRepository;
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
        backtestRepository.deleteAll();
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
        stock.setName("波动股");
        stock.setIndustry("测试");
        stock.setMarket(Market.STOCK);
        stock = stockRepository.save(stock);

        // 100 天正弦波: 均值 20, 振幅 5 —— 网格/均值回归/RSI 都有信号可触发
        LocalDate d = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < 100; i++) {
            double close = 20 + 5 * Math.sin(i / 6.0);
            BigDecimal c = BigDecimal.valueOf(Math.round(close * 100) / 100.0);
            DailyPrice p = new DailyPrice();
            p.setStockId(stock.getStockId());
            p.setTradeDate(d.plusDays(i));
            p.setOpen(c);
            p.setHigh(c.add(BigDecimal.ONE));
            p.setLow(c.subtract(BigDecimal.ONE));
            p.setClose(c);
            p.setVolume(10000L);
            priceRepository.save(p);
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

    private JsonNode run(String extra) {
        ResponseEntity<String> resp = postJson("/api/backtest/run",
                "{\"username\":\"策略测试\",\"stockCode\":\"000001\"" + extra + "}");
        assertThat(resp.getStatusCode()).as(resp.getBody()).isEqualTo(HttpStatus.OK);
        return json(resp);
    }

    @Test
    void allNewStrategiesRunAndReturnSaneMetrics() {
        String[] extras = {
                ",\"strategy\":\"RSI\"",
                ",\"strategy\":\"MACD\"",
                ",\"strategy\":\"BOLL\"",
                ",\"strategy\":\"GRID\"",
                ",\"strategy\":\"TURTLE\"",
        };
        for (String extra : extras) {
            JsonNode res = run(extra);
            assertThat(res.path("tradingDays").asInt()).isEqualTo(100);
            assertThat(res.path("equityCurve")).hasSize(100);
            double total = res.path("totalReturn").decimalValue().doubleValue();
            assertThat(total).isBetween(-1.0, 10.0);
            double dd = res.path("maxDrawdown").decimalValue().doubleValue();
            assertThat(dd).isBetween(0.0, 1.0);
        }
        // 正弦行情下网格策略应有多次交易
        JsonNode grid = run(",\"strategy\":\"GRID\",\"gridPct\":3,\"gridLevels\":5");
        assertThat(grid.path("tradeCount").asInt()).isGreaterThan(2);
    }

    @Test
    void positionPctKeepsCashInReserve() {
        // 50% 仓位的买入持有变体: 用 MA_CROSS 场景对比 100% 与 50% 的首日后曲线差异即可,
        // 简化断言: pos=50 时策略资金曲线的最大回撤应不大于 pos=100
        JsonNode full = run(",\"strategy\":\"MOMENTUM\",\"lookbackDays\":5,\"positionPct\":100");
        JsonNode half = run(",\"strategy\":\"MOMENTUM\",\"lookbackDays\":5,\"positionPct\":50");
        double ddFull = full.path("maxDrawdown").decimalValue().doubleValue();
        double ddHalf = half.path("maxDrawdown").decimalValue().doubleValue();
        assertThat(ddHalf).isLessThanOrEqualTo(ddFull + 1e-9);
        assertThat(half.path("params").asText()).contains("pos=50%");
    }

    @Test
    void customRsiRuleWorks() {
        JsonNode res = run(",\"strategy\":\"CUSTOM\","
                + "\"buyConditions\":[{\"left\":\"RSI\",\"op\":\"LT\",\"rightValue\":35}],"
                + "\"sellConditions\":[{\"left\":\"RSI\",\"op\":\"GT\",\"rightValue\":65}]");
        assertThat(res.path("tradeCount").asInt()).isGreaterThan(0);
        assertThat(res.path("params").asText()).contains("RSI");
    }

    @Test
    void tuneReturnsFullGridForHeatmap() {
        ResponseEntity<String> resp = postJson("/api/backtest/tune",
                "{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"BOLL\"}");
        assertThat(resp.getStatusCode()).as(resp.getBody()).isEqualTo(HttpStatus.OK);
        JsonNode res = json(resp);
        // BOLL 网格 = 6 窗口 × 4 倍数 = 24
        assertThat(res.path("triedCount").asInt()).isEqualTo(24);
        assertThat(res.path("grid")).hasSize(24);
        assertThat(res.path("paramKeys")).hasSize(2);
        assertThat(res.path("bestParams").has("bollWindow")).isTrue();
        assertThat(res.path("result").path("backtestId").asLong()).isPositive();

        // 新策略调参也能跑 (RSI 5×5=25)
        JsonNode rsi = json(postJson("/api/backtest/tune",
                "{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"RSI\"}"));
        assertThat(rsi.path("triedCount").asInt()).isEqualTo(25);
    }

    // ---------- 参数校验与身份 ----------

    @Test
    void invalidParamsRejected() {
        record BadCase(String body, String expectMsgPart) {}
        BadCase[] cases = {
                new BadCase("{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"FOO\"}",
                        "未知策略"),
                new BadCase("{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"MA_CROSS\","
                        + "\"fastWindow\":30,\"slowWindow\":10}", "快线窗口必须小于"),
                new BadCase("{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"RSI\","
                        + "\"rsiPeriod\":99}", "RSI 周期"),
                new BadCase("{\"username\":\"策略测试\",\"stockCode\":\"000001\",\"strategy\":\"CUSTOM\"}",
                        "至少需要一条"),
                new BadCase("{\"username\":\"策略测试\",\"stockCode\":\"999999\",\"strategy\":\"BUY_HOLD\"}",
                        "股票不存在"),
        };
        for (BadCase c : cases) {
            ResponseEntity<String> resp = postJson("/api/backtest/run", c.body());
            assertThat(resp.getStatusCode().is4xxClientError()).as(c.body()).isTrue();
            assertThat(json(resp).path("message").asText()).as(c.body()).contains(c.expectMsgPart());
        }
    }

    @Test
    void buyHoldStrategyMatchesHoldBenchmark() {
        // BUY_HOLD 策略与买入持有基准同规则同费用 (此处费用为 0), 两条曲线终点必须一致
        JsonNode res = run(",\"strategy\":\"BUY_HOLD\"");
        assertThat(res.path("totalReturn").decimalValue())
                .isEqualByComparingTo(res.path("holdReturn").decimalValue());
        assertThat(res.path("tradeCount").asInt()).isEqualTo(1);
    }

    @Test
    void guestRunWithRegisteredUsernameRejected() {
        // 注册一个真实账户 (TestRestTemplate 不保留 cookie, 后续请求仍是游客)
        ResponseEntity<String> reg = postJson("/api/auth/register",
                "{\"username\":\"真身股神\",\"password\":\"secret66\"}");
        assertThat(reg.getStatusCode()).isEqualTo(HttpStatus.OK);

        // 游客用注册用户名入榜: 拒绝, 且不产生回测记录
        ResponseEntity<String> resp = postJson("/api/backtest/run",
                "{\"username\":\"真身股神\",\"stockCode\":\"000001\",\"strategy\":\"BUY_HOLD\"}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(resp).path("message").asText()).contains("已被注册");
        assertThat(backtestRepository.count()).isZero();
    }
}
