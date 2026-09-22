package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.TradeTransaction;

public interface TransactionRepository extends JpaRepository<TradeTransaction, Long> {

    List<TradeTransaction> findBySessionIdOrderByCreatedAtAsc(Long sessionId);
}
