package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.UserPoints;

import jakarta.persistence.LockModeType;

public interface UserPointsRepository extends JpaRepository<UserPoints, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserPoints> findWithLockByUserId(Long userId);

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
