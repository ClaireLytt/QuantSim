package com.quantsim.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/** 会话中的登录用户标识存取。前后端同源, 用容器 HttpSession 即可。 */
public final class CurrentUser {

    /** HttpSession 属性键。 */
    public static final String SESSION_KEY = "qs.userId";

    private CurrentUser() {}

    /** 已登录返回 userId, 未登录返回 null。 */
    public static Long idOrNull(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object v = session.getAttribute(SESSION_KEY);
        return v instanceof Long id ? id : null;
    }

    public static void login(HttpServletRequest request, Long userId) {
        // 登录成功先作废旧会话再新建: 防会话固定攻击 (攻击者预置 session id 骗受害者登录)
        HttpSession old = request.getSession(false);
        if (old != null) {
            old.invalidate();
        }
        request.getSession(true).setAttribute(SESSION_KEY, userId);
    }

    public static void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }
}
