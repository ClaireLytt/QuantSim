package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Service;

import com.quantsim.config.GameProperties;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * AI 对手操盘的决策层: 按当日预测决定目标仓位, 按当日收盘价下单 (整手, 与玩家同规则)。
 * 账务 (现金/持仓/费用) 全部走 AiOpponent, 本类不直接碰 aiCash/aiShares;
 * 由调用方 (tick 的事务) 负责落库。
 */
@Service
@RequiredArgsConstructor
public class GameAiService {

    private final TradeEngine tradeEngine;
    private final FeeCalculator feeCalculator;
    private final GameProperties props;
    private final AiOpponent opponent;

    /**
     * AI 用当日预测决策, 按当日收盘价成交 (整手、扣费, 与玩家同规则)。
     * EASY 保留全进全出; 其余难度按置信度调仓: 目标仓位比例 = clamp((probUp-0.5)/0.15, 0, 1)。
     */
    int applyAiTrade(GameSession session, StockData sd) {
        DailyPrediction pred = sd.prediction(session.getCurrentTradeDate(), session.getAiModel());
        DailyPrice bar = sd.bar(session.getCurrentTradeDate());
        if (pred == null || bar == null) {
            return 0;
        }
        Market market = sd.stock().getMarket();
        int lotSize = market.getLotSize();
        BigDecimal close = bar.getClose();
        if (close.signum() <= 0) {
            return 0; // 坏行情防御: 零价会把下面的 divide 炸成 ArithmeticException
        }
        double probUp = pred.getProbUp().doubleValue();

        // 真实规则下 AI 与玩家同受封板限制 (T+1 对一天一次操作的 AI 天然满足)
        boolean limitUp = session.isRealRules() && tradeEngine.limitBandError(sd,
                session.getCurrentTradeDate(), TradeTransaction.Direction.BUY) != null;
        boolean limitDown = session.isRealRules() && tradeEngine.limitBandError(sd,
                session.getCurrentTradeDate(), TradeTransaction.Direction.SELL) != null;

        if (AiLevel.EASY.getModel().equals(session.getAiModel())) {
            // 简单 AI: 老式全进全出
            if (probUp >= props.getAiBuyThreshold() && !limitUp) {
                int bought = feeCalculator.maxAffordableShares(session.getAiCash(), close, lotSize, market);
                opponent.buy(session, market, close, bought);
                return bought;
            }
            if (probUp <= props.getAiSellThreshold() && session.getAiShares() > 0 && !limitDown) {
                int sold = session.getAiShares();
                opponent.sell(session, market, close, sold);
                return -sold;
            }
            return 0;
        }

        // 按置信度定目标仓位; NORMAL/HARD 在此基础上体现"性格" (EASY/HELL 行为有集成测试锁定)
        double adjProb = probUp;
        if (AiLevel.HARD.getModel().equals(session.getAiModel())) {
            // 量化狂魔: 动量派, 价格站上 MA5 加码看多, 跌破减码 (追涨杀跌的纪律版)
            DailyIndicator ind = sd.indicators().get(session.getCurrentTradeDate());
            if (ind != null && ind.getMa5() != null) {
                adjProb += close.compareTo(ind.getMa5()) > 0 ? 0.04 : -0.04;
            }
        }
        double targetFraction = Math.max(0, Math.min(1, (adjProb - 0.5) / 0.15));
        BigDecimal aiEquity = opponent.valueAt(session, close);
        BigDecimal targetValue = aiEquity.multiply(BigDecimal.valueOf(targetFraction));
        int targetShares = targetValue.divide(close, 0, RoundingMode.DOWN).intValue() / lotSize * lotSize;
        int delta = targetShares - session.getAiShares();
        // 稳健王: 价值派低换手, 调仓幅度小于净值 15% 时按兵不动 (建仓/清仓不受限)
        if (AiLevel.NORMAL.getModel().equals(session.getAiModel())
                && session.getAiShares() > 0 && targetShares > 0
                && close.multiply(BigDecimal.valueOf(Math.abs(delta)))
                        .compareTo(aiEquity.multiply(BigDecimal.valueOf(0.15))) < 0) {
            return 0;
        }
        if (delta > 0 && !limitUp) {
            int bought = Math.min(delta, feeCalculator.maxAffordableShares(session.getAiCash(), close, lotSize, market));
            opponent.buy(session, market, close, bought);
            return bought;
        }
        if (delta < 0 && !limitDown) {
            opponent.sell(session, market, close, -delta);
            return delta;
        }
        return 0;
    }
}
