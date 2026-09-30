package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.AiStatus;
import com.quantsim.dto.GameDtos.HistoryResponse;
import com.quantsim.dto.GameDtos.KlinePoint;
import com.quantsim.dto.GameDtos.NewsItem;
import com.quantsim.dto.GameDtos.OrderInfo;
import com.quantsim.dto.GameDtos.PlaceOrderRequest;
import com.quantsim.dto.GameDtos.PositionInfo;
import com.quantsim.dto.GameDtos.PredictionDay;
import com.quantsim.dto.GameDtos.PredictionInfo;
import com.quantsim.dto.GameDtos.SettleResponse;
import com.quantsim.dto.GameDtos.StartGameRequest;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.dto.GameDtos.StatusResponse;
import com.quantsim.dto.GameDtos.StockLite;
import com.quantsim.dto.GameDtos.TickResponse;
import com.quantsim.dto.GameDtos.TradeRequest;
import com.quantsim.dto.GameDtos.TradeResponse;
import com.quantsim.entity.Account;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.SessionStock;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.SessionStockRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MarketDataService.StockData;
import com.quantsim.service.OrderService.FillSummary;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GameService {

    private final StockRepository stockRepository;
    private final DailyPriceRepository priceRepository;
    private final MarketDataService marketData;
    private final UserService userService;
    private final GameSessionRepository sessionRepository;
    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final SessionStockRepository sessionStockRepository;
    private final TradeEngine tradeEngine;
    private final FeeCalculator feeCalculator;
    private final OrderService orderService;
    private final NewsService newsService;
    private final GameProperties props;

    public static final ZoneId GAME_ZONE = ZoneId.of("Asia/Shanghai");

    /** probUp 达到该值即视为"预测上涨"。 */
    private static final double PROB_UP_THRESHOLD = 0.5;

    // 风格画像标签及判定阈值
    private static final String STYLE_WATCHER = "WATCHER";
    private static final String STYLE_CHASER = "CHASER";
    private static final String STYLE_ACTIVE = "ACTIVE";
    private static final String STYLE_HOLDER = "HOLDER";
    private static final String STYLE_SWING = "SWING";
    private static final int CHASER_MIN_TRADES = 3;
    private static final double CHASER_RATIO = 0.7;
    private static final int ACTIVE_MIN_TRADES = 8;
    private static final int HOLDER_MAX_TRADES = 2;

    @Transactional
    public StartGameResponse startGame(StartGameRequest request) {
        // trim 防止 " alice" 和 "alice" 被当成两个用户
        String username = request.username().trim();
        if (username.isEmpty()) {
            throw new BusinessException("用户名不能为空");
        }
        User user = userService.findOrCreate(username);
        Market market = parseMarket(request.market());
        AiLevel aiLevel = parseAiLevel(request.aiLevel());
        String mode = parseMode(request.mode());
        boolean advanced = Boolean.TRUE.equals(request.advanced());
        if (advanced && market != Market.US && market != Market.CRYPTO) {
            throw new BusinessException("进阶模式（做空/杠杆）仅支持美股或币圈, 请先选定市场");
        }

        Map<Long, Long> counts = eligibleCounts();
        Map<Long, Market> marketById = stockRepository.findAll().stream()
                .collect(Collectors.toMap(Stock::getStockId, Stock::getMarket));
        List<Long> eligible = filterEligible(counts, marketById, market);
        if (eligible.isEmpty()) {
            throw new BusinessException(market == null
                    ? "没有数据量足够的股票, 请检查行情数据"
                    : "该市场暂无数据量足够的标的, 请先运行数据管道导入行情数据");
        }
        ThreadLocalRandom random = ThreadLocalRandom.current();

        if ("PORTFOLIO".equals(mode)) {
            return startPortfolio(user, eligible, marketById, counts, aiLevel, advanced, random);
        }

        Long stockId = eligible.get(random.nextInt(eligible.size()));
        int startIdx = randomStartIdx(counts.get(stockId), random);
        LocalDate startDate = marketData.load(stockId).prices().get(startIdx).getTradeDate();
        return persistSession(user, List.of(stockId), startDate, aiLevel, "CLASSIC", advanced, null);
    }

    /** 每日挑战 / 房间等确定性开局: 由调用方指定标的与起始日。 */
    @Transactional
    public StartGameResponse startGameAt(User user, Long stockId, LocalDate startDate,
                                         AiLevel aiLevel, String mode, LocalDate challengeDate) {
        return persistSession(user, List.of(stockId), startDate, aiLevel, mode, false, challengeDate);
    }

    /** 供确定性开局挑选标的: 合格标的按 stockId 排序 + 指定随机源。 */
    @Transactional(readOnly = true)
    public long[] pickDeterministic(Market market, Random random) {
        Map<Long, Long> counts = eligibleCounts();
        Map<Long, Market> marketById = stockRepository.findAll().stream()
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
                .filter(e -> market == null || marketById.get(e.getKey()) == market)
                .map(Map.Entry::getKey)
                .toList();
    }

    private int randomStartIdx(long total, Random random) {
        int minIdx = props.getMinHistoryDays() - 1;
        int maxIdx = (int) total - props.getTotalTicks() - 1;
        return minIdx + random.nextInt(maxIdx - minIdx + 1);
    }

    /** 组合模式: 同市场挑 3 只窗口对齐的标的。 */
    private StartGameResponse startPortfolio(User user, List<Long> eligible,
                                             Map<Long, Market> marketById, Map<Long, Long> counts,
                                             AiLevel aiLevel, boolean advanced, ThreadLocalRandom random) {
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

        List<Long> picked = new ArrayList<>();
        picked.add(primary);
        for (int i = 1; i < pool.size() && picked.size() < props.getPortfolioSize(); i++) {
            StockData sd = marketData.load(pool.get(i));
            if (sd.indexOf(startDate) != null && sd.indexOf(endDate) != null
                    && sd.indexOf(startDate) >= props.getMinHistoryDays() - 1) {
                picked.add(pool.get(i));
            }
        }
        if (picked.size() < props.getPortfolioSize()) {
            throw new BusinessException("未找到窗口对齐的 " + props.getPortfolioSize() + " 只标的, 请再试一次");
        }
        return persistSession(user, picked, startDate, aiLevel, "PORTFOLIO", advanced, null);
    }

    private StartGameResponse persistSession(User user, List<Long> stockIds, LocalDate startDate,
                                             AiLevel aiLevel, String mode, boolean advanced,
                                             LocalDate challengeDate) {
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
        session.setSeason(YearMonth.now(GAME_ZONE).toString());
        session.setChallengeDate(challengeDate);
        session = sessionRepository.save(session);

        Account account = new Account();
        account.setSessionId(session.getSessionId());
        account.setCashBalance(props.getInitialCash());
        accountRepository.save(account);

        List<StockLite> stocks = new ArrayList<>();
        for (int slot = 0; slot < stockIds.size(); slot++) {
            Stock st = marketData.load(stockIds.get(slot)).stock();
            stocks.add(new StockLite(st.getCode(), st.getName()));
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
                session.getSessionId(), stock.getCode(), stock.getName(),
                stock.getMarket().name(), stock.getMarket().getLotSize(),
                startDate, props.getInitialCash(), props.getTotalTicks(), aiLevel.name(),
                mode, advanced, stocks, session.getStatus().name());
    }

    /** 用于恢复/接管已有对局 (房间/每日挑战): 把会话描述成开局响应。 */
    @Transactional(readOnly = true)
    public StartGameResponse describe(Long sessionId) {
        GameSession session = getSession(sessionId);
        Stock stock = marketData.load(session.getStockId()).stock();
        List<StockLite> stocks = tradeEngine.stockIds(session).stream()
                .map(sid -> {
                    Stock st = marketData.load(sid).stock();
                    return new StockLite(st.getCode(), st.getName());
                })
                .toList();
        String levelName = AiLevel.NORMAL.name();
        for (AiLevel level : AiLevel.values()) {
            if (level.getModel().equals(session.getAiModel())) {
                levelName = level.name();
                break;
            }
        }
        return new StartGameResponse(session.getSessionId(), stock.getCode(), stock.getName(),
                stock.getMarket().name(), stock.getMarket().getLotSize(),
                session.getStartDate(), session.getInitialCash(), props.getTotalTicks(),
                levelName, session.getMode(), session.isAdvanced(), stocks,
                session.getStatus().name());
    }

    @Transactional(readOnly = true)
    public HistoryResponse getHistory(Long sessionId, String stockCode) {
        GameSession session = getSession(sessionId);
        Long stockId = resolveStock(session, stockCode);
        StockData sd = marketData.load(stockId);
        Stock stock = sd.stock();

        Integer startIdx = sd.indexOf(session.getStartDate());
        if (startIdx == null) {
            throw new BusinessException("起始日期行情缺失: " + session.getStartDate());
        }
        Integer curIdx = sd.indexOf(session.getCurrentTradeDate());
        if (curIdx == null) {
            throw new BusinessException("当前交易日行情缺失: " + session.getCurrentTradeDate());
        }

        // 起始日往前 historyDays 根 + 起始日到当前日的已推进部分
        int fromIdx = Math.max(0, startIdx - props.getHistoryDays() + 1);
        List<KlinePoint> klines = sd.prices().subList(fromIdx, curIdx + 1).stream()
                .map(p -> toKlinePoint(p, sd.indicators().get(p.getTradeDate())))
                .toList();
        return new HistoryResponse(
                sessionId, stock.getCode(), stock.getName(),
                session.getStartDate(), session.getCurrentTradeDate(), klines);
    }

    @Transactional
    public TickResponse tick(Long sessionId) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);
        StockData sd = marketData.load(session.getStockId());

        Integer curIdx = sd.indexOf(session.getCurrentTradeDate());
        if (curIdx == null || curIdx + 1 >= sd.prices().size()) {
            throw new BusinessException("行情数据已到尽头, 请结算");
        }
        DailyPrice next = sd.prices().get(curIdx + 1);

        // AI 在推进前用今日预测决策, 按今日收盘价成交 (只用已揭晓的数据, 无未来泄漏)
        applyAiTrade(session, sd);

        session.setCurrentTradeDate(next.getTradeDate());
        session.setDaysElapsed(session.getDaysElapsed() + 1);
        int daysElapsed = session.getDaysElapsed();

        KlinePoint bar = toKlinePoint(next, sd.indicators().get(next.getTradeDate()));

        // 新交易日揭晓后: 撮合挂单 -> 进阶模式保证金检查
        Account account = accountRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        FillSummary fills = orderService.fillOrders(session, account);

        boolean liquidatedNow = false;
        if (session.isAdvanced() && !session.isLiquidated()) {
            Map<Long, BigDecimal> closes = tradeEngine.currentCloses(session);
            if (tradeEngine.equity(session, account, closes).signum() <= 0) {
                forceLiquidate(session, account, closes);
                liquidatedNow = true;
            }
        }
        accountRepository.save(account);

        SettleResponse settleResult = null;
        boolean settled = liquidatedNow || daysElapsed >= props.getTotalTicks();
        if (settled) {
            settleResult = doSettle(session);
        }
        sessionRepository.save(session);

        // 内嵌账户快照, 前端 tick 后无需再请求 /status
        StatusResponse status = buildStatus(session, account, sd);
        List<NewsItem> news = newsService.eventsFor(sd.stock(), next.getTradeDate());

        return new TickResponse(next.getTradeDate(), daysElapsed, props.getTotalTicks(),
                settled, bar, settleResult, status,
                fills.filled(), fills.autoCancelled(), liquidatedNow, news);
    }

    /** 净值归零强平: 全部持仓按现价了结 (含费用), 现金落定。 */
    private void forceLiquidate(GameSession session, Account account, Map<Long, BigDecimal> closes) {
        for (Map.Entry<Long, Integer> e : tradeEngine.sharesByStock(session, account).entrySet()) {
            int shares = e.getValue();
            if (shares == 0) {
                continue;
            }
            BigDecimal price = closes.getOrDefault(e.getKey(), BigDecimal.ZERO);
            if (price.signum() <= 0) {
                continue; // 无有效价格时不能按 0 元"平仓"毁掉仓位
            }
            TradeTransaction.Direction dir = shares > 0
                    ? TradeTransaction.Direction.SELL : TradeTransaction.Direction.BUY;
            tradeEngine.execute(session, account, e.getKey(), dir, price, Math.abs(shares));
        }
        session.setLiquidated(true);
    }

    @Transactional
    public TradeResponse trade(Long sessionId, TradeRequest request) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);

        TradeTransaction.Direction direction;
        try {
            direction = TradeTransaction.Direction.valueOf(request.direction().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("direction 必须是 BUY 或 SELL");
        }

        BigDecimal price = request.price();
        if (price.stripTrailingZeros().scale() > 2) {
            throw new BusinessException("委托价最多两位小数");
        }
        price = price.setScale(2, RoundingMode.UNNECESSARY);

        Long stockId = resolveStock(session, request.stockCode());
        StockData sd = marketData.load(stockId);
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        if (bar == null) {
            throw new BusinessException("当前交易日行情缺失");
        }
        if (price.compareTo(bar.getLow()) < 0 || price.compareTo(bar.getHigh()) > 0) {
            throw new BusinessException(String.format(
                    "委托价 %s 超出当日价格区间 [%s, %s]", price, bar.getLow(), bar.getHigh()));
        }

        Account account = accountRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));

        int shares = request.shares();
        int lotSize = sd.stock().getMarket().getLotSize();
        if (shares % lotSize != 0) {
            throw new BusinessException("数量必须为 " + lotSize + " 的整数倍（整手交易）");
        }

        String error = tradeEngine.validate(session, account, stockId, direction, price, shares);
        if (error != null) {
            throw new BusinessException(error);
        }
        BigDecimal fee = tradeEngine.execute(session, account, stockId, direction, price, shares);
        accountRepository.save(account);

        return new TradeResponse(account.getCashBalance(),
                account.getHoldingShares(), account.getHoldingCost(), fee);
    }

    // ---------- 挂单 ----------

    @Transactional
    public OrderInfo placeOrder(Long sessionId, PlaceOrderRequest request) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);
        Long stockId = resolveStock(session, request.stockCode());
        return orderService.place(session, stockId, request.orderType(), request.price(), request.shares());
    }

    @Transactional(readOnly = true)
    public List<OrderInfo> listOrders(Long sessionId) {
        return orderService.list(getSession(sessionId));
    }

    @Transactional
    public List<OrderInfo> cancelOrder(Long sessionId, Long orderId) {
        GameSession session = getSessionWithLock(sessionId);
        orderService.cancel(session, orderId);
        return orderService.list(session);
    }

    @Transactional(readOnly = true)
    public StatusResponse getStatus(Long sessionId) {
        GameSession session = getSession(sessionId);
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        return buildStatus(session, account, marketData.load(session.getStockId()));
    }

    @Transactional
    public SettleResponse settle(Long sessionId) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);
        SettleResponse result = doSettle(session);
        sessionRepository.save(session);
        return result;
    }

    private SettleResponse doSettle(GameSession session) {
        Account account = accountRepository.findWithLockBySessionId(session.getSessionId())
                .orElseThrow(() -> new NotFoundException("账户不存在"));

        StockData sd = marketData.load(session.getStockId());
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        if (bar == null) {
            throw new BusinessException("结算日行情缺失");
        }
        BigDecimal settleClose = bar.getClose();
        BigDecimal initial = session.getInitialCash();

        // 净值口径: 现金 + Σ 持仓×收盘 (组合模式聚合全部标的, 空头为负)
        Map<Long, BigDecimal> closes = tradeEngine.currentCloses(session);
        BigDecimal finalAssets = tradeEngine.equity(session, account, closes);
        BigDecimal returnRate = TradeMath.returnRate(finalAssets, initial);

        BigDecimal aiFinal = null;
        BigDecimal aiReturn = null;
        if (aiInitialized(session)) {
            aiFinal = session.getAiCash()
                    .add(settleClose.multiply(BigDecimal.valueOf(session.getAiShares())));
            aiReturn = TradeMath.returnRate(aiFinal, initial);
        }

        Integer startIdx = sd.indexOf(session.getStartDate());
        Integer endIdx = sd.indexOf(session.getCurrentTradeDate());
        BigDecimal holdReturn = null;
        BigDecimal maCrossReturn = null;
        List<PredictionDay> predictionDays = List.of();
        if (startIdx != null && endIdx != null) {
            holdReturn = buyAndHoldReturn(sd, startIdx, endIdx, initial);
            maCrossReturn = maCrossReturn(sd, startIdx, endIdx, initial);
            predictionDays = predictionDays(session, sd, startIdx, endIdx);
        }
        String styleTag = styleTag(session, sd);

        session.setStatus(GameSession.Status.SETTLED);
        session.setFinalReturnRate(returnRate);

        return new SettleResponse(session.getSessionId(), initial,
                finalAssets, returnRate, aiFinal, aiReturn, holdReturn, maCrossReturn,
                predictionDays, styleTag);
    }

    /** 逐日复盘 AI 预测: 每天的"次日涨跌"预测 vs 实际走势 (最后一天没有次日, 不计入)。 */
    private List<PredictionDay> predictionDays(GameSession session, StockData sd, int startIdx, int endIdx) {
        List<PredictionDay> days = new ArrayList<>();
        for (int i = startIdx; i < endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyPrediction pred = sd.prediction(p.getTradeDate(), session.getAiModel());
            if (pred == null) {
                continue;
            }
            boolean predictedUp = pred.getProbUp().doubleValue() >= PROB_UP_THRESHOLD;
            boolean actualUp = sd.prices().get(i + 1).getClose().compareTo(p.getClose()) > 0;
            days.add(new PredictionDay(p.getTradeDate(), predictedUp, predictedUp == actualUp));
        }
        return days;
    }

    /** 规则式风格画像: 观望者/追涨杀跌/高频交易/佛系持有/波段操作。 */
    private String styleTag(GameSession session, StockData sd) {
        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        if (txs.isEmpty()) {
            return STYLE_WATCHER;
        }
        int withSign = 0;
        int chase = 0;
        for (TradeTransaction tx : txs) {
            DailyIndicator ind = sd.indicators().get(tx.getTradeDate());
            if (ind == null || ind.getPctChange() == null || ind.getPctChange().signum() == 0) {
                continue;
            }
            withSign++;
            boolean buy = tx.getDirection() == TradeTransaction.Direction.BUY;
            boolean up = ind.getPctChange().signum() > 0;
            if (buy == up) {
                chase++;
            }
        }
        if (txs.size() >= CHASER_MIN_TRADES && withSign > 0 && chase >= withSign * CHASER_RATIO) {
            return STYLE_CHASER;
        }
        if (txs.size() >= ACTIVE_MIN_TRADES) {
            return STYLE_ACTIVE;
        }
        if (txs.size() <= HOLDER_MAX_TRADES) {
            return STYLE_HOLDER;
        }
        return STYLE_SWING;
    }

    /**
     * AI 用当日预测决策, 按当日收盘价成交 (整手、扣费, 与玩家同规则)。
     * EASY 保留全进全出; 其余难度按置信度调仓: 目标仓位比例 = clamp((probUp-0.5)/0.15, 0, 1)。
     */
    private void applyAiTrade(GameSession session, StockData sd) {
        DailyPrediction pred = sd.prediction(session.getCurrentTradeDate(), session.getAiModel());
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        if (pred == null || bar == null) {
            return;
        }
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        BigDecimal close = bar.getClose();
        double probUp = pred.getProbUp().doubleValue();

        if (AiLevel.EASY.getModel().equals(session.getAiModel())) {
            // 简单 AI: 老式全进全出
            if (probUp >= props.getAiBuyThreshold()) {
                aiBuy(session, market, close, maxAffordableShares(session.getAiCash(), close, lotSize, market));
            } else if (probUp <= props.getAiSellThreshold() && session.getAiShares() > 0) {
                aiSell(session, market, close, session.getAiShares());
            }
            return;
        }

        // 高难度 AI: 按置信度目标仓位调仓
        double targetFraction = Math.max(0, Math.min(1, (probUp - 0.5) / 0.15));
        BigDecimal aiEquity = session.getAiCash()
                .add(close.multiply(BigDecimal.valueOf(session.getAiShares())));
        BigDecimal targetValue = aiEquity.multiply(BigDecimal.valueOf(targetFraction));
        int targetShares = targetValue.divide(close, 0, RoundingMode.DOWN).intValue() / lotSize * lotSize;
        int delta = targetShares - session.getAiShares();
        if (delta > 0) {
            int affordable = maxAffordableShares(session.getAiCash(), close, lotSize, market);
            aiBuy(session, market, close, Math.min(delta, affordable));
        } else if (delta < 0) {
            aiSell(session, market, close, -delta);
        }
    }

    private void aiBuy(GameSession session, Market market, BigDecimal close, int shares) {
        if (shares <= 0) {
            return;
        }
        BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
        session.setAiCash(session.getAiCash().subtract(gross).subtract(fee));
        session.setAiShares(session.getAiShares() + shares);
    }

    private void aiSell(GameSession session, Market market, BigDecimal close, int shares) {
        if (shares <= 0) {
            return;
        }
        BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross);
        session.setAiCash(session.getAiCash().add(gross).subtract(fee));
        session.setAiShares(session.getAiShares() - shares);
    }

    /** 现金能买到的最大整手数, 含买入费用 (对齐真实约束, 各策略基准共用)。 */
    private int maxAffordableShares(BigDecimal cash, BigDecimal price, int lotSize, Market market) {
        int shares = TradeMath.maxWholeShares(cash, price, lotSize);
        while (shares > 0) {
            BigDecimal gross = price.multiply(BigDecimal.valueOf(shares));
            BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
            if (gross.add(fee).compareTo(cash) <= 0) {
                break;
            }
            shares -= lotSize;
        }
        return Math.max(0, shares);
    }

    /** 基准一: 开局收盘价全仓买入并持有到结算 (与玩家同口径扣费)。 */
    private BigDecimal buyAndHoldReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        BigDecimal startClose = sd.prices().get(startIdx).getClose();
        BigDecimal endClose = sd.prices().get(endIdx).getClose();
        int shares = maxAffordableShares(initial, startClose, lotSize, market);
        BigDecimal buyGross = startClose.multiply(BigDecimal.valueOf(shares));
        BigDecimal buyFee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, buyGross);
        BigDecimal finalAssets = initial.subtract(buyGross).subtract(buyFee)
                .add(endClose.multiply(BigDecimal.valueOf(shares)));
        return TradeMath.returnRate(finalAssets, initial);
    }

    /** 基准二: MA5 上穿 MA20 全仓买入, 下穿清仓, 按当日收盘价成交 (含费用)。 */
    private BigDecimal maCrossReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        BigDecimal cash = initial;
        int shares = 0;
        for (int i = startIdx; i <= endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyIndicator ind = sd.indicators().get(p.getTradeDate());
            if (ind == null || ind.getMa5() == null || ind.getMa20() == null) {
                continue;
            }
            BigDecimal close = p.getClose();
            int cmp = ind.getMa5().compareTo(ind.getMa20());
            if (cmp > 0 && shares == 0) {
                int bought = maxAffordableShares(cash, close, lotSize, market);
                if (bought > 0) {
                    shares = bought;
                    BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
                    cash = cash.subtract(gross)
                            .subtract(feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross));
                }
            } else if (cmp < 0 && shares > 0) {
                BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
                cash = cash.add(gross)
                        .subtract(feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross));
                shares = 0;
            }
        }
        BigDecimal endClose = sd.prices().get(endIdx).getClose();
        BigDecimal finalAssets = cash.add(endClose.multiply(BigDecimal.valueOf(shares)));
        return TradeMath.returnRate(finalAssets, initial);
    }

    // ---------- helpers ----------

    private StatusResponse buildStatus(GameSession session, Account account, StockData sd) {
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        BigDecimal currentPrice = bar == null ? BigDecimal.ZERO : bar.getClose();

        Map<Long, BigDecimal> closes = tradeEngine.currentCloses(session);
        BigDecimal totalAssets = tradeEngine.equity(session, account, closes);
        BigDecimal exposure = tradeEngine.exposure(session, account, closes);
        BigDecimal marketValue = totalAssets.subtract(account.getCashBalance());
        BigDecimal floatingPnl;
        List<PositionInfo> positions = null;
        if ("PORTFOLIO".equals(session.getMode())) {
            positions = new ArrayList<>();
            floatingPnl = BigDecimal.ZERO;
            for (Long sid : tradeEngine.stockIds(session)) {
                StockData ssd = marketData.load(sid);
                var pos = tradeEngine.position(session, account, sid);
                BigDecimal close = closes.getOrDefault(sid, BigDecimal.ZERO);
                BigDecimal value = close.multiply(BigDecimal.valueOf(pos.shares()));
                floatingPnl = floatingPnl.add(value.subtract(
                        pos.avgCost().multiply(BigDecimal.valueOf(pos.shares()))));
                positions.add(new PositionInfo(ssd.stock().getCode(), ssd.stock().getName(),
                        pos.shares(), pos.avgCost(), close, value));
            }
        } else {
            floatingPnl = marketValue.subtract(
                    account.getHoldingCost().multiply(BigDecimal.valueOf(account.getHoldingShares())));
        }
        BigDecimal returnRate = TradeMath.returnRate(totalAssets, session.getInitialCash());

        DailyPrediction pred = sd.prediction(session.getCurrentTradeDate(), session.getAiModel());
        PredictionInfo prediction = pred == null ? null
                : new PredictionInfo(pred.getPredictedDirection(), pred.getProbUp());

        AiStatus ai = null;
        if (aiInitialized(session)) {
            BigDecimal aiTotal = session.getAiCash()
                    .add(currentPrice.multiply(BigDecimal.valueOf(session.getAiShares())));
            ai = new AiStatus(session.getAiCash(), session.getAiShares(),
                    aiTotal, TradeMath.returnRate(aiTotal, session.getInitialCash()));
        }

        BigDecimal feesPaid = transactionRepository.sumFeesBySessionId(session.getSessionId());
        BigDecimal marginRatio = null;
        if (session.isAdvanced() && exposure.signum() > 0) {
            marginRatio = totalAssets.divide(exposure, 4, RoundingMode.HALF_UP);
        }

        return new StatusResponse(
                session.getSessionId(), session.getStatus().name(), session.getCurrentTradeDate(),
                session.getDaysElapsed(), props.getTotalTicks(),
                account.getCashBalance(), account.getHoldingShares(), account.getHoldingCost(),
                currentPrice, marketValue, totalAssets, floatingPnl, returnRate,
                prediction, ai,
                session.getMode(), session.isAdvanced(), session.isLiquidated(),
                feesPaid == null ? BigDecimal.ZERO : feesPaid, marginRatio, positions);
    }

    /** stockCode 为空 -> 主标的; 组合模式校验必须在标的清单内。 */
    private Long resolveStock(GameSession session, String stockCode) {
        if (stockCode == null || stockCode.isBlank()) {
            return session.getStockId();
        }
        for (Long sid : tradeEngine.stockIds(session)) {
            if (marketData.load(sid).stock().getCode().equals(stockCode.trim())) {
                return sid;
            }
        }
        throw new BusinessException("标的不在本局清单内: " + stockCode);
    }

    private AiLevel parseAiLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return AiLevel.NORMAL;
        }
        try {
            return AiLevel.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知 AI 难度: " + raw + "（可选 EASY / NORMAL / HARD / HELL）");
        }
    }

    private Market parseMarket(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Market.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知市场: " + raw + "（可选 STOCK / US / CRYPTO）");
        }
    }

    private String parseMode(String raw) {
        if (raw == null || raw.isBlank()) {
            return "CLASSIC";
        }
        String mode = raw.trim().toUpperCase();
        if (!mode.equals("CLASSIC") && !mode.equals("PORTFOLIO")) {
            throw new BusinessException("未知模式: " + raw + "（可选 CLASSIC / PORTFOLIO）");
        }
        return mode;
    }

    private GameSession getSession(Long sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
    }

    private GameSession getSessionWithLock(Long sessionId) {
        return sessionRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
    }

    /** V2 迁移前创建的旧对局 ai_cash/ai_shares 均为 0, 视为无 AI 对手, 避免显示 -100% 收益。 */
    private boolean aiInitialized(GameSession session) {
        return session.getAiCash().signum() > 0 || session.getAiShares() > 0;
    }

    private void requireInProgress(GameSession session) {
        if (session.getStatus() != GameSession.Status.IN_PROGRESS) {
            throw new BusinessException("对局已结算");
        }
    }

    private KlinePoint toKlinePoint(DailyPrice p, DailyIndicator ind) {
        return new KlinePoint(
                p.getTradeDate(), p.getOpen(), p.getHigh(), p.getLow(), p.getClose(), p.getVolume(),
                ind == null ? null : ind.getMa5(),
                ind == null ? null : ind.getMa20(),
                ind == null ? null : ind.getPctChange());
    }
}
