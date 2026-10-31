package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.GameDtos.PredictionDay;
import com.quantsim.dto.GameDtos.RiskMetrics;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 结算复盘的纯计算域: 玩家资金曲线重放、买入持有/MA 交叉/定投三条基准、
 * 风险指标、AI 预测逐日复盘与玩家风格画像。
 * 从 GameService 拆出 —— 只读数据不写库, 口径必须与对局交易严格一致
 * (费用走 FeeCalculator, 计息与重放走 LedgerReplay)。
 */
@Service
@RequiredArgsConstructor
public class GameBenchmarks {

    /** probUp 达到该值即视为"预测上涨"。 */
    private static final double PROB_UP_THRESHOLD = 0.5;

    // 风格画像标签及判定阈值
    private static final String STYLE_WATCHER = "WATCHER";
    private static final String STYLE_CHASER = "CHASER";
    private static final String STYLE_ACTIVE = "ACTIVE";
    private static final String STYLE_HOLDER = "HOLDER";
    private static final String STYLE_SWING = "SWING";
    private static final int CHASER_MIN_TRADES = 3;
    private static final double CHASER_RATIO = 0.7;
    private static final int ACTIVE_MIN_TRADES = 8;
    private static final int HOLDER_MAX_TRADES = 2;

    private final TransactionRepository transactionRepository;
    private final SessionMarketData sessionData;
    private final TradeEngine tradeEngine;
    private final FeeCalculator feeCalculator;
    private final GameProperties props;
    private final LedgerReplay ledger;

    /** 逐日复盘 AI 预测: 每天的"次日涨跌"预测 vs 实际走势 (最后一天没有次日, 不计入)。 */
    List<PredictionDay> predictionDays(GameSession session, StockData sd, int startIdx, int endIdx) {
        List<PredictionDay> days = new ArrayList<>();
        for (int i = startIdx; i < endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyPrediction pred = sd.prediction(p.getTradeDate(), session.getAiModel());
            if (pred == null) {
                continue;
            }
            boolean predictedUp = pred.getProbUp().doubleValue() >= PROB_UP_THRESHOLD;
            boolean actualUp = sd.prices().get(i + 1).getClose().compareTo(p.getClose()) > 0;
            days.add(new PredictionDay(BlindDates.mask(session, p.getTradeDate()),
                    predictedUp, predictedUp == actualUp));
        }
        return days;
    }

    /** 规则式风格画像: 观望者/追涨杀跌/高频交易/佛系持有/波段操作。 */
    String styleTag(GameSession session, StockData sd) {
        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        if (txs.isEmpty()) {
            return STYLE_WATCHER;
        }
        int withSign = 0;
        int chase = 0;
        for (TradeTransaction tx : txs) {
            DailyIndicator ind = sd.indicators().get(tx.getTradeDate());
            if (ind == null || ind.getPctChange() == null || ind.getPctChange().signum() == 0) {
                continue;
            }
            withSign++;
            boolean buy = tx.getDirection() == TradeTransaction.Direction.BUY;
            boolean up = ind.getPctChange().signum() > 0;
            if (buy == up) {
                chase++;
            }
        }
        if (txs.size() >= CHASER_MIN_TRADES && withSign > 0 && chase >= withSign * CHASER_RATIO) {
            return STYLE_CHASER;
        }
        if (txs.size() >= ACTIVE_MIN_TRADES) {
            return STYLE_ACTIVE;
        }
        if (txs.size() <= HOLDER_MAX_TRADES) {
            return STYLE_HOLDER;
        }
        return STYLE_SWING;
    }

    /**
     * 玩家资金曲线 (首点为初始资金): 重放循环在 LedgerReplay (与 tick 计息/undo 重建同一内核),
     * 这里只做逐日估值。组合模式的旧流水缺 stock_id 无法归属标的, 此时放弃 (返回 null, 前端不展示)。
     */
    List<BigDecimal> equityCurve(GameSession session, StockData sd, int startIdx, int endIdx) {
        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(session.getSessionId());
        boolean portfolio = "PORTFOLIO".equals(session.getMode());
        if (portfolio && txs.stream().anyMatch(tx -> tx.getStockId() == null)) {
            return null;
        }
        List<LocalDate> days = sd.prices().subList(startIdx, endIdx + 1).stream()
                .map(DailyPrice::getTradeDate).toList();
        Map<Long, StockData> datas = new HashMap<>();
        List<BigDecimal> curve = new ArrayList<>(days.size() + 1);
        curve.add(session.getInitialCash());
        for (LedgerReplay.Snapshot snap
                : ledger.replay(session.getInitialCash(), days, txs, session.getStockId())) {
            // 副标的当日可能停牌, 与 TradeEngine 同口径: 回退最近收盘估值
            BigDecimal eq = snap.cash();
            for (Map.Entry<Long, PositionMath.Fill> e : snap.fills().entrySet()) {
                int shares = e.getValue().shares();
                if (shares == 0) {
                    continue;
                }
                StockData sdd = datas.computeIfAbsent(e.getKey(), sid -> sessionData.of(session, sid));
                eq = eq.add(tradeEngine.lastCloseOnOrBefore(sdd, snap.day())
                        .multiply(BigDecimal.valueOf(shares)));
            }
            curve.add(eq);
        }
        return curve;
    }

