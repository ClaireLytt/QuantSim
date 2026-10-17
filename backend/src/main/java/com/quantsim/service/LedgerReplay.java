package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.quantsim.config.GameProperties;
import com.quantsim.entity.TradeTransaction;

import lombok.RequiredArgsConstructor;

/**
 * 资金重放内核: "逐日 → 先计隔夜利息 (首日除外) → 再按当日流水调整现金/持仓" 的唯一实现。
 * 三个调用方是它的三种视图 —— tick 实时计息 (dailyInterest 单步)、undo 重建账户
 * (replay 取末日快照)、结算资金曲线 (replay 逐日快照估值)。
 * 计息顺序 / 公式 / 舍入 / 现金流算术只存在于此, 改口径只改这里, 调用方之间不会再分叉。
 */
@Service
@RequiredArgsConstructor
public class LedgerReplay {

    private final GameProperties props;

    /** 某交易日收盘后的账面: 现金 / 累计利息 / 各标的持仓 (股数 + 均价)。 */
    public record Snapshot(LocalDate day, BigDecimal cash, BigDecimal interestTotal,
                           Map<Long, PositionMath.Fill> fills) {
    }

    /**
     * 单日利息: 现金 × 年化利率 / 252, 两位小数。正现金按货基利率生息 (教学: 钱不要躺着),
     * 透支现金按融资利率付息 (杠杆不白借); 利率配置为 0 时即关闭。玩家与 AI 同口径。
     */
    public BigDecimal dailyInterest(BigDecimal cash) {
        double rate = cash.signum() >= 0 ? props.getCashRateAnnual() : props.getBorrowRateAnnual();
        if (rate == 0) {
            return BigDecimal.ZERO;
        }
        return cash.multiply(BigDecimal.valueOf(rate / RiskMath.TRADING_DAYS_PER_YEAR))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 从初始资金起逐日重放流水, 返回与 days 一一对应的每日快照。
     * 流水只记成交价与费用, 重放结果与实际现金流严格一致;
     * stock_id 为空的旧流水归属 defaultStockId (组合模式的取舍由调用方先判)。
     */
    public List<Snapshot> replay(BigDecimal initialCash, List<LocalDate> days,
                                 List<TradeTransaction> txs, Long defaultStockId) {
        Map<LocalDate, List<TradeTransaction>> byDate =
                txs.stream().collect(Collectors.groupingBy(TradeTransaction::getTradeDate));
        BigDecimal cash = initialCash;
        BigDecimal interestTotal = BigDecimal.ZERO;
        Map<Long, PositionMath.Fill> fills = new HashMap<>();
        List<Snapshot> out = new ArrayList<>(days.size());
        for (int i = 0; i < days.size(); i++) {
            LocalDate day = days.get(i);
            if (i > 0) {
                BigDecimal interest = dailyInterest(cash);
                cash = cash.add(interest);
                interestTotal = interestTotal.add(interest);
            }
            for (TradeTransaction tx : byDate.getOrDefault(day, List.of())) {
                BigDecimal gross = tx.getPrice().multiply(BigDecimal.valueOf(tx.getShares()));
                boolean buy = tx.getDirection() == TradeTransaction.Direction.BUY;
                cash = cash.add(buy ? gross.negate() : gross).subtract(tx.getFee());
                Long sid = tx.getStockId() != null ? tx.getStockId() : defaultStockId;
                PositionMath.Fill cur = fills.getOrDefault(sid, new PositionMath.Fill(0, BigDecimal.ZERO));
                fills.put(sid, PositionMath.apply(cur.shares(), cur.avgCost(),
                        tx.getDirection(), tx.getPrice(), tx.getShares()));
            }
            out.add(new Snapshot(day, cash, interestTotal, Map.copyOf(fills)));
        }
        return out;
    }
}
