package com.quantsim.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.TradeTransaction;

public interface TransactionRepository extends JpaRepository<TradeTransaction, Long> {

    List<TradeTransaction> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    @Query("select coalesce(sum(t.fee), 0) from TradeTransaction t where t.sessionId = :sessionId")
    BigDecimal sumFeesBySessionId(Long sessionId);
}
