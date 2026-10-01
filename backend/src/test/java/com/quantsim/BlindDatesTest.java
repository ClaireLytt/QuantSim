package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.GameSession;
import com.quantsim.service.BlindDates;

/** 竞技模式日期脱敏的纯单元测试: 平移规则、间隔保持、普通模式不动。 */
class BlindDatesTest {

    private GameSession session(String mode, LocalDate startDate) {
        GameSession s = new GameSession();
        s.setMode(mode);
        s.setStartDate(startDate);
        return s;
    }

    @Test
    void classicAndPortfolioKeepRealDates() {
        LocalDate d = LocalDate.of(2024, 9, 24);
        assertThat(BlindDates.mask(session("CLASSIC", LocalDate.of(2024, 9, 1)), d)).isEqualTo(d);
        assertThat(BlindDates.mask(session("PORTFOLIO", LocalDate.of(2024, 9, 1)), d)).isEqualTo(d);
        assertThat(BlindDates.blind(session("CLASSIC", d))).isFalse();
    }

    @Test
    void dailyAndRoomShiftStartToBase() {
        LocalDate start = LocalDate.of(2024, 9, 20);
        for (String mode : new String[] {"DAILY", "ROOM"}) {
            GameSession s = session(mode, start);
            assertThat(BlindDates.blind(s)).isTrue();
            // 起始日落在虚拟纪元
            assertThat(BlindDates.mask(s, start)).isEqualTo(BlindDates.BASE);
            // 相对间隔保持: 起始日 +3 天 -> BASE+3; 起始日前 5 天 -> BASE-5
            assertThat(BlindDates.mask(s, start.plusDays(3))).isEqualTo(BlindDates.BASE.plusDays(3));
            assertThat(BlindDates.mask(s, start.minusDays(5))).isEqualTo(BlindDates.BASE.minusDays(5));
        }
    }

    @Test
    void nullDatePassesThrough() {
        assertThat(BlindDates.mask(session("DAILY", LocalDate.of(2024, 1, 1)), null)).isNull();
    }

    @Test
    void maskedDateNeverEqualsRealDateForModernData() {
        // 只要真实窗口在 2000 年之后 (行情数据从 2024 起), 脱敏后必然不同, 不会泄漏
        GameSession s = session("DAILY", LocalDate.of(2024, 5, 6));
        assertThat(BlindDates.mask(s, LocalDate.of(2024, 5, 6))).isNotEqualTo(LocalDate.of(2024, 5, 6));
    }
}
