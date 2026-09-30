package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.SessionStock;

public interface SessionStockRepository extends JpaRepository<SessionStock, SessionStock.Key> {

    List<SessionStock> findBySessionIdOrderBySlotAsc(Long sessionId);
}
