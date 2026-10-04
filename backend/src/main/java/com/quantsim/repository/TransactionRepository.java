package com.quantsim.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.TradeTransaction;

public interface TransactionRepository extends JpaRepository<TradeTransaction, Long> {

    List<TradeTransaction> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    /** T+1 校验用: 查某交易日的流水 (量小, 标的过滤在内存做) */
    List<TradeTransaction> findBySessionIdAndTradeDate(Long sessionId, java.time.LocalDate tradeDate);

    @Query("select coalesce(sum(t.fee), 0) from TradeTransaction t where t.sessionId = :sessionId")
    BigDecimal sumFeesBySessionId(Long sessionId);
}
