package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.DailyIndicator;

public interface DailyIndicatorRepository extends JpaRepository<DailyIndicator, Long> {

    List<DailyIndicator> findByStockId(Long stockId);
}
