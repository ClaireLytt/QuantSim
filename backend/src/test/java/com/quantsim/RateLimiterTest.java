package com.quantsim;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.quantsim.config.RateLimiter;
import com.quantsim.exception.BusinessException;

/** 限流器纯单元测试: 不走 HTTP, 避免污染同 JVM 内其它集成测试的限流窗口。 */
class RateLimiterTest {

    @Test
    void allowsUpToLimitThenRejects() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 6; i++) {
            final int n = i;
            assertThatCode(() -> limiter.check("tune", "u:1", 6)).as("第 %d 次应放行", n + 1)
                    .doesNotThrowAnyException();
        }
        assertThatThrownBy(() -> limiter.check("tune", "u:1", 6))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("频繁");
    }

    @Test
    void dailyQuotaWorksAndIsSeparateFromMinuteWindow() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 3; i++) {
            limiter.checkDaily("advisor-global", "all", 3);
        }
        assertThatThrownBy(() -> limiter.checkDaily("advisor-global", "all", 3))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("额度");
        // 日配额桶与分钟桶互不影响
        assertThatCode(() -> limiter.check("advisor-global", "all", 3)).doesNotThrowAnyException();
    }

    /**
     * 回归 (审计 P1-7): 海量一次性伪造 IP 各留 1 条时间戳的非空队列必须能被清理 ——
     * 过期戳只在同 key 下次 check 才被 pollFirst, 只删空队列的话 map 单调增长可撑爆内存。
     */
    @Test
    @SuppressWarnings("unchecked")
    void staleNonEmptyQueuesAreEvicted() throws Exception {
        RateLimiter limiter = new RateLimiter();
        var field = RateLimiter.class.getDeclaredField("hits");
        field.setAccessible(true);
        var hits = (java.util.concurrent.ConcurrentHashMap<String, java.util.Deque<Long>>) field.get(limiter);
        long stale = System.currentTimeMillis() - 25L * 60 * 60_000; // 超过最长窗口 24h
        for (int i = 0; i < 10_001; i++) {
            var q = new java.util.ArrayDeque<Long>();
            q.addLast(stale);
            hits.put("b|ip:" + i, q);
        }
        limiter.check("b", "ip:fresh", 6); // 触发清理
        org.assertj.core.api.Assertions.assertThat(hits.size()).isLessThan(100);
    }

    @Test
    void bucketsAndKeysAreIsolated() {
        RateLimiter limiter = new RateLimiter();
        for (int i = 0; i < 6; i++) {
            limiter.check("tune", "u:1", 6);
        }
        // 同 key 不同 bucket、同 bucket 不同 key 都不受影响
        assertThatCode(() -> limiter.check("advisor", "u:1", 6)).doesNotThrowAnyException();
        assertThatCode(() -> limiter.check("tune", "u:2", 6)).doesNotThrowAnyException();
        assertThatCode(() -> limiter.check("tune", "ip:127.0.0.1", 6)).doesNotThrowAnyException();
    }
}
