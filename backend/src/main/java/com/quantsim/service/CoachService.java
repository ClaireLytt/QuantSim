package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.quantsim.dto.GameDtos.CoachAnchor;
import com.quantsim.dto.GameDtos.CoachFinding;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.MarketDataService.StockData;

/**
 * 复盘教练首发三卡 (docs/recap-coach-2026-10.md 的 C9/C11/C1), 规则+统计实现, 零 LLM。
 * 铁律落地:
 *   时点纪律 — C1 的象限归类只用买入当日及之前的价格/指标 (历史行情不可变, 结算时按日期
 *     回查与下单时冻结等价, 故 v1 不加 decision_ctx 列——设计文档的"冻结"推迟到出现可变口径时);
 *   证据先行 — 每条发现挂 TX/STAT 锚;
 *   不确定性 — SOLID/LEAN/WEAK 三级; C9 的会计恒等式校验不过直接不出卡 (宁缺毋错)。
 * 适用范围 v1: 单股非进阶局 (组合/做空的配对口径另期); 三卡均无 hindsight (不用未来数据)。
 */
@Service
public class CoachService {

    private static final BigDecimal CHASE_FROM_HIGH = new BigDecimal("-0.03"); // 距近高 ≥-3% = 追入区
    private static final BigDecimal KNIFE_FROM_HIGH = new BigDecimal("-0.10"); // 距近高 ≤-10% 且价<MA20 = 接刀
    private static final int HIGH_LOOKBACK = 20;
    private static final BigDecimal ONE_SHOT = new BigDecimal("0.6"); // 单笔贡献 >60% = 一笔定乾坤

    enum Quadrant { CHASE, DIP, KNIFE, PROBE }

    public List<CoachFinding> findings(GameSession session, StockData sd,
                                       List<TradeTransaction> txs,
                                       BigDecimal initialCash, BigDecimal finalAssets,
                                       BigDecimal interestTotal, BigDecimal returnRate,
                                       BigDecimal holdReturn, BigDecimal maCrossReturn,
                                       BigDecimal dcaReturn, BigDecimal aiReturn) {
        List<CoachFinding> out = new ArrayList<>();
        // v1 口径护栏: 组合与进阶 (做空/杠杆) 的配对与象限口径未覆盖, 宁缺毋错
        if ("PORTFOLIO".equals(session.getMode()) || session.isAdvanced()) {
            return out;
        }
        Waterfall wf = waterfall(txs, sd, session.getCurrentTradeDate(), initialCash, finalAssets, interestTotal);
        if (wf != null) {
            out.addAll(c9(wf));
            out.addAll(c1(txs, sd, wf));
        }
        out.addAll(c11(returnRate, holdReturn, maCrossReturn, dcaReturn, aiReturn));
        return out;
    }

    // ---------- C9 盈亏来源瀑布 ----------

    /** FIFO 配对结果: pairs 的 pnl 按卖出归集; buyPnl 把已实现盈亏归到买入笔 (C1 复用)。 */
    record Waterfall(BigDecimal realized, BigDecimal unrealized, BigDecimal fees,
                     BigDecimal interest, BigDecimal total,
                     BigDecimal biggestPairPnl, Long biggestPairTxId,
                     Map<Long, BigDecimal> buyPnl) {}

