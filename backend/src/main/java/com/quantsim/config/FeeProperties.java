package com.quantsim.config;

import java.math.BigDecimal;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 交易摩擦: 各市场佣金费率 (双向)、最低佣金、印花税率 (仅卖出)。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "quantsim.fees")
public class FeeProperties {

    @Getter
    @Setter
    public static class MarketFee {
        /** 佣金费率, 买卖双向收取 */
        private BigDecimal commissionRate = BigDecimal.ZERO;
        /** 单笔最低佣金 */
        private BigDecimal minCommission = BigDecimal.ZERO;
        /** 印花税率, 仅卖出收取 */
        private BigDecimal stampTaxRate = BigDecimal.ZERO;
    }

    private MarketFee stock = new MarketFee();
    private MarketFee us = new MarketFee();
    private MarketFee crypto = new MarketFee();
}
