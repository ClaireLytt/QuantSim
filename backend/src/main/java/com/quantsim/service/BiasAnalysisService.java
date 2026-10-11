package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import com.quantsim.dto.GameDtos.BiasReport;
import com.quantsim.dto.GameDtos.BiasVerdict;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.MarketDataService.StockData;

/**
 * 行为偏差诊断: 结算时重放交易流水, 用统计规则识别典型交易心理偏差。
 * 为什么服务端算: 前端的复盘 heuristic 存内存刷新即丢, 且阈值口径要全服一致才可比。
 * 每个判定都带最小样本护栏 —— 20 tick 的短局交易很少, 两三笔就下结论是误诊,
 * 样本不足时 insufficient=true, 前端只展示数据不下定论。
 */
@Service
public class BiasAnalysisService {

    // 阈值首版按 20 tick 局手感定, 上线后按真实对局分布再调
    private static final BigDecimal DISPOSITION_RATIO = new BigDecimal("1.8");
    private static final BigDecimal REVENGE_RATIO = new BigDecimal("1.5");
    private static final BigDecimal CHASE_RATE = new BigDecimal("0.5");
    private static final BigDecimal PANIC_RATE = new BigDecimal("0.5");
    private static final BigDecimal MOVE_THRESHOLD = new BigDecimal("0.03"); // 前日涨跌 ±3%
    private static final int OVERTRADE_COUNT = 15;
    private static final int REVENGE_WINDOW_TICKS = 2;

    /** 一笔已实现卖出(或平仓)的快照: 盈亏与持有时长 (tick 数) */
    private record Realized(BigDecimal pnl, int holdTicks, int tickIdx) {}

    /**
     * 重放流水生成诊断报告。
     *
     * @param dataByStock 流水涉及的全部标的行情 (stockId=null 的旧流水回退到主标的)
     */
    public BiasReport analyze(GameSession session, List<TradeTransaction> txs,
                              Function<Long, StockData> dataByStock) {
        List<Realized> realized = new ArrayList<>();
        // 每笔交易的 tick 序号与金额 (报复性交易要比较"亏损后下单额" vs 全局中位额)
        List<BigDecimal> allAmounts = new ArrayList<>();
        List<Integer> allTicks = new ArrayList<>();
        int chaseBuys = 0;
        int totalBuys = 0;
        int panicSells = 0;
        int totalSells = 0;

        // 均价持仓模型 (镜像 TradeEngine 口径, 支持 advanced 空头: 仓位带符号,
        // 反向成交的重叠部分视为平仓并实现盈亏, 加仓才摊薄均价/加权入场点)
        Map<Long, int[]> posShares = new HashMap<>();          // stockId -> [signed shares]
        Map<Long, BigDecimal> posCost = new HashMap<>();       // 均价
        Map<Long, BigDecimal> posEntryTick = new HashMap<>();  // 加权入场 tick

        for (TradeTransaction tx : txs) {
            long stockId = tx.getStockId() != null ? tx.getStockId() : session.getStockId();
            StockData sd = dataByStock.apply(stockId);
            Integer idx = sd == null ? null : sd.indexOf(tx.getTradeDate());
            if (idx == null) {
                continue; // 行情缺失的流水不参与统计
            }
            int signed = tx.getDirection() == TradeTransaction.Direction.BUY
                    ? tx.getShares() : -tx.getShares();
            BigDecimal amount = tx.getPrice().multiply(BigDecimal.valueOf(tx.getShares()));
            allAmounts.add(amount);
            allTicks.add(idx);

            // 追涨/杀跌: 看前一交易日涨跌幅 (窗口头两根没有"前日", 跳过)
            BigDecimal prevRet = prevDayReturn(sd, idx);
            if (tx.getDirection() == TradeTransaction.Direction.BUY) {
                totalBuys++;
                if (prevRet != null && prevRet.compareTo(MOVE_THRESHOLD) > 0) {
                    chaseBuys++;
                }
            } else {
                totalSells++;
            }

            int cur = posShares.computeIfAbsent(stockId, k -> new int[1])[0];
            boolean closing = cur != 0 && Integer.signum(signed) != Integer.signum(cur);
            if (closing) {
                int closed = Math.min(Math.abs(signed), Math.abs(cur));
                BigDecimal avgCost = posCost.getOrDefault(stockId, BigDecimal.ZERO);
                // 多头平仓赚 = 卖价高于成本; 空头方向取反
                BigDecimal pnl = tx.getPrice().subtract(avgCost)
                        .multiply(BigDecimal.valueOf((long) closed * Integer.signum(cur)))
                        .setScale(4, RoundingMode.HALF_UP);
                int holdTicks = Math.max(0,
                        idx - posEntryTick.getOrDefault(stockId, BigDecimal.valueOf(idx)).intValue());
                realized.add(new Realized(pnl, holdTicks, idx));
                if (pnl.signum() < 0
                        && tx.getDirection() == TradeTransaction.Direction.SELL
                        && prevRet != null && prevRet.compareTo(MOVE_THRESHOLD.negate()) < 0) {
                    panicSells++; // 恐慌卖: 前日大跌 + 实亏离场
                }
            }
            // 更新仓位: 加仓摊薄, 平仓不动均价, 反手则以本笔为新入场
            int next = cur + signed;
            if (cur == 0 || Integer.signum(next) != Integer.signum(cur)) {
                posCost.put(stockId, tx.getPrice());
                posEntryTick.put(stockId, BigDecimal.valueOf(idx));
            } else if (!closing) {
                BigDecimal oldAbs = BigDecimal.valueOf(Math.abs(cur));
                BigDecimal addAbs = BigDecimal.valueOf(Math.abs(signed));
                BigDecimal total = oldAbs.add(addAbs);
                posCost.put(stockId, posCost.getOrDefault(stockId, tx.getPrice()).multiply(oldAbs)
                        .add(tx.getPrice().multiply(addAbs))
                        .divide(total, 4, RoundingMode.HALF_UP));
                posEntryTick.put(stockId, posEntryTick.getOrDefault(stockId, BigDecimal.valueOf(idx))
                        .multiply(oldAbs).add(BigDecimal.valueOf(idx).multiply(addAbs))
                        .divide(total, 2, RoundingMode.HALF_UP));
            }
            posShares.get(stockId)[0] = next;
        }

        int totalTrades = allAmounts.size();
        List<BiasVerdict> verdicts = new ArrayList<>();
        verdicts.add(disposition(realized));
        verdicts.add(revenge(realized, allAmounts, allTicks));
        verdicts.add(rateVerdict("chase", chaseBuys, totalBuys, 3, CHASE_RATE));
        verdicts.add(rateVerdict("panic", panicSells, totalSells, 2, PANIC_RATE));
        verdicts.add(overtrade(totalTrades));
        return new BiasReport(totalTrades, verdicts);
    }

