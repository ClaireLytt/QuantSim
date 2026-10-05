package com.quantsim.repository;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.quantsim.entity.DailyChallenge;

public interface DailyChallengeRepository extends JpaRepository<DailyChallenge, LocalDate> {

    /** 并发安全的首插: INSERT IGNORE 撞主键静默跳过, 不会把当前事务标记 rollback-only。 */
    @Modifying
    @Query(value = """
            INSERT IGNORE INTO daily_challenges (challenge_date, stock_id, start_date, created_at)
            VALUES (:date, :stockId, :startDate, NOW())
            """, nativeQuery = true)
    void insertIgnore(@Param("date") LocalDate date, @Param("stockId") long stockId,
                      @Param("startDate") LocalDate startDate);
}
