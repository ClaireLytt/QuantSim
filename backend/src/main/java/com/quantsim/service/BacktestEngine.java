package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Service;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.TradeTransaction;

import lombok.RequiredArgsConstructor;

/**
 * 回测模拟内核: 逐日循环 (资金/费用/成交/统计) 与指标计算。
 * 策略逻辑 (参数/信号/目标仓位/调参网格) 全部在 BacktestStrategy 的常量体里,
 * 循环只问策略"今天目标持仓多少"——新增策略不需要动本类。
 * 不碰库、不碰榜单, 只做"参数 + 行情 -> 净值曲线";
 * 交易规则与对局同口径: 收盘价成交、整手、无做空, 费用走 FeeCalculator。
 */
@Service
@RequiredArgsConstructor
public class BacktestEngine {

    private final FeeCalculator feeCalculator;

    static final class Simulation {
        BigDecimal[] equity;
        BigDecimal finalEquity;
        int tradeCount;
        int roundTrips;
        int wins;
    }

    /** 逐日模拟: initial 为初始资金 (对局口径由调用方传入, 引擎自身不读配置)。 */
    Simulation simulate(BacktestStrategy strategy, BacktestStrategy.StrategyParams sp,
                        List<DailyPrice> prices, Market market, BigDecimal initial) {
        int n = prices.size();
        int lotSize = market.getLotSize();
        double[] closes = new double[n];
        for (int i = 0; i < n; i++) {
            closes[i] = prices.get(i).getClose().doubleValue();
        }
        BacktestStrategy.Ctx ctx = strategy.buildCtx(sp, closes);

        BigDecimal cash = initial;
        int shares = 0;
        BigDecimal positionCost = BigDecimal.ZERO;
        Simulation sim = new Simulation();
        sim.equity = new BigDecimal[n];

        for (int i = 0; i < n; i++) {
            BigDecimal close = prices.get(i).getClose();
            BigDecimal equityNow = cash.add(close.multiply(BigDecimal.valueOf(shares)));

            // 目标仓位: null = 不动作 (推导规则见 BacktestStrategy.targetShares)
            Integer targetShares = strategy.targetShares(sp, ctx,
                    new BacktestStrategy.DayState(i, n, equityNow, cash, shares, lotSize, initial));

            if (targetShares != null && targetShares != shares) {
                if (targetShares > shares) {
                    int want = targetShares - shares;
                    int affordable = feeCalculator.maxAffordableShares(cash, close, lotSize, market);
                    int bought = Math.min(want, affordable);
                    if (bought > 0) {
                        BigDecimal gross = close.multiply(BigDecimal.valueOf(bought));
                        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
                        cash = cash.subtract(gross).subtract(fee);
                        shares += bought;
                        positionCost = positionCost.add(gross).add(fee);
                        sim.tradeCount++;
                    }
                } else {
                    int sell = shares - targetShares;
                    BigDecimal gross = close.multiply(BigDecimal.valueOf(sell));
                    BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross);
                    BigDecimal proceeds = gross.subtract(fee);
                    // 成本按卖出比例分摊
                    BigDecimal costPart = shares == 0 ? BigDecimal.ZERO
                            : positionCost.multiply(BigDecimal.valueOf(sell))
                                    .divide(BigDecimal.valueOf(shares), 2, RoundingMode.HALF_UP);
                    cash = cash.add(proceeds);
                    shares -= sell;
                    positionCost = positionCost.subtract(costPart);
                    sim.tradeCount++;
                    if (shares == 0) {
                        sim.roundTrips++;
                        if (proceeds.compareTo(costPart) > 0) {
                            sim.wins++;
                        }
                        positionCost = BigDecimal.ZERO;
                    }
                }
            }
            sim.equity[i] = cash.add(close.multiply(BigDecimal.valueOf(shares)));
        }
        sim.finalEquity = sim.equity[n - 1];
        return sim;
    }

    BigDecimal[] buyAndHoldCurve(List<DailyPrice> prices, BigDecimal initial, Market market) {
        BigDecimal startClose = prices.get(0).getClose();
        int shares = feeCalculator.maxAffordableShares(initial, startClose, market.getLotSize(), market);
        BigDecimal gross = startClose.multiply(BigDecimal.valueOf(shares));
        BigDecimal fee = feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross);
        BigDecimal cash = initial.subtract(gross).subtract(fee);
        BigDecimal[] curve = new BigDecimal[prices.size()];
        for (int i = 0; i < prices.size(); i++) {
            curve[i] = cash.add(prices.get(i).getClose().multiply(BigDecimal.valueOf(shares)));
        }
        return curve;
    }

    // ---------- 指标计算 ----------

    BigDecimal annualize(BigDecimal finalEquity, BigDecimal initial, int days) {
        if (days < 2) {
            return null;
        }
        double growth = finalEquity.doubleValue() / initial.doubleValue();
        double annual = Math.pow(growth, RiskMath.TRADING_DAYS_PER_YEAR / days) - 1;
        return BigDecimal.valueOf(annual).setScale(4, RoundingMode.HALF_UP);
    }

    /** 年化夏普比率, 口径与结算复盘共用 RiskMath (无风险利率取 0, 波动为 0 时 null)。 */
    BigDecimal sharpeRatio(BigDecimal[] equity) {
        return RiskMath.sharpe(RiskMath.dailyReturns(Arrays.asList(equity)));
    }

    /** 最大回撤 (正数, 0.15 表示曾从峰值回撤 15%), 口径与结算复盘共用 RiskMath。 */
    BigDecimal maxDrawdown(BigDecimal[] equity) {
        return RiskMath.maxDrawdown(Arrays.asList(equity));
    }
}
