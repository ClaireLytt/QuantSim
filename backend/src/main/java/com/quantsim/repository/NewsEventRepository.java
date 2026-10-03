package com.quantsim.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.NewsEvent;

public interface NewsEventRepository extends JpaRepository<NewsEvent, Long> {

    List<NewsEvent> findByEventDate(LocalDate eventDate);
}
