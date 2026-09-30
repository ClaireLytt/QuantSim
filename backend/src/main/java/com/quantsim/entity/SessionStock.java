package com.quantsim.entity;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 组合模式的标的清单, slot 0 为主标的。 */
@Getter
@Setter
@Entity
@Table(name = "session_stocks")
@IdClass(SessionStock.Key.class)
public class SessionStock {

    @Getter
    @Setter
    public static class Key implements Serializable {
        private Long sessionId;
        private Integer slot;

        public Key() {}

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && sessionId.equals(k.sessionId) && slot.equals(k.slot);
        }

        @Override
        public int hashCode() {
            return sessionId.hashCode() * 31 + slot;
        }
    }

    @Id
    @Column(name = "session_id")
    private Long sessionId;

    @Id
    @Column(name = "slot")
    private Integer slot;

    @Column(name = "stock_id", nullable = false)
    private Long stockId;
}
