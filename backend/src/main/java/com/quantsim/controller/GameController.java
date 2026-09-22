package com.quantsim.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.dto.GameDtos.AdvisorResponse;
import com.quantsim.dto.GameDtos.HistoryResponse;
import com.quantsim.dto.GameDtos.SettleResponse;
import com.quantsim.dto.GameDtos.StartGameRequest;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.dto.GameDtos.StatusResponse;
import com.quantsim.dto.GameDtos.TickResponse;
import com.quantsim.dto.GameDtos.TradeRequest;
import com.quantsim.dto.GameDtos.TradeResponse;
import com.quantsim.service.AdvisorService;
import com.quantsim.service.GameService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;
    private final AdvisorService advisorService;

    @PostMapping("/start")
    public StartGameResponse start(@Valid @RequestBody StartGameRequest request) {
        return gameService.startGame(request);
    }

    @GetMapping("/{sessionId}/history")
    public HistoryResponse history(@PathVariable Long sessionId) {
        return gameService.getHistory(sessionId);
    }

    @PostMapping("/{sessionId}/tick")
    public TickResponse tick(@PathVariable Long sessionId) {
        return gameService.tick(sessionId);
    }

    @PostMapping("/{sessionId}/trade")
    public TradeResponse trade(@PathVariable Long sessionId,
                               @Valid @RequestBody TradeRequest request) {
        return gameService.trade(sessionId, request);
    }

    @GetMapping("/{sessionId}/status")
    public StatusResponse status(@PathVariable Long sessionId) {
        return gameService.getStatus(sessionId);
    }

    @PostMapping("/{sessionId}/settle")
    public SettleResponse settle(@PathVariable Long sessionId) {
        return gameService.settle(sessionId);
    }

    @PostMapping("/{sessionId}/advisor")
    public AdvisorResponse advisor(@PathVariable Long sessionId,
                                   @RequestParam(required = false) String lang) {
        return advisorService.advise(sessionId, lang);
    }

    @PostMapping("/{sessionId}/review")
    public AdvisorResponse review(@PathVariable Long sessionId,
                                  @RequestParam(required = false) String lang) {
        return advisorService.review(sessionId, lang);
    }
}
