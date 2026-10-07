package com.quantsim.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.AdvisorProperties;
import com.quantsim.config.CurrentUser;
import com.quantsim.config.RateLimiter;
import com.quantsim.dto.GameDtos.AdvisorResponse;
import com.quantsim.service.AdvisorService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * 首页智能小宠的 LLM 闲聊接口 (游客可用, 设计如此)。
 * 烧钱接口双保险 (守则 #3): 每调用方限频 + 与顾问共用全站日配额硬顶。
 */
@RestController
@RequestMapping("/api/pet")
@RequiredArgsConstructor
public class PetController {

    /** 闲聊比顾问更不要紧, 限得更紧一点 */
    private static final int PET_PER_MINUTE = 6;

    private final AdvisorService advisorService;
    private final RateLimiter rateLimiter;
    private final AdvisorProperties advisorProps;

    public record PetChatRequest(
            @Size(max = 200) String question,
            @Size(max = 20) String petName,
            @Size(max = 300) String context,
            @Size(max = 8) String lang) {}

    @PostMapping("/chat")
    public AdvisorResponse chat(@Valid @RequestBody PetChatRequest body, HttpServletRequest http) {
        rateLimiter.check("pet-chat", callerKey(http), PET_PER_MINUTE);
        // 与 advisor 共用同一个全站日配额键: 一个成本硬顶管住全部 LLM 出口
        rateLimiter.checkDaily("advisor-global", "all", advisorProps.getDailyLimit());
        return advisorService.petChat(body.question(), body.lang(), body.petName(), body.context());
    }

    /** 限流键: 登录用户按 userId, 游客按来源 IP (同 GameController)。 */
    private static String callerKey(HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        return userId != null ? "u:" + userId : "ip:" + http.getRemoteAddr();
    }
}
