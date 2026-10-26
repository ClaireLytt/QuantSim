package com.quantsim.service;

import java.security.SecureRandom;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.SeedChallenge;
import com.quantsim.entity.SeedChallengeEntry;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.SeedChallengeEntryRepository;
import com.quantsim.repository.SeedChallengeRepository;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * 同局战书 (好友玩法 1/8): A 用自己打完的一局立战书, B 凭 code 打完全相同的一局。
 * 公平三件套:
 *   同码同局 — 战书锁死 (标的, 起始日), AI 固定 NORMAL, 规则与经典局一致;
 *   先交卷后揭晓 — 自己未结算前, 榜上只显示人数与各自是否完赛, 看不到任何收益数字;
 *   标的匿名 — SEED 走竞技脱敏 (BlindDates), 防拿代码去研究所查"未来"。
 * SEED 模式不入公开排行榜 (榜查询只收 CLASSIC/PORTFOLIO), 同一战书 ≥4 人即小锦标赛视图。
 */
@Service
@RequiredArgsConstructor
public class SeedChallengeService {

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SeedChallengeRepository challengeRepository;
    private final SeedChallengeEntryRepository entryRepository;
    private final GameSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final GameStartService gameStart;

    public record CreateResult(String code) {}

    public record BoardEntry(String username, boolean isSelf, boolean isCreator,
                             boolean settled, java.math.BigDecimal returnRate) {}

    /** revealed=false 时 entries 里所有 returnRate 为 null (先交卷后揭晓)。 */
    public record ChallengeBoard(String code, int players, boolean joined, boolean revealed,
                                 Long mySessionId, List<BoardEntry> entries) {}

    @Transactional
    public CreateResult create(Long userId, Long sessionId) {
        requireLogin(userId);
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在"));
        // 属主校验 (security-lessons #1): 只能用自己的局立战书
        if (!session.getUserId().equals(userId)) {
            throw new BusinessException("只能用自己的对局立战书");
        }
        if (session.getStatus() != GameSession.Status.SETTLED) {
            throw new BusinessException("打完结算后才能立战书");
        }
        // v1 只支持经典单股局: 组合/生存/每日的规则参数无法在应战侧完整还原
        if (!"CLASSIC".equals(session.getMode()) || session.isAdvanced() || session.isRealRules()) {
            throw new BusinessException("战书目前只支持标准经典对局（无进阶/真实规则）");
        }
        SeedChallenge sc = new SeedChallenge();
        sc.setCode(randomCode());
        sc.setCreatorUserId(userId);
        sc.setStockId(session.getStockId());
        sc.setStartDate(session.getStartDate());
        sc = challengeRepository.save(sc);
        // 发起者的原局占一行, 榜上与应战者同口径
        SeedChallengeEntry mine = new SeedChallengeEntry();
        mine.setChallengeId(sc.getChallengeId());
        mine.setUserId(userId);
        mine.setSessionId(sessionId);
        entryRepository.save(mine);
        return new CreateResult(sc.getCode());
    }

    @Transactional
    public StartGameResponse accept(Long userId, String code) {
        requireLogin(userId);
        SeedChallenge sc = challengeRepository.findByCode(normalize(code))
                .orElseThrow(() -> new NotFoundException("战书不存在或已撤销"));
        if (entryRepository.findByChallengeIdAndUserId(sc.getChallengeId(), userId).isPresent()) {
            throw new BusinessException("你已应战过这张战书（一人一局）");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        // 固定 NORMAL AI + SEED 模式: 全员同条件; SEED 在 BlindDates 里走竞技脱敏
        StartGameResponse res = gameStart.startGameAt(user, sc.getStockId(), sc.getStartDate(),
                AiLevel.NORMAL, "SEED", false, null);
        SeedChallengeEntry entry = new SeedChallengeEntry();
        entry.setChallengeId(sc.getChallengeId());
        entry.setUserId(userId);
        entry.setSessionId(res.sessionId());
        entryRepository.save(entry);
        return res;
    }

    @Transactional(readOnly = true)
    public ChallengeBoard board(Long userId, String code) {
        SeedChallenge sc = challengeRepository.findByCode(normalize(code))
                .orElseThrow(() -> new NotFoundException("战书不存在或已撤销"));
        List<SeedChallengeEntry> entries = entryRepository
                .findByChallengeIdOrderByCreatedAtAsc(sc.getChallengeId());
        SeedChallengeEntry mine = userId == null ? null : entries.stream()
                .filter(e -> e.getUserId().equals(userId)).findFirst().orElse(null);
        // 先交卷后揭晓: 只有自己已结算才放出全场收益
        boolean revealed = false;
        if (mine != null) {
            GameSession ms = sessionRepository.findById(mine.getSessionId()).orElse(null);
            revealed = ms != null && ms.getStatus() == GameSession.Status.SETTLED;
        }
        final boolean show = revealed;
        List<BoardEntry> board = entries.stream().map(e -> {
            GameSession s = sessionRepository.findById(e.getSessionId()).orElse(null);
            boolean settled = s != null && s.getStatus() == GameSession.Status.SETTLED;
            String name = userRepository.findById(e.getUserId())
                    .map(u -> PublicNames.mask(u.getUsername())).orElse("?");
            return new BoardEntry(name, userId != null && e.getUserId().equals(userId),
                    e.getUserId().equals(sc.getCreatorUserId()), settled,
                    show && settled && s != null ? s.getFinalReturnRate() : null);
        }).sorted((a, b) -> {
            // 已揭晓按收益降序 (擂主 = 第一行); 未揭晓保持入场序
            if (!show || a.returnRate() == null || b.returnRate() == null) return 0;
            return b.returnRate().compareTo(a.returnRate());
        }).toList();
        return new ChallengeBoard(sc.getCode(), entries.size(), mine != null, revealed,
                mine == null ? null : mine.getSessionId(), board);
    }

    private static void requireLogin(Long userId) {
        if (userId == null) {
            throw new BusinessException("战书功能需要登录（成绩要记在名下才有得比）");
        }
    }

    private static String normalize(String code) {
        return code == null ? "" : code.trim().toUpperCase();
    }

    /** 10 位无易混字符码 (去掉 0/O/1/I), 空间 32^10, 碰撞由唯一键兜底。 */
    private static String randomCode() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }
}
