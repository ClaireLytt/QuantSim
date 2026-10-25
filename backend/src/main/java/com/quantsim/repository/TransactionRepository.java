package com.quantsim.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.TradeTransaction;

public interface TransactionRepository extends JpaRepository<TradeTransaction, Long> {

    List<TradeTransaction> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    /** 限制条件玩法: 本局已成交笔数 (手动交易与挂单成交同计) */
    long countBySessionId(Long sessionId);

    /** T+1 校验用: 查某交易日的流水 (量小, 标的过滤在内存做) */
    List<TradeTransaction> findBySessionIdAndTradeDate(Long sessionId, java.time.LocalDate tradeDate);

    @Query("select coalesce(sum(t.fee), 0) from TradeTransaction t where t.sessionId = :sessionId")
    BigDecimal sumFeesBySessionId(Long sessionId);

    /** 我的交易人生: 某用户全部已结算对局的流水 (按局分组、局内时间升序), 逐笔配对胜率用 */
    @Query("""
            select t from TradeTransaction t
            join GameSession s on s.sessionId = t.sessionId
            where s.userId = :userId and s.status = :status
            order by t.sessionId asc, t.createdAt asc, t.txId asc
            """)
    List<TradeTransaction> findByUserAndSessionStatus(Long userId,
            com.quantsim.entity.GameSession.Status status);
}
