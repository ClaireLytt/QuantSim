package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import com.quantsim.dto.GameDtos.RiskMetrics;
import com.quantsim.dto.GameDtos;
import com.quantsim.dto.GameDtos.BiasReport;
import com.quantsim.dto.GameDtos.SettleResponse;
import com.quantsim.dto.GameDtos.TransactionInfo;
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
import com.quantsim.entity.Position;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.PositionRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserRepository;
import com.quantsim.service.MarketDataService.StockData;
import com.quantsim.service.OrderService.FillSummary;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class GameService {

    private final MarketDataService marketData;
    private final UserRepository userRepository;
    private final GameSessionRepository sessionRepository;
    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final PositionRepository positionRepository;
    private final PointsService pointsService;
    private final TradeEngine tradeEngine;
    private final OrderService orderService;
    private final NewsService newsService;
    private final BiasAnalysisService biasAnalysisService;
    private final com.quantsim.repository.EventScenarioRepository eventScenarioRepository;
    private final com.quantsim.repository.EventTimelineRepository eventTimelineRepository;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final GameProperties props;
    private final GameAiService gameAi;
    private final GameBenchmarks benchmarks;

    public static final ZoneId GAME_ZONE = ZoneId.of("Asia/Shanghai");


    /**
     * 会话级访问控制: 注册用户的对局只有本人可读写, 其他人一律 404 (不泄露存在性)。
     * 游客对局无法绑定身份, 保持开放 (sessionId 不可枚举性有限, 已在 CLAUDE.md 记录)。
     */
    @Transactional(readOnly = true)
    public void requireAccess(Long sessionId, Long authUserId) {
        GameSession session = getSession(sessionId);
        if (session.getUserId() == null || session.getUserId().equals(authUserId)) {
            return;
        }
        User owner = userRepository.findById(session.getUserId()).orElse(null);
        if (owner != null && owner.getPasswordHash() != null) {
            throw new NotFoundException("对局不存在: " + sessionId);
        }
    }

    /** 用于恢复/接管已有对局 (房间/每日挑战): 把会话描述成开局响应。 */
    @Transactional(readOnly = true)
    public StartGameResponse describe(Long sessionId) {
        GameSession session = getSession(sessionId);
        Stock stock = marketData.load(session.getStockId()).stock();
        List<StockLite> stocks = tradeEngine.stockIds(session).stream()
                .map(sid -> {
                    Stock st = marketData.load(sid).stock();
                    return new StockLite(BlindDates.maskCode(session, st.getCode()),
                            BlindDates.maskName(session, st.getName()));
                })
                .toList();
        String levelName = AiLevel.fromModel(session.getAiModel()).name();
        return new StartGameResponse(session.getSessionId(),
                BlindDates.maskCode(session, stock.getCode()),
                BlindDates.maskName(session, stock.getName()),
                stock.getMarket().name(), stock.getMarket().getLotSize(),
                BlindDates.mask(session, session.getStartDate()),
                session.getInitialCash(), props.getTotalTicks(),
                levelName, session.getMode(), session.isAdvanced(), session.isRealRules(), stocks,
                session.getStatus().name(), session.getMaxTrades(), session.isRequireReason());
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
                .map(p -> toKlinePoint(session, sd, p, sd.indicators().get(p.getTradeDate())))
                .toList();
        return new HistoryResponse(
                sessionId,
                BlindDates.maskCode(session, stock.getCode()),
                BlindDates.maskName(session, stock.getName()),
                BlindDates.mask(session, session.getStartDate()),
                BlindDates.mask(session, session.getCurrentTradeDate()), klines);
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
        int aiTradeShares = gameAi.applyAiTrade(session, sd);

        session.setCurrentTradeDate(next.getTradeDate());
        session.setDaysElapsed(session.getDaysElapsed() + 1);
        int daysElapsed = session.getDaysElapsed();

        KlinePoint bar = toKlinePoint(session, sd, next, sd.indicators().get(next.getTradeDate()));

        // 新交易日揭晓后: 隔夜资金计息 -> 撮合挂单 -> 进阶模式保证金检查
        Account account = accountRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        accrueInterest(session, account);
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
        // 竞技模式不下发新闻: 事件文本 (如 "924行情") 会暴露隐藏窗口的真实时间
        List<NewsItem> news = BlindDates.blind(session)
                ? List.of() : newsService.eventsFor(sd.stock(), next.getTradeDate());

        return new TickResponse(BlindDates.mask(session, next.getTradeDate()), daysElapsed, props.getTotalTicks(),
                settled, bar, settleResult, status,
                fills.filled(), fills.autoCancelled(), liquidatedNow, news, aiTradeShares);
    }

    /**
     * 明日快讯预告: 在揭晓次日 K 线之前先下发事件, 给玩家"要不要先调仓"的决策时刻。
     * 只透露事件文本不透露行情, 是设计好的信息差玩法; 竞技模式 (防剧透) 不提供。
     */
    @Transactional(readOnly = true)
    public List<NewsItem> upcomingNews(Long sessionId) {
        GameSession session = getSession(sessionId);
        if (session.getStatus() != GameSession.Status.IN_PROGRESS || BlindDates.blind(session)) {
            return List.of();
        }
        StockData sd = marketData.load(session.getStockId());
        Integer curIdx = sd.indexOf(session.getCurrentTradeDate());
        if (curIdx == null || curIdx + 1 >= sd.prices().size()) {
            return List.of();
        }
        return newsService.eventsFor(sd.stock(), sd.prices().get(curIdx + 1).getTradeDate());
    }

    /**
     * 隔夜资金计息: 正现金按货基利率生息 (教学: 钱不要躺着), 进阶模式透支现金按融资利率付息
     * (杠杆不白借)。玩家与 AI 同口径; 结算重放资金曲线 (equityCurve) 必须复现同一公式与舍入。
     */
    private void accrueInterest(GameSession session, Account account) {
        BigDecimal interest = benchmarks.dailyInterest(account.getCashBalance());
        if (interest.signum() != 0) {
            account.setCashBalance(account.getCashBalance().add(interest));
            account.setInterestTotal(account.getInterestTotal().add(interest));
        }
        if (aiInitialized(session)) {
            BigDecimal aiInterest = benchmarks.dailyInterest(session.getAiCash());
            if (aiInterest.signum() != 0) {
                session.setAiCash(session.getAiCash().add(aiInterest));
            }
        }
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

        TradeTransaction.Direction direction =
                Enums.parse(request.direction(), TradeTransaction.Direction.class, "交易方向");

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
        // 当日 K 线已揭晓, 若仍允许区间内任意价成交, 玩家可每天低买高卖无风险套利刷榜。
        // 手动交易一律按当日收盘价撮合; 想按其他价位成交请用挂单 (次日按 OHLC 触发)。
        if (price.compareTo(bar.getClose()) != 0) {
            throw new BusinessException("对局内交易按当日收盘价成交, 当前收盘价 " + bar.getClose().toPlainString());
        }

        Account account = accountRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));

        int shares = request.shares();
        int lotSize = sd.stock().getMarket().getLotSize();
        if (shares % lotSize != 0) {
            throw new BusinessException("数量必须为 " + lotSize + " 的整数倍（整手交易）");
        }

        // 限制条件: 笔数上限与强制理由 (与 placeOrder 同走 requireBudgetAndReason, 保证口径一致)
        String reason = sanitizeReason(request.reason());
        Long usedBefore = requireBudgetAndReason(session, reason, "下单"); // 只查一次, 剩余笔数由它推出

        String error = tradeEngine.validate(session, account, stockId, direction, price, shares);
        if (error != null) {
            throw new BusinessException(error);
        }
        BigDecimal fee = tradeEngine.execute(session, account, stockId, direction, price, shares, reason);
        accountRepository.save(account);

        return new TradeResponse(account.getCashBalance(),
                account.getHoldingShares(), account.getHoldingCost(), fee,
                usedBefore == null ? null
                        : (int) Math.max(0, session.getMaxTrades() - usedBefore - 1));
    }

    /** 理由只留可见字符 (去控制符), 截 100 字; 渲染安全由前端 textContent 保证。 */
    private String sanitizeReason(String reason) {
        if (reason == null) {
            return null;
        }
        String cleaned = reason.replaceAll("\\p{Cntrl}", "").trim();
        return cleaned.length() > 100 ? cleaned.substring(0, 100) : cleaned;
    }

    /** 已用笔数预算: 已成交 + 在挂单。挂单也占预算, 否则挂单就是绕过笔数上限的后门。 */
    private long budgetUsed(Long sessionId) {
        return transactionRepository.countBySessionId(sessionId) + orderService.countOpen(sessionId);
    }

    /**
     * 笔数预算 + 强制理由校验, trade/placeOrder 共用 (同一口径, 不再各写一份)。
     * 返回已用笔数 (无上限时 null), 调用方可据此推出剩余笔数, 省掉第二次 COUNT。
     */
    private Long requireBudgetAndReason(GameSession session, String sanitizedReason, String action) {
        Long used = null;
        if (session.getMaxTrades() != null) {
            used = budgetUsed(session.getSessionId());
            if (used >= session.getMaxTrades()) {
                throw new BusinessException("本局交易笔数已达上限 " + session.getMaxTrades() + " 笔（在挂单也占用笔数）");
            }
        }
        if (session.isRequireReason() && (sanitizedReason == null || sanitizedReason.isEmpty())) {
            throw new BusinessException("本局开启了交易日志: 请写一句交易理由再" + action);
        }
        return used;
    }

    /** 剩余可交易笔数 (无上限返回 null)。 */
    private Integer tradesRemaining(GameSession session) {
        if (session.getMaxTrades() == null) {
            return null;
        }
        return (int) Math.max(0, session.getMaxTrades() - budgetUsed(session.getSessionId()));
    }

    // ---------- 挂单 ----------

    @Transactional
    public OrderInfo placeOrder(Long sessionId, PlaceOrderRequest request) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);
        Long stockId = resolveStock(session, request.stockCode());
        // 限制模式对挂单同样生效, 否则挂单就是绕开笔数上限/交易日志的后门:
        // 已成交 + 在挂单一起占笔数预算; 强制理由随挂单落库, 成交时写进流水。
        String reason = sanitizeReason(request.reason());
        requireBudgetAndReason(session, reason, "挂单");
        return orderService.place(session, stockId, request.orderType(), request.price(), request.shares(),
                request.trailPct(), reason);
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
        BigDecimal dcaReturn = null;
        List<PredictionDay> predictionDays = List.of();
        RiskMetrics risk = null;
        RiskMetrics holdRisk = null;
        List<BigDecimal> curve = null;
        List<BigDecimal> holdCurve = null;
        if (startIdx != null && endIdx != null) {
            holdReturn = benchmarks.buyAndHoldReturn(sd, startIdx, endIdx, initial);
            maCrossReturn = benchmarks.maCrossReturn(sd, startIdx, endIdx, initial);
            dcaReturn = benchmarks.dcaReturn(sd, startIdx, endIdx, initial);
            predictionDays = benchmarks.predictionDays(session, sd, startIdx, endIdx);
            curve = benchmarks.equityCurve(session, sd, startIdx, endIdx);
            if (curve != null) {
                risk = benchmarks.riskMetrics(curve);
            }
            holdCurve = benchmarks.holdEquityCurve(sd, startIdx, endIdx, initial);
            holdRisk = benchmarks.riskMetrics(holdCurve);
        }
        String styleTag = benchmarks.styleTag(session, sd);
        List<TradeTransaction> allTxs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        BiasReport biasReport = computeAndStoreBias(session, allTxs);
        // 交易日志: 理由 vs 结果 (只有写过理由的流水才有行)
        List<GameDtos.JournalEntry> journal = biasAnalysisService.journal(session, allTxs, marketData::load);
        // 事件回放: 结算揭晓场景与大事记 (进行中绝不下发, 文本会暴露真实时间)
        GameDtos.EventReveal eventReveal = eventReveal(session);

        session.setStatus(GameSession.Status.SETTLED);
        session.setFinalReturnRate(returnRate);
        session.setFinalSharpe(risk == null ? null : risk.sharpe());

        // 积分入账 (服务端权威): 基础/胜AI/赢基准/连胜/每日任务, 前端只展示
        boolean beatAi = aiReturn != null && returnRate.compareTo(aiReturn) > 0;
        boolean beatHold = holdReturn != null && returnRate.compareTo(holdReturn) > 0;
        PointsService.SettleAward award = pointsService.awardSettle(
                session.getUserId(), beatAi, beatHold, "DAILY".equals(session.getMode()));

        // 已结算: 竞技模式在此揭晓真实标的 (进行中全程匿名)。
        // 事件场景复合代码的剥壳统一走 BlindDates.stripScenario, 别再各写一份
        String revealCode = BlindDates.stripScenario(sd.stock().getCode());
        return new SettleResponse(session.getSessionId(), initial,
                finalAssets, returnRate, aiFinal, aiReturn, holdReturn, maCrossReturn, dcaReturn,
                risk, holdRisk, account.getInterestTotal(), curve, holdCurve,
                predictionDays, styleTag, revealCode, sd.stock().getName(),
                award.earned(), award.winStreak(), biasReport, journal, eventReveal);
    }

    /** 事件回放结算揭晓: 场景名 + 真实窗口 + 整段大事记 (给足上下文, 不只截对局窗口)。 */
    private GameDtos.EventReveal eventReveal(GameSession session) {
        if (!"EVENT".equals(session.getMode()) || session.getScenarioId() == null) {
            return null;
        }
        return eventScenarioRepository.findById(session.getScenarioId())
                .map(sc -> new GameDtos.EventReveal(sc.getNameZh(), sc.getNameEn(),
                        session.getStartDate(), session.getCurrentTradeDate(),
                        eventTimelineRepository.findByScenarioIdOrderByEventDateAsc(sc.getId()).stream()
                                .map(ti -> new GameDtos.TimelineItemDto(ti.getEventDate(), ti.getSeverity(),
                                        ti.getTitleZh(), ti.getTitleEn(), ti.getBodyZh(), ti.getBodyEn()))
                                .toList()))
                .orElse(null);
    }

    /** 行为偏差诊断: 结算时按流水算一次并 JSON 落库 (复读走存储, 不重算防口径漂移)。 */
    private BiasReport computeAndStoreBias(GameSession session, List<TradeTransaction> txs) {
        try {
            BiasReport report = biasAnalysisService.analyze(session, txs, marketData::load);
            session.setBiasReport(objectMapper.writeValueAsString(report));
            return report;
        } catch (Exception e) {
            // 诊断是增值信息, 失败不应拖垮结算主流程
            log.warn("偏差诊断失败 session={}", session.getSessionId(), e);
            return null;
        }
    }

    /** 已结算对局的诊断报告 (存储 JSON 反序列化)。 */
    @Transactional(readOnly = true)
    public BiasReport getBiasReport(Long sessionId) {
        GameSession session = getSession(sessionId);
        if (session.getStatus() != GameSession.Status.SETTLED) {
            throw new BusinessException("对局尚未结算, 暂无诊断报告");
        }
        if (session.getBiasReport() == null) {
            return new BiasReport(0, List.of());
        }
        try {
            return objectMapper.readValue(session.getBiasReport(), BiasReport.class);
        } catch (Exception e) {
            throw new BusinessException("诊断报告解析失败");
        }
    }

    /** 交易流水下发 (复盘用): 竞技对局进行中日期脱敏、标的匿名, 结算后原样。 */
    @Transactional(readOnly = true)
    public List<TransactionInfo> listTransactions(Long sessionId) {
        GameSession session = getSession(sessionId);
        return transactionRepository.findBySessionIdOrderByCreatedAtAsc(sessionId).stream()
                .map(tx -> {
                    long stockId = tx.getStockId() != null ? tx.getStockId() : session.getStockId();
                    String code = BlindDates.maskCode(session, marketData.load(stockId).stock().getCode());
                    return new TransactionInfo(tx.getTxId(), BlindDates.mask(session, tx.getTradeDate()),
                            tx.getDirection().name(), tx.getPrice(), tx.getShares(), tx.getFee(), code,
                            tx.getReason());
                })
                .toList();
    }

    /**
     * 道具「预知卡」: 返回明日收盘相对今日的方向 (UP/DOWN/FLAT)。
     * 只开放给休闲对局 —— 竞技模式 (每日/房间) 防剧透, 一律拒绝。
     * 次数限制在前端道具层, 服务端不计费 (休闲模拟, 无榜可刷: SURVIVAL/CLASSIC 同场不同题)。
     */
    @Transactional
    public String peekTomorrow(Long sessionId) {
        GameSession session = getSession(sessionId);
        requireInProgress(session);
        if (BlindDates.blind(session)) {
            throw new BusinessException("竞技对局不能使用预知道具");
        }
        pointsService.consumeItem(session.getUserId(), "peek"); // 道具计数服务端扣减
        StockData sd = marketData.load(session.getStockId());
        Integer curIdx = sd.indexOf(session.getCurrentTradeDate());
        if (curIdx == null || curIdx + 1 >= sd.prices().size()) {
            throw new BusinessException("行情数据已到尽头");
        }
        int cmp = sd.prices().get(curIdx + 1).getClose()
                .compareTo(sd.prices().get(curIdx).getClose());
        return cmp > 0 ? "UP" : cmp < 0 ? "DOWN" : "FLAT";
    }

    /**
     * 道具「后悔药」: 撤销今天最后一笔成交。删掉流水后从头重放 (含每日利息),
     * 现金/持仓/均价/累计利息全部重算, 与结算用的 equityCurve 同一口径。
     */
    @Transactional
    public TradeResponse undoLastTradeToday(Long sessionId) {
        GameSession session = getSessionWithLock(sessionId);
        requireInProgress(session);
        if (BlindDates.blind(session)) {
            throw new BusinessException("竞技对局不能使用后悔药");
        }
        pointsService.consumeItem(session.getUserId(), "undo"); // 道具计数服务端扣减
        Account account = accountRepository.findWithLockBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        List<TradeTransaction> todays = transactionRepository
                .findBySessionIdAndTradeDate(sessionId, session.getCurrentTradeDate());
        if (todays.isEmpty()) {
            throw new BusinessException("今天还没有成交, 没什么可后悔的");
        }
        // 查询方法不保证顺序, 按主键取真正的最后一笔
        TradeTransaction last = todays.stream()
                .max(java.util.Comparator.comparing(TradeTransaction::getTxId))
                .orElseThrow();
        transactionRepository.delete(last);
        transactionRepository.flush();
        replayAccount(session, account);
        accountRepository.save(account);
        return new TradeResponse(account.getCashBalance(),
                account.getHoldingShares(), account.getHoldingCost(), BigDecimal.ZERO,
                tradesRemaining(session));
    }

    /** 已结算对局的风险指标 (LLM 复盘上下文用); 旧组合流水缺 stock_id 时返回 null。 */
    @Transactional(readOnly = true)
    public RiskMetrics riskForSettled(GameSession session) {
        StockData sd = marketData.load(session.getStockId());
        Integer startIdx = sd.indexOf(session.getStartDate());
        Integer endIdx = sd.indexOf(session.getCurrentTradeDate());
        if (startIdx == null || endIdx == null) {
            return null;
        }
        List<BigDecimal> curve = benchmarks.equityCurve(session, sd, startIdx, endIdx);
        return curve == null ? null : benchmarks.riskMetrics(curve);
    }

    /** 从初始资金重放全部流水, 重建账户现金/持仓/均价/累计利息 (undo 用)。 */
    private void replayAccount(GameSession session, Account account) {
        StockData sd = marketData.load(session.getStockId());
        Integer startIdx = sd.indexOf(session.getStartDate());
        Integer endIdx = sd.indexOf(session.getCurrentTradeDate());
        if (startIdx == null || endIdx == null) {
            throw new BusinessException("行情数据缺失, 无法重算账户");
        }
        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        Map<LocalDate, List<TradeTransaction>> byDate =
                txs.stream().collect(Collectors.groupingBy(TradeTransaction::getTradeDate));
        BigDecimal cash = session.getInitialCash();
        BigDecimal interestTotal = BigDecimal.ZERO;
        Map<Long, PositionMath.Fill> fills = new HashMap<>();
        for (int i = startIdx; i <= endIdx; i++) {
            LocalDate day = sd.prices().get(i).getTradeDate();
            if (i > startIdx) {
                BigDecimal interest = benchmarks.dailyInterest(cash);
                cash = cash.add(interest);
                interestTotal = interestTotal.add(interest);
            }
            for (TradeTransaction tx : byDate.getOrDefault(day, List.of())) {
                BigDecimal gross = tx.getPrice().multiply(BigDecimal.valueOf(tx.getShares()));
                boolean buy = tx.getDirection() == TradeTransaction.Direction.BUY;
                cash = cash.add(buy ? gross.negate() : gross).subtract(tx.getFee());
                Long sid = tx.getStockId() != null ? tx.getStockId() : session.getStockId();
                PositionMath.Fill cur = fills.getOrDefault(sid, new PositionMath.Fill(0, BigDecimal.ZERO));
                fills.put(sid, PositionMath.apply(cur.shares(), cur.avgCost(),
                        tx.getDirection(), tx.getPrice(), tx.getShares()));
            }
        }
        account.setCashBalance(cash);
        account.setInterestTotal(interestTotal);
        if ("PORTFOLIO".equals(session.getMode())) {
            // 先把全部已有仓位行归入重放结果: 不在剩余流水里的标的必须清零,
            // 否则撤销某标的唯一一笔交易后旧仓位会凭空残留
            for (Position p : positionRepository.findBySessionId(session.getSessionId())) {
                fills.putIfAbsent(p.getStockId(), new PositionMath.Fill(0, BigDecimal.ZERO));
            }
            for (Map.Entry<Long, PositionMath.Fill> e : fills.entrySet()) {
                Position pos = positionRepository
                        .findWithLockBySessionIdAndStockId(session.getSessionId(), e.getKey())
                        .orElseGet(() -> {
                            Position np = new Position();
                            np.setSessionId(session.getSessionId());
                            np.setStockId(e.getKey());
                            return np;
                        });
                pos.setShares(e.getValue().shares());
                pos.setAvgCost(e.getValue().avgCost());
                positionRepository.save(pos);
            }
        } else {
            PositionMath.Fill f = fills.getOrDefault(session.getStockId(),
                    new PositionMath.Fill(0, BigDecimal.ZERO));
            account.setHoldingShares(f.shares());
            account.setHoldingCost(f.avgCost());
        }
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

        // 真实规则 (单股) 下提示今日可卖数, 免得玩家靠报错试探 T+1。
        // 与卖出校验共用 TradeEngine.sellableShares (带标的归属过滤, 组合模式将来开放也不漂移)
        Integer sellableShares = null;
        if (session.isRealRules() && !"PORTFOLIO".equals(session.getMode())
                && session.getStatus() == GameSession.Status.IN_PROGRESS) {
            sellableShares = tradeEngine.sellableShares(session, account, session.getStockId());
        }

        BigDecimal feesPaid = transactionRepository.sumFeesBySessionId(session.getSessionId());
        BigDecimal marginRatio = null;
        if (session.isAdvanced() && exposure.signum() > 0) {
            marginRatio = totalAssets.divide(exposure, 4, RoundingMode.HALF_UP);
        }

        return new StatusResponse(
                session.getSessionId(), session.getStatus().name(),
                BlindDates.mask(session, session.getCurrentTradeDate()),
                session.getDaysElapsed(), props.getTotalTicks(),
                account.getCashBalance(), account.getHoldingShares(), account.getHoldingCost(),
                currentPrice, marketValue, totalAssets, floatingPnl, returnRate,
                prediction, ai,
                session.getMode(), session.isAdvanced(), session.isLiquidated(),
                feesPaid == null ? BigDecimal.ZERO : feesPaid, marginRatio,
                account.getInterestTotal(), sellableShares, positions,
                tradesRemaining(session)); // 刷新/续局时前端以此为准, 不要从满额重置
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

    /** 组装 K 线点; 竞技模式日期脱敏 (见 BlindDates)。 */
    private KlinePoint toKlinePoint(GameSession session, StockData sd, DailyPrice p, DailyIndicator ind) {
        BigDecimal[] macd = sd.macdAt(p.getTradeDate());
        return new KlinePoint(
                BlindDates.mask(session, p.getTradeDate()),
                p.getOpen(), p.getHigh(), p.getLow(), p.getClose(), p.getVolume(),
                ind == null ? null : ind.getMa5(),
                ind == null ? null : ind.getMa20(),
                ind == null ? null : ind.getPctChange(),
                sd.rsiAt(p.getTradeDate()),
                macd == null ? null : macd[0],
                macd == null ? null : macd[1]);
    }
}
