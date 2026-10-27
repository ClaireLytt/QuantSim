package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.PendingOrder;

public interface PendingOrderRepository extends JpaRepository<PendingOrder, Long> {

    List<PendingOrder> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    List<PendingOrder> findBySessionIdAndStatusOrderByCreatedAtAsc(Long sessionId, PendingOrder.Status status);

    long countBySessionIdAndStatus(Long sessionId, PendingOrder.Status status);

    /** 移动止损在挂期间占 2 笔预算 (TradeBudget), 需要单独计数。 */
    long countBySessionIdAndStatusAndOrderType(Long sessionId, PendingOrder.Status status,
                                               PendingOrder.Type orderType);
}
