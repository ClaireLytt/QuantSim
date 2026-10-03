package com.quantsim.repository;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.DailyChallenge;

public interface DailyChallengeRepository extends JpaRepository<DailyChallenge, LocalDate> {
}
