package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.UserPoints;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.repository.UserPointsRepository;

import lombok.RequiredArgsConstructor;

/**
 * 「我的交易人生」首页聚合: 把已结算对局折算成一条人生净值曲线。
 * 口径 (2026-10-25 用户拍板):
 *  - 各模式初始资金不一, 统一归一化为 10 万起步的净值, 各局收益率按时间序几何连乘 (资金滚动);
 *  - 累计收益率 = 终值/10万 - 1; 对局胜率 = finalReturnRate>0 的局数占比;
 *  - 最大回撤 = 净值序列 (含 10 万起点) 的峰谷最大跌幅。
 * P2 (2026-10-26):
 *  - 曲线细化到日: 结算落库的逐日净值 (equity_curve) 按 "入局前净值/该局本金" 缩放后拼接,
 *    老对局无曲线回退单点; 回撤改在逐日序列上算 (更真);
 *  - 逐笔胜率: 均价法配对 —— 每笔减仓流水算一次平仓, 盈利 (含手续费分摊) 记胜。
 *    均价法对多/空仓统一成立, 比 FIFO 简单且与 TradeEngine 的持仓均价口径一致。
 * 只读聚合, 不落库; 响应曲线降采样 ≤200 点。
 */
@Service
@RequiredArgsConstructor
public class MeSummaryService {

    /** 归一化基准本金 (10 万) */
    public static final BigDecimal BASE_ASSETS = new BigDecimal("100000");

    /** 响应曲线点数上限 (末点恒保留) */
    private static final int RESPONSE_MAX_POINTS = 200;

    private final GameSessionRepository sessionRepository;
    private final UserPointsRepository pointsRepository;
    private final TransactionRepository transactionRepository;
    private final ObjectMapper objectMapper;

    public record CurvePoint(LocalDate date, BigDecimal value) {}

    public record LifeSummary(int settledCount, int wins, BigDecimal virtualAssets,
            BigDecimal cumulativeReturn, BigDecimal winRate, BigDecimal maxDrawdown,
            int signInStreak, int closedTrades, BigDecimal tradeWinRate,
            List<CurvePoint> curve) {}

