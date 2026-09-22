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
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

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

    public AdvisorResponse advise(Long sessionId, String lang) {
        if (!enabled()) {
            throw new BusinessException("未配置 ANTHROPIC_API_KEY, AI 顾问功能未启用");
        }
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        StockData sd = marketData.load(session.getStockId());

        String systemPrompt = "en".equalsIgnoreCase(lang) ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;
        String advice = callClaude(systemPrompt, buildContext(session, account, sd));
        return new AdvisorResponse(advice, props.getModel());
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
        String advice = callClaude(systemPrompt, buildReviewContext(session, account, sd));
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
        sb.append("标的: ").append(stock.getName()).append(" (").append(stock.getCode()).append("), 市场: ")
                .append(marketDesc(stock.getMarket())).append('\n');
        sb.append("成绩: 初始资金 ").append(session.getInitialCash())
                .append(", 最终资产 ").append(finalAssets)
                .append(", 收益率 ").append(returnRate.multiply(BigDecimal.valueOf(100))).append("%\n");

        sb.append("本局行情 (日期 收盘 涨跌幅%):\n");
        for (int i = startIdx; i <= endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyIndicator ind = sd.indicators().get(p.getTradeDate());
            sb.append(p.getTradeDate()).append(' ').append(p.getClose()).append(' ')
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
                sb.append(tx.getTradeDate()).append(' ')
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
        sb.append("标的: ").append(stock.getName()).append(" (").append(stock.getCode()).append("), 市场: ")
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
            sb.append(p.getTradeDate()).append(' ').append(p.getClose()).append(' ')
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

    private String callClaude(String systemPrompt, String context) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "model", props.getModel(),
                    "max_tokens", props.getMaxTokens(),
                    "system", systemPrompt,
                    "messages", List.of(Map.of("role", "user", "content", context))));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(props.getApiUrl()))
                    .timeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .header("x-api-key", props.getApiKey())
                    .header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
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
        } catch (IOException e) {
            throw new BusinessException("AI 顾问调用失败: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("AI 顾问调用被中断");
        }
    }
}
