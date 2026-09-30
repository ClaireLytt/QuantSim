package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.quantsim.entity.Position;

import jakarta.persistence.LockModeType;

public interface PositionRepository extends JpaRepository<Position, Long> {

    List<Position> findBySessionId(Long sessionId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Position> findWithLockBySessionIdAndStockId(Long sessionId, Long stockId);
}
