package com.quantsim.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.dto.GameDtos.LeaderboardEntry;
import com.quantsim.service.LeaderboardService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/leaderboard")
@RequiredArgsConstructor
public class LeaderboardController {

    private final LeaderboardService leaderboardService;
    private final com.quantsim.service.PointsService pointsService;

    @GetMapping
    public List<LeaderboardEntry> leaderboard(@RequestParam(required = false) String season,
                                              @RequestParam(required = false) String sort,
                                              jakarta.servlet.http.HttpServletRequest http) {
        // isSelf 标记需要登录态; 游客拿到全 false, 不影响榜单本体
        return leaderboardService.topSessions(season, sort, com.quantsim.config.CurrentUser.idOrNull(http));
    }

    /** 积分榜 TOP20: [{username, balance}] */
    @GetMapping("/points")
    public java.util.List<java.util.Map<String, Object>> points() {
        // 公开榜: 测试账号已在查询里排除; 这里只做邮箱脱敏
        return pointsService.board(20).stream()
                .map(r -> java.util.Map.<String, Object>of(
                        "username", com.quantsim.service.PublicNames.mask((String) r[0]), "balance", r[1]))
                .toList();
    }

    /** 全部赛季 (YYYY-MM, 降序) */
    @GetMapping("/seasons")
    public List<String> seasons() {
        return leaderboardService.seasons();
    }
}
