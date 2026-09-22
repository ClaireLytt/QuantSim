package com.quantsim.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.dto.BacktestDtos.ArenaEntry;
import com.quantsim.dto.BacktestDtos.RunRequest;
import com.quantsim.dto.BacktestDtos.RunResponse;
import com.quantsim.dto.BacktestDtos.StockInfo;
import com.quantsim.dto.BacktestDtos.TuneRequest;
import com.quantsim.dto.BacktestDtos.TuneResponse;
import com.quantsim.service.BacktestService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/backtest")
@RequiredArgsConstructor
public class BacktestController {

    private final BacktestService backtestService;

    @PostMapping("/run")
    public RunResponse run(@Valid @RequestBody RunRequest request) {
        return backtestService.run(request);
    }

    @PostMapping("/tune")
    public TuneResponse tune(@Valid @RequestBody TuneRequest request) {
        return backtestService.tune(request);
    }

    @GetMapping("/leaderboard")
    public List<ArenaEntry> leaderboard() {
        return backtestService.arenaLeaderboard();
    }

    @GetMapping("/stocks")
    public List<StockInfo> stocks() {
        return backtestService.listStocks();
    }
}
