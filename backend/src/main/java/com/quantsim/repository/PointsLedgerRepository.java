package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.PointsLedger;

public interface PointsLedgerRepository extends JpaRepository<PointsLedger, Long> {

    /** 非盲盒净收入 (只加正项): 大额兑换的资格口径, 盲盒返利刷不出来。 */
    @Query("""
            select coalesce(sum(l.delta), 0) from PointsLedger l
            where l.userId = :userId and l.delta > 0 and l.reason <> 'blindbox'
            """)
    long earnedExcludingBlindbox(Long userId);

    List<PointsLedger> findByUserIdOrderByLedgerIdAsc(Long userId);
}
