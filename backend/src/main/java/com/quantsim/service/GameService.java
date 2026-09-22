package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.AiStatus;
import com.quantsim.dto.GameDtos.HistoryResponse;
import com.quantsim.dto.GameDtos.KlinePoint;
import com.quantsim.dto.GameDtos.PredictionDay;
import com.quantsim.dto.GameDtos.PredictionInfo;
import com.quantsim.dto.GameDtos.SettleResponse;
import com.quantsim.dto.GameDtos.StartGameRequest;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.dto.GameDtos.StatusResponse;
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
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MarketDataService.StockData;

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
    private final GameProperties props;

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

        // 一条 GROUP BY 拿全部股票数据量, 随机挑一只数据量足够的:
        // 起点前至少 minHistoryDays 天, 起点后至少 totalTicks 天
        Map<Long, Long> counts = priceRepository.countGroupByStock().stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
        if (counts.isEmpty()) {
            throw new BusinessException("股票池为空, 请先运行数据管道导入行情数据");
        }
        Map<Long, Market> marketById = stockRepository.findAll().stream()
                .collect(Collectors.toMap(Stock::getStockId, Stock::getMarket));
        int required = props.getMinHistoryDays() + props.getTotalTicks() + 1;
        List<Long> eligible = counts.entrySet().stream()
                .filter(e -> e.getValue() >= required)
                .filter(e -> market == null || marketById.get(e.getKey()) == market)
                .map(Map.Entry::getKey)
                .toList();
        if (eligible.isEmpty()) {
            throw new BusinessException(market == null
                    ? "没有数据量足够的股票, 请检查行情数据"
                    : "该市场暂无数据量足够的标的, 请先运行数据管道导入行情数据");
        }
        ThreadLocalRandom random = ThreadLocalRandom.current();
        Long stockId = eligible.get(random.nextInt(eligible.size()));
        long total = counts.get(stockId);

        int minIdx = props.getMinHistoryDays() - 1;
        int maxIdx = (int) total - props.getTotalTicks() - 1;
        int startIdx = minIdx + random.nextInt(maxIdx - minIdx + 1);
        StockData sd = marketData.load(stockId);
        LocalDate startDate = sd.prices().get(startIdx).getTradeDate();

        GameSession session = new GameSession();
        session.setUserId(user.getUserId());
        session.setStockId(stockId);
        session.setStartDate(startDate);
        session.setCurrentTradeDate(startDate);
        session.setInitialCash(props.getInitialCash());
        session.setAiCash(props.getInitialCash());
        session.setAiModel(aiLevel.getModel());
        session = sessionRepository.save(session);

        Account account = new Account();
        account.setSessionId(session.getSessionId());
        account.setCashBalance(props.getInitialCash());
        accountRepository.save(account);

        Stock stock = sd.stock();
        return new StartGameResponse(
                session.getSessionId(), stock.getCode(), stock.getName(),
                stock.getMarket().name(), stock.getMarket().getLotSize(),
                startDate, props.getInitialCash(), props.getTotalTicks(), aiLevel.name());
    }

    @Transactional(readOnly = true)
    public HistoryResponse getHistory(Long sessionId) {
        GameSession session = getSession(sessionId);
        StockData sd = marketData.load(session.getStockId());
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

        SettleResponse settleResult = null;
        boolean settled = daysElapsed >= props.getTotalTicks();
        if (settled) {
            settleResult = doSettle(session);
        }
        sessionRepository.save(session);

        // 内嵌账户快照, 前端 tick 后无需再请求 /status
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        StatusResponse status = buildStatus(session, account, sd);

        return new TickResponse(next.getTradeDate(), daysElapsed, props.getTotalTicks(),
                settled, bar, settleResult, status);
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

        StockData sd = marketData.load(session.getStockId());
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
        BigDecimal amount = price.multiply(BigDecimal.valueOf(shares));

        if (direction == TradeTransaction.Direction.BUY) {
            if (account.getCashBalance().compareTo(amount) < 0) {
                throw new BusinessException("现金余额不足");
            }
            BigDecimal oldValue = account.getHoldingCost()
                    .multiply(BigDecimal.valueOf(account.getHoldingShares()));
            int newShares = account.getHoldingShares() + shares;
            account.setCashBalance(account.getCashBalance().subtract(amount));
            account.setHoldingShares(newShares);
            account.setHoldingCost(oldValue.add(amount)
                    .divide(BigDecimal.valueOf(newShares), 2, RoundingMode.HALF_UP));
        } else {
            if (account.getHoldingShares() < shares) {
                throw new BusinessException("持仓股数不足");
            }
            int newShares = account.getHoldingShares() - shares;
            account.setCashBalance(account.getCashBalance().add(amount));
            account.setHoldingShares(newShares);
            if (newShares == 0) {
                account.setHoldingCost(BigDecimal.ZERO);
            }
        }
        accountRepository.save(account);

        TradeTransaction tx = new TradeTransaction();
        tx.setSessionId(sessionId);
        tx.setTradeDate(session.getCurrentTradeDate());
        tx.setDirection(direction);
        tx.setPrice(price);
        tx.setShares(shares);
        transactionRepository.save(tx);

        return new TradeResponse(account.getCashBalance(),
                account.getHoldingShares(), account.getHoldingCost());
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

        BigDecimal finalAssets = account.getCashBalance()
                .add(settleClose.multiply(BigDecimal.valueOf(account.getHoldingShares())));
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

    /** AI 用当日预测决策, 按当日收盘价全仓买入/清仓 (整手交易, 与玩家同规则)。 */
    private void applyAiTrade(GameSession session, StockData sd) {
        DailyPrediction pred = sd.prediction(session.getCurrentTradeDate(), session.getAiModel());
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        if (pred == null || bar == null) {
            return;
        }
        int lotSize = sd.stock().getMarket().getLotSize();
        BigDecimal close = bar.getClose();
        double probUp = pred.getProbUp().doubleValue();
        if (probUp >= props.getAiBuyThreshold()) {
            int shares = TradeMath.maxWholeShares(session.getAiCash(), close, lotSize);
            if (shares > 0) {
                session.setAiCash(session.getAiCash()
                        .subtract(close.multiply(BigDecimal.valueOf(shares))));
                session.setAiShares(session.getAiShares() + shares);
            }
        } else if (probUp <= props.getAiSellThreshold() && session.getAiShares() > 0) {
            session.setAiCash(session.getAiCash()
                    .add(close.multiply(BigDecimal.valueOf(session.getAiShares()))));
            session.setAiShares(0);
        }
    }

    /** 基准一: 开局收盘价全仓买入并持有到结算。 */
    private BigDecimal buyAndHoldReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        int lotSize = sd.stock().getMarket().getLotSize();
        BigDecimal startClose = sd.prices().get(startIdx).getClose();
        BigDecimal endClose = sd.prices().get(endIdx).getClose();
        int shares = TradeMath.maxWholeShares(initial, startClose, lotSize);
        BigDecimal finalAssets = initial
                .subtract(startClose.multiply(BigDecimal.valueOf(shares)))
                .add(endClose.multiply(BigDecimal.valueOf(shares)));
        return TradeMath.returnRate(finalAssets, initial);
    }

    /** 基准二: MA5 上穿 MA20 全仓买入, 下穿清仓, 按当日收盘价成交。 */
    private BigDecimal maCrossReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        int lotSize = sd.stock().getMarket().getLotSize();
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
                int bought = TradeMath.maxWholeShares(cash, close, lotSize);
                if (bought > 0) {
                    shares = bought;
                    cash = cash.subtract(close.multiply(BigDecimal.valueOf(shares)));
                }
            } else if (cmp < 0 && shares > 0) {
                cash = cash.add(close.multiply(BigDecimal.valueOf(shares)));
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

        BigDecimal marketValue = currentPrice.multiply(BigDecimal.valueOf(account.getHoldingShares()));
        BigDecimal totalAssets = account.getCashBalance().add(marketValue);
        BigDecimal floatingPnl = marketValue.subtract(
                account.getHoldingCost().multiply(BigDecimal.valueOf(account.getHoldingShares())));
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

        return new StatusResponse(
                session.getSessionId(), session.getStatus().name(), session.getCurrentTradeDate(),
                session.getDaysElapsed(), props.getTotalTicks(),
                account.getCashBalance(), account.getHoldingShares(), account.getHoldingCost(),
                currentPrice, marketValue, totalAssets, floatingPnl, returnRate,
                prediction, ai);
    }

    private AiLevel parseAiLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return AiLevel.NORMAL;
        }
        try {
            return AiLevel.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知 AI 难度: " + raw + "（可选 EASY / NORMAL / HARD）");
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