    static Waterfall waterfall(List<TradeTransaction> txs, StockData sd, LocalDate settleDate,
                               BigDecimal initialCash, BigDecimal finalAssets, BigDecimal interest) {
        record Lot(Long buyTxId, LocalDate date, int shares, BigDecimal price) {}
        Deque<Lot> inv = new ArrayDeque<>();
        BigDecimal realized = BigDecimal.ZERO;
        BigDecimal fees = BigDecimal.ZERO;
        BigDecimal biggest = BigDecimal.ZERO;
        Long biggestTx = null;
        Map<Long, BigDecimal> buyPnl = new java.util.HashMap<>();
        for (TradeTransaction tx : txs) {
            if (tx.getFee() != null) {
                fees = fees.add(tx.getFee());
            }
            int q = tx.getShares() == null ? 0 : tx.getShares();
            if (q <= 0 || tx.getPrice() == null) {
                continue;
            }
            if (tx.getDirection() == TradeTransaction.Direction.BUY) {
                inv.addLast(new Lot(tx.getTxId(), tx.getTradeDate(), q, tx.getPrice()));
            } else {
                int remaining = q;
                BigDecimal pairPnl = BigDecimal.ZERO;
                while (remaining > 0 && !inv.isEmpty()) {
                    Lot lot = inv.pollFirst();
                    int matched = Math.min(remaining, lot.shares());
                    BigDecimal pnl = tx.getPrice().subtract(lot.price())
                            .multiply(BigDecimal.valueOf(matched));
                    pairPnl = pairPnl.add(pnl);
                    buyPnl.merge(lot.buyTxId(), pnl, BigDecimal::add);
                    remaining -= matched;
                    if (lot.shares() > matched) {
                        inv.addFirst(new Lot(lot.buyTxId(), lot.date(), lot.shares() - matched, lot.price()));
                    }
                }
                if (remaining > 0) {
                    return null; // 裸卖 (不该出现在非进阶局): 口径不符, 不出卡
                }
                realized = realized.add(pairPnl);
                if (pairPnl.abs().compareTo(biggest.abs()) > 0) {
                    biggest = pairPnl;
                    biggestTx = tx.getTxId();
                }
            }
        }
        // 期末浮盈: 剩余 lot 按结算日收盘估值
        DailyPrice last = sd.bar(settleDate);
        BigDecimal unrealized = BigDecimal.ZERO;
        for (Lot lot : inv) {
            if (last == null) {
                return null;
            }
            BigDecimal pnl = last.getClose().subtract(lot.price())
                    .multiply(BigDecimal.valueOf(lot.shares()));
            unrealized = unrealized.add(pnl);
            buyPnl.merge(lot.buyTxId(), pnl, BigDecimal::add);
            if (pnl.abs().compareTo(biggest.abs()) > 0) {
                biggest = pnl;
                biggestTx = lot.buyTxId();
            }
        }
        BigDecimal total = finalAssets.subtract(initialCash);
        BigDecimal interestSafe = interest == null ? BigDecimal.ZERO : interest;
        // 会计恒等式: 已实现 + 浮盈 + 利息 - 费用 = 总盈亏 (±1 元容差吸收四舍五入)
        BigDecimal identity = realized.add(unrealized).add(interestSafe).subtract(fees);
        if (identity.subtract(total).abs().compareTo(BigDecimal.ONE) > 0) {
            return null; // 恒等式不成立 = 口径有洞, 宁缺毋错
        }
        return new Waterfall(realized, unrealized, fees, interestSafe, total, biggest, biggestTx, buyPnl);
    }

    private List<CoachFinding> c9(Waterfall wf) {
        List<CoachFinding> out = new ArrayList<>();
        out.add(new CoachFinding("C9", "coach.c9.main",
                List.of(money(wf.realized()), money(wf.unrealized()), money(wf.fees()),
                        money(wf.interest()), money(wf.total())),
                "SOLID", false,
                List.of(stat("coach.ev.fees", money(wf.fees())),
                        stat("coach.ev.total", money(wf.total())))));
        // 一笔定乾坤: 最大单笔贡献 > 总盈亏的 60% (总盈亏接近 0 时无意义, 跳过)
        if (wf.total().abs().compareTo(BigDecimal.ONE) > 0
                && wf.biggestPairPnl().abs()
                        .compareTo(wf.total().abs().multiply(ONE_SHOT)) > 0) {
            out.add(new CoachFinding("C9", "coach.c9.oneShot",
                    List.of(money(wf.biggestPairPnl())), "SOLID", false,
                    List.of(tx(wf.biggestPairTxId()))));
        }
        return out;
    }

    // ---------- C11 四基准机会成本榜 ----------

    private List<CoachFinding> c11(BigDecimal ret, BigDecimal hold, BigDecimal maCross,
                                   BigDecimal dca, BigDecimal ai) {
        record Bench(String key, BigDecimal v) {}
        List<Bench> benches = new ArrayList<>();
        if (hold != null) benches.add(new Bench("hold", hold));
        if (maCross != null) benches.add(new Bench("ma", maCross));
        if (dca != null) benches.add(new Bench("dca", dca));
        if (ai != null) benches.add(new Bench("ai", ai));
        if (benches.isEmpty() || ret == null) {
            return List.of();
        }
        long beaten = benches.stream().filter(b -> ret.compareTo(b.v()) > 0).count();
        // 最强对手 = 没赢过的基准里收益最高的; 全赢则记最接近的那个
        Bench rival = benches.stream()
                .filter(b -> ret.compareTo(b.v()) <= 0)
                .max(java.util.Comparator.comparing(Bench::v))
                .orElseGet(() -> benches.stream().max(java.util.Comparator.comparing(Bench::v)).orElseThrow());
        List<CoachAnchor> anchors = benches.stream()
                .map(b -> stat("coach.bench." + b.key(), pct(b.v())))
                .toList();
        return List.of(new CoachFinding("C11",
                beaten == benches.size() ? "coach.c11.sweep" : "coach.c11.main",
                List.of(String.valueOf(beaten), String.valueOf(benches.size()),
                        "coach.bench." + rival.key(), pct(rival.v())),
                "SOLID", false, anchors));
    }

