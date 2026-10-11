package com.quantsim.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.EventScenario;

public interface EventScenarioRepository extends JpaRepository<EventScenario, Long> {

    List<EventScenario> findByEnabledTrue();
}
