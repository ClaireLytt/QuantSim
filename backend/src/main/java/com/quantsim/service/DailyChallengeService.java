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
        // 标的匿名: 自己结算前不暴露是哪只股票 (防拿代码去研究所查全量历史作弊)
        boolean revealed = mine != null && mine.getStatus() == GameSession.Status.SETTLED;
        return new DailyToday(date,
                revealed ? stock.getCode() : BlindDates.MASK_CODE,
                revealed ? stock.getName() : BlindDates.MASK_NAME,
                stock.getMarket().name(),
                mine != null, mine == null ? null : mine.getSessionId(),
                mine != null && mine.getStatus() == GameSession.Status.SETTLED,
                streak(userId, date));
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
                    DAILY_AI, "DAILY", false, date);
        } catch (DataIntegrityViolationException e) {
            // 并发双开撞 uk_user_daily
            throw new BusinessException("你今天已经玩过每日挑战, 明天再来");
        }
    }

    @Transactional(readOnly = true)
    public List<DailyBoardEntry> leaderboard(LocalDate date) {
        LocalDate day = date == null ? LocalDate.now(GameService.GAME_ZONE) : date;
        // 当天的榜单隐藏标的 (未玩的人看到会剧透), 历史日期正常展示
        boolean maskStock = day.equals(LocalDate.now(GameService.GAME_ZONE));
        return sessionRepository.findDailyBoard(day, GameSession.Status.SETTLED,
                        PageRequest.of(0, props.getLeaderboardSize())).stream()
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new DailyBoardEntry((String) row[1],
                            maskStock ? BlindDates.MASK_NAME : (String) row[2],
                            maskStock ? BlindDates.MASK_CODE : (String) row[3],
                            s.getFinalReturnRate());
                })
                .toList();
    }

    /** 连续挑战天数: 从 today (没玩则从昨天) 往回数连续参与的日子。 */
    private int streak(Long userId, LocalDate today) {
        List<LocalDate> days = sessionRepository.findChallengeDatesDesc(userId);
        if (days.isEmpty()) {
            return 0;
        }
        LocalDate expect = days.get(0).equals(today) ? today : today.minusDays(1);
        int count = 0;
        for (LocalDate d : days) {
            if (!d.equals(expect)) {
                break;
            }
            count++;
            expect = expect.minusDays(1);
        }
        return count;
    }

    private DailyChallenge getOrCreate(LocalDate date) {
        return challengeRepository.findById(date).orElseGet(() -> {
            Random random = new Random(seedFor(date));
            long[] pick = gameService.pickDeterministic(null, random);
            LocalDate startDate = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();
            // 不能 saveAndFlush + catch 唯一键冲突: flush 失败会把事务标记 rollback-only,
            // 后续写入全部在提交时翻车 (500)。INSERT IGNORE 撞主键静默跳过; 选股是日期种子
            // 确定性的, 并发双方插的是同一行, 重读结果一致。
            challengeRepository.insertIgnore(date, pick[0], startDate);
            return challengeRepository.findById(date)
                    .orElseThrow(() -> new BusinessException("每日挑战生成失败"));
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
