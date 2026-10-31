package com.quantsim.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.IndustryOption;
import com.quantsim.dto.GameDtos.StartGameRequest;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.dto.GameDtos.StockLite;
import com.quantsim.entity.Account;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.SessionStock;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 开局域: 标的挑选 (随机/确定性/熊市窗口/组合对齐)、会话与账户落库、限制条件固化。
 * 从 GameService 拆出 —— 对局进行中的读写 (tick/trade/settle) 仍在 GameService。
 */
@Service
@RequiredArgsConstructor
public class GameStartService {

    private final StockRepository stockRepository;
    private final DailyPriceRepository priceRepository;
    private final MarketDataService marketData;
    private final UserService userService;
    private final GameSessionRepository sessionRepository;
    private final AccountRepository accountRepository;
    private final SessionStockRepository sessionStockRepository;
    private final GameProperties props;

    @Transactional
    public StartGameResponse startGame(StartGameRequest request, Long authUserId) {
        // 已登录以会话身份为准; 游客昵称撞注册用户名会被拒 (防冒名刷榜)
        User user = userService.resolve(request.username(), authUserId);
        Market market = parseMarket(request.market());
        AiLevel aiLevel = parseAiLevel(request.aiLevel());
        String mode = parseMode(request.mode());
        boolean advanced = Boolean.TRUE.equals(request.advanced());
        if (advanced && market != Market.US && market != Market.CRYPTO) {
            throw new BusinessException("进阶模式（做空/杠杆）仅支持美股或币圈, 请先选定市场");
        }
        boolean realRules = Boolean.TRUE.equals(request.realRules());
        if (realRules && market != Market.STOCK) {
            throw new BusinessException("真实规则（T+1/涨跌停）仅支持 A股, 请先选定市场");
        }
        // 限制条件 (可选): 笔数上限 / 强制交易理由, 开局固化
        Integer maxTrades = request.maxTrades();
        if (maxTrades != null && (maxTrades < 1 || maxTrades > 50)) {
            throw new BusinessException("交易笔数上限须在 1~50 之间");
        }
        boolean requireReason = Boolean.TRUE.equals(request.requireReason());

        Map<Long, Long> counts = eligibleCounts();
        List<Stock> allStocks = stockRepository.findByHiddenFalse();
        Map<Long, Market> marketById = allStocks.stream()
                .collect(Collectors.toMap(Stock::getStockId, Stock::getMarket));
        List<Long> eligible = filterEligible(counts, marketById, market);
        // 行业偏好: 在市场过滤之上再收一层 (玩家挑喜欢的行业开局)
        String industry = request.industry() == null ? "" : request.industry().trim();
        if (!industry.isEmpty()) {
            Map<Long, String> industryById = new HashMap<>();
            for (Stock st : allStocks) {
                if (st.getIndustry() != null) {
                    industryById.put(st.getStockId(), st.getIndustry());
                }
            }
            eligible = eligible.stream()
                    .filter(id -> industry.equals(industryById.get(id)))
                    .toList();
        }
        if (eligible.isEmpty()) {
            throw new BusinessException(!industry.isEmpty()
                    ? "该行业暂无数据量足够的标的, 换个行业试试"
                    : market == null
                            ? "没有数据量足够的股票, 请检查行情数据"
                            : "该市场暂无数据量足够的标的, 请先运行数据管道导入行情数据");
        }
        ThreadLocalRandom random = ThreadLocalRandom.current();

        if ("PORTFOLIO".equals(mode)) {
            return withConstraints(
                    startPortfolio(user, eligible, marketById, counts, aiLevel, advanced, realRules, random),
                    maxTrades, requireReason);
        }
        if ("INTRO".equals(mode)) {
            // 新手浓缩局: 专挑波澜不惊的温和窗口 (新手第一局不该被暴涨暴跌吓跑),
            // 笔数固定 2 (买卖各一次的近似), 短局天数见 GameProperties.introTicks
            long[] pick = pickCalmWindow(eligible, random);
            LocalDate calmStart = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();
            return withConstraints(
                    persistSession(user, List.of(pick[0]), calmStart, aiLevel, "INTRO", advanced, realRules, null),
                    2, false);
        }
        if ("SURVIVAL".equals(mode)) {
            // 熊市生存: 专挑历史上买入持有亏得最惨的窗口, 目标是跑赢基准 (亏得比它少)
            long[] pick = pickCrashWindow(eligible, random);
            LocalDate crashStart = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();
            return withConstraints(
                    persistSession(user, List.of(pick[0]), crashStart, aiLevel, "SURVIVAL", advanced, realRules, null),
                    maxTrades, requireReason);
        }

        Long stockId = eligible.get(random.nextInt(eligible.size()));
        int startIdx = randomStartIdx(counts.get(stockId), random);
        LocalDate startDate = marketData.load(stockId).prices().get(startIdx).getTradeDate();
        return withConstraints(
                persistSession(user, List.of(stockId), startDate, aiLevel, "CLASSIC", advanced, realRules, null),
                maxTrades, requireReason);
    }

