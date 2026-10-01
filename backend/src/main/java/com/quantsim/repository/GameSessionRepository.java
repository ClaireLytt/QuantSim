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
              and s.mode in ('CLASSIC', 'PORTFOLIO')
              and (:season is null or s.season = :season)
            order by s.finalReturnRate desc
            """)
    List<Object[]> findLeaderboard(GameSession.Status status, String season, Pageable pageable);

    Optional<GameSession> findByUserIdAndChallengeDate(Long userId, java.time.LocalDate challengeDate);

    /** 某用户玩过的全部每日挑战日期 (降序), 用于计算连续挑战 streak。 */
    @Query("""
            select s.challengeDate
            from GameSession s
            where s.userId = :userId and s.challengeDate is not null
            order by s.challengeDate desc
            """)
    List<java.time.LocalDate> findChallengeDatesDesc(Long userId);

    @Query("""
            select s, u.username, st.name, st.code
            from GameSession s
            join User u on u.userId = s.userId
            join Stock st on st.stockId = s.stockId
            where s.challengeDate = :date and s.status = :status
            order by s.finalReturnRate desc
            """)
    List<Object[]> findDailyBoard(java.time.LocalDate date, GameSession.Status status, Pageable pageable);

    @Query("select distinct s.season from GameSession s where s.season is not null order by s.season desc")
    List<String> findSeasons();

    @Query("""
            select s, st.name, st.code
            from GameSession s
            join Stock st on st.stockId = s.stockId
            where s.userId = :userId
            order by s.createdAt desc
            """)
    List<Object[]> findMyGames(Long userId, Pageable pageable);
}
