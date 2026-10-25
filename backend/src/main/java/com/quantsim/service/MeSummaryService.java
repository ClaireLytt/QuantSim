package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.GameSession;
import com.quantsim.entity.UserPoints;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.UserPointsRepository;

import lombok.RequiredArgsConstructor;

/**
 * 「我的交易人生」首页聚合: 把已结算对局折算成一条人生净值曲线。
 * 口径 (2026-10-25 用户拍板):
 *  - 各模式初始资金不一, 统一归一化为 10 万起步的净值, 各局收益率按时间序几何连乘 (资金滚动);
 *  - 累计收益率 = 终值/10万 - 1; 胜率 = finalReturnRate>0 的局数占比;
 *  - 最大回撤 = 净值序列 (含 10 万起点) 的峰谷最大跌幅。
 * 只读聚合, 不落库; 曲线点数 = 已结算局数 (前端自行补起点)。
 */
@Service
@RequiredArgsConstructor
public class MeSummaryService {

    /** 归一化基准本金 (10 万) */
    public static final BigDecimal BASE_ASSETS = new BigDecimal("100000");

    private final GameSessionRepository sessionRepository;
    private final UserPointsRepository pointsRepository;

    public record CurvePoint(LocalDate date, BigDecimal value) {}

    public record LifeSummary(int settledCount, int wins, BigDecimal virtualAssets,
            BigDecimal cumulativeReturn, BigDecimal winRate, BigDecimal maxDrawdown,
            int signInStreak, List<CurvePoint> curve) {}

    @Transactional(readOnly = true)
    public LifeSummary summary(Long userId) {
        List<GameSession> sessions = sessionRepository
                .findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                        userId, GameSession.Status.SETTLED);
        BigDecimal net = BASE_ASSETS;
        BigDecimal peak = BASE_ASSETS;
        BigDecimal maxDd = BigDecimal.ZERO;
        int wins = 0;
        List<CurvePoint> curve = new ArrayList<>(sessions.size());
        for (GameSession s : sessions) {
            BigDecimal r = s.getFinalReturnRate();
            if (r.signum() > 0) {
                wins++;
            }
            net = net.multiply(BigDecimal.ONE.add(r)).setScale(2, RoundingMode.HALF_UP);
            if (net.compareTo(peak) > 0) {
                peak = net;
            } else {
                BigDecimal dd = peak.subtract(net).divide(peak, 4, RoundingMode.HALF_UP);
                if (dd.compareTo(maxDd) > 0) {
                    maxDd = dd;
                }
            }
            curve.add(new CurvePoint(s.getCreatedAt().toLocalDate(), net));
        }
        int n = sessions.size();
        BigDecimal cumReturn = net.subtract(BASE_ASSETS).divide(BASE_ASSETS, 4, RoundingMode.HALF_UP);
        BigDecimal winRate = n == 0 ? BigDecimal.ZERO.setScale(4)
                : BigDecimal.valueOf(wins).divide(BigDecimal.valueOf(n), 4, RoundingMode.HALF_UP);
        int streak = pointsRepository.findById(userId).map(UserPoints::getSignInStreak).orElse(0);
        return new LifeSummary(n, wins, net, cumReturn, winRate, maxDd, streak, curve);
    }
}