    /**
     * 交易日志 (限制条件玩法): 每笔带理由的交易给出"事后结果"供对照。
     * 口径: 卖出(平仓) = 相对持仓均价的已实现收益率; 买入(开仓) = 成交价到结算收盘的涨跌
     * (空头开仓取反)。日期脱敏由调用方决定 (竞技局结算后已揭晓, 原样即可)。
     */
    public List<com.quantsim.dto.GameDtos.JournalEntry> journal(GameSession session,
            List<TradeTransaction> txs, Function<Long, StockData> dataByStock) {
        List<com.quantsim.dto.GameDtos.JournalEntry> out = new ArrayList<>();
        Map<Long, int[]> posShares = new HashMap<>();
        Map<Long, BigDecimal> posCost = new HashMap<>();
        for (TradeTransaction tx : txs) {
            long stockId = tx.getStockId() != null ? tx.getStockId() : session.getStockId();
            StockData sd = dataByStock.apply(stockId);
            int cur = posShares.computeIfAbsent(stockId, k -> new int[1])[0];
            int signed = tx.getDirection() == TradeTransaction.Direction.BUY
                    ? tx.getShares() : -tx.getShares();
            boolean closing = cur != 0 && Integer.signum(signed) != Integer.signum(cur);

            if (tx.getReason() != null && !tx.getReason().isBlank()) {
                BigDecimal outcome = null;
                if (closing) {
                    BigDecimal avgCost = posCost.getOrDefault(stockId, tx.getPrice());
                    if (avgCost.signum() > 0) {
                        outcome = tx.getPrice().subtract(avgCost)
                                .divide(avgCost, 4, RoundingMode.HALF_UP)
                                .multiply(BigDecimal.valueOf(Integer.signum(cur)));
                    }
                } else if (sd != null) {
                    var settleBar = sd.bar(session.getCurrentTradeDate());
                    if (settleBar != null && tx.getPrice().signum() > 0) {
                        outcome = settleBar.getClose().subtract(tx.getPrice())
                                .divide(tx.getPrice(), 4, RoundingMode.HALF_UP)
                                .multiply(BigDecimal.valueOf(Integer.signum(signed)));
                    }
                }
                out.add(new com.quantsim.dto.GameDtos.JournalEntry(
                        tx.getTradeDate(), tx.getDirection().name(), tx.getReason(), outcome));
            }

            // 与 analyze 同一套仓位推进 (只需均价, 不需入场 tick)
            int next = cur + signed;
            if (cur == 0 || Integer.signum(next) != Integer.signum(cur)) {
                posCost.put(stockId, tx.getPrice());
            } else if (!closing) {
                BigDecimal oldAbs = BigDecimal.valueOf(Math.abs(cur));
                BigDecimal addAbs = BigDecimal.valueOf(Math.abs(signed));
                posCost.put(stockId, posCost.getOrDefault(stockId, tx.getPrice()).multiply(oldAbs)
                        .add(tx.getPrice().multiply(addAbs))
                        .divide(oldAbs.add(addAbs), 4, RoundingMode.HALF_UP));
            }
            posShares.get(stockId)[0] = next;
        }
        return out;
    }

