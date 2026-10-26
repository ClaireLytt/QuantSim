package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.SeedChallengeEntry;

public interface SeedChallengeEntryRepository extends JpaRepository<SeedChallengeEntry, Long> {

    List<SeedChallengeEntry> findByChallengeIdOrderByCreatedAtAsc(Long challengeId);

    Optional<SeedChallengeEntry> findByChallengeIdAndUserId(Long challengeId, Long userId);

    Optional<SeedChallengeEntry> findBySessionId(Long sessionId);
}
