package com.quantsim.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.quantsim.entity.Room;

import jakarta.persistence.LockModeType;

public interface RoomRepository extends JpaRepository<Room, Long> {

    Optional<Room> findByCode(String code);

    /**
     * 并发安全的建房: 房间码撞唯一键时 INSERT IGNORE 静默跳过 (返回 0 行),
     * 调用方换码重试即可 —— saveAndFlush + catch 会把事务标记 rollback-only。
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(value = """
            INSERT IGNORE INTO rooms (code, creator_user_id, stock_id, start_date, ai_level,
                                      status, max_players, real_rules, expires_at, created_at)
            VALUES (:code, :creator, :stockId, :startDate, :aiLevel,
                    'OPEN', :maxPlayers, :realRules, :expiresAt, NOW())
            """, nativeQuery = true)
    int insertIgnore(@org.springframework.data.repository.query.Param("code") String code,
                     @org.springframework.data.repository.query.Param("creator") Long creator,
                     @org.springframework.data.repository.query.Param("stockId") Long stockId,
                     @org.springframework.data.repository.query.Param("startDate") java.time.LocalDate startDate,
                     @org.springframework.data.repository.query.Param("aiLevel") String aiLevel,
                     @org.springframework.data.repository.query.Param("maxPlayers") int maxPlayers,
                     @org.springframework.data.repository.query.Param("realRules") boolean realRules,
                     @org.springframework.data.repository.query.Param("expiresAt") java.time.LocalDateTime expiresAt);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Room> findWithLockByCode(String code);
}
