package com.quantsim.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.service.BlindTournamentService;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/** 擂台盲测赛: 报名 (锁死) / 看榜 (过去的周才揭晓)。 */
@RestController
@RequestMapping("/api/blind")
@RequiredArgsConstructor
public class BlindTournamentController {

    private final BlindTournamentService blindTournamentService;

    @PostMapping("/submit")
    public BlindTournamentService.SubmitResult submit(@RequestBody Map<String, Object> config,
                                                      HttpServletRequest request) {
        return blindTournamentService.submit(CurrentUser.idOrNull(request), config);
    }

    @GetMapping("/board")
    public BlindTournamentService.Board board(@RequestParam(required = false) Integer week,
                                              HttpServletRequest request) {
        return blindTournamentService.board(week, CurrentUser.idOrNull(request));
    }
}
