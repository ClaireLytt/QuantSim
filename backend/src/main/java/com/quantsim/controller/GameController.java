package com.quantsim.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.dto.GameDtos.AdvisorResponse;
import java.util.List;

import com.quantsim.dto.GameDtos.HistoryResponse;
import com.quantsim.dto.GameDtos.OrderInfo;
import com.quantsim.dto.GameDtos.PlaceOrderRequest;
import com.quantsim.dto.GameDtos.SettleResponse;
import com.quantsim.dto.GameDtos.StartGameRequest;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.dto.GameDtos.StatusResponse;
import com.quantsim.dto.GameDtos.TickResponse;
import com.quantsim.dto.GameDtos.TradeRequest;
import com.quantsim.dto.GameDtos.TradeResponse;
import com.quantsim.config.AdvisorProperties;
import com.quantsim.config.CurrentUser;
import com.quantsim.config.GameProperties;
import com.quantsim.config.RateLimiter;
import com.quantsim.service.AdvisorService;
import com.quantsim.service.GameService;
import com.quantsim.service.GameStartService;
import com.quantsim.service.MiniGameService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * 对局接口。所有带 {sessionId} 的路径由 GameAccessInterceptor 统一先过 requireAccess
 * (注册用户的对局只有本人可操作, 防 IDOR 遍历 sessionId 操控他人对局), 端点内不再手写。
 */
