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
        long now = System.currentTimeMillis();
        if (hits.size() > MAX_KEYS) {
            // 只删空队列不够: 过期时间戳只在"同 key 下一次 check"里被 pollFirst, 海量一次性
            // 伪造 IP 各留 1 条戳的非空队列永远删不掉, map 单调增长可被低速扫描撑爆内存。
            // 最长窗口是 DAY_MS (daily 桶), 末条时间戳超过它的队列整体过期, 一并清掉。
            hits.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    Long lastHit = e.getValue().peekLast();
                    return lastHit == null || now - lastHit > DAY_MS;
                }
            });
        }
        String fullKey = bucket + '|' + key;
        Deque<Long> q = hits.computeIfAbsent(fullKey, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > windowMs) {
                q.pollFirst();
            }
            if (q.size() >= max) {
                throw new BusinessException(message);
            }
            q.addLast(now);
        }
        // 清理竞态兜底: 上面的 removeIf 可能恰好把刚 computeIfAbsent 出来的空队列摘掉,
        // 本次命中就记进了孤儿队列 (限流被旁路)。写完后把队列挂回去; 若已被其他线程
        // 重建则放弃本次计数 (丢一跳好过整体旁路)。
        hits.putIfAbsent(fullKey, q);
    }
}
