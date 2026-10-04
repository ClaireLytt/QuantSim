package com.quantsim.config;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.quantsim.exception.BusinessException;

/**
 * 进程内滑动窗口限流: 保护烧钱 (LLM 调用) 与烧 CPU (网格调参) 的接口。
 * key 建议 "u:{userId}" 或 "ip:{addr}", bucket 区分接口组。单机部署够用, 多实例部署需换集中式方案。
 */
@Component
public class RateLimiter {

    private static final long WINDOW_MS = 60_000;
    /** 防御性上限: key 数超过它时清理空队列, 避免被海量伪造 IP 撑爆内存 */
    private static final int MAX_KEYS = 10_000;

    private final ConcurrentHashMap<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    private static final long DAY_MS = 24 * 60 * 60_000L;

    /** 24 小时滑动窗口配额 (用于全站 LLM 成本硬顶等), 超限抛 BusinessException。 */
    public void checkDaily(String bucket, String key, int maxPerDay) {
        check(bucket + ":daily", key, maxPerDay, DAY_MS,
                "今日额度已用完, 明天再来");
    }

    /** 每分钟超过 maxPerMinute 次抛 BusinessException (400)。 */
    public void check(String bucket, String key, int maxPerMinute) {
        check(bucket, key, maxPerMinute, WINDOW_MS, "请求过于频繁, 请稍后再试");
    }

    private void check(String bucket, String key, int max, long windowMs, String message) {
        if (hits.size() > MAX_KEYS) {
            hits.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    return e.getValue().isEmpty();
                }
            });
        }
        Deque<Long> q = hits.computeIfAbsent(bucket + '|' + key, k -> new ArrayDeque<>());
        long now = System.currentTimeMillis();
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > windowMs) {
                q.pollFirst();
            }
            if (q.size() >= max) {
                throw new BusinessException(message);
            }
            q.addLast(now);
        }
    }
}