    /** 行业筛选候选: 去重排序, 只含有行业标注的标的 (前端按所选市场二次过滤)。 */
    @Transactional(readOnly = true)
    public List<IndustryOption> listIndustries() {
        return stockRepository.findByHiddenFalse().stream()
                .filter(st -> st.getIndustry() != null && !st.getIndustry().isBlank())
                .map(st -> new IndustryOption(st.getIndustry(), st.getMarket().name()))
                .distinct()
                .sorted(java.util.Comparator
                        .comparing(IndustryOption::market)
                        .thenComparing(IndustryOption::industry))
                .toList();
    }

    /**
     * 每日挑战 / 房间等确定性开局: 由调用方指定标的与起始日。
     * realRules 由调用方给定且全员一致 (每日挑战固定 false 保证榜单可比,
     * 房间按建房配置, 事件回放按场景配置); advanced 一律关闭。
     */
    @Transactional
    public StartGameResponse startGameAt(User user, Long stockId, LocalDate startDate,
                                         AiLevel aiLevel, String mode, boolean realRules,
                                         LocalDate challengeDate) {
        return persistSession(user, List.of(stockId), startDate, aiLevel, mode, false, realRules, challengeDate);
    }

    /** 供确定性开局挑选标的: 合格标的按 stockId 排序 + 指定随机源。 */
    @Transactional(readOnly = true)
    public long[] pickDeterministic(Market market, Random random) {
        Map<Long, Long> counts = eligibleCounts();
        Map<Long, Market> marketById = stockRepository.findByHiddenFalse().stream()
                .collect(Collectors.toMap(Stock::getStockId, Stock::getMarket));
        List<Long> eligible = filterEligible(counts, marketById, market).stream()
                .sorted()
                .toList();
        if (eligible.isEmpty()) {
            throw new BusinessException("没有数据量足够的股票, 请检查行情数据");
        }
        Long stockId = eligible.get(random.nextInt(eligible.size()));
        int startIdx = randomStartIdx(counts.get(stockId), random);
        return new long[] { stockId, startIdx };
    }

    private Map<Long, Long> eligibleCounts() {
        Map<Long, Long> counts = priceRepository.countGroupByStock().stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
        if (counts.isEmpty()) {
            throw new BusinessException("股票池为空, 请先运行数据管道导入行情数据");
        }
        return counts;
    }

    private List<Long> filterEligible(Map<Long, Long> counts, Map<Long, Market> marketById, Market market) {
        int required = props.getMinHistoryDays() + props.getTotalTicks() + 1;
        return counts.entrySet().stream()
                .filter(e -> e.getValue() >= required)
                // marketById 来自 findByHiddenFalse: 不在表里的就是 hidden 场景标的, 全市场随机也不能抽中
                .filter(e -> marketById.containsKey(e.getKey()))
                .filter(e -> market == null || marketById.get(e.getKey()) == market)
                .map(Map.Entry::getKey)
                .toList();
    }

    /**
     * 熊市生存窗口: 扫全部合格标的的每个可开局窗口, 收集跌幅最深的前 20 个,
     * 随机挑一个 (返回 [stockId, startIdx])。没有明显下跌段就退回最差的那个。
     */
    private long[] pickCrashWindow(List<Long> eligible, Random random) {
        record Window(long stockId, int startIdx, double ret) {}
        List<Window> worst = new ArrayList<>();
        int span = props.getTotalTicks();
        int minIdx = props.getMinHistoryDays() - 1;
        for (Long sid : eligible) {
            List<DailyPrice> prices = marketData.load(sid).prices();
            for (int i = minIdx; i + span < prices.size(); i++) {
                double start = prices.get(i).getClose().doubleValue();
                if (start <= 0) {
                    continue;
                }
                double ret = prices.get(i + span).getClose().doubleValue() / start - 1;
                worst.add(new Window(sid, i, ret));
            }
        }
        if (worst.isEmpty()) {
            throw new BusinessException("没有数据量足够的股票, 请检查行情数据");
        }
        worst.sort(java.util.Comparator.comparingDouble(Window::ret));
        List<Window> pool = worst.subList(0, windowPool(worst.size()));
        Window w = pool.get(random.nextInt(pool.size()));
        return new long[] { w.stockId(), w.startIdx() };
    }

    /**
     * 极值窗口池大小: 最差/最平静的 5% 分位, 下限 20。
     * 固定取前 20 时熊市生存的暴跌 K 线形态会被反复游玩的玩家背谱 (认出窗口即知道底部,
     * 审计创意27); 分位制让池随数据量增长, 不牺牲"够极端"的筛选语义。
     */
    static int windowPool(int candidates) {
        return Math.min(candidates, Math.max(20, candidates / 20));
    }

