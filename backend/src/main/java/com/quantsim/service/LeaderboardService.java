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

    /** sort=sharpe 走夏普榜 (风险调整后收益), 其余按总收益。 */
    @Transactional(readOnly = true)
    public List<LeaderboardEntry> topSessions(String season, String sort) {
        String filter = season == null || season.isBlank() ? null : season.trim();
        var page = PageRequest.of(0, props.getLeaderboardSize());
        List<Object[]> rows = "sharpe".equalsIgnoreCase(sort)
                ? sessionRepository.findLeaderboardBySharpe(GameSession.Status.SETTLED, filter, page)
                : sessionRepository.findLeaderboard(GameSession.Status.SETTLED, filter, page);
        // 公开榜: 过滤自动化测试账号 + 邮箱用户名脱敏 (见 PublicNames)
        return rows.stream()
                .filter(row -> !PublicNames.isTestAccount((String) row[1]))
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new LeaderboardEntry(
                            s.getSessionId(), PublicNames.mask((String) row[1]), (String) row[2], (String) row[3],
                            s.getStartDate(), s.getFinalReturnRate(), s.getFinalSharpe());
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<String> seasons() {
        return sessionRepository.findSeasons();
    }
}
