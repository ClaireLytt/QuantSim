package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.config.FeeProperties;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;

/**
 * 回测内核的纯单元测试 (不起 Spring, 风格同 LedgerReplayTest):
 * 模拟循环的资金守恒 / 策略-基准同口径 / 只买不卖纪律等不变量在这里锁死。
 * 费用用 FeeProperties 默认值 (全零), 让断言聚焦价格数学本身——
 * 费率口径已有 FeeIntegrationTest 全链路覆盖, 这里不重复。
 */
class BacktestEngineTest {

    /** 默认 FeeProperties 全字段为零 -> 零摩擦, 回测结果只由价格序列决定。 */
    private final BacktestEngine engine = new BacktestEngine(new FeeCalculator(new FeeProperties()));

    private static final BigDecimal INITIAL = new BigDecimal("100000.00");

    /** 引擎只读 close (open/high/low 不参与回测撮合), 其余字段无需填充。 */
    private static List<DailyPrice> prices(double... closes) {
        List<DailyPrice> list = new ArrayList<>(closes.length);
        LocalDate d = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < closes.length; i++) {
            DailyPrice p = new DailyPrice();
            p.setTradeDate(d.plusDays(i));
            p.setClose(BigDecimal.valueOf(closes[i]));
            list.add(p);
        }
        return list;
    }

    private static double[] flat(int days, double close) {
        double[] arr = new double[days];
        java.util.Arrays.fill(arr, close);
        return arr;
    }

    /** BUY_HOLD 默认参数: 不走 parse(RunRequest), 用工厂直构空参数体。 */
    private static BacktestStrategy.StrategyParams noParams() {
        return BacktestStrategy.emptyParams();
    }

    @Test
    void 买入持有策略与基准曲线终点一致() {
        // BUY_HOLD 策略和 buyAndHoldCurve 基准走的是两段不同代码, 口径必须锁死一致
        List<DailyPrice> ps = prices(10, 12, 9, 15, 14, 18);
        BacktestEngine.Simulation sim = engine.simulate(
                BacktestStrategy.BUY_HOLD, noParams(), ps, Market.STOCK, INITIAL);
        BigDecimal[] hold = engine.buyAndHoldCurve(ps, INITIAL, Market.STOCK);

        assertThat(sim.finalEquity).isEqualByComparingTo(hold[hold.length - 1]);
        assertThat(sim.tradeCount).isEqualTo(1);
        // 首日即建仓, 全程曲线也应逐点一致
        for (int i = 0; i < ps.size(); i++) {
            assertThat(sim.equity[i]).isEqualByComparingTo(hold[i]);
        }
    }

    @Test
    void 均线交叉在单调上涨中建仓且零费用下盈利() {
        // 30 天单调上涨: 快线必然上穿慢线并保持, 建仓后随行情增值
        double[] closes = new double[30];
        for (int i = 0; i < 30; i++) {
            closes[i] = 10 + 0.5 * i;
        }
        BacktestEngine.Simulation sim = engine.simulate(
                BacktestStrategy.MA_CROSS, BacktestStrategy.maCrossParams(2, 5, 100),
                prices(closes), Market.STOCK, INITIAL);

        assertThat(sim.tradeCount).isGreaterThan(0);
        assertThat(sim.finalEquity).isGreaterThan(INITIAL);
    }

    @Test
    void 定投只买不卖() {
        // DCA 的纪律就是永不卖出: tradeCount 累计而 roundTrips 恒为 0
        BacktestEngine.Simulation sim = engine.simulate(
                BacktestStrategy.DCA, BacktestStrategy.dcaParams(5, 100),
                prices(flat(30, 10)), Market.STOCK, INITIAL);

        assertThat(sim.tradeCount).isGreaterThan(1);
        assertThat(sim.roundTrips).isZero();
    }

    @Test
    void 零费用平价行情下资金守恒() {
        // 价格不动 + 零摩擦: 无论策略怎么倒腾, 每一天 equity 都必须等于初始资金
        List<DailyPrice> flat = prices(flat(20, 10));
        for (BacktestStrategy s : new BacktestStrategy[] {
                BacktestStrategy.BUY_HOLD, BacktestStrategy.DCA }) {
            BacktestStrategy.StrategyParams sp = s == BacktestStrategy.DCA
                    ? BacktestStrategy.dcaParams(5, 100)
                    : noParams();
            BacktestEngine.Simulation sim = engine.simulate(s, sp, flat, Market.STOCK, INITIAL);
            for (BigDecimal eq : sim.equity) {
                assertThat(eq).as(s.name()).isEqualByComparingTo(INITIAL);
            }
        }
    }

    @Test
    void 网格在价格下跌中分批加仓() {
        // 从基准价逐级下跌: 每跌过一格目标仓位上调一档 -> 多笔买入;
        // 持有下跌资产, 零费用下终值必然低于初始 (方向性不变量)
        double[] closes = new double[30];
        for (int i = 0; i < 30; i++) {
            closes[i] = 100 - 2 * i; // 100 -> 42, 跨越全部网格档位
        }
        BacktestEngine.Simulation sim = engine.simulate(
                BacktestStrategy.GRID, BacktestStrategy.gridParams(0.05, 5, 100),
                prices(closes), Market.STOCK, INITIAL);

        assertThat(sim.tradeCount).isGreaterThan(1);
        assertThat(sim.finalEquity).isLessThan(INITIAL);
    }
}
