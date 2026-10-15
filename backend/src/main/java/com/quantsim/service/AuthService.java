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
        UserService.requireValidName(name); // 与游客昵称同一套白名单 (防同形字冒充/零宽字符)
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
        try {
            return userRepository.saveAndFlush(u);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // 并发同名注册 (或游客行刚被创建) 撞唯一键: 转业务提示而非 500。
            // catch 后直接抛业务异常收场, 不在本事务继续写, 符合 CLAUDE.md 的约定
            throw new BusinessException("用户名已被注册");
        }
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
