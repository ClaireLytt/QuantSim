package com.quantsim.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.EventScenario;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.EventScenarioRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.UserRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 事件回放模式 (EVENT): 服务端随机选场景/标的/起始日, 玩家盲测一段真实历史行情,
 * 结算才揭晓是哪个历史时刻。场景/窗口/标的绝不提前下发 —— catalog 只给可选筛选项。
 * 行情挂在 hidden 标的行上 (code = "真实代码@场景code"), 由 fetch_scenarios.py 回灌。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EventService {


    private final EventScenarioRepository scenarioRepository;
    private final StockRepository stockRepository;
    private final MarketDataService marketData;
    private final GameService gameService;
    private final GameSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final com.quantsim.config.GameProperties props;

    /** catalog 只暴露筛选维度, 绝不下发场景名/窗口/标的 (防剧透)。 */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> catalog() {
        List<EventScenario> enabled = scenarioRepository.findByEnabledTrue();
        List<String> markets = enabled.stream().map(EventScenario::getMarket).distinct().sorted().toList();
        List<String> difficulties = enabled.stream().map(EventScenario::getDifficulty).distinct().sorted().toList();
        return java.util.Map.of("markets", markets, "difficulties", difficulties, "count", enabled.size());
    }

    @Transactional
    public StartGameResponse start(Long userId, String market, String difficulty) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        List<EventScenario> pool = scenarioRepository.findByEnabledTrue().stream()
                .filter(sc -> market == null || market.isBlank() || sc.getMarket().equalsIgnoreCase(market))
                .filter(sc -> difficulty == null || difficulty.isBlank()
                        || sc.getDifficulty().equalsIgnoreCase(difficulty))
                .toList();
        if (pool.isEmpty()) {
            throw new BusinessException("没有符合条件的历史场景, 换个筛选试试");
        }
        ThreadLocalRandom random = ThreadLocalRandom.current();
        // 场景随机、候选标的随机、起始日随机: 同一场景多刷也难撞同一段
        List<EventScenario> scenarios = new ArrayList<>(pool);
        java.util.Collections.shuffle(scenarios, new java.util.Random(random.nextLong()));
        for (EventScenario scenario : scenarios) {
            StartGameResponse res = tryStart(user, scenario, random);
            if (res != null) {
                return res;
            }
        }
        throw new BusinessException("场景行情数据未就绪, 请先运行 data-pipeline/fetch_scenarios.py 回灌");
    }

    /** 在场景内随机挑一个数据就绪的候选标的与合法起始日; 全部不可用返回 null。 */
    private StartGameResponse tryStart(User user, EventScenario scenario, ThreadLocalRandom random) {
        List<String> tickers = new ArrayList<>(List.of(scenario.getTickers().split(",")));
        java.util.Collections.shuffle(tickers, new java.util.Random(random.nextLong()));
        for (String ticker : tickers) {
            String hiddenCode = ticker.trim() + "@" + scenario.getCode();
            Stock stock = stockRepository.findByCode(hiddenCode).orElse(null);
            if (stock == null) {
                continue; // 该候选还没回灌
            }
            LocalDate start = pickStartDate(stock.getStockId(), scenario, random);
            if (start == null) {
                continue;
            }
            StartGameResponse res = gameService.startGameAt(user, stock.getStockId(), start,
                    AiLevel.NORMAL, "EVENT", scenario.isForceRealRules(), null);
            // 场景 id 落在 session 上, 结算时据此揭晓
            GameSession session = sessionRepository.findById(res.sessionId()).orElseThrow();
            session.setScenarioId(scenario.getId());
            return res;
        }
        return null;
    }

    /**
     * 合法起始日: 窗口内随机, 且满足 (1) 前面至少 MIN_HISTORY_BARS 根预热 K 线;
     * (2) 往后推 totalTicks 个交易日仍不越过窗口终点 (结局必须发生在场景窗口里)。
     */
    private LocalDate pickStartDate(Long stockId, EventScenario scenario, ThreadLocalRandom random) {
        StockData sd = marketData.load(stockId);
        List<com.quantsim.entity.DailyPrice> prices = sd.prices();
        if (prices.isEmpty()) {
            return null;
        }
        int lo = 0;
        while (lo < prices.size() && prices.get(lo).getTradeDate().isBefore(scenario.getWindowStart())) {
            lo++;
        }
        int hi = prices.size() - 1;
        while (hi >= 0 && prices.get(hi).getTradeDate().isAfter(scenario.getWindowEnd())) {
            hi--;
        }
        // 前置预热 K 线数与 GameService 同口径 (吃配置, 测试里会调小)
        int minStart = Math.max(lo, props.getMinHistoryDays());
        int maxStart = hi - props.getTotalTicks();
        if (maxStart < minStart) {
            return null;
        }
        return prices.get(minStart + random.nextInt(maxStart - minStart + 1)).getTradeDate();
    }
}