    @Transactional(readOnly = true)
    public LifeSummary summary(Long userId) {
        List<GameSession> sessions = sessionRepository
                .findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
                        userId, GameSession.Status.SETTLED);
        BigDecimal net = BASE_ASSETS;
        BigDecimal peak = BASE_ASSETS;
        BigDecimal maxDd = BigDecimal.ZERO;
        int wins = 0;
        List<CurvePoint> curve = new ArrayList<>();
        for (GameSession s : sessions) {
            BigDecimal r = s.getFinalReturnRate();
            if (r.signum() > 0) {
                wins++;
            }
            // 入局前净值 → 该局逐日点按 (净值/本金) 缩放拼接; 无曲线退化为结算日单点
            List<CurvePoint> daily = scaledDaily(s, net);
            BigDecimal next = net.multiply(BigDecimal.ONE.add(r)).setScale(2, RoundingMode.HALF_UP);
            if (daily.isEmpty()) {
                daily = List.of(new CurvePoint(s.getCreatedAt().toLocalDate(), next));
            }
            for (CurvePoint p : daily) {
                curve.add(p);
                if (p.value().compareTo(peak) > 0) {
                    peak = p.value();
                } else {
                    BigDecimal dd = peak.subtract(p.value()).divide(peak, 4, RoundingMode.HALF_UP);
                    if (dd.compareTo(maxDd) > 0) {
                        maxDd = dd;
                    }
                }
            }
            net = next;
        }
        int n = sessions.size();
        BigDecimal cumReturn = net.subtract(BASE_ASSETS).divide(BASE_ASSETS, 4, RoundingMode.HALF_UP);
        BigDecimal winRate = n == 0 ? BigDecimal.ZERO.setScale(4)
                : BigDecimal.valueOf(wins).divide(BigDecimal.valueOf(n), 4, RoundingMode.HALF_UP);
        int streak = pointsRepository.findById(userId).map(UserPoints::getSignInStreak).orElse(0);
        TradeStats trades = n == 0 ? new TradeStats(List.of(), List.of())
                : pairTrades(transactionRepository.findByUserAndSessionStatus(
                        userId, GameSession.Status.SETTLED));
        BigDecimal tradeWinRate = trades.closed() == 0 ? BigDecimal.ZERO.setScale(4)
                : BigDecimal.valueOf(trades.wins())
                        .divide(BigDecimal.valueOf(trades.closed()), 4, RoundingMode.HALF_UP);
        return new LifeSummary(n, wins, net, cumReturn, winRate, maxDd, streak,
                trades.closed(), tradeWinRate, downsample(curve));
    }

    /** 该局落库曲线 (JSON [[date,value]...]) 按入局前净值缩放; 无曲线/坏数据返回空表 */
    private List<CurvePoint> scaledDaily(GameSession s, BigDecimal netBefore) {
        if (s.getEquityCurve() == null || s.getInitialCash() == null
                || s.getInitialCash().signum() <= 0) {
            return List.of();
        }
        try {
            JsonNode arr = objectMapper.readTree(s.getEquityCurve());
            BigDecimal factor = netBefore.divide(s.getInitialCash(), 8, RoundingMode.HALF_UP);
            List<CurvePoint> pts = new ArrayList<>(arr.size());
            for (JsonNode p : arr) {
                pts.add(new CurvePoint(LocalDate.parse(p.get(0).asText()),
                        new BigDecimal(p.get(1).asText()).multiply(factor)
                                .setScale(2, RoundingMode.HALF_UP)));
            }
            return pts;
        } catch (Exception e) {
            return List.of(); // 个别坏数据回退单点, 不拖垮整页
        }
    }

    /** 响应曲线降采样 (≤200 点, 末点恒保留): 全量逐日点可达 50 局×150 点, 没必要全下发 */
    private List<CurvePoint> downsample(List<CurvePoint> curve) {
        if (curve.size() <= RESPONSE_MAX_POINTS) {
            return curve;
        }
        int step = (int) Math.ceil(curve.size() / (double) RESPONSE_MAX_POINTS);
        List<CurvePoint> pts = new ArrayList<>();
        for (int i = 0; i < curve.size(); i += step) {
            pts.add(curve.get(i));
        }
        if ((curve.size() - 1) % step != 0) {
            pts.add(curve.get(curve.size() - 1));
        }
        return pts;
    }

    /** 一次平仓明细 (赛后复盘用): 开仓均价含买入费摊入, pnl 含平仓费摊入 */
    public record ClosedTrade(Long stockId, boolean isLong, int qty, BigDecimal entryAvg,
            BigDecimal exitPrice, LocalDate exitDate, long holdDays, BigDecimal pnl) {}

    /** 结算时仍未平的持仓 (均价含费; qty 带符号: 正=多, 负=空) */
    public record OpenLot(Long stockId, int qty, BigDecimal avg) {}

    public record TradeStats(List<ClosedTrade> trades, List<OpenLot> open) {
        public int closed() { return trades.size(); }

        public int wins() { return (int) trades.stream().filter(ct -> ct.pnl().signum() > 0).count(); }
    }

    /**
     * 均价法逐笔配对: 按 (局, 标的) 维持带符号持仓与均价 (手续费摊进成本/平仓损益),
     * 每笔减仓流水记一次平仓, 实现盈亏 > 0 记胜; 反手时剩余量按本笔价开新仓。
     * 返回平仓明细与期末敞口 —— 已实现/未实现的分解恒等式建立在"买入费入均价、
     * 平仓费入当笔 pnl"这一个口径上 (RecapServiceTest 以现金流对拍钉死)。
     */
    static TradeStats pairTrades(List<TradeTransaction> txs) {
        // qty 带符号: 正=多, 负=空; stockId 随 Pos 携带 (旧组合流水可能为 null, 不能从 key 反解析)
        record Pos(Long stockId, int qty, BigDecimal avg, LocalDate opened) {}
        Map<String, Pos> book = new HashMap<>();
        List<ClosedTrade> closedTrades = new ArrayList<>();
        for (TradeTransaction tx : txs) {
            String key = tx.getSessionId() + ":" + tx.getStockId();
            Pos pos = book.getOrDefault(key, new Pos(tx.getStockId(), 0, BigDecimal.ZERO, tx.getTradeDate()));
            int signed = tx.getDirection() == TradeTransaction.Direction.BUY
                    ? tx.getShares() : -tx.getShares();
            BigDecimal fee = tx.getFee() == null ? BigDecimal.ZERO : tx.getFee();
            if (pos.qty() == 0 || (pos.qty() > 0) == (signed > 0)) {
                // 开仓/加仓: 均价 = (旧成本 + 本笔金额 + 手续费) / 新数量
                BigDecimal cost = pos.avg().multiply(BigDecimal.valueOf(Math.abs(pos.qty())))
                        .add(tx.getPrice().multiply(BigDecimal.valueOf(Math.abs(signed))))
                        .add(fee);
                int newQty = pos.qty() + signed;
                book.put(key, new Pos(pos.stockId(), newQty,
                        cost.divide(BigDecimal.valueOf(Math.abs(newQty)), 8, RoundingMode.HALF_UP),
                        pos.qty() == 0 ? tx.getTradeDate() : pos.opened()));
                continue;
            }
            // 减仓/平仓: 实现盈亏 = (价差 × 平仓量) - 本笔手续费按量分摊
            int closeQty = Math.min(Math.abs(pos.qty()), Math.abs(signed));
            BigDecimal diff = pos.qty() > 0
                    ? tx.getPrice().subtract(pos.avg())   // 平多: 卖价 - 均价
                    : pos.avg().subtract(tx.getPrice());  // 平空: 均价 - 买价
            BigDecimal feeShare = fee.multiply(BigDecimal.valueOf(closeQty))
                    .divide(BigDecimal.valueOf(Math.abs(signed)), 8, RoundingMode.HALF_UP);
            BigDecimal pnl = diff.multiply(BigDecimal.valueOf(closeQty)).subtract(feeShare);
            long holdDays = pos.opened() == null || tx.getTradeDate() == null ? 0
                    : java.time.temporal.ChronoUnit.DAYS.between(pos.opened(), tx.getTradeDate());
            closedTrades.add(new ClosedTrade(tx.getStockId(), pos.qty() > 0, closeQty,
                    pos.avg().setScale(4, RoundingMode.HALF_UP), tx.getPrice(), tx.getTradeDate(),
                    holdDays, pnl.setScale(2, RoundingMode.HALF_UP)));
            int remainder = pos.qty() + signed;
            if ((remainder > 0) == (pos.qty() > 0) && remainder != 0) {
                book.put(key, new Pos(pos.stockId(), remainder, pos.avg(), pos.opened())); // 部分平仓: 均价不变
            } else if (remainder == 0) {
                book.remove(key);
            } else {
                // 反手: 剩余量按本笔价开新仓, 剩余手续费摊进新均价
                BigDecimal restFee = fee.subtract(feeShare);
                BigDecimal avg = tx.getPrice()
                        .add(restFee.divide(BigDecimal.valueOf(Math.abs(remainder)),
                                8, RoundingMode.HALF_UP));
                book.put(key, new Pos(pos.stockId(), remainder, avg, tx.getTradeDate()));
            }
        }
        List<OpenLot> open = book.values().stream()
                .map(p -> new OpenLot(p.stockId(), p.qty(), p.avg()))
                .toList();
        return new TradeStats(closedTrades, open);
    }
}
