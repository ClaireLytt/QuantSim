package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.RoomMember;

public interface RoomMemberRepository extends JpaRepository<RoomMember, RoomMember.Key> {

    List<RoomMember> findByRoomIdOrderByJoinedAtAsc(Long roomId);

    Optional<RoomMember> findByRoomIdAndUserId(Long roomId, Long userId);

    long countByRoomId(Long roomId);
}
