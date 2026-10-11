package com.quantsim.config;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 轻量登录门卫: 仅对必须有身份的路径生效 (房间/每日挑战/我的),
 * 其余接口保持游客可用。未登录一律 401, 由前端引导到账户页。
 */
@Component
public class AuthFilter extends OncePerRequestFilter {

    private static final String[] PROTECTED_PREFIXES = {
            "/api/me/", "/api/rooms", "/api/daily", "/api/event"
    };

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (requiresAuth(request.getRequestURI()) && CurrentUser.idOrNull(request) == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"message\":\"请先登录\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean requiresAuth(String uri) {
        for (String prefix : PROTECTED_PREFIXES) {
            if (uri.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
