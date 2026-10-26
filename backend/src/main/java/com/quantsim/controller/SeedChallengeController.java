package com.quantsim.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.service.SeedChallengeService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;

/** 同局战书: 创建/应战/看榜。登录校验在 service (成绩必须记名, 游客无从入榜)。 */
@RestController
@RequestMapping("/api/challenge")
@RequiredArgsConstructor
public class SeedChallengeController {

    private final SeedChallengeService seedChallengeService;

    public record CreateRequest(@NotNull Long sessionId) {}

    @PostMapping("/create")
    public SeedChallengeService.CreateResult create(@RequestBody CreateRequest req,
                                                    HttpServletRequest request) {
        return seedChallengeService.create(CurrentUser.idOrNull(request), req.sessionId());
    }

    @PostMapping("/{code}/accept")
    public StartGameResponse accept(@PathVariable String code, HttpServletRequest request) {
        return seedChallengeService.accept(CurrentUser.idOrNull(request), code);
    }

    @GetMapping("/{code}")
    public SeedChallengeService.ChallengeBoard board(@PathVariable String code,
                                                     HttpServletRequest request) {
        return seedChallengeService.board(CurrentUser.idOrNull(request), code);
    }
}