    /** 买入持有基准的资金曲线, 建仓规则与 buyAndHoldReturn 完全一致 (整手、扣费)。 */
    List<BigDecimal> holdEquityCurve(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        Market market = sd.stock().getMarket();
        BigDecimal startClose = sd.prices().get(startIdx).getClose();
        int shares = feeCalculator.maxAffordableShares(initial, startClose, market.getLotSize(), market);
        BigDecimal gross = startClose.multiply(BigDecimal.valueOf(shares));
        BigDecimal cash = initial.subtract(gross)
                .subtract(feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross));
        List<BigDecimal> curve = new ArrayList<>(endIdx - startIdx + 2);
        curve.add(initial);
        for (int i = startIdx; i <= endIdx; i++) {
            curve.add(cash.add(sd.prices().get(i).getClose().multiply(BigDecimal.valueOf(shares))));
        }
        return curve;
    }

    RiskMetrics riskMetrics(List<BigDecimal> curve) {
        double[] returns = RiskMath.dailyReturns(curve);
        return new RiskMetrics(RiskMath.maxDrawdown(curve), RiskMath.volatility(returns),
                RiskMath.sharpe(returns), RiskMath.sortino(returns),
                RiskMath.winRate(returns), RiskMath.profitLossRatio(returns));
    }

    /**
     * 定投基准: 初始资金均分 N 期, 每隔 dcaIntervalDays 个交易日按收盘价投一期
     * (整手、扣费), 持有到结算。与"择时"的玩家收益对比是最直观的纪律教学。
     */
    BigDecimal dcaReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        int interval = Math.max(1, props.getDcaIntervalDays());
        int buys = (endIdx - startIdx) / interval + 1;
        BigDecimal tranche = initial.divide(BigDecimal.valueOf(buys), 2, RoundingMode.DOWN);
        BigDecimal cash = initial;
        int shares = 0;
        for (int k = 0; k < buys; k++) {
            BigDecimal close = sd.prices().get(startIdx + k * interval).getClose();
            int bought = feeCalculator.maxAffordableShares(tranche.min(cash), close, lotSize, market);
            if (bought <= 0) {
                continue;
            }
            BigDecimal gross = close.multiply(BigDecimal.valueOf(bought));
            cash = cash.subtract(gross)
                    .subtract(feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross));
            shares += bought;
        }
        BigDecimal finalAssets = cash
                .add(sd.prices().get(endIdx).getClose().multiply(BigDecimal.valueOf(shares)));
        return TradeMath.returnRate(finalAssets, initial);
    }

    /** 基准一: 开局收盘价全仓买入并持有到结算 ≡ holdEquityCurve 的末点收益, 不再重写一遍建仓。 */
    BigDecimal buyAndHoldReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        List<BigDecimal> curve = holdEquityCurve(sd, startIdx, endIdx, initial);
        return TradeMath.returnRate(curve.get(curve.size() - 1), initial);
    }

    /** 基准二: MA5 上穿 MA20 全仓买入, 下穿清仓, 按当日收盘价成交 (含费用)。 */
    BigDecimal maCrossReturn(StockData sd, int startIdx, int endIdx, BigDecimal initial) {
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        BigDecimal cash = initial;
        int shares = 0;
        for (int i = startIdx; i <= endIdx; i++) {
            DailyPrice p = sd.prices().get(i);
            DailyIndicator ind = sd.indicators().get(p.getTradeDate());
            if (ind == null || ind.getMa5() == null || ind.getMa20() == null) {
                continue;
            }
            BigDecimal close = p.getClose();
            int cmp = ind.getMa5().compareTo(ind.getMa20());
            if (cmp > 0 && shares == 0) {
                int bought = feeCalculator.maxAffordableShares(cash, close, lotSize, market);
                if (bought > 0) {
                    shares = bought;
                    BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
                    cash = cash.subtract(gross)
                            .subtract(feeCalculator.fee(market, TradeTransaction.Direction.BUY, gross));
                }
            } else if (cmp < 0 && shares > 0) {
                BigDecimal gross = close.multiply(BigDecimal.valueOf(shares));
                cash = cash.add(gross)
                        .subtract(feeCalculator.fee(market, TradeTransaction.Direction.SELL, gross));
                shares = 0;
            }
        }
        BigDecimal endClose = sd.prices().get(endIdx).getClose();
        BigDecimal finalAssets = cash.add(endClose.multiply(BigDecimal.valueOf(shares)));
        return TradeMath.returnRate(finalAssets, initial);
    }
}