    /**
     * 温和窗口: 扫全部合格标的的可开局窗口, 按 |区间收益| + 平均日振幅 打分,
     * 挑最平静的前 20 个随机取一 (返回 [stockId, startIdx])。评分跨度用 introTicks
     * (新手局真实时长); 窗口可用性校验仍按 totalTicks 留足余量 (与其他模式同口径)。
     */
    private long[] pickCalmWindow(List<Long> eligible, Random random) {
        record Window(long stockId, int startIdx, double score) {}
        List<Window> calmest = new ArrayList<>();
        int span = props.getIntroTicks();
        int reserve = props.getTotalTicks();
        int minIdx = props.getMinHistoryDays() - 1;
        for (Long sid : eligible) {
            List<DailyPrice> prices = marketData.load(sid).prices();
            for (int i = minIdx; i + reserve < prices.size(); i++) {
                double start = prices.get(i).getClose().doubleValue();
                if (start <= 0) {
                    continue;
                }
                double ret = Math.abs(prices.get(i + span).getClose().doubleValue() / start - 1);
                double range = 0;
                for (int d = 1; d <= span; d++) {
                    DailyPrice p = prices.get(i + d);
                    double close = p.getClose().doubleValue();
                    if (close > 0) {
                        range += (p.getHigh().doubleValue() - p.getLow().doubleValue()) / close;
                    }
                }
                calmest.add(new Window(sid, i, ret + range / span * 2));
            }
        }
        if (calmest.isEmpty()) {
            throw new BusinessException("没有数据量足够的股票, 请检查行情数据");
        }
        calmest.sort(java.util.Comparator.comparingDouble(Window::score));
        List<Window> pool = calmest.subList(0, windowPool(calmest.size()));
        Window w = pool.get(random.nextInt(pool.size()));
        return new long[] { w.stockId(), w.startIdx() };
    }

    private int randomStartIdx(long total, Random random) {
        int minIdx = props.getMinHistoryDays() - 1;
        int maxIdx = (int) total - props.getTotalTicks() - 1;
        return minIdx + random.nextInt(maxIdx - minIdx + 1);
    }

    /** 组合模式: 同市场挑 3 只窗口对齐的标的。 */
    private StartGameResponse startPortfolio(User user, List<Long> eligible,
                                             Map<Long, Market> marketById, Map<Long, Long> counts,
                                             AiLevel aiLevel, boolean advanced, boolean realRules,
                                             ThreadLocalRandom random) {
        // 按市场分组, 只保留标的数够的市场
        Map<Market, List<Long>> byMarket = eligible.stream()
                .collect(Collectors.groupingBy(marketById::get));
        List<Market> candidates = byMarket.entrySet().stream()
                .filter(e -> e.getValue().size() >= props.getPortfolioSize())
                .map(Map.Entry::getKey)
                .toList();
        if (candidates.isEmpty()) {
            throw new BusinessException("没有市场拥有足够多 (" + props.getPortfolioSize() + " 只) 的合格标的");
        }
        Market market = candidates.get(random.nextInt(candidates.size()));
        List<Long> pool = new ArrayList<>(byMarket.get(market));
        Collections.shuffle(pool, new Random(random.nextLong()));

        // 主标的定窗口, 其余标的必须覆盖同一窗口 (同市场交易日历一致时天然满足)
        Long primary = pool.get(0);
        int startIdx = randomStartIdx(counts.get(primary), random);
        StockData psd = marketData.load(primary);
        LocalDate startDate = psd.prices().get(startIdx).getTradeDate();
        LocalDate endDate = psd.prices().get(startIdx + props.getTotalTicks()).getTradeDate();

        // 窗口对齐的候选, 保持洗牌顺序
        List<Long> aligned = new ArrayList<>();
        for (int i = 1; i < pool.size(); i++) {
            StockData sd = marketData.load(pool.get(i));
            if (sd.indexOf(startDate) != null && sd.indexOf(endDate) != null
                    && sd.indexOf(startDate) >= props.getMinHistoryDays() - 1) {
                aligned.add(pool.get(i));
            }
        }
        // 行业互异优先 (审计创意28): 同行业三只强相关标的会让"分散"决策失去意义;
        // 先挑未出现过的行业, 行业种类不够时再回退补齐
        List<Long> picked = new ArrayList<>();
        picked.add(primary);
        java.util.Set<String> industries = new java.util.HashSet<>();
        industries.add(industryOf(primary));
        for (Long sid : aligned) {
            if (picked.size() >= props.getPortfolioSize()) {
                break;
            }
            if (industries.add(industryOf(sid))) {
                picked.add(sid);
            }
        }
        for (Long sid : aligned) {
            if (picked.size() >= props.getPortfolioSize()) {
                break;
            }
            if (!picked.contains(sid)) {
                picked.add(sid);
            }
        }
        if (picked.size() < props.getPortfolioSize()) {
            throw new BusinessException("未找到窗口对齐的 " + props.getPortfolioSize() + " 只标的, 请再试一次");
        }
        return persistSession(user, picked, startDate, aiLevel, "PORTFOLIO", advanced, realRules, null);
    }