    /**
     * 偏差档案: 把一个玩家按时间排好的诊断报告聚合成跨对局趋势。
     * 只统计样本充足 (insufficient=false) 的局; 近 5 局触发率 vs 更早触发率
     * 给出 IMPROVING / WORSENING / FLAT, 不足 4 局样本给 NA (不下结论)。
     */
    public com.quantsim.dto.GameDtos.BiasProfile profile(List<BiasReport> reports) {
        String[] keys = {"disposition", "revenge", "chase", "panic", "overtrade"};
        List<com.quantsim.dto.GameDtos.BiasTrend> trends = new ArrayList<>();
        for (String key : keys) {
            List<BigDecimal> history = new ArrayList<>();
            List<Boolean> trig = new ArrayList<>();
            for (BiasReport r : reports) {
                BiasVerdict v = r.verdicts().stream()
                        .filter(x -> key.equals(x.key())).findFirst().orElse(null);
                if (v == null || v.insufficient()) {
                    continue;
                }
                history.add(metricOf(key, v));
                trig.add(v.triggered());
            }
            int games = trig.size();
            int triggered = (int) trig.stream().filter(Boolean::booleanValue).count();
            BigDecimal recentRate = null;
            BigDecimal earlierRate = null;
            String trend = "NA";
            if (games >= 4) {
                int recentN = Math.min(5, games / 2);
                List<Boolean> recent = trig.subList(games - recentN, games);
                List<Boolean> earlier = trig.subList(0, games - recentN);
                recentRate = rate(recent);
                earlierRate = rate(earlier);
                int cmp = recentRate.compareTo(earlierRate);
                // 触发率降 = 改善 (偏差是坏事)
                trend = cmp < 0 ? "IMPROVING" : cmp > 0 ? "WORSENING" : "FLAT";
            }
            trends.add(new com.quantsim.dto.GameDtos.BiasTrend(
                    key, games, triggered, recentRate, earlierRate, trend, history, trig));
        }
        return new com.quantsim.dto.GameDtos.BiasProfile(reports.size(), trends);
    }

    /** 每项偏差取一个可画趋势的关键指标。 */
    private BigDecimal metricOf(String key, BiasVerdict v) {
        Map<String, BigDecimal> stats = v.stats() == null ? Map.of() : v.stats();
        return switch (key) {
            case "disposition", "revenge" -> stats.get("ratio");
            case "chase", "panic" -> stats.get("rate");
            case "overtrade" -> stats.get("total");
            default -> null;
        };
    }

    private BigDecimal rate(List<Boolean> xs) {
        if (xs.isEmpty()) {
            return BigDecimal.ZERO;
        }
        long hit = xs.stream().filter(Boolean::booleanValue).count();
        return BigDecimal.valueOf(hit).divide(BigDecimal.valueOf(xs.size()), 2, RoundingMode.HALF_UP);
    }

    /** 前一交易日涨跌幅 close[i-1]/close[i-2] - 1; 数据不足返回 null。 */
    private BigDecimal prevDayReturn(StockData sd, int idx) {
        if (idx < 2) {
            return null;
        }
        BigDecimal c1 = sd.prices().get(idx - 1).getClose();
        BigDecimal c2 = sd.prices().get(idx - 2).getClose();
        if (c2.signum() <= 0) {
            return null;
        }
        return c1.divide(c2, 6, RoundingMode.HALF_UP).subtract(BigDecimal.ONE);
    }

