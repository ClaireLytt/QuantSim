package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.PendingOrder;

public interface PendingOrderRepository extends JpaRepository<PendingOrder, Long> {

    List<PendingOrder> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    List<PendingOrder> findBySessionIdAndStatusOrderByCreatedAtAsc(Long sessionId, PendingOrder.Status status);

    long countBySessionIdAndStatus(Long sessionId, PendingOrder.Status status);
}