    /** 行业键: 空标注按标的各自独立 (不互相挤占"新行业"名额, 也不被已有行业拦下)。 */
    private String industryOf(Long stockId) {
        String ind = marketData.load(stockId).stock().getIndustry();
        return ind == null || ind.isBlank() ? "unknown-" + stockId : ind;
    }

    private StartGameResponse persistSession(User user, List<Long> stockIds, LocalDate startDate,
                                             AiLevel aiLevel, String mode, boolean advanced,
                                             boolean realRules, LocalDate challengeDate) {
        GameSession session = new GameSession();
        session.setUserId(user.getUserId());
        session.setStockId(stockIds.get(0));
        session.setStartDate(startDate);
        session.setCurrentTradeDate(startDate);
        session.setInitialCash(props.getInitialCash());
        session.setAiCash(props.getInitialCash());
        session.setAiModel(aiLevel.getModel());
        session.setMode(mode);
        session.setAdvanced(advanced);
        session.setRealRules(realRules);
        session.setSeason(YearMonth.now(GameService.GAME_ZONE).toString());
        session.setChallengeDate(challengeDate);
        // saveAndFlush: 每日挑战的 uk_user_daily 冲突要在 DailyChallengeService.start 的
        // catch 块内暴露 (转"今天已玩"业务提示), commit 时才炸就只剩 500 了
        session = sessionRepository.saveAndFlush(session);

        Account account = new Account();
        account.setSessionId(session.getSessionId());
        account.setCashBalance(props.getInitialCash());
        accountRepository.save(account);

        List<StockLite> stocks = new ArrayList<>();
        for (int slot = 0; slot < stockIds.size(); slot++) {
            Stock st = marketData.load(stockIds.get(slot)).stock();
            stocks.add(new StockLite(BlindDates.maskCode(session, st.getCode()),
                    BlindDates.maskName(session, st.getName())));
            if ("PORTFOLIO".equals(mode)) {
                SessionStock ss = new SessionStock();
                ss.setSessionId(session.getSessionId());
                ss.setSlot(slot);
                ss.setStockId(stockIds.get(slot));
                sessionStockRepository.save(ss);
            }
        }

        Stock stock = marketData.load(stockIds.get(0)).stock();
        return new StartGameResponse(
                session.getSessionId(),
                BlindDates.maskCode(session, stock.getCode()),
                BlindDates.maskName(session, stock.getName()),
                stock.getMarket().name(), stock.getMarket().getLotSize(),
                BlindDates.mask(session, startDate),
                props.getInitialCash(), props.ticksFor(mode), aiLevel.name(),
                mode, advanced, realRules, stocks, session.getStatus().name(),
                null, false);
    }

    /**
     * 开局后补写限制条件 (同事务, 托管实体提交时落库)。
     * 不塞进 persistSession 的参数列表: 竞技入口 (每日/房间/事件) 不支持限制条件。
     */
    private StartGameResponse withConstraints(StartGameResponse res, Integer maxTrades, boolean requireReason) {
        if (maxTrades == null && !requireReason) {
            return res;
        }
        GameSession session = sessionRepository.findById(res.sessionId()).orElseThrow();
        session.setMaxTrades(maxTrades);
        session.setRequireReason(requireReason);
        return new StartGameResponse(res.sessionId(), res.stockCode(), res.stockName(), res.market(),
                res.lotSize(), res.startDate(), res.initialCash(), res.totalTicks(), res.aiLevel(),
                res.mode(), res.advanced(), res.realRules(), res.stocks(), res.status(),
                maxTrades, requireReason);
    }

    private AiLevel parseAiLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return AiLevel.NORMAL;
        }
        return Enums.parse(raw, AiLevel.class, " AI 难度");
    }

    private Market parseMarket(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return Enums.parse(raw, Market.class, "市场");
    }

    private String parseMode(String raw) {
        if (raw == null || raw.isBlank()) {
            return "CLASSIC";
        }
        String mode = raw.trim().toUpperCase();
        if (!mode.equals("CLASSIC") && !mode.equals("PORTFOLIO") && !mode.equals("SURVIVAL")
                && !mode.equals("INTRO")) {
            throw new BusinessException("未知模式: " + raw + "（可选 CLASSIC / PORTFOLIO / SURVIVAL / INTRO）");
        }
        return mode;
    }
}
