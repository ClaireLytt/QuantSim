package com.quantsim.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.config.RateLimiter;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.service.EventService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * 事件回放模式 (路径受 AuthFilter 保护, 需登录)。
 * 防剧透: 开局只能走这里由服务端随机选题, EVENT 不在 /api/game/start 的模式白名单里,
 * 客户端无法点名场景或窗口; catalog 只给筛选维度。
 */
@RestController
@RequestMapping("/api/event")
@RequiredArgsConstructor
public class EventController {

    private final EventService eventService;
    private final RateLimiter rateLimiter;

    public record StartEventRequest(@Size(max = 8) String market,
                                    @Size(max = 16) String difficulty) {}

    @GetMapping("/catalog")
    public Map<String, Object> catalog() {
        return eventService.catalog();
    }

    @PostMapping("/start")
    public StartGameResponse start(@RequestBody(required = false) StartEventRequest body,
                                   HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        // 开局会建 session/account 行, 按用户限频防刷库
        rateLimiter.check("event-start", "user:" + userId, 10);
        StartEventRequest req = body == null ? new StartEventRequest(null, null) : body;
        return eventService.start(userId, req.market(), req.difficulty());
    }
}
