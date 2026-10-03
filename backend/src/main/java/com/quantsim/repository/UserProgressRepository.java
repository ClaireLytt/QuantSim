package com.quantsim.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.UserProgress;

public interface UserProgressRepository extends JpaRepository<UserProgress, Long> {
}
