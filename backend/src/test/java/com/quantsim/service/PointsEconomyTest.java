package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.UserPoints;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.PointsLedgerRepository;
import com.quantsim.repository.UserPointsRepository;

/**
 * 积分经济防刷规则单测 (2026-10 策略单一化审计创意 1/2/3/5):
 * 盲盒负期望 / 连胜加成封顶 / 结算基础分当日衰减 / 大额兑换非盲盒收入门槛。
 */
class PointsEconomyTest {

    private final UserPointsRepository repo = mock(UserPointsRepository.class);
    private final PointsLedgerRepository ledger = mock(PointsLedgerRepository.class);
    private final PointsService service = new PointsService(repo, ledger);

    private UserPoints stub(int balance) {
        UserPoints p = new UserPoints();
        p.setUserId(1L);
        p.setBalance(balance);
        when(repo.findById(anyLong())).thenReturn(Optional.of(p));
        when(repo.findWithLockByUserId(anyLong())).thenReturn(Optional.of(p));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        return p;
    }

    @Test
    void 盲盒期望值必须低于售价() {
        // 曾因 100~1000 配 500 售价成为正期望印钞机 (审计 A1), 此断言钉死口径
        double ev = PointsService.BLINDBOX_MIN + (PointsService.BLINDBOX_SPAN - 1) / 2.0;
        assertThat(ev).isLessThan(500);
    }

    @Test
    void 盲盒返利在声明区间内且两笔流水() {
        UserPoints p = stub(1000);
        var res = service.redeem(1L, "blindbox");
        int win = (int) res.get("blindboxWin");
        assertThat(win).isBetween(PointsService.BLINDBOX_MIN,
                PointsService.BLINDBOX_MIN + PointsService.BLINDBOX_SPAN - 1);
        assertThat(p.getBalance()).isEqualTo(1000 - 500 + win);
        verify(ledger, times(2)).save(any()); // -500 兑换 + 返利各一行
    }

    @Test
    void 连胜加成封顶在五连() {
        UserPoints p = stub(0);
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        p.setWinStreak(9);
        p.setTaskDate(today);
        p.setTaskFlags(UserPoints.TASK_SETTLE); // 任务位已领, 隔离出加成本身
        var award = service.awardSettle(1L, true, false, false);
        assertThat(award.winStreak()).isEqualTo(10);
        // 基础 50 + 胜AI 30 + 连胜 10×min(10,5)=50, 而非未封顶的 100
        assertThat(award.earned()).isEqualTo(130);
    }

    @Test
    void 当日第四局基础分衰减() {
        UserPoints p = stub(0);
        p.setTaskDate(LocalDate.now(GameService.GAME_ZONE));
        p.setTaskFlags(UserPoints.TASK_SETTLE);
        p.setSettleCount(PointsService.SETTLE_FULL_GAMES_PER_DAY);
        var award = service.awardSettle(1L, false, false, false);
        assertThat(award.earned()).isEqualTo(PointsService.SETTLE_BASE_DECAYED);
        assertThat(p.getSettleCount()).isEqualTo(PointsService.SETTLE_FULL_GAMES_PER_DAY + 1);
    }

    @Test
    void 跨零点结算局数归零_基础分恢复全额() {
        UserPoints p = stub(0);
        p.setTaskDate(LocalDate.now(GameService.GAME_ZONE).minusDays(1));
        p.setTaskFlags(UserPoints.TASK_SETTLE);
        p.setSettleCount(5);
        var award = service.awardSettle(1L, false, false, false);
        // 新的一天: 基础 50 全额 + 任务位重开 +30
        assertThat(award.earned()).isEqualTo(PointsService.SETTLE_BASE + 30);
        assertThat(p.getSettleCount()).isEqualTo(1);
    }

    @Test
    void 自选限笔局结算有补偿加成() {
        UserPoints p = stub(0);
        p.setTaskDate(LocalDate.now(GameService.GAME_ZONE));
        p.setTaskFlags(UserPoints.TASK_SETTLE); // 任务位已领, 隔离出加成本身
        var award = service.awardSettle(1L, false, false, false, true);
        // 基础 50 + 限笔补偿 15: 限制无补偿时"从不勾选限笔"是支配选择 (审计创意21)
        assertThat(award.earned()).isEqualTo(PointsService.SETTLE_BASE + PointsService.SELF_LIMIT_BONUS);
    }

    @Test
    void 大额兑换要求非盲盒净收入达标() {
        stub(100000);
        when(ledger.earnedExcludingBlindbox(1L)).thenReturn(0L);
        assertThatThrownBy(() -> service.redeem(1L, "earbuds"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("盲盒返利不计入");
    }

    @Test
    void 大额兑换_收入达标放行() {
        UserPoints p = stub(100000);
        when(ledger.earnedExcludingBlindbox(1L)).thenReturn(8000L);
        service.redeem(1L, "earbuds");
        assertThat(p.getBalance()).isEqualTo(92000);
    }
}
