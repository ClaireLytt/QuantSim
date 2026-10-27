package com.quantsim.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.quantsim.entity.BlindWeekSalt;

public interface BlindWeekSaltRepository extends JpaRepository<BlindWeekSalt, Integer> {

    /** 并发安全的首插 (同 DailyChallengeRepository.insertIgnore): 撞主键静默跳过。 */
    @Modifying
    @Query(value = """
            INSERT IGNORE INTO blind_week_salts (week_idx, salt, created_at)
            VALUES (:weekIdx, :salt, NOW())
            """, nativeQuery = true)
    void insertIgnore(@Param("weekIdx") int weekIdx, @Param("salt") long salt);
}
