package com.quantsim.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.quantsim.entity.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    /** 并发安全的首插: INSERT IGNORE 撞唯一键静默跳过, 不会把外层事务标记 rollback-only。 */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(
            value = "INSERT IGNORE INTO users (username) VALUES (:username)", nativeQuery = true)
    void insertIgnore(@org.springframework.data.repository.query.Param("username") String username);
}
