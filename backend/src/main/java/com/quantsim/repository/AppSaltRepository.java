package com.quantsim.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.quantsim.entity.AppSalt;

public interface AppSaltRepository extends JpaRepository<AppSalt, String> {

    /** 并发安全的首插 (同 DailyChallengeRepository.insertIgnore): 撞主键静默跳过。 */
    @Modifying
    @Query(value = """
            INSERT IGNORE INTO app_salts (name, salt, created_at)
            VALUES (:name, :salt, NOW())
            """, nativeQuery = true)
    void insertIgnore(@Param("name") String name, @Param("salt") long salt);
}
