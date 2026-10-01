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

    /**
     * 解析"本次请求以谁的身份记战绩": 已登录以会话身份为准 (忽略 body 里的昵称);
     * 游客昵称若已被注册则拒绝, 防止冒名把战绩记到别人头上刷榜。
     */
    public User resolve(String username, Long authUserId) {
        if (authUserId != null) {
            return userRepository.findById(authUserId)
                    .orElseThrow(() -> new BusinessException("登录状态已失效, 请重新登录"));
        }
        String name = username == null ? "" : username.trim();
        if (name.isEmpty()) {
            throw new BusinessException("用户名不能为空");
        }
        User user = findOrCreate(name);
        if (user.getPasswordHash() != null) {
            throw new BusinessException("该用户名已被注册, 请登录后再玩");
        }
        return user;
    }

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
