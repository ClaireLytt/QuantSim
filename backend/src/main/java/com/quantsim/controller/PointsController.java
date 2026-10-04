package com.quantsim.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.service.PointsService;
import com.quantsim.service.PointsService.PointsState;
import com.quantsim.service.PointsService.SpinResult;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/** 积分系统 (需登录, AuthFilter 保护 /api/me/ 前缀): 状态/签到/转盘/兑换/道具消耗。 */
@RestController
@RequestMapping("/api/me/points")
@RequiredArgsConstructor
public class PointsController {

    private final PointsService pointsService;

    public record RedeemRequest(String itemId) {}

    public record UseItemRequest(String kind) {}

    @GetMapping
    public PointsState state(HttpServletRequest http) {
        return pointsService.state(CurrentUser.idOrNull(http));
    }

    @PostMapping("/signin")
    public PointsState signIn(HttpServletRequest http) {
        return pointsService.signIn(CurrentUser.idOrNull(http));
    }

    @PostMapping("/spin")
    public SpinResult spin(HttpServletRequest http) {
        return pointsService.spin(CurrentUser.idOrNull(http));
    }

    @PostMapping("/redeem")
    public Map<String, Object> redeem(@RequestBody RedeemRequest body, HttpServletRequest http) {
        return pointsService.redeem(CurrentUser.idOrNull(http), body.itemId());
    }

    /** 仅「时间加速」走这里显式扣; 预知卡/后悔药在对局端点内部扣。 */
    @PostMapping("/use-item")
    public PointsState useItem(@RequestBody UseItemRequest body, HttpServletRequest http) {
        return pointsService.consumeItem(CurrentUser.idOrNull(http), body.kind());
    }
}
