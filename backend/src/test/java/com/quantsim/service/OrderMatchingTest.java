package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.PendingOrder;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.OrderMatching.CancelReason;
import com.quantsim.service.OrderMatching.Decision;
import com.quantsim.service.OrderMatching.Gates;
import com.quantsim.service.OrderMatching.OrderView;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/**
 * 挂单撮合决策矩阵的表驱动单测: 直构 OrderView + 常量 Gates, 零 Spring 零数据库。
 * 闸门顺序 (触发→ratchet→reduce-only→realRules→预算→validate) 与四个历史坑在这里钉死。
 */
class OrderMatchingTest {

    private static DailyPrice bar(String open, String high, String low, String close) {
        DailyPrice b = new DailyPrice();
        b.setOpen(new BigDecimal(open));
        b.setHigh(new BigDecimal(high));
        b.setLow(new BigDecimal(low));
        b.setClose(new BigDecimal(close));
        return b;
    }

    /** 常量四问假件; 单测里按用例覆写个别答案。 */
    private static Gates gates(int position, boolean rulesBlocked, boolean exhausted, String validateError) {
        return new Gates() {
            @Override public int currentPositionShares() { return position; }
            @Override public boolean realRulesBlocked(TradeTransaction.Direction d, int s) { return rulesBlocked; }
            @Override public boolean budgetExhausted() { return exhausted; }
            @Override public String validateError(TradeTransaction.Direction d, BigDecimal p, int s) { return validateError; }
        };
    }

    private static final Gates OPEN_GATES = gates(1000, false, false, null);

    private static OrderView view(PendingOrder.Type type, String trigger, int shares) {
        return new OrderView(type, new BigDecimal(trigger), shares, null);
    }

    // ---------- 触发与成交价 ----------

    @Test
    void 限价买_低点触达_按开盘与触发价孰低成交() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.50", 100),
                bar("9.80", "10.00", "9.40", "9.90"), false, false, OPEN_GATES);
        assertThat(d).isEqualTo(new Decision.Fill(
                TradeTransaction.Direction.BUY, new BigDecimal("9.50"), 100));
    }

    @Test
    void 限价买_低点未触达_继续挂() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.00", 100),
                bar("9.80", "10.00", "9.40", "9.90"), false, false, OPEN_GATES);
        assertThat(d).isEqualTo(new Decision.Keep());
    }

    @Test
    void 止盈_高点触达_按开盘与触发价孰高成交_方向为卖() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.TAKE_PROFIT, "10.00", 100),
                bar("10.20", "10.50", "9.90", "10.30"), false, false, OPEN_GATES);
        assertThat(d).isEqualTo(new Decision.Fill(
                TradeTransaction.Direction.SELL, new BigDecimal("10.20"), 100));
    }

    @Test
    void 跳空低开的止损_按开盘价成交而非触发价() {
        // 触发价 9.50, 开盘 9.20 已跳空: min(开盘, 触发) = 9.20, 不给玩家不存在的好价
        Decision d = OrderMatching.decide(view(PendingOrder.Type.STOP_LOSS, "9.50", 100),
                bar("9.20", "9.30", "9.00", "9.10"), false, false, OPEN_GATES);
        assertThat(d).isEqualTo(new Decision.Fill(
                TradeTransaction.Direction.SELL, new BigDecimal("9.20"), 100));
    }

    // ---------- 移动止损 ratchet ----------

    @Test
    void ratchet只升不降_收盘走高时上移触发价() {
        OrderView v = new OrderView(PendingOrder.Type.TRAIL_STOP,
                new BigDecimal("9.00"), 100, new BigDecimal("10")); // 10% 跟踪
        Decision d = OrderMatching.decide(v, bar("10.80", "11.00", "10.50", "11.00"),
                false, false, OPEN_GATES);
        // 11.00 * 0.9 = 9.90 > 9.00 → 上移
        assertThat(d).isEqualTo(new Decision.Ratchet(new BigDecimal("9.90")));
    }

    @Test
    void ratchet只升不降_收盘回落时触发价不动() {
        OrderView v = new OrderView(PendingOrder.Type.TRAIL_STOP,
                new BigDecimal("9.90"), 100, new BigDecimal("10"));
        Decision d = OrderMatching.decide(v, bar("10.50", "10.60", "10.00", "10.00"),
                false, false, OPEN_GATES);
        // 10.00 * 0.9 = 9.00 < 9.90 → 保持, 不下调
        assertThat(d).isEqualTo(new Decision.Keep());
    }

    // ---------- reduce-only 钳制 (advanced 模式) ----------

    @Test
    void 保护单清仓作废_仓位已清的止损单取消而非开空() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.STOP_LOSS, "9.50", 100),
                bar("9.40", "9.60", "9.30", "9.35"), true, false,
                gates(0, false, false, null));
        assertThat(d).isEqualTo(new Decision.Cancel(CancelReason.POSITION_GONE));
    }

    @Test
    void 多头缩水只平剩余_成交数量钳到当前持仓() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.STOP_LOSS, "9.50", 500),
                bar("9.40", "9.60", "9.30", "9.35"), true, false,
                gates(200, false, false, null));
        assertThat(d).isEqualTo(new Decision.Fill(
                TradeTransaction.Direction.SELL, new BigDecimal("9.40"), 200));
    }

    @Test
    void 限价卖不受reduceOnly约束_advanced下也按原数量成交() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_SELL, "9.50", 500),
                bar("9.60", "9.80", "9.40", "9.70"), true, false,
                gates(0, false, false, null)); // 持仓 0 也不问
        assertThat(d).isEqualTo(new Decision.Fill(
                TradeTransaction.Direction.SELL, new BigDecimal("9.60"), 500));
    }

    // ---------- 闸门顺序: realRules → 预算 → validate ----------

    @Test
    void 真实规则拦下_继续挂而非作废() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.50", 100),
                bar("9.40", "9.60", "9.30", "9.35"), false, true,
                gates(0, true, false, null));
        assertThat(d).isEqualTo(new Decision.Keep());
    }

    @Test
    void 预算耗尽作废而非跳过() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.50", 100),
                bar("9.40", "9.60", "9.30", "9.35"), false, false,
                gates(0, false, true, null));
        assertThat(d).isEqualTo(new Decision.Cancel(CancelReason.BUDGET_EXHAUSTED));
    }

    @Test
    void 真实规则先于预算_被拦的单不触发预算作废() {
        // 封板拦下 + 预算同时耗尽: 必须 Keep (明天还能成交), 不能 Cancel —— 顺序即行为
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.50", 100),
                bar("9.40", "9.60", "9.30", "9.35"), false, true,
                gates(0, true, true, null));
        assertThat(d).isEqualTo(new Decision.Keep());
    }

    @Test
    void validate拒绝_作废并标记原因() {
        Decision d = OrderMatching.decide(view(PendingOrder.Type.LIMIT_BUY, "9.50", 100),
                bar("9.40", "9.60", "9.30", "9.35"), false, false,
                gates(0, false, false, "现金不足"));
        assertThat(d).isEqualTo(new Decision.Cancel(CancelReason.REJECTED));
    }
}
