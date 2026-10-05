package com.quantsim.controller;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.dto.AuthDtos.ProgressRequest;
import com.quantsim.dto.AuthDtos.ProgressResponse;
import com.quantsim.entity.BacktestResult;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.UserProgress;
import com.quantsim.repository.BacktestResultRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.UserProgressRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/** 「我的」板块: 学堂进度云同步 + 个人战绩历史。路径受 AuthFilter 保护。 */
@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

    private static final int HISTORY_LIMIT = 50;

    private final UserProgressRepository progressRepository;
    private final GameSessionRepository sessionRepository;
    private final BacktestResultRepository backtestRepository;
    private final com.quantsim.service.BiasAnalysisService biasAnalysisService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public record GameRecord(
            Long sessionId, String stockName, String stockCode, LocalDate startDate,
            String status, String mode, String aiModel, BigDecimal returnRate, LocalDateTime createdAt) {}

    public record BacktestRecord(
            Long backtestId, String stockName, String stockCode, String strategy, String params,
            BigDecimal totalReturn, BigDecimal sharpeRatio, BigDecimal maxDrawdown,
            LocalDateTime createdAt) {}

    @GetMapping("/progress")
    public ProgressResponse getProgress(HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        return progressRepository.findById(userId)
                .map(p -> new ProgressResponse(p.getProgressJson(), p.getUpdatedAt()))
                .orElse(new ProgressResponse(null, null));
    }

    @PostMapping("/progress")
    public ProgressResponse saveProgress(@Valid @RequestBody ProgressRequest body,
                                         HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        UserProgress p = progressRepository.findById(userId).orElseGet(() -> {
            UserProgress np = new UserProgress();
            np.setUserId(userId);
            return np;
        });
        p.setProgressJson(body.progressJson());
        p.setUpdatedAt(LocalDateTime.now());
        progressRepository.save(p);
        return new ProgressResponse(p.getProgressJson(), p.getUpdatedAt());
    }

    /** 行为偏差档案: 跨对局聚合诊断趋势 (诊断在结算时已 JSON 落库, 这里只读+聚合)。 */
    @GetMapping("/bias-profile")
    public com.quantsim.dto.GameDtos.BiasProfile biasProfile(HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        List<com.quantsim.dto.GameDtos.BiasReport> reports = sessionRepository
                .findTop60ByUserIdAndStatusAndBiasReportIsNotNullOrderByCreatedAtAsc(
                        userId, GameSession.Status.SETTLED)
                .stream()
                .map(sess -> {
                    try {
                        return objectMapper.readValue(sess.getBiasReport(),
                                com.quantsim.dto.GameDtos.BiasReport.class);
                    } catch (Exception e) {
                        return null; // 个别坏数据跳过, 不拖垮整页
                    }
                })
                .filter(java.util.Objects::nonNull)
                .toList();
        return biasAnalysisService.profile(reports);
    }

    @GetMapping("/games")
    public List<GameRecord> myGames(HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        return sessionRepository.findMyGames(userId, PageRequest.of(0, HISTORY_LIMIT)).stream()
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new GameRecord(s.getSessionId(), (String) row[1], (String) row[2],
                            s.getStartDate(), s.getStatus().name(), s.getMode(), s.getAiModel(),
                            s.getFinalReturnRate(), s.getCreatedAt());
                })
                .toList();
    }

    @GetMapping("/backtests")
    public List<BacktestRecord> myBacktests(HttpServletRequest request) {
        Long userId = CurrentUser.idOrNull(request);
        return backtestRepository.findMyBacktests(userId, PageRequest.of(0, HISTORY_LIMIT)).stream()
                .map(row -> {
                    BacktestResult b = (BacktestResult) row[0];
                    return new BacktestRecord(b.getBacktestId(), (String) row[1], (String) row[2],
                            b.getStrategy(), b.getParams(), b.getTotalReturn(), b.getSharpeRatio(),
                            b.getMaxDrawdown(), b.getCreatedAt());
                })
                .toList();
    }
}
