package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.quantsim.entity.UserPoints;

import jakarta.persistence.LockModeType;

public interface UserPointsRepository extends JpaRepository<UserPoints, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserPoints> findWithLockByUserId(Long userId);

    /** 并发安全的首插: INSERT IGNORE 撞主键静默跳过, 不会把当前事务标记 rollback-only。 */
    @Modifying
    @Query(value = "INSERT IGNORE INTO user_points (user_id) VALUES (:userId)", nativeQuery = true)
    void insertIgnore(@Param("userId") Long userId);

    /** 积分榜: [username, balance] */
    @Query("""
            select u.username, p.balance
            from UserPoints p
            join User u on u.userId = p.userId
            where p.balance > 0
            order by p.balance desc
            """)
    List<Object[]> findPointsBoard(Pageable pageable);
}
