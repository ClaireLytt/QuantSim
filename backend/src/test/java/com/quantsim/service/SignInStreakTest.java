package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.UserPoints;
import com.quantsim.repository.UserPointsRepository;

/** 签到连续天数规则单测: 隔日 +1 / 断签归 1 / 当日重复签不动 (幂等)。 */
class SignInStreakTest {

    private final UserPointsRepository repo = mock(UserPointsRepository.class);
    private final com.quantsim.repository.PointsLedgerRepository ledger =
            mock(com.quantsim.repository.PointsLedgerRepository.class);
    private final PointsService service = new PointsService(repo, ledger);

    private UserPoints withLastSignIn(LocalDate date, int streak) {
        UserPoints p = new UserPoints();
        p.setUserId(1L);
        p.setLastSignIn(date);
        p.setSignInStreak(streak);
        when(repo.findById(anyLong())).thenReturn(Optional.of(p));
        when(repo.findWithLockByUserId(anyLong())).thenReturn(Optional.of(p));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        return p;
    }

    @Test
    void 昨日签过_今日签到连续天数加一() {
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        UserPoints p = withLastSignIn(today.minusDays(1), 4);
        var state = service.signIn(1L);
        assertThat(p.getSignInStreak()).isEqualTo(5);
        assertThat(state.signInStreak()).isEqualTo(5);
    }

    @Test
    void 断签三天_连续天数归一() {
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        UserPoints p = withLastSignIn(today.minusDays(3), 9);
        service.signIn(1L);
        assertThat(p.getSignInStreak()).isEqualTo(1);
    }

    @Test
    void 首次签到_连续天数为一() {
        UserPoints p = withLastSignIn(null, 0);
        service.signIn(1L);
        assertThat(p.getSignInStreak()).isEqualTo(1);
    }

    @Test
    void 当日重复签到_幂等不加分不改天数() {
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        UserPoints p = withLastSignIn(today, 6);
        p.setBalance(100);
        service.signIn(1L);
        assertThat(p.getSignInStreak()).isEqualTo(6);
        assertThat(p.getBalance()).isEqualTo(100);
    }
}
