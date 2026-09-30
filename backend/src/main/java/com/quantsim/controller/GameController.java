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
import com.quantsim.config.CurrentUser;
import com.quantsim.repository.UserRepository;
import com.quantsim.service.AdvisorService;
import com.quantsim.service.GameService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;
    private final AdvisorService advisorService;
    private final UserRepository userRepository;

    @PostMapping("/start")
    public StartGameResponse start(@Valid @RequestBody StartGameRequest request,
                                   HttpServletRequest http) {
        // 已登录时以会话身份为准, 防止顶别人用户名开局; 游客沿用 body 里的昵称
        Long userId = CurrentUser.idOrNull(http);
        if (userId != null) {
            String username = userRepository.findById(userId).orElseThrow().getUsername();
            request = new StartGameRequest(username, request.market(), request.aiLevel(),
                    request.mode(), request.advanced());
        }
        return gameService.startGame(request);
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

    @PostMapping("/{sessionId}/trade")
    public TradeResponse trade(@PathVariable Long sessionId,
                               @Valid @RequestBody TradeRequest request) {
        return gameService.trade(sessionId, request);
    }

    @GetMapping("/{sessionId}/status")
    public StatusResponse status(@PathVariable Long sessionId) {
        return gameService.getStatus(sessionId);
    }

    @PostMapping("/{sessionId}/settle")
    public SettleResponse settle(@PathVariable Long sessionId) {
        return gameService.settle(sessionId);
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
                                   @RequestParam(required = false) String q) {
        return advisorService.advise(sessionId, lang, q);
    }

    /** 流式顾问: EventSource 只支持 GET, 增量事件为纯文本 delta, 结束事件名 done。 */
    @GetMapping("/{sessionId}/advisor/stream")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter advisorStream(
            @PathVariable Long sessionId,
            @RequestParam(required = false) String lang,
            @RequestParam(required = false) String q) {
        return advisorService.adviseStream(sessionId, lang, q);
    }

    @PostMapping("/{sessionId}/advisor/reset")
    public void advisorReset(@PathVariable Long sessionId) {
        advisorService.resetChat(sessionId);
    }

    @PostMapping("/{sessionId}/review")
    public AdvisorResponse review(@PathVariable Long sessionId,
                                  @RequestParam(required = false) String lang) {
        return advisorService.review(sessionId, lang);
    }
}
