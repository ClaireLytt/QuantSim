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

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * 对局接口。所有 /{sessionId}/ 路径先过 requireAccess:
 * 注册用户的对局只有本人可操作 (防 IDOR 遍历 sessionId 操控他人对局)。
 */
@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    /** LLM 顾问按调用方限频, 保护 API 配额。 */
    private static final int ADVISOR_PER_MINUTE = 10;

    private final GameService gameService;
    private final AdvisorService advisorService;
    private final RateLimiter rateLimiter;
    private final GameProperties gameProps;
    private final AdvisorProperties advisorProps;

    /** 每调用方限频 + 全站日配额 (LLM API 成本硬顶)。 */
    private void checkAdvisorQuota(HttpServletRequest http) {
        rateLimiter.check("advisor", callerKey(http), ADVISOR_PER_MINUTE);
        rateLimiter.checkDaily("advisor-global", "all", advisorProps.getDailyLimit());
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
        return gameService.startGame(request, userId);
    }

    @GetMapping("/{sessionId}/history")
    public HistoryResponse history(@PathVariable Long sessionId,
                                   @RequestParam(required = false) String stockCode,
                                   HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.getHistory(sessionId, stockCode);
    }

    @PostMapping("/{sessionId}/tick")
    public TickResponse tick(@PathVariable Long sessionId, HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.tick(sessionId);
    }

    /** 明日快讯预告: 推进前询问, 给玩家"先调仓还是直接推进"的决策时刻。 */
    @GetMapping("/{sessionId}/news/upcoming")
    public List<com.quantsim.dto.GameDtos.NewsItem> upcomingNews(@PathVariable Long sessionId,
                                                                 HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.upcomingNews(sessionId);
    }

    @PostMapping("/{sessionId}/trade")
    public TradeResponse trade(@PathVariable Long sessionId,
                               @Valid @RequestBody TradeRequest request,
                               HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.trade(sessionId, request);
    }

    @GetMapping("/{sessionId}/status")
    public StatusResponse status(@PathVariable Long sessionId, HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.getStatus(sessionId);
    }

    @PostMapping("/{sessionId}/settle")
    public SettleResponse settle(@PathVariable Long sessionId, HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.settle(sessionId);
    }

    @PostMapping("/{sessionId}/orders")
    public OrderInfo placeOrder(@PathVariable Long sessionId,
                                @Valid @RequestBody PlaceOrderRequest request,
                                HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.placeOrder(sessionId, request);
    }

    @GetMapping("/{sessionId}/orders")
    public List<OrderInfo> listOrders(@PathVariable Long sessionId, HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.listOrders(sessionId);
    }

    @PostMapping("/{sessionId}/orders/{orderId}/cancel")
    public List<OrderInfo> cancelOrder(@PathVariable Long sessionId, @PathVariable Long orderId,
                                       HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        return gameService.cancelOrder(sessionId, orderId);
    }

    @PostMapping("/{sessionId}/advisor")
    public AdvisorResponse advisor(@PathVariable Long sessionId,
                                   @RequestParam(required = false) String lang,
                                   @RequestParam(required = false) String q,
                                   HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        checkAdvisorQuota(http);
        return advisorService.advise(sessionId, lang, q);
    }

    /** 流式顾问: EventSource 只支持 GET, 增量事件为纯文本 delta, 结束事件名 done。 */
    @GetMapping("/{sessionId}/advisor/stream")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter advisorStream(
            @PathVariable Long sessionId,
            @RequestParam(required = false) String lang,
            @RequestParam(required = false) String q,
            HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        checkAdvisorQuota(http);
        return advisorService.adviseStream(sessionId, lang, q);
    }

    @PostMapping("/{sessionId}/advisor/reset")
    public void advisorReset(@PathVariable Long sessionId, HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        advisorService.resetChat(sessionId);
    }

    @PostMapping("/{sessionId}/review")
    public AdvisorResponse review(@PathVariable Long sessionId,
                                  @RequestParam(required = false) String lang,
                                  HttpServletRequest http) {
        gameService.requireAccess(sessionId, CurrentUser.idOrNull(http));
        checkAdvisorQuota(http);
        return advisorService.review(sessionId, lang);
    }

    /** 限流键: 登录用户按 userId, 游客按来源 IP。 */
    private static String callerKey(HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        return userId != null ? "u:" + userId : "ip:" + http.getRemoteAddr();
    }
}