    // ---------- C1 入场时机画像 ----------

    private List<CoachFinding> c1(List<TradeTransaction> txs, StockData sd, Waterfall wf) {
        Map<Quadrant, Integer> count = new EnumMap<>(Quadrant.class);
        Map<Quadrant, BigDecimal> pnl = new EnumMap<>(Quadrant.class);
        Map<Quadrant, Long> sampleTx = new EnumMap<>(Quadrant.class);
        int buys = 0;
        for (TradeTransaction tx : txs) {
            if (tx.getDirection() != TradeTransaction.Direction.BUY
                    || tx.getShares() == null || tx.getShares() <= 0) {
                continue;
            }
            Quadrant q = classify(sd, tx.getTradeDate());
            if (q == null) {
                continue;
            }
            buys++;
            count.merge(q, 1, Integer::sum);
            pnl.merge(q, wf.buyPnl().getOrDefault(tx.getTxId(), BigDecimal.ZERO), BigDecimal::add);
            sampleTx.putIfAbsent(q, tx.getTxId());
        }
        if (buys == 0) {
            return List.of();
        }
        // 主象限 = 买入最多的那一类; 单局措辞恒为描述性, 规范性结论留给跨局 (设计文档 C1)
        Quadrant dominant = count.entrySet().stream()
                .max(Map.Entry.comparingByValue()).orElseThrow().getKey();
        int n = count.get(dominant);
        return List.of(new CoachFinding("C1", "coach.c1.main",
                List.of("coach.c1.q." + dominant.name(), String.valueOf(n), String.valueOf(buys),
                        money(pnl.get(dominant))),
                n >= 3 ? "SOLID" : "WEAK", false,
                List.of(tx(sampleTx.get(dominant)),
                        stat("coach.ev.buys", String.valueOf(buys)))));
    }

    /**
     * 象限归类 (只用买入当日及之前的信息):
     * CHASE 距近 20 日高 ≥-3% 且价>MA5; KNIFE 距近高 ≤-10% 且价<MA20;
     * DIP 其间回调且价≥MA20; 其余 PROBE。指标缺失返回 null (开局初期 MA 未就绪)。
     */
    static Quadrant classify(StockData sd, LocalDate buyDate) {
        Integer idx = sd.indexOf(buyDate);
        if (idx == null) {
            return null;
        }
        DailyIndicator ind = sd.indicators().get(buyDate);
        if (ind == null || ind.getMa5() == null || ind.getMa20() == null) {
            return null;
        }
        BigDecimal close = sd.prices().get(idx).getClose();
        BigDecimal high = BigDecimal.ZERO;
        for (int i = Math.max(0, idx - HIGH_LOOKBACK + 1); i <= idx; i++) {
            high = high.max(sd.prices().get(i).getClose());
        }
        if (high.signum() <= 0) {
            return null;
        }
        BigDecimal fromHigh = close.divide(high, 6, RoundingMode.HALF_UP).subtract(BigDecimal.ONE);
        if (fromHigh.compareTo(CHASE_FROM_HIGH) >= 0 && close.compareTo(ind.getMa5()) > 0) {
            return Quadrant.CHASE;
        }
        if (fromHigh.compareTo(KNIFE_FROM_HIGH) <= 0 && close.compareTo(ind.getMa20()) < 0) {
            return Quadrant.KNIFE;
        }
        if (fromHigh.compareTo(CHASE_FROM_HIGH) < 0 && close.compareTo(ind.getMa20()) >= 0) {
            return Quadrant.DIP;
        }
        return Quadrant.PROBE;
    }

    // ---------- 工具 ----------

    private static CoachAnchor stat(String key, String value) {
        return new CoachAnchor("STAT", null, key, value);
    }

    private static CoachAnchor tx(Long txId) {
        return new CoachAnchor("TX", txId, null, null);
    }

    private static String money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(0, RoundingMode.HALF_UP).toPlainString();
    }

    private static String pct(BigDecimal v) {
        return v.multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
