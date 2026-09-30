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
import com.quantsim.repository.UserRepository;
import com.quantsim.service.BacktestService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/backtest")
@RequiredArgsConstructor
public class BacktestController {

    private final BacktestService backtestService;
    private final UserRepository userRepository;

    @PostMapping("/run")
    public RunResponse run(@Valid @RequestBody RunRequest request, HttpServletRequest http) {
        String username = sessionUsername(http);
        if (username != null) {
            request = new RunRequest(username, request.stockCode(), request.strategy(),
                    request.fastWindow(), request.slowWindow(), request.lookbackDays(),
                    request.maWindow(), request.threshold(),
                    request.buyConditions(), request.sellConditions(),
                    request.rsiPeriod(), request.rsiBuy(), request.rsiSell(),
                    request.macdFast(), request.macdSlow(), request.macdSignal(),
                    request.bollWindow(), request.bollK(),
                    request.gridPct(), request.gridLevels(),
                    request.turtleEntry(), request.turtleExit(), request.positionPct());
        }
        return backtestService.run(request);
    }

    @PostMapping("/tune")
    public TuneResponse tune(@Valid @RequestBody TuneRequest request, HttpServletRequest http) {
        String username = sessionUsername(http);
        if (username != null) {
            request = new TuneRequest(username, request.stockCode(), request.strategy());
        }
        return backtestService.tune(request);
    }

    /** 已登录返回会话用户名 (覆盖 body), 游客返回 null。 */
    private String sessionUsername(HttpServletRequest http) {
        Long userId = CurrentUser.idOrNull(http);
        return userId == null ? null : userRepository.findById(userId).orElseThrow().getUsername();
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
