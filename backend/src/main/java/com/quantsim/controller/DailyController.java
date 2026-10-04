package com.quantsim.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.dto.CompetitiveDtos.DailyBoardEntry;
import com.quantsim.dto.CompetitiveDtos.DailyToday;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.service.DailyChallengeService;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/** 每日挑战 (路径受 AuthFilter 保护, 需登录)。 */
@RestController
@RequestMapping("/api/daily")
@RequiredArgsConstructor
public class DailyController {

    private final DailyChallengeService dailyService;

    @GetMapping("/today")
    public DailyToday today(HttpServletRequest http) {
        return dailyService.today(CurrentUser.idOrNull(http));
    }

    @PostMapping("/start")
    public StartGameResponse start(HttpServletRequest http) {
        return dailyService.start(CurrentUser.idOrNull(http));
    }

    @GetMapping("/leaderboard")
    public List<DailyBoardEntry> leaderboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dailyService.leaderboard(date);
    }
}
