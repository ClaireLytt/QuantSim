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

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> topSessions() {
        return sessionRepository
                .findLeaderboard(GameSession.Status.SETTLED, PageRequest.of(0, props.getLeaderboardSize()))
                .stream()
                .map(row -> {
                    GameSession s = (GameSession) row[0];
                    return new LeaderboardEntry(
                            s.getSessionId(), (String) row[1], (String) row[2], (String) row[3],
                            s.getStartDate(), s.getFinalReturnRate());
                })
                .toList();
    }
}
