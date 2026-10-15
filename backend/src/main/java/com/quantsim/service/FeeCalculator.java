package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Service;

import com.quantsim.config.FeeProperties;
import com.quantsim.entity.Market;
import com.quantsim.entity.TradeTransaction;

import lombok.RequiredArgsConstructor;

/**
 * 交易费用: 佣金 (双向, 有最低值) + 印花税 (仅卖出)。
 * 玩家、AI、基准与回测统一走这里, 保证结算对比同口径。
 */
@Service
@RequiredArgsConstructor
public class FeeCalculator {

    private final FeeProperties props;

    /** gross = 价格 × 数量 (绝对值)。返回总费用, 两位小数 HALF_UP。 */
    public BigDecimal fee(Market market, TradeTransaction.Direction direction, BigDecimal gross) {
        FeeProperties.MarketFee f = of(market);
        BigDecimal commission = gross.multiply(f.getCommissionRate());
        if (commission.compareTo(f.getMinCommission()) < 0 && f.getCommissionRate().signum() > 0) {
            commission = f.getMinCommission();
        }
        BigDecimal total = commission;
        if (direction == TradeTransaction.Direction.SELL) {
            total = total.add(gross.multiply(f.getStampTaxRate()));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 现金能买到的最大整手数, 含买入费用 (对齐真实约束)。
     * 对局 AI/基准与回测各策略共用, 保证"全仓买入"口径一致。
     */
    public int maxAffordableShares(BigDecimal cash, BigDecimal price, int lotSize, Market market) {
        int shares = TradeMath.maxWholeShares(cash, price, lotSize);
        while (shares > 0) {
            BigDecimal gross = price.multiply(BigDecimal.valueOf(shares));
            BigDecimal buyFee = fee(market, TradeTransaction.Direction.BUY, gross);
            if (gross.add(buyFee).compareTo(cash) <= 0) {
                break;
            }
            shares -= lotSize;
        }
        return Math.max(0, shares);
    }

    private FeeProperties.MarketFee of(Market market) {
        return switch (market) {
            case STOCK -> props.getStock();
            case US -> props.getUs();
            case CRYPTO -> props.getCrypto();
        };
    }
}
