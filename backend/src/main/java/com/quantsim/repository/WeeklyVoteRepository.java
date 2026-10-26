package com.quantsim.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.WeeklyVote;

public interface WeeklyVoteRepository extends JpaRepository<WeeklyVote, Long> {

    Optional<WeeklyVote> findByWeekIdxAndUserId(int weekIdx, Long userId);

    long countByWeekIdxAndChoice(int weekIdx, String choice);
}
