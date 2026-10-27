package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.quantsim.exception.BusinessException;
import org.junit.jupiter.api.Test;

/**
 * 交易预算纯策略核的表驱动单测: 直构 Snapshot/FillConsumer, 零 Spring 零数据库。
 * 两个口径的语义 (新增数已成交+在挂单 / 撮合只数已成交) 在这里钉死,
 * 谁改口径不同步另一侧, 这些用例毫秒级变红。
 */
class TradeBudgetTest {

    // ---------- 新增口径: 已成交 + 在挂单 ----------

    @Test
    void 不限笔时剩余为null且永远放行() {
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(99, 99, 0, null);
        assertThat(s.remaining()).isNull();
        assertThat(s.remainingAfterAdd()).isNull();
        s.requireHeadroom(); // 不抛
    }

    @Test
    void 挂单占预算_已成交加在挂单恰满时拒绝新增() {
        // 这就是"挂单是绕过上限的后门"要堵的口: 2 成交 + 1 挂单 = 3, 上限 3 → 拒
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(2, 1, 0, 3);
        assertThatThrownBy(s::requireHeadroom)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已达上限 3 笔")
                .hasMessageContaining("在挂单也占用笔数");
    }

    @Test
    void 未满时放行且剩余笔数按两类合计() {
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(1, 1, 0, 5);
        s.requireHeadroom();
        assertThat(s.remaining()).isEqualTo(3);
        assertThat(s.remainingAfterAdd()).isEqualTo(2); // trade 响应: 本笔成交后的剩余
    }

    @Test
    void 超卖状态下剩余不为负数() {
        // undo/撤单时序异常等造成 used > max 的脏状态: 剩余钳到 0, 不给前端负数
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(4, 1, 0, 3);
        assertThat(s.remaining()).isZero();
        assertThat(s.remainingAfterAdd()).isZero();
    }

    @Test
    void 移动止损在挂期间占两笔() {
        // 1 成交 + 1 在挂 (其中 1 张是 TRAIL): used = 1+1+1 = 3, 上限 4 → 还剩 1
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(1, 1, 1, 4);
        assertThat(s.remaining()).isEqualTo(1);
        s.requireHeadroom(); // 普通单 (weight 1) 放行
        // 再挂一张 TRAIL (weight 2) 超出 → 拒, 文案指明加价口径
        assertThatThrownBy(() -> s.requireHeadroom(2))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("移动止损占 2 笔");
    }

    @Test
    void 预算恰满时加权校验仍走历史文案() {
        // used == max: 不论权重, 先报"已达上限" (与历史文案逐字一致)
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(2, 1, 0, 3);
        assertThatThrownBy(() -> s.requireHeadroom(2))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已达上限 3 笔");
    }

    // ---------- 撮合口径: 只数已成交, 边成交边记账 ----------

    @Test
    void 撮合不双计自身名额_已成交未到上限即可成交() {
        // 上限 3, 已成交 2, 在挂单 1: 新增口径已满 (2+1=3), 但这张挂单自己转 FILLED
        // 只是名额转换 → 撮合口径 (2 < 3) 放行。两口径的差异即业务语义, 不是 bug。
        TradeBudget.FillConsumer c = new TradeBudget.FillConsumer(2, 3);
        assertThat(c.exhausted()).isFalse();
        c.consume();
        assertThat(c.exhausted()).isTrue(); // 3 == 3, 下一张作废
    }

    @Test
    void 撮合消耗器_不限笔恒不耗尽() {
        TradeBudget.FillConsumer c = new TradeBudget.FillConsumer(0, null);
        for (int i = 0; i < 100; i++) {
            assertThat(c.exhausted()).isFalse();
            c.consume();
        }
    }

    @Test
    void 撮合消耗器_初始即满时第一张就作废() {
        TradeBudget.FillConsumer c = new TradeBudget.FillConsumer(3, 3);
        assertThat(c.exhausted()).isTrue();
    }

    @Test
    void validate失败的单不消耗预算_由调用方只在成交后consume保证() {
        // 语义锚: exhausted 查 → validate 失败 → 不 consume → 下一张仍可成交
        TradeBudget.FillConsumer c = new TradeBudget.FillConsumer(2, 3);
        assertThat(c.exhausted()).isFalse(); // 第一张: 查过但 validate 失败, 不记账
        assertThat(c.exhausted()).isFalse(); // 第二张: 预算仍是 2/3
        c.consume();
        assertThat(c.exhausted()).isTrue();
    }

    @Test
    void 快照零状态_上限1_允许第一笔() {
        TradeBudget.Snapshot s = new TradeBudget.Snapshot(0, 0, 0, 1);
        s.requireHeadroom();
        assertThat(s.remaining()).isEqualTo(1);
        assertThat(s.remainingAfterAdd()).isZero();
    }
}
