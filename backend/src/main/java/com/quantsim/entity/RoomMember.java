package com.quantsim.entity;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "room_members")
@IdClass(RoomMember.Key.class)
public class RoomMember {

    @Getter
    @Setter
    public static class Key implements Serializable {
        private Long roomId;
        private Long userId;

        public Key() {}

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(roomId, k.roomId) && Objects.equals(userId, k.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(roomId, userId);
        }
    }

    @Id
    @Column(name = "room_id")
    private Long roomId;

    @Id
    @Column(name = "user_id")
    private Long userId;

    /** 成员点「开始我的对局」后关联的对局; 未开始为 NULL */
    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @PrePersist
    void prePersist() {
        if (joinedAt == null) {
            joinedAt = LocalDateTime.now();
        }
    }
}
