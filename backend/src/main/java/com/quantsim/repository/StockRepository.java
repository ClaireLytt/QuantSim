package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.Stock;

public interface StockRepository extends JpaRepository<Stock, Long> {

    Optional<Stock> findByCode(String code);

    /** 公开标的列表: 事件回放的 hidden 场景行情绝不能混进来 (防比对泄题) */
    List<Stock> findByHiddenFalse();

    List<Stock> findByHiddenFalse(Sort sort);
}
