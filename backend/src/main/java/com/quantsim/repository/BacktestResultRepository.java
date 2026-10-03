package com.quantsim.repository;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.BacktestResult;

public interface BacktestResultRepository extends JpaRepository<BacktestResult, Long> {

    @Query("""
            select b, u.username, st.name, st.code
            from BacktestResult b
            join User u on u.userId = b.userId
            join Stock st on st.stockId = b.stockId
            where (:season is null or b.season = :season)
            order by b.totalReturn desc
            """)
    List<Object[]> findArenaLeaderboard(String season, Pageable pageable);

    @Query("""
            select b, st.name, st.code
            from BacktestResult b
            join Stock st on st.stockId = b.stockId
            where b.userId = :userId
            order by b.createdAt desc
            """)
    List<Object[]> findMyBacktests(Long userId, Pageable pageable);
}
