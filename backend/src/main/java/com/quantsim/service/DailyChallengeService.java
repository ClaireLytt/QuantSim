package com.quantsim.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.List;
import java.util.Random;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.CompetitiveDtos.DailyBoardEntry;
import com.quantsim.dto.CompetitiveDtos.DailyToday;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyChallenge;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.DailyChallengeRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * 每日挑战: 种子 = SHA-256("QS-DAILY-" + 当天日期) 前 8 字节,
 * 合格标的按 stockId 排序后用该种子随机挑选, 因此全服同一天必然同题。
 * 题目在首个请求时固化入库, 之后数据重灌也不会漂移。
 */
@Service
@RequiredArgsConstructor
public class DailyChallengeService {

    private final DailyChallengeRepository challengeRepository;
    private final GameSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final GameService gameService;
    private final MarketDataService marketData;
    private final GameProperties props;

    /** 每日挑战固定用普通 AI, 保证全服同一对手。 */
    private static final AiLevel DAILY_AI = AiLevel.NORMAL;

    @Transactional
    public DailyToday today(Long userId) {
        LocalDate date = LocalDate.now(GameService.GAME_ZONE);
        DailyChallenge challenge = getOrCreate(date);
        Stock stock = marketData.load(challenge.getStockId()).stock();
        GameSession mine = sessionRepository.findByUserIdAndChallengeDate(userId, date).orElse(null);
        return new DailyToday(date, stock.getCode(), stock.getName(), stock.getMarket().name(),
                mine != null, mine == null ? null : mine.getSessionId(),
                mine != null && mine.getStatus() == GameSession.Status.SETTLED);
    }

    @Transactional
    public StartGameResponse start(Long userId) {
        LocalDate date = LocalDate.now(GameService.GAME_ZONE);
        DailyChallenge challenge = getOrCreate(date);
        if (sessionRepository.findByUserIdAndChallengeDate(userId, date).isPresent()) {
            throw new BusinessException("你今天已经玩过每日挑战, 明天再来");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        try {
            return gameService.startGameAt(user, challenge.getStockId(), challenge.getStartDate(),
                    DAILY_AI, "DAILY", date);
        } catch (DataIntegrityViolationException e) {
            // 并发双开撞 uk_user_daily
            throw new BusinessException("你今天已经玩过每日挑战, 明天再来");
        }
    }

    @Transactional(readOnly = true)
    public List<DailyBoardEntry> leaderboard(LocalDate date) {
        LocalDate day = date == null ? LocalDate.now(GameService.GAME_ZONE) : date;
        return sessionRepository.findDailyBoard(day, GameSession.Status.SETTLED,
                        PageRequest.of(0, props.getLeaderboardSize())).stream()
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new DailyBoardEntry((String) row[1], (String) row[2], (String) row[3],
                            s.getFinalReturnRate());
                })
                .toList();
    }

    private DailyChallenge getOrCreate(LocalDate date) {
        return challengeRepository.findById(date).orElseGet(() -> {
            Random random = new Random(seedFor(date));
            long[] pick = gameService.pickDeterministic(null, random);
            LocalDate startDate = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();
            DailyChallenge challenge = new DailyChallenge();
            challenge.setChallengeDate(date);
            challenge.setStockId(pick[0]);
            challenge.setStartDate(startDate);
            try {
                return challengeRepository.saveAndFlush(challenge);
            } catch (DataIntegrityViolationException e) {
                // 并发首个请求撞主键: 重读即可
                return challengeRepository.findById(date)
                        .orElseThrow(() -> new BusinessException("每日挑战生成失败"));
            }
        });
    }

    /** SHA-256("QS-DAILY-" + yyyy-MM-dd) 前 8 字节拼成 long。 */
    static long seedFor(LocalDate date) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(("QS-DAILY-" + date).getBytes(StandardCharsets.UTF_8));
            long seed = 0;
            for (int i = 0; i < 8; i++) {
                seed = (seed << 8) | (hash[i] & 0xffL);
            }
            return seed;
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
