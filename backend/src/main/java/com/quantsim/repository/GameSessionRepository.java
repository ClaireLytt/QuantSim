package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.GameSession;

import jakarta.persistence.LockModeType;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<GameSession> findWithLockBySessionId(Long sessionId);

    @Query("""
            select s, u.username, st.name, st.code
            from GameSession s
            join User u on u.userId = s.userId
            join Stock st on st.stockId = s.stockId
            where s.status = :status
            order by s.finalReturnRate desc
            """)
    List<Object[]> findLeaderboard(GameSession.Status status, Pageable pageable);
}
