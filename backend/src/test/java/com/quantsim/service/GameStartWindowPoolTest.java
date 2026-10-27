package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 极值窗口池分位口径 (审计创意27): 固定前 20 会被反复游玩的玩家背谱,
 * 池 = max(20, 候选数 5%), 随数据量增长且不超过候选总数。
 */
class GameStartWindowPoolTest {

    @Test
    void 池大小_下限20且按百分之五分位增长() {
        assertThat(GameStartService.windowPool(10)).isEqualTo(10);   // 候选不足时全池
        assertThat(GameStartService.windowPool(100)).isEqualTo(20);  // 5% < 下限 → 20
        assertThat(GameStartService.windowPool(400)).isEqualTo(20);
        assertThat(GameStartService.windowPool(1000)).isEqualTo(50); // 5% 分位生效
        assertThat(GameStartService.windowPool(10000)).isEqualTo(500);
    }
}
