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
