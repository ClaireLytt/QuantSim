package com.quantsim.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.config.AdvisorProperties;
import com.quantsim.dto.GameDtos.AdvisorResponse;
import com.quantsim.entity.Account;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MarketDataService.StockData;

/**
 * LLM 交易顾问: 把当前对局的行情与账户上下文交给 Claude, 生成中文解说与操作建议。
 * 只提供当前交易日及之前的数据, 与玩家视角一致, 无未来信息泄漏。
 */
@Service
public class AdvisorService {

    private static final String SYSTEM_PROMPT_ZH = """
            你是虚拟炒股游戏 QuantSim 中的交易顾问。根据提供的行情与账户数据, \
            用中文给出简短分析和明确的操作建议（买入 / 卖出 / 观望之一, 附一两条理由）, \
            总共不超过 150 字。这是模拟游戏, 无需免责声明; 只依据提供的数据, 不要编造。""";

    private static final String SYSTEM_PROMPT_EN = """
            You are the trading advisor in QuantSim, a virtual stock trading game. Based on the \
            provided market and account data, give a brief analysis in English and one clear \
            recommendation (buy / sell / hold, with one or two reasons), within 100 words. \
            This is a simulation game, no disclaimer needed; rely only on the given data.""";

    private static final String REVIEW_PROMPT_ZH = """
            你是虚拟炒股游戏 QuantSim 中的复盘教练。对局已结束, 根据本局行情走势、\
            玩家的每一笔交易记录和最终成绩, 用中文逐笔点评: 哪些操作做对了、哪些踏错了节奏, \
            并总结 1-2 条最值得改进的习惯。语气友善具体, 总共不超过 250 字。\
            这是模拟游戏, 无需免责声明; 只依据提供的数据, 不要编造。""";

    private static final String REVIEW_PROMPT_EN = """
            You are the post-game review coach in QuantSim, a virtual stock trading game. The game \
            is settled. Based on the price history, the player's trade log and final results, review \
            each trade in English: what was well timed, what was not, then summarize 1-2 habits most \
            worth improving. Be friendly and specific, within 180 words. This is a simulation game, \
            no disclaimer needed; rely only on the given data.""";

