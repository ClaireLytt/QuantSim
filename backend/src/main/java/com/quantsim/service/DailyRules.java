package com.quantsim.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.quantsim.dto.GameDtos;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.TradeTransaction;

/**
 * 每日挑战规则轮换 (docs/challenge-system-2026-10.md 的 D1~D8): 按挑战日期轮转,
 * 全服同一天同一规则 (与同题机制同构, 日期即种子)。
 * 规则分三类表达:
 *   开局参数 (maxTrades / requireReason) — 固化进 session, 复用既有闸门;
 *   交易时闸 (guardError) — 半仓线 / 观察期 / 禁追高, 下单当场拒绝;
 *   结算判定 (evaluate) — 目标达成与否, 只定性不给分 (综合分体系另期落地)。
 * 纯静态无状态, 全部可单测。
 */
public final class DailyRules {

    private DailyRules() {}

    /** 轮换顺序即 D1~D8 文档顺序。 */
    public enum Rule { FIVE, BELT, HALF, WATCH, NOCHASE, STRIKE, AUDIT, IRONSTOP }

    private static final int WATCH_TICKS = 5; // WATCH: 前 5 tick 禁交易
    private static final BigDecimal HALF_LINE = new BigDecimal("0.5");
    private static final BigDecimal BELT_DD = new BigDecimal("0.08");
    private static final BigDecimal STRIKE_GAP = new BigDecimal("0.03");
    private static final BigDecimal IRONSTOP_LOSS = new BigDecimal("-0.05");

    public static Rule ruleFor(LocalDate challengeDate) {
        Rule[] all = Rule.values();
        return all[(int) Math.floorMod(challengeDate.toEpochDay(), all.length)];
    }

    /** 开局笔数上限: FIVE=5 / STRIKE=2 (一买一卖), 其余不限。 */
    public static Integer maxTrades(Rule rule) {
        return switch (rule) {
            case FIVE -> 5;
            case STRIKE -> 2;
            default -> null;
        };
    }

    /** AUDIT 日强制交易理由 (复用 requireReason 闸门)。 */
    public static boolean requireReason(Rule rule) {
        return rule == Rule.AUDIT;
    }

    /**
     * 交易时闸: 违规直接拒单, 返回拒绝文案 (null = 放行)。
     * lastBuyPrice = 本局最近一笔买入价 (无买入记录为 null);
     * ratioAfterBuy = 买入成交后 持仓市值/总资产 的估算 (卖出方向传 null)。
     */
    public static String guardError(Rule rule, TradeTransaction.Direction direction,
                                    int daysElapsed, BigDecimal price,
                                    BigDecimal lastBuyPrice, BigDecimal ratioAfterBuy) {
        boolean buying = direction == TradeTransaction.Direction.BUY;
        return switch (rule) {
            case WATCH -> daysElapsed < WATCH_TICKS
                    ? "今日规则【现金是答案】: 前 " + WATCH_TICKS + " 个交易日只许观察, 不许出手" : null;
            case HALF -> buying && ratioAfterBuy != null && ratioAfterBuy.compareTo(HALF_LINE) > 0
                    ? "今日规则【半仓行者】: 任意时刻仓位不得超过 50%" : null;
            case NOCHASE -> buying && lastBuyPrice != null && price.compareTo(lastBuyPrice) > 0
                    ? "今日规则【只卖不追】: 买入价不得高于上一笔买入价 " + lastBuyPrice.toPlainString() : null;
            default -> null;
        };
    }

    /** 带交易时闸的规则禁用挂单: 次日 OHLC 成交会绕过闸门 (半仓线/观察期/追高都无法在挂单时判定)。 */
    public static boolean ordersBlocked(Rule rule) {
        return rule == Rule.WATCH || rule == Rule.HALF || rule == Rule.NOCHASE;
    }

    /** STRIKE 的买入最小规模: 名义金额 ≥ 初始资金 × 30% (1 手试探 +3% 不算"一击脱离")。 */
    static final BigDecimal STRIKE_MIN_NOTIONAL = new BigDecimal("0.3");
    /** AUDIT 的理由最短长度: 短于此的敷衍理由不计入一致率样本。 */
    static final int AUDIT_MIN_REASON_LEN = 8;
    /** 三星条件: 通过 + 跑赢持有 + 回撤 ≤5%。 */
    private static final BigDecimal STAR3_DD = new BigDecimal("0.05");

