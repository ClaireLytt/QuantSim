package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.BlindEntry;

public interface BlindEntryRepository extends JpaRepository<BlindEntry, Long> {

    List<BlindEntry> findByWeekIdxOrderByCreatedAtAsc(int weekIdx);

    Optional<BlindEntry> findByWeekIdxAndUserId(int weekIdx, Long userId);

    long countByWeekIdx(int weekIdx);
}
