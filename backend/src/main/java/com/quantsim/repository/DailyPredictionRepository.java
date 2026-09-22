package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.DailyPrediction;

public interface DailyPredictionRepository extends JpaRepository<DailyPrediction, Long> {

    List<DailyPrediction> findByStockId(Long stockId);
}
