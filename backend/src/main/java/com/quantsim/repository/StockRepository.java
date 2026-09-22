package com.quantsim.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.Stock;

public interface StockRepository extends JpaRepository<Stock, Long> {

    Optional<Stock> findByCode(String code);
}