    /** 处置效应: 亏损单平均持有时长 / 盈利单平均持有时长。 */
    private BiasVerdict disposition(List<Realized> realized) {
        long winners = realized.stream().filter(r -> r.pnl().signum() > 0).count();
        long losers = realized.stream().filter(r -> r.pnl().signum() < 0).count();
        Map<String, BigDecimal> stats = new LinkedHashMap<>();
        if (realized.size() < 3 || winners < 2 || losers < 1) {
            return new BiasVerdict("disposition", false, "INFO", stats, true);
        }
        BigDecimal avgWin = avgHold(realized, true);
        BigDecimal avgLose = avgHold(realized, false);
        BigDecimal ratio = avgLose.divide(avgWin.max(new BigDecimal("0.5")), 2, RoundingMode.HALF_UP);
        stats.put("holdWin", avgWin);
        stats.put("holdLose", avgLose);
        stats.put("ratio", ratio);
        boolean triggered = ratio.compareTo(DISPOSITION_RATIO) >= 0;
        return new BiasVerdict("disposition", triggered, triggered ? "WARN" : "INFO", stats, false);
    }

    private BigDecimal avgHold(List<Realized> realized, boolean winners) {
        List<Realized> part = realized.stream()
                .filter(r -> winners ? r.pnl().signum() > 0 : r.pnl().signum() < 0).toList();
        if (part.isEmpty()) {
            return BigDecimal.ZERO;
        }
        long sum = part.stream().mapToLong(Realized::holdTicks).sum();
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(part.size()), 2, RoundingMode.HALF_UP);
    }

    /** 报复性交易: 实亏后 2 tick 内的下单额 / 全部交易中位额。 */
    private BiasVerdict revenge(List<Realized> realized, List<BigDecimal> amounts, List<Integer> ticks) {
        Map<String, BigDecimal> stats = new LinkedHashMap<>();
        List<Integer> lossTicks = realized.stream()
                .filter(r -> r.pnl().signum() < 0).map(Realized::tickIdx).toList();
        List<BigDecimal> postLoss = new ArrayList<>();
        for (int i = 0; i < amounts.size(); i++) {
            int t = ticks.get(i);
            for (int lt : lossTicks) {
                if (t > lt && t - lt <= REVENGE_WINDOW_TICKS) {
                    postLoss.add(amounts.get(i));
                    break;
                }
            }
        }
        if (postLoss.size() < 2 || amounts.size() < 4) {
            return new BiasVerdict("revenge", false, "INFO", stats, true);
        }
        BigDecimal median = median(amounts);
        if (median.signum() <= 0) {
            return new BiasVerdict("revenge", false, "INFO", stats, true);
        }
        BigDecimal avgPost = postLoss.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(postLoss.size()), 2, RoundingMode.HALF_UP);
        BigDecimal ratio = avgPost.divide(median, 2, RoundingMode.HALF_UP);
        stats.put("ratio", ratio);
        stats.put("postLossTrades", BigDecimal.valueOf(postLoss.size()));
        boolean triggered = ratio.compareTo(REVENGE_RATIO) >= 0;
        return new BiasVerdict("revenge", triggered, triggered ? "WARN" : "INFO", stats, false);
    }

    private BigDecimal median(List<BigDecimal> values) {
        List<BigDecimal> sorted = values.stream().sorted().toList();
        int n = sorted.size();
        return n % 2 == 1 ? sorted.get(n / 2)
                : sorted.get(n / 2 - 1).add(sorted.get(n / 2))
                        .divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
    }

    /** 占比型判定 (chase/panic 共用): hits/total ≥ 阈值。 */
    private BiasVerdict rateVerdict(String key, int hits, int total, int minSample, BigDecimal threshold) {
        Map<String, BigDecimal> stats = new LinkedHashMap<>();
        if (total < minSample) {
            return new BiasVerdict(key, false, "INFO", stats, true);
        }
        BigDecimal rate = BigDecimal.valueOf(hits)
                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
        stats.put("rate", rate);
        stats.put("hits", BigDecimal.valueOf(hits));
        stats.put("total", BigDecimal.valueOf(total));
        boolean triggered = rate.compareTo(threshold) >= 0;
        return new BiasVerdict(key, triggered, triggered ? "WARN" : "INFO", stats, false);
    }

    /** 过度交易: 20 tick 的局超过 15 笔。笔数本身就是样本, 无护栏。 */
    private BiasVerdict overtrade(int totalTrades) {
        Map<String, BigDecimal> stats = new LinkedHashMap<>();
        stats.put("total", BigDecimal.valueOf(totalTrades));
        boolean triggered = totalTrades > OVERTRADE_COUNT;
        return new BiasVerdict("overtrade", triggered, triggered ? "WARN" : "INFO", stats, false);
    }
}