@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    /** LLM 顾问按调用方限频, 保护 API 配额。 */
    private static final int ADVISOR_PER_MINUTE = 10;

    private final GameService gameService;
    private final GameStartService gameStart;
    private final MiniGameService miniGameService;
    private final com.quantsim.service.RecapService recapService;
    private final AdvisorService advisorService;
    private final RateLimiter rateLimiter;
    private final GameProperties gameProps;
    private final AdvisorProperties advisorProps;

    /** 每调用方限频 + 全站日配额 (LLM API 成本硬顶)。 */
    private void checkAdvisorQuota(HttpServletRequest http) {
        rateLimiter.check("advisor", callerKey(http), ADVISOR_PER_MINUTE);
        rateLimiter.checkDaily("advisor-global", "all", advisorProps.getDailyLimit());
    }

    /** 顾问问题长度上限: 配额按"次"计, 不设上限的话单次可塞超长文本放大 token 成本
     *  (对照 pet-chat 的 @Size(max=200); SSE 走 GET 参数没有 bean 校验, 在这里拦)。 */
    private static String capQuestion(String q) {
        if (q != null && q.length() > 500) {
            throw new com.quantsim.exception.BusinessException("问题太长了, 请精简到 500 字以内");
        }
        return q;
    }

    /** 开局行业筛选候选项 (游客可用) */
    @GetMapping("/industries")
    public List<com.quantsim.dto.GameDtos.IndustryOption> industries() {
        return gameStart.listIndustries();
    }

    /** 猜涨跌·真实历史模式窗口 (游客可用, 只读缓存; M1, 见 MiniGameService) */
    @GetMapping("/guess-window")
    public MiniGameService.GuessWindow guessWindow() {
        return miniGameService.guessWindow();
    }

    /** 新闻多空·实战题池 (游客可用, 只读; M2, 见 MiniGameService)。
     *  挂在 /api/game 而非 /api/event: 后者整段被 AuthFilter 保护, 小游戏对游客开放。 */
    @GetMapping("/news-quiz")
    public List<MiniGameService.QuizItem> newsQuiz() {
        return miniGameService.newsQuiz();
    }

    @PostMapping("/start")
    public StartGameResponse start(@Valid @RequestBody StartGameRequest request,
                                   HttpServletRequest http) {
        // 已登录以会话身份为准, 防止顶别人用户名开局; 游客昵称在 service 层校验
        Long userId = CurrentUser.idOrNull(http);
        if (userId == null) {
            // 游客开局会 findOrCreate users 行, 不限频可被刷库 (审计遗留项#10)
            rateLimiter.check("guest-start", "ip:" + http.getRemoteAddr(), gameProps.getGuestStartPerMinute());
        }
        return gameStart.startGame(request, userId);
    }

    @GetMapping("/{sessionId}/history")
    public HistoryResponse history(@PathVariable Long sessionId,
                                   @RequestParam(required = false) String stockCode) {
        return gameService.getHistory(sessionId, stockCode);
    }

    @PostMapping("/{sessionId}/tick")
    public TickResponse tick(@PathVariable Long sessionId) {
        return gameService.tick(sessionId);
    }

    /** 明日快讯预告: 推进前询问, 给玩家"先调仓还是直接推进"的决策时刻。 */
    @GetMapping("/{sessionId}/news/upcoming")
    public List<com.quantsim.dto.GameDtos.NewsItem> upcomingNews(@PathVariable Long sessionId) {
        return gameService.upcomingNews(sessionId);
    }

    /** 道具「预知卡」: 偷看明日方向 (竞技对局 service 层拒绝) */
    @PostMapping("/{sessionId}/peek")
    public java.util.Map<String, String> peek(@PathVariable Long sessionId) {
        return java.util.Map.of("direction", gameService.peekTomorrow(sessionId));
    }

    /** 道具「后悔药」: 撤销今天最后一笔成交 */
    @PostMapping("/{sessionId}/undo-trade")
    public TradeResponse undoTrade(@PathVariable Long sessionId) {
        return gameService.undoLastTradeToday(sessionId);
    }

    @PostMapping("/{sessionId}/trade")
    public TradeResponse trade(@PathVariable Long sessionId,
                               @Valid @RequestBody TradeRequest request) {
        return gameService.trade(sessionId, request);
    }

    /** 财报日历 (联动设计#7): [第几天...] 偏移; 盲局恒空。 */
    @GetMapping("/{sessionId}/earnings")
    public java.util.List<Integer> earnings(@PathVariable Long sessionId) {
        return gameService.earningsDays(sessionId);
    }

    @GetMapping("/{sessionId}/status")
    public StatusResponse status(@PathVariable Long sessionId) {
        return gameService.getStatus(sessionId);
    }

    @PostMapping("/{sessionId}/settle")
    public SettleResponse settle(@PathVariable Long sessionId) {
        return gameService.settle(sessionId);
    }

    /** 行为偏差诊断报告 (已结算对局; 结算时已落库, 这里只读) */
    /** 赛后复盘: 盈亏四分解 + 逐笔配对 + 卖后走势事实 (属主校验由 GameAccessInterceptor 统一过) */
    @GetMapping("/{sessionId}/recap")
    public com.quantsim.service.RecapService.RecapResponse recap(@PathVariable Long sessionId) {
        return recapService.recap(sessionId);
    }

    @GetMapping("/{sessionId}/bias")
    public com.quantsim.dto.GameDtos.BiasReport bias(@PathVariable Long sessionId) {
        return gameService.getBiasReport(sessionId);
    }

    /** 交易流水 (复盘用, 竞技对局进行中日期脱敏/标的匿名) */
    @GetMapping("/{sessionId}/transactions")
    public List<com.quantsim.dto.GameDtos.TransactionInfo> transactions(@PathVariable Long sessionId) {
        return gameService.listTransactions(sessionId);
    }

    @PostMapping("/{sessionId}/orders")
    public OrderInfo placeOrder(@PathVariable Long sessionId,
                                @Valid @RequestBody PlaceOrderRequest request) {
        return gameService.placeOrder(sessionId, request);
    }

    @GetMapping("/{sessionId}/orders")
    public List<OrderInfo> listOrders(@PathVariable Long sessionId) {
        return gameService.listOrders(sessionId);
    }

    @PostMapping("/{sessionId}/orders/{orderId}/cancel")
    public List<OrderInfo> cancelOrder(@PathVariable Long sessionId, @PathVariable Long orderId) {
        return gameService.cancelOrder(sessionId, orderId);
    }

    @PostMapping("/{sessionId}/advisor")
    public AdvisorResponse advisor(@PathVariable Long sessionId,
                                   @RequestParam(required = false) String lang,
                                   @RequestParam(required = false) String q,
                                   HttpServletRequest http) {
        checkAdvisorQuota(http);
        return advisorService.advise(sessionId, lang, capQuestion(q));
    }

    /** 流式顾问: EventSource 只支持 GET, 增量事件为纯文本 delta, 结束事件名 done。 */
    @GetMapping("/{sessionId}/advisor/stream")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter advisorStream(
            @PathVariable Long sessionId,
            @RequestParam(required = false) String lang,
            @RequestParam(required = false) String q,
            HttpServletRequest http) {
        checkAdvisorQuota(http);
        return advisorService.adviseStream(sessionId, lang, capQuestion(q));
    }

    @PostMapping("/{sessionId}/advisor/reset")
    public void advisorReset(@PathVariable Long sessionId) {
        advisorService.resetChat(sessionId);
    }

    @PostMapping("/{sessionId}/review")
    public AdvisorResponse review(@PathVariable Long sessionId,
                                  @RequestParam(required = false) String lang,
                                  HttpServletRequest http) {
        checkAdvisorQuota(http);
        return advisorService.review(sessionId, lang);
    }

    /** 限流键: 登录用户按 userId, 游客按来源 IP。 */
    private static String callerKey(HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        return userId != null ? "u:" + userId : "ip:" + http.getRemoteAddr();
    }
}
