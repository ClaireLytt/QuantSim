package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.GameSession;
import com.quantsim.entity.UserPoints;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.UserPointsRepository;

/**
 * 「我的交易人生」聚合口径单测 (纯 Mock, 零 Spring 零数据库):
 * 几何连乘 / 胜率 / 峰谷回撤 / 空账户零态在这里钉死, 改口径必须同步这些用例。
 */
class MeSummaryServiceTest {

    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final UserPointsRepository points = mock(UserPointsRepository.class);
    private final MeSummaryService service = new MeSummaryService(sessions, points);

    private GameSession settled(String rate, LocalDate date) {
        GameSession s = new GameSession();
        s.setFinalReturnRate(new BigDecimal(rate));
        s.setCreatedAt(date.atTime(12, 0));
        return s;
    }

    @Test
    void 几何连乘_先涨一成再跌一成净值为99000() {
        when(sessions.findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                anyLong(), any())).thenReturn(List.of(
                        settled("0.1000", LocalDate.of(2026, 10, 1)),
                        settled("-0.1000", LocalDate.of(2026, 10, 2))));
        when(points.findById(anyLong())).thenReturn(Optional.empty());

        var r = service.summary(1L);
        assertThat(r.virtualAssets()).isEqualByComparingTo("99000.00");
        assertThat(r.cumulativeReturn()).isEqualByComparingTo("-0.0100");
        assertThat(r.winRate()).isEqualByComparingTo("0.5000"); // 2 局 1 胜
        // 峰 110000 → 谷 99000: 回撤 11000/110000 = 10%
        assertThat(r.maxDrawdown()).isEqualByComparingTo("0.1000");
        assertThat(r.curve()).hasSize(2);
        assertThat(r.curve().get(0).value()).isEqualByComparingTo("110000.00");
    }

    @Test
    void 一路上涨_回撤为零且曲线时间升序() {
        when(sessions.findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                anyLong(), any())).thenReturn(List.of(
                        settled("0.0500", LocalDate.of(2026, 10, 1)),
                        settled("0.0200", LocalDate.of(2026, 10, 3))));
        when(points.findById(anyLong())).thenReturn(Optional.empty());

        var r = service.summary(1L);
        assertThat(r.maxDrawdown()).isEqualByComparingTo("0");
        assertThat(r.winRate()).isEqualByComparingTo("1.0000");
        assertThat(r.virtualAssets()).isEqualByComparingTo("107100.00"); // 105000 * 1.02
        assertThat(r.curve().get(1).date()).isAfter(r.curve().get(0).date());
    }

    @Test
    void 空账户_全零不伪造数据() {
        when(sessions.findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                anyLong(), any())).thenReturn(List.of());
        when(points.findById(anyLong())).thenReturn(Optional.empty());

        var r = service.summary(1L);
        assertThat(r.settledCount()).isZero();
        assertThat(r.virtualAssets()).isEqualByComparingTo("100000");
        assertThat(r.cumulativeReturn()).isEqualByComparingTo("0");
        assertThat(r.winRate()).isEqualByComparingTo("0");
        assertThat(r.curve()).isEmpty();
    }

    @Test
    void 签到连续天数透传自UserPoints() {
        when(sessions.findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                anyLong(), any())).thenReturn(List.of());
        UserPoints up = new UserPoints();
        up.setSignInStreak(7);
        when(points.findById(anyLong())).thenReturn(Optional.of(up));

        assertThat(service.summary(1L).signInStreak()).isEqualTo(7);
    }
}
