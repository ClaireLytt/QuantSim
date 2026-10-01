package com.quantsim.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.config.RateLimiter;
import com.quantsim.dto.AuthDtos.LoginRequest;
import com.quantsim.dto.AuthDtos.MeResponse;
import com.quantsim.dto.AuthDtos.RegisterRequest;
import com.quantsim.dto.AuthDtos.UserInfo;
import com.quantsim.entity.User;
import com.quantsim.repository.UserRepository;
import com.quantsim.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    /** 认证接口按 IP 限频, 抬高爆破口令的成本 (集成测试里放宽)。 */
    @org.springframework.beans.factory.annotation.Value("${quantsim.auth.per-minute:10}")
    private int authPerMinute;

    private final AuthService authService;
    private final UserRepository userRepository;
    private final RateLimiter rateLimiter;

    @PostMapping("/register")
    public MeResponse register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
        rateLimiter.check("auth", "ip:" + request.getRemoteAddr(), authPerMinute);
        User user = authService.register(body.username(), body.password());
        CurrentUser.login(request, user.getUserId());
        return new MeResponse(toInfo(user));
    }

    @PostMapping("/login")
    public MeResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        rateLimiter.check("auth", "ip:" + request.getRemoteAddr(), authPerMinute);
        User user = authService.authenticate(body.username(), body.password());
        CurrentUser.login(request, user.getUserId());
        return new MeResponse(toInfo(user));
    }

    @PostMapping("/logout")
    public MeResponse logout(HttpServletRequest request) {
        CurrentUser.logout(request);
        return new MeResponse(null);
    }

    /** 未登录返回 user=null (200), 方便前端无痛引导。 */
    @GetMapping("/me")
    public MeResponse me(HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        if (userId == null) {
            return new MeResponse(null);
        }
        return new MeResponse(userRepository.findById(userId).map(AuthController::toInfo).orElse(null));
    }

    private static UserInfo toInfo(User u) {
        return new UserInfo(u.getUserId(), u.getUsername(), u.getCreatedAt());
    }
}