    private final GameSessionRepository sessionRepository;
    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final MarketDataService marketData;
    private final AdvisorProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /**
     * 每局的多轮对话历史 (Q/A 文本对), 上限 MAX_TURNS 轮; 重开时清空。
     * 访问有序 LRU: 超过 MAX_TRACKED_SESSIONS 淡汰最久未用的一局, 不影响活跃对话。
     */
    private final Map<Long, Deque<String[]>> chatHistory = java.util.Collections.synchronizedMap(
            new java.util.LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Long, Deque<String[]>> eldest) {
                    return size() > MAX_TRACKED_SESSIONS;
                }
            });
    private static final int MAX_TURNS = 10;
    private static final int MAX_TRACKED_SESSIONS = 500;
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "advisor-sse");
        thread.setDaemon(true);
        return thread;
    });

    public AdvisorService(GameSessionRepository sessionRepository, AccountRepository accountRepository,
            TransactionRepository transactionRepository, MarketDataService marketData,
            AdvisorProperties props, ObjectMapper objectMapper) {
        this.sessionRepository = sessionRepository;
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
        this.marketData = marketData;
        this.props = props;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                .build();
    }

    public boolean enabled() {
        return props.getApiKey() != null && !props.getApiKey().isBlank();
    }

    public AdvisorResponse advise(Long sessionId, String lang, String question) {
        if (!enabled()) {
            throw new BusinessException("未配置 ANTHROPIC_API_KEY, AI 顾问功能未启用");
        }
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        StockData sd = marketData.load(session.getStockId());

        String systemPrompt = "en".equalsIgnoreCase(lang) ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;
        String advice = callClaude(systemPrompt, buildMessages(sessionId, session, account, sd, question), false, null);
        recordTurn(sessionId, question, advice);
        return new AdvisorResponse(advice, props.getModel());
    }

    /** 流式版顾问: SSE 增量下发。历史与非流式共享。 */
    public SseEmitter adviseStream(Long sessionId, String lang, String question) {
        if (!enabled()) {
            throw new BusinessException("未配置 ANTHROPIC_API_KEY, AI 顾问功能未启用");
        }
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        StockData sd = marketData.load(session.getStockId());
        String systemPrompt = "en".equalsIgnoreCase(lang) ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;
        List<Map<String, String>> messages = buildMessages(sessionId, session, account, sd, question);

        SseEmitter emitter = new SseEmitter(props.getTimeoutSeconds() * 2000L);
        streamExecutor.execute(() -> {
            StringBuilder full = new StringBuilder();
            try {
                callClaude(systemPrompt, messages, true, chunk -> {
                    full.append(chunk);
                    try {
                        emitter.send(SseEmitter.event().data(chunk));
                    } catch (IOException e) {
                        throw new BusinessException("SSE 连接已断开");
                    }
                });
                recordTurn(sessionId, question, full.toString());
                emitter.send(SseEmitter.event().name("done").data("ok"));
                emitter.complete();
            } catch (Exception e) {
                try {
                    // 不能叫 "error": 会和 EventSource 的原生 error 事件撞名
                    emitter.send(SseEmitter.event().name("advisor-error").data(String.valueOf(e.getMessage())));
                } catch (IOException ignored) {
                    // 客户端已断开
                }
                emitter.complete();
            }
        });
        return emitter;
    }

    /** 清空某局的对话历史 (重开一局时调用)。 */
    public void resetChat(Long sessionId) {
        chatHistory.remove(sessionId);
    }

    /** 上下文 + 既往轮次 + 本轮追问 组装 messages。每轮都重建行情上下文, 保证无未来泄漏。 */
    private List<Map<String, String>> buildMessages(Long sessionId, GameSession session,
            Account account, StockData sd, String question) {
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "user", "content", buildContext(session, account, sd)));
        messages.add(Map.of("role", "assistant", "content", "收到, 我已了解当前局面。请问你想了解什么?"));
        Deque<String[]> history = chatHistory.get(sessionId);
        if (history != null) {
            for (String[] turn : history) {
                messages.add(Map.of("role", "user", "content", turn[0]));
                messages.add(Map.of("role", "assistant", "content", turn[1]));
            }
        }
        String q = question == null || question.isBlank() ? "请分析当前局势并给出操作建议。" : question.trim();
        messages.add(Map.of("role", "user", "content", q));
        return messages;
    }

    private void recordTurn(Long sessionId, String question, String answer) {
        Deque<String[]> history = chatHistory.computeIfAbsent(sessionId, k -> new ArrayDeque<>());
        synchronized (history) {
            history.addLast(new String[] {
                    question == null || question.isBlank() ? "请分析当前局势并给出操作建议。" : question.trim(),
                    answer });
            while (history.size() > MAX_TURNS) {
                history.removeFirst();
            }
        }
    }

    /** 结算后逐笔复盘: 只对已结算对局开放, 上下文包含本局全程行情与交易流水。 */
    public AdvisorResponse review(Long sessionId, String lang) {
        if (!enabled()) {
            throw new BusinessException("未配置 ANTHROPIC_API_KEY, AI 复盘功能未启用");
        }
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        if (session.getStatus() != GameSession.Status.SETTLED) {
            throw new BusinessException("对局尚未结算, 结算后才能复盘");
        }
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        StockData sd = marketData.load(session.getStockId());

        String systemPrompt = "en".equalsIgnoreCase(lang) ? REVIEW_PROMPT_EN : REVIEW_PROMPT_ZH;
        String advice = callClaude(systemPrompt,
                List.of(Map.of("role", "user", "content", buildReviewContext(session, account, sd))),
                false, null);
        return new AdvisorResponse(advice, props.getModel());
    }

    private String buildReviewContext(GameSession session, Account account, StockData sd) {
        Stock stock = sd.stock();
        Integer startIdx = sd.indexOf(session.getStartDate());
        Integer endIdx = sd.indexOf(session.getCurrentTradeDate());
        if (startIdx == null || endIdx == null) {
            throw new BusinessException("对局行情缺失");
        }
        BigDecimal settleClose = sd.prices().get(endIdx).getClose();
        BigDecimal finalAssets = account.getCashBalance()
                .add(settleClose.multiply(BigDecimal.valueOf(account.getHoldingShares())));
        BigDecimal returnRate = TradeMath.returnRate(finalAssets, session.getInitialCash());

        StringBuilder sb = new StringBuilder();
        sb.append("标的: ").append(BlindDates.maskName(session, stock.getName()))
                .append(" (").append(BlindDates.maskCode(session, stock.getCode())).append("), 市场: ")
                .append(marketDesc(stock.getMarket())).append('\n');
        sb.append("成绩: 初始资金 ").append(session.getInitialCash())
                .append(", 最终资产 ").append(finalAssets)
                .append(", 收益率 ").append(returnRate.multiply(BigDecimal.valueOf(100))).append("%\n");

        sb.append("本局行情 (日期 收盘 涨跌幅%):\n");
        for (int i = startIdx; i <= endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyIndicator ind = sd.indicators().get(p.getTradeDate());
            // 竞技模式日期脱敏, 防止 LLM 回答里泄漏真实日历日
            sb.append(BlindDates.mask(session, p.getTradeDate())).append(' ').append(p.getClose()).append(' ')
                    .append(ind == null || ind.getPctChange() == null ? "--"
                            : ind.getPctChange().multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP))
                    .append('\n');
        }

        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        if (txs.isEmpty()) {
            sb.append("交易记录: 全程未交易\n");
        } else {
            sb.append("交易记录 (日期 方向 价格 数量):\n");
            for (TradeTransaction tx : txs) {
                sb.append(BlindDates.mask(session, tx.getTradeDate())).append(' ')
                        .append(tx.getDirection() == TradeTransaction.Direction.BUY ? "买入" : "卖出")
                        .append(' ').append(tx.getPrice()).append(' ').append(tx.getShares()).append('\n');
            }
        }
        return sb.toString();
    }

    private String buildContext(GameSession session, Account account, StockData sd) {
        Stock stock = sd.stock();
        Integer curIdx = sd.indexOf(session.getCurrentTradeDate());
        if (curIdx == null) {
            throw new BusinessException("当前交易日行情缺失");
        }
        BigDecimal close = sd.prices().get(curIdx).getClose();
        BigDecimal marketValue = close.multiply(BigDecimal.valueOf(account.getHoldingShares()));
        BigDecimal totalAssets = account.getCashBalance().add(marketValue);
        BigDecimal returnRate = TradeMath.returnRate(totalAssets, session.getInitialCash());

        StringBuilder sb = new StringBuilder();
        sb.append("标的: ").append(BlindDates.maskName(session, stock.getName()))
                .append(" (").append(BlindDates.maskCode(session, stock.getCode())).append("), 市场: ")
                .append(marketDesc(stock.getMarket()))
                .append('\n');
        sb.append("对局进度: 第 ").append(session.getDaysElapsed()).append(" 天\n");
        sb.append("账户: 现金 ").append(account.getCashBalance())
                .append(", 持仓 ").append(account.getHoldingShares())
                .append(" 股 (成本 ").append(account.getHoldingCost())
                .append("), 最新收盘 ").append(close)
                .append(", 总资产 ").append(totalAssets)
                .append(", 收益率 ").append(returnRate.multiply(BigDecimal.valueOf(100))).append("%\n");

        DailyPrediction pred = sd.prediction(session.getCurrentTradeDate(), session.getAiModel());
        if (pred != null) {
            sb.append("ML 模型预测明日上涨概率: ")
                    .append(pred.getProbUp().multiply(BigDecimal.valueOf(100))).append("%\n");
        }

        sb.append("近 ").append(props.getRecentDays()).append(" 日行情 (日期 收盘 涨跌幅% MA5 MA20):\n");
        int from = Math.max(0, curIdx - props.getRecentDays() + 1);
        List<DailyPrice> prices = sd.prices();
        for (int i = from; i <= curIdx; i++) {
            DailyPrice p = prices.get(i);
            DailyIndicator ind = sd.indicators().get(p.getTradeDate());
            // 竞技模式日期脱敏, 防止 LLM 回答里泄漏真实日历日
            sb.append(BlindDates.mask(session, p.getTradeDate())).append(' ').append(p.getClose()).append(' ')
                    .append(ind == null || ind.getPctChange() == null ? "--"
                            : ind.getPctChange().multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP))
                    .append(' ').append(ind == null || ind.getMa5() == null ? "--" : ind.getMa5())
                    .append(' ').append(ind == null || ind.getMa20() == null ? "--" : ind.getMa20())
                    .append('\n');
        }
        return sb.toString();
    }

    private String marketDesc(Market market) {
        return switch (market) {
            case CRYPTO -> "加密货币 (7x24, 1 枚起买)";
            case US -> "美股 (1 股起买)";
            case STOCK -> "A股 (一手 100 股)";
        };
    }

    /** onChunk 为 null 时走非流式并返回全文; 否则 stream=true, 逐段回调, 返回值为空串。 */
    private String callClaude(String systemPrompt, List<Map<String, String>> messages,
            boolean stream, java.util.function.Consumer<String> onChunk) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "model", props.getModel(),
                    "max_tokens", props.getMaxTokens(),
                    "system", systemPrompt,
                    "stream", stream,
                    "messages", messages));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(props.getApiUrl()))
                    .timeout(Duration.ofSeconds(props.getTimeoutSeconds() * 2L))
                    .header("Content-Type", "application/json")
                    .header("x-api-key", props.getApiKey())
                    .header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

            if (!stream) {
                HttpResponse<String> response = httpClient.send(request,
                        HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (response.statusCode() != 200) {
                    throw new BusinessException("AI 顾问调用失败 (HTTP " + response.statusCode() + ")");
                }
                JsonNode text = objectMapper.readTree(response.body()).path("content").path(0).path("text");
                if (text.isMissingNode() || text.asText().isBlank()) {
                    throw new BusinessException("AI 顾问返回内容为空");
                }
                return text.asText();
            }

            // 流式: 逐行解析 Anthropic SSE, 提取 content_block_delta 的 text_delta
            HttpResponse<java.util.stream.Stream<String>> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofLines());
            if (response.statusCode() != 200) {
                throw new BusinessException("AI 顾问调用失败 (HTTP " + response.statusCode() + ")");
            }
            response.body().forEach(line -> {
                if (!line.startsWith("data:")) {
                    return;
                }
                String payload = line.substring(5).trim();
                if (payload.isEmpty() || "[DONE]".equals(payload)) {
                    return;
                }
                try {
                    JsonNode node = objectMapper.readTree(payload);
                    if ("content_block_delta".equals(node.path("type").asText())) {
                        String delta = node.path("delta").path("text").asText("");
                        if (!delta.isEmpty()) {
                            onChunk.accept(delta);
                        }
                    } else if ("error".equals(node.path("type").asText())) {
                        throw new BusinessException("AI 顾问调用失败: "
                                + node.path("error").path("message").asText());
                    }
                } catch (IOException e) {
                    // 单行解析失败跳过
                }
            });
            return "";
        } catch (IOException e) {
            throw new BusinessException("AI 顾问调用失败: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("AI 顾问调用被中断");
        }
    }
}
