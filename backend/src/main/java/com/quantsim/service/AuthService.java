package com.quantsim.service;

import java.time.LocalDateTime;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /**
     * 注册。用户名已存在且有密码 -> 拒绝; 已存在但无密码 (历史游客行) -> 认领:
     * 补上密码哈希, 过往战绩自然归入该账户。
     */
    @Transactional
    public User register(String username, String rawPassword) {
        String name = username.trim();
        if (name.isEmpty()) {
            throw new BusinessException("用户名不能为空");
        }
        User existing = userRepository.findByUsername(name).orElse(null);
        if (existing != null) {
            if (existing.getPasswordHash() != null) {
                throw new BusinessException("用户名已被注册");
            }
            existing.setPasswordHash(encoder.encode(rawPassword));
            existing.setLastLoginAt(LocalDateTime.now());
            return existing;
        }
        User u = new User();
        u.setUsername(name);
        u.setPasswordHash(encoder.encode(rawPassword));
        u.setLastLoginAt(LocalDateTime.now());
        return userRepository.save(u);
    }

    /** 登录。游客行 (无密码) 提示先注册认领。 */
    @Transactional
    public User authenticate(String username, String rawPassword) {
        User user = userRepository.findByUsername(username.trim())
                .orElseThrow(() -> new BusinessException("用户名或密码错误"));
        if (user.getPasswordHash() == null) {
            throw new BusinessException("该用户名是游客记录, 注册即可认领");
        }
        if (!encoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BusinessException("用户名或密码错误");
        }
        user.setLastLoginAt(LocalDateTime.now());
        return user;
    }
}
