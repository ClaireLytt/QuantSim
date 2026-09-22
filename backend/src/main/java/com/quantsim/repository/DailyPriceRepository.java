package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.DailyPrice;

public interface DailyPriceRepository extends JpaRepository<DailyPrice, Long> {

    List<DailyPrice> findByStockIdOrderByTradeDateAsc(Long stockId);

    /** 一条 GROUP BY 拿全部股票的数据量, 供开局选股, 替代逐只 COUNT */
    @Query("SELECT p.stockId, COUNT(p) FROM DailyPrice p GROUP BY p.stockId")
    List<Object[]> countGroupByStock();
}
