package com.quantsim.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    /** 按用户名取用户, 不存在则创建; 并发撞唯一约束时重查即可。 */
    public User findOrCreate(String username) {
        return userRepository.findByUsername(username).orElseGet(() -> {
            try {
                User u = new User();
                u.setUsername(username);
                return userRepository.saveAndFlush(u);
            } catch (DataIntegrityViolationException e) {
                return userRepository.findByUsername(username)
                        .orElseThrow(() -> new BusinessException("用户创建失败: " + username));
            }
        });
    }
}
