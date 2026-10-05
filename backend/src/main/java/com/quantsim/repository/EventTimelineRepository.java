package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.EventTimelineItem;

public interface EventTimelineRepository extends JpaRepository<EventTimelineItem, Long> {

    List<EventTimelineItem> findByScenarioIdOrderByEventDateAsc(Long scenarioId);
}
