package com.quantsim.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.SeedChallenge;

public interface SeedChallengeRepository extends JpaRepository<SeedChallenge, Long> {

    Optional<SeedChallenge> findByCode(String code);
}
