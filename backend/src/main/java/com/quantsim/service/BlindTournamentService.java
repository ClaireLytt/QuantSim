package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.config.GameProperties;
import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.entity.BlindEntry;
import com.quantsim.entity.BlindWeekSalt;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.BlindEntryRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * 擂台盲测赛 (研究游戏化 #10): 报名即锁死配置, 赛果只对"已成为过去的周"计算——
 * 三段保密窗口由周种子派生, 赛中任何接口都不下发窗口, 制度上逼出面向分布的稳健构型。
 * 评分 = 最差段 50% + 三段均值 50% (短板定成败); 另单列最差段榜由前端同数据排序。
 * 策略执行完全复用 BacktestEngine (与回测工坊同一口径, 不另造轮子)。
 */
@Service
@RequiredArgsConstructor
public class BlindTournamentService {

    private static final int WINDOWS = 3;
    private static final int SPAN = 120; // 每段窗口交易日数
    private static final int MIN_ROWS = SPAN + 40;
    /** 第四段 (未来段) 交易日数: 报名截止后的真实行情, 结构上不可过拟合 (审计创意23)。 */
    private static final int FUTURE_SPAN = 20;
    private static final java.security.SecureRandom SALT_RANDOM = new java.security.SecureRandom();

    private final BlindEntryRepository entryRepository;
    private final com.quantsim.repository.BlindWeekSaltRepository saltRepository;
    private final StockRepository stockRepository;
    private final DailyPriceRepository priceRepository;
    private final UserRepository userRepository;
    private final MarketDataService marketData;
    private final BacktestEngine engine;
    private final GameProperties props;
    private final ObjectMapper objectMapper;

    public record SubmitResult(int week, int players) {}

    public record BoardRow(String username, boolean isSelf,
                           BigDecimal worst, BigDecimal mean, BigDecimal score,
                           List<BigDecimal> windows) {}

    /** salt 只在已揭晓的周下发 (commit-reveal 的 reveal 半边), 供任何人复算窗口审计赛果。 */
    public record Board(int week, int players, boolean revealed, boolean joined,
                        List<BoardRow> rows, Long salt) {}

    static int weekIdx(java.time.LocalDate d) {
        return (int) Math.floorDiv(d.toEpochDay() - 4, 7); // 与 qsWeekIndex 同口径
    }

    private int currentWeek() {
        return weekIdx(java.time.LocalDate.now(GameService.GAME_ZONE));
    }

    @Transactional
    public SubmitResult submit(Long userId, Map<String, Object> config) {
        if (userId == null) {
            throw new BusinessException("报名需要登录（赛果要记在名下）");
        }
        int week = currentWeek();
        if (entryRepository.findByWeekIdxAndUserId(week, userId).isPresent()) {
            throw new BusinessException("本周已报名——报名即锁死，下周再战");
        }
        // 入口验证: 配置必须能解析成合法策略参数 (坏配置当场拒, 别等揭晓日炸)
        RunRequest req = toRunRequest(config);
        BacktestStrategy strategy = Enums.parse(req.strategy(), BacktestStrategy.class, "策略");
        strategy.parse(req);
        BlindEntry e = new BlindEntry();
        e.setWeekIdx(week);
        e.setUserId(userId);
        try {
            String json = objectMapper.writeValueAsString(config);
            if (json.length() > 2000) {
                throw new BusinessException("策略配置过大");
            }
            e.setConfigJson(json);
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new BusinessException("策略配置无法序列化");
        }
        entryRepository.save(e);
        saltOf(week); // 报名即固化本周盐 (commit 半边): 之后任何人都无法预知窗口
        return new SubmitResult(week, (int) entryRepository.countByWeekIdx(week));
    }

    /** 周盐取或建: INSERT IGNORE 并发安全, 值一旦落库不再变。 */
    private long saltOf(int week) {
        return saltRepository.findById(week).map(BlindWeekSalt::getSalt).orElseGet(() -> {
            saltRepository.insertIgnore(week, SALT_RANDOM.nextLong());
            return saltRepository.findById(week).orElseThrow().getSalt();
        });
    }

    // 非 readOnly: 看榜可能是某周盐的首次固化 (saltOf 的 INSERT IGNORE), 只读连接会拒绝写入
    @Transactional
    public Board board(Integer weekParam, Long userId) {
        int week = weekParam == null ? currentWeek() : weekParam;
        List<BlindEntry> entries = entryRepository.findByWeekIdxOrderByCreatedAtAsc(week);
        boolean joined = userId != null && entries.stream().anyMatch(e -> e.getUserId().equals(userId));
        // 保密窗口纪律: 只有已成为过去的周才揭晓并计分
        if (week >= currentWeek()) {
            return new Board(week, entries.size(), false, joined, List.of(), null);
        }
        long salt = saltOf(week);
        List<long[]> windows = pickWindows(week, salt);
        List<BoardRow> rows = new ArrayList<>();
        for (BlindEntry e : entries) {
            List<BigDecimal> rets = new ArrayList<>();
            try {
                RunRequest req = toRunRequest(objectMapper.readTree(e.getConfigJson()));
                BacktestStrategy strategy = Enums.parse(req.strategy(), BacktestStrategy.class, "策略");
                var sp = strategy.parse(req);
                for (long[] w : windows) {
                    MarketDataService.StockData sd = marketData.load(w[0]);
                    List<DailyPrice> slice = sd.prices().subList((int) w[1], (int) (w[1] + w[2]));
                    Market market = sd.stock().getMarket();
                    var sim = engine.simulate(strategy, sp, slice, market, props.getInitialCash());
                    rets.add(TradeMath.returnRate(sim.finalEquity, props.getInitialCash()));
                }
            } catch (Exception ex) {
                continue; // 坏档条目跳过 (入口已验证, 此处只防数据漂移)
            }
            BigDecimal worst = rets.stream().min(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
            BigDecimal mean = rets.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(rets.size()), 6, RoundingMode.HALF_UP);
            BigDecimal score = worst.multiply(new BigDecimal("0.5"))
                    .add(mean.multiply(new BigDecimal("0.5")));
            String name = userRepository.findById(e.getUserId())
                    .map(u -> PublicNames.mask(u.getUsername())).orElse("?");
            rows.add(new BoardRow(name, userId != null && e.getUserId().equals(userId),
                    worst, mean, score, rets));
        }
        rows.sort((a, b) -> b.score().compareTo(a.score()));
        return new Board(week, entries.size(), true, joined, rows, salt);
    }

    /**
     * 保密窗口: SHA 周种子 XOR 周盐, 在合格 A 股池里确定性抽取——盐在服务端,
     * 赛中无法本地复算 (纯公开种子曾可报名前预计算窗口过拟合, 审计创意22)。
     * 前三段取历史任意位置 (SPAN 日); 第四段取该周结束后的真实行情 (FUTURE_SPAN 日,
     * 报名时尚未发生, 结构上不可过拟合), 数据不足时自动省略 —— 计分对段数取均值, 口径不变。
     */
    private List<long[]> pickWindows(int week, long salt) {
        Map<Long, Long> counts = new java.util.HashMap<>();
        priceRepository.countGroupByStock().forEach(r -> counts.put((Long) r[0], (Long) r[1]));
        List<Stock> pool = stockRepository.findByHiddenFalse().stream()
                .filter(s -> s.getMarket() == Market.STOCK)
                .filter(s -> counts.getOrDefault(s.getStockId(), 0L) >= MIN_ROWS)
                .sorted(java.util.Comparator.comparing(Stock::getStockId))
                .toList();
        if (pool.isEmpty()) {
            throw new BusinessException("没有数据量足够的标的, 请先运行数据管道");
        }
        Random rng = new Random(seedOf(week) ^ salt);
        List<long[]> windows = new ArrayList<>();
        for (int i = 0; i < WINDOWS; i++) {
            Stock s = pool.get(rng.nextInt(pool.size()));
            int total = counts.get(s.getStockId()).intValue();
            int startIdx = 20 + rng.nextInt(Math.max(1, total - SPAN - 20));
            windows.add(new long[] { s.getStockId(), startIdx, SPAN });
        }
        // 第四段: 周结束日之后的首个交易日起 FUTURE_SPAN 根; 行情还没攒够就省略
        Stock future = pool.get(rng.nextInt(pool.size()));
        java.time.LocalDate weekEnd = java.time.LocalDate.ofEpochDay(7L * week + 10);
        MarketDataService.StockData sd = marketData.load(future.getStockId());
        List<DailyPrice> prices = sd.prices();
        for (int i = 0; i < prices.size(); i++) {
            if (prices.get(i).getTradeDate().isAfter(weekEnd)) {
                if (i + FUTURE_SPAN <= prices.size()) {
                    windows.add(new long[] { future.getStockId(), i, FUTURE_SPAN });
                }
                break;
            }
        }
        return windows;
    }

    private static long seedOf(int week) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256")
                    .digest(("QS-BLIND-" + week).getBytes(StandardCharsets.UTF_8));
            long seed = 0;
            for (int i = 0; i < 8; i++) {
                seed = (seed << 8) | (h[i] & 0xff);
            }
            return seed;
        } catch (Exception e) {
            return week * 2654435761L;
        }
    }

    private RunRequest toRunRequest(Map<String, Object> config) {
        if (config == null || config.isEmpty()) {
            throw new BusinessException("策略配置不能为空");
        }
        return toRunRequest(objectMapper.<com.fasterxml.jackson.databind.JsonNode>valueToTree(config));
    }

    /** JsonNode 入口: 补齐 record 必填位后宽松反序列化 (未知字段忽略)。 */
    private RunRequest toRunRequest(com.fasterxml.jackson.databind.JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new BusinessException("策略配置不能为空");
        }
        com.fasterxml.jackson.databind.node.ObjectNode obj = node.deepCopy();
        obj.put("username", "x"); // 入库不用, 只为过 record 形
        obj.put("stockCode", "x");
        try {
            return objectMapper.copy()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .treeToValue(obj, RunRequest.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new BusinessException("策略配置无法解析");
        }
    }
}
