package com.quantsim.service;

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

    /**
     * 按用户名取用户, 不存在则创建。用 INSERT IGNORE 而非 saveAndFlush + catch:
     * 本方法常被包在外层事务里 (开局/回测), flush 撞唯一键会把整个事务标记
     * rollback-only, 重查成功也会在提交时翻车 (同 PointsService 曾经的并发首登 500)。
     */
    @org.springframework.transaction.annotation.Transactional
    public User findOrCreate(String username) {
        return userRepository.findByUsername(username).orElseGet(() -> {
            userRepository.insertIgnore(username);
            // 重读必须用锁定读 (当前读): 若 IGNORE 是被并发事务已提交的行"吃掉"的,
            // RR 快照下的普通 SELECT 仍看不到那行, 会误报创建失败。
            return userRepository.findWithLockByUsername(username)
                    .orElseThrow(() -> new BusinessException("用户创建失败: " + username));
        });
    }
}
