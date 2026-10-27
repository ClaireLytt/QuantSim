package com.quantsim.service;

import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.LeaderboardEntry;
import com.quantsim.entity.GameSession;
import com.quantsim.repository.GameSessionRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class LeaderboardService {

    private final GameSessionRepository sessionRepository;
    private final GameProperties props;

    /** 稳定榜入榜门槛: 完赛局数不足该值的用户不参与均值排序 (小样本均值即运气)。 */
    static final int AVG_MIN_GAMES = 3;

    /** sort=sharpe 走夏普榜 (风险调整后收益), sort=avg 走稳定榜 (用户均值), 其余按总收益。 */
    @Transactional(readOnly = true)
    public List<LeaderboardEntry> topSessions(String season, String sort, Long authUserId) {
        String filter = season == null || season.isBlank() ? null : season.trim();
        var page = PageRequest.of(0, props.getLeaderboardSize());
        int minTicks = props.getTotalTicks(); // 只收打满全程 (或强平) 的局, 防秒结算摘樱桃
        if ("avg".equalsIgnoreCase(sort)) {
            return sessionRepository.findLeaderboardByAvg(GameSession.Status.SETTLED, filter,
                            minTicks, AVG_MIN_GAMES, page).stream()
                    .map(row -> new LeaderboardEntry(null, PublicNames.mask((String) row[1]),
                            null, null, null,
                            // JPQL avg() 规范返回 Double, 统一经 Number 转回 4 位小数口径
                            java.math.BigDecimal.valueOf(((Number) row[2]).doubleValue())
                                    .setScale(4, java.math.RoundingMode.HALF_UP),
                            null, PublicNames.isSelf((Long) row[0], authUserId),
                            null, ((Number) row[3]).intValue()))
                    .toList();
        }
        List<Object[]> rows = "sharpe".equalsIgnoreCase(sort)
                ? sessionRepository.findLeaderboardBySharpe(GameSession.Status.SETTLED, filter, minTicks, page)
                : sessionRepository.findLeaderboard(GameSession.Status.SETTLED, filter, minTicks, page);
        // 公开榜: 测试账号已在查询里排除 (分页前, 不挤占名额); 这里只做邮箱脱敏 + isSelf 标记
        return rows.stream()
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new LeaderboardEntry(
                            s.getSessionId(), PublicNames.mask((String) row[1]), (String) row[2], (String) row[3],
                            s.getStartDate(), s.getFinalReturnRate(), s.getFinalSharpe(),
                            PublicNames.isSelf(s.getUserId(), authUserId),
                            s.getDaysElapsed(), null);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<String> seasons() {
        return sessionRepository.findSeasons();
    }
}
