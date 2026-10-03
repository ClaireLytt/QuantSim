package com.quantsim.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.dto.BacktestDtos.ArenaEntry;
import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.dto.BacktestDtos.RunResponse;
import com.quantsim.dto.BacktestDtos.StockInfo;
import com.quantsim.dto.BacktestDtos.TuneRequest;
import com.quantsim.dto.BacktestDtos.TuneResponse;
import com.quantsim.config.CurrentUser;
import com.quantsim.config.RateLimiter;
import com.quantsim.service.BacktestService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/backtest")
@RequiredArgsConstructor
public class BacktestController {

    /** 网格调参 CPU 密集, 按调用方限频。 */
    private static final int TUNE_PER_MINUTE = 6;

    private final BacktestService backtestService;
    private final RateLimiter rateLimiter;

    @PostMapping("/run")
    public RunResponse run(@Valid @RequestBody RunRequest request, HttpServletRequest http) {
        // 已登录以会话身份入榜 (忽略 body 用户名), 游客昵称由 service 校验
        return backtestService.run(request, CurrentUser.idOrNull(http));
    }

    @PostMapping("/tune")
    public TuneResponse tune(@Valid @RequestBody TuneRequest request, HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        rateLimiter.check("tune", userId != null ? "u:" + userId : "ip:" + http.getRemoteAddr(),
                TUNE_PER_MINUTE);
        return backtestService.tune(request, userId);
    }

    @GetMapping("/leaderboard")
    public List<ArenaEntry> leaderboard(@RequestParam(required = false) String season) {
        return backtestService.arenaLeaderboard(season);
    }

    @GetMapping("/stocks")
    public List<StockInfo> stocks() {
        return backtestService.listStocks();
    }
}
