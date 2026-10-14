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
                                              @RequestParam(required = false) String sort) {
        return leaderboardService.topSessions(season, sort);
    }

    /** 积分榜 TOP20: [{username, balance}] */
    @GetMapping("/points")
    public java.util.List<java.util.Map<String, Object>> points() {
        // 公开榜: 过滤测试账号 + 邮箱脱敏, 口径同收益榜 (PublicNames)
        return pointsService.board(20).stream()
                .filter(r -> !com.quantsim.service.PublicNames.isTestAccount((String) r[0]))
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
