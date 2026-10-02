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

    @GetMapping
    public List<LeaderboardEntry> leaderboard(@RequestParam(required = false) String season,
                                              @RequestParam(required = false) String sort) {
        return leaderboardService.topSessions(season, sort);
    }

    /** 全部赛季 (YYYY-MM, 降序) */
    @GetMapping("/seasons")
    public List<String> seasons() {
        return leaderboardService.seasons();
    }
}
