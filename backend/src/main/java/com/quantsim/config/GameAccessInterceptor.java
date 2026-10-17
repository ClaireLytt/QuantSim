package com.quantsim.config;

import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import com.quantsim.service.GameService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * 对局归属校验的唯一入口: /api/game/** 下凡是带 {sessionId} 路径变量的端点,
 * 进 handler 前先过 GameService.requireAccess (注册用户的对局仅本人可访问, 他人 404)。
 * 之前每个端点手写一行 requireAccess (×17), 新端点忘写 = 越权操作他人对局
 * (CLAUDE.md 高危教训 #1); 收口到拦截器后"忘写"在结构上不可能。
 */
@Component
@RequiredArgsConstructor
public class GameAccessInterceptor implements HandlerInterceptor {

    private final GameService gameService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        @SuppressWarnings("unchecked")
        Map<String, String> vars =
                (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (vars != null) {
            String sessionId = vars.get("sessionId");
            // 非数字或超 Long 位数的路径段放行, 交给 Spring 参数绑定走正常的 400 流程
            // (长度上限防 Long.valueOf 在这里抛 NumberFormatException 变 500)
            if (sessionId != null && sessionId.length() <= 18
                    && sessionId.chars().allMatch(Character::isDigit)) {
                gameService.requireAccess(Long.valueOf(sessionId), CurrentUser.idOrNull(request));
            }
        }
        return true;
    }
}