    /**
     * 结算判定。口径注记 (2026-10 审计创意 12~16 收紧):
     *   躺平封堵 —— BELT/HALF/WATCH/NOCHASE/IRONSTOP 要求至少 1 笔成交: 现金利息使
     *   零交易收益恒为小正数, 否则"什么都不做"是这些规则日的优势策略;
     *   HALF 的目标取 max(持有×0.5, 0): 乘法基准在熊市窗口会反转语义 (负一半更容易);
     *   STRIKE 买入须 ≥ 初始资金 30%; AUDIT 只计 ≥8 字理由的流水 (正结果率 ≥60%);
     *   IRONSTOP 的浮亏按收盘价对持仓均价衡量 (成交价口径全站统一为收盘价)。
     * 星级: 未过 0 星; 过 1 星; 跑赢买入持有 2 星; 再叠回撤 ≤5% 3 星 (全规则同口径)。
     */
    public static GameDtos.DailyRuleResult evaluate(Rule rule, BigDecimal returnRate,
                                                    BigDecimal holdReturn, BigDecimal maxDrawdown,
                                                    BigDecimal initialCash,
                                                    List<TradeTransaction> txs,
                                                    List<GameDtos.JournalEntry> journal,
                                                    List<DailyPrice> window) {
        boolean hasTrade = txs != null && !txs.isEmpty();
        boolean passed = switch (rule) {
            case FIVE -> holdReturn != null && returnRate.compareTo(holdReturn) > 0;
            case BELT -> hasTrade && returnRate.signum() > 0
                    && maxDrawdown != null && maxDrawdown.compareTo(BELT_DD) <= 0;
            case HALF -> hasTrade && holdReturn != null
                    && returnRate.compareTo(holdReturn.multiply(HALF_LINE).max(BigDecimal.ZERO)) > 0;
            case WATCH, NOCHASE -> hasTrade && returnRate.signum() > 0;
            case STRIKE -> strikeHit(txs, initialCash);
            case AUDIT -> auditHit(journal);
            case IRONSTOP -> hasTrade && returnRate.compareTo(IRONSTOP_LOSS) >= 0
                    && window != null && !ironStopViolated(txs, window);
        };
        return new GameDtos.DailyRuleResult(rule.name(), passed,
                stars(passed, returnRate, holdReturn, maxDrawdown));
    }

    /** 星级梯度: 让"压线过"与"大胜"有分辨率, 过/不过布尔没有策略张力。 */
    static int stars(boolean passed, BigDecimal returnRate, BigDecimal holdReturn,
                     BigDecimal maxDrawdown) {
        if (!passed) {
            return 0;
        }
        if (holdReturn == null || returnRate.compareTo(holdReturn) <= 0) {
            return 1;
        }
        return maxDrawdown != null && maxDrawdown.compareTo(STAR3_DD) <= 0 ? 3 : 2;
    }

    /** STRIKE: 恰好一买一卖、卖价较买价高 ≥3%, 且买入名义金额 ≥ 初始资金 30%。 */
    static boolean strikeHit(List<TradeTransaction> txs, BigDecimal initialCash) {
        if (txs == null || txs.size() != 2) {
            return false;
        }
        TradeTransaction buy = txs.get(0);
        TradeTransaction sell = txs.get(1);
        if (buy.getDirection() != TradeTransaction.Direction.BUY
                || sell.getDirection() != TradeTransaction.Direction.SELL
                || buy.getPrice() == null || sell.getPrice() == null
                || buy.getPrice().signum() <= 0) {
            return false;
        }
        // 规模闸: 1 手试探性买卖与收益脱钩, 不构成"一击"
        if (initialCash != null && buy.getShares() != null) {
            BigDecimal notional = buy.getPrice().multiply(BigDecimal.valueOf(buy.getShares()));
            if (notional.compareTo(initialCash.multiply(STRIKE_MIN_NOTIONAL)) < 0) {
                return false;
            }
        }
        return sell.getPrice().subtract(buy.getPrice())
                .divide(buy.getPrice(), 6, java.math.RoundingMode.HALF_UP)
                .compareTo(STRIKE_GAP) >= 0;
    }

    /** AUDIT: ≥8 字理由的流水 ≥1 条且其正结果率 ≥60% (短理由不计入样本, 防敷衍)。 */
    static boolean auditHit(List<GameDtos.JournalEntry> journal) {
        if (journal == null || journal.isEmpty()) {
            return false;
        }
        List<GameDtos.JournalEntry> serious = journal.stream()
                .filter(j -> j.reason() != null && j.reason().trim().length() >= AUDIT_MIN_REASON_LEN)
                .toList();
        long scored = serious.stream().filter(j -> j.outcomePct() != null).count();
        if (scored == 0) {
            return false;
        }
        long good = serious.stream()
                .filter(j -> j.outcomePct() != null && j.outcomePct().signum() > 0)
                .count();
        return good * 10 >= scored * 6;
    }

    /**
     * IRONSTOP 违规检测: 按日重放流水 (买入摊薄均价, 卖出减仓不动均价),
     * 任一交易日收盘后仍持仓且 收盘/均价-1 ≤ -5% 即违规 (该 tick 本应清仓)。
     */
    static boolean ironStopViolated(List<TradeTransaction> txs, List<DailyPrice> window) {
        int shares = 0;
        BigDecimal cost = BigDecimal.ZERO; // 持仓均价
        int ti = 0;
        for (DailyPrice day : window) {
            while (ti < txs.size() && !txs.get(ti).getTradeDate().isAfter(day.getTradeDate())) {
                TradeTransaction tx = txs.get(ti++);
                int q = tx.getShares() == null ? 0 : tx.getShares();
                if (q <= 0 || tx.getPrice() == null) {
                    continue;
                }
                if (tx.getDirection() == TradeTransaction.Direction.BUY) {
                    BigDecimal total = cost.multiply(BigDecimal.valueOf(shares))
                            .add(tx.getPrice().multiply(BigDecimal.valueOf(q)));
                    shares += q;
                    cost = total.divide(BigDecimal.valueOf(shares), 4, java.math.RoundingMode.HALF_UP);
                } else {
                    shares = Math.max(0, shares - q);
                }
            }
            if (shares > 0 && cost.signum() > 0
                    && day.getClose().divide(cost, 6, java.math.RoundingMode.HALF_UP)
                            .subtract(BigDecimal.ONE).compareTo(IRONSTOP_LOSS) <= 0) {
                return true;
            }
        }
        return false;
    }
}
