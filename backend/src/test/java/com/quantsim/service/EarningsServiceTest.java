package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.service.MarketDataService.StockData;

/**
 * 财报解释层 (联动设计 7-9) 纯单测: 季月第 10 交易日定日历;
 * 反标口径——卖事实 (高涨幅+发布后下跌=超预期高预期) 与 指引救场 (miss 后收复)。
 */
class EarningsServiceTest {

    private final EarningsService service = new EarningsService();

    /** 2024-03-01 起连续日历日 K 线, closes 由调用方给定。 */
    private StockData data(double[] closes) {
        Stock stock = new Stock();
        stock.setStockId(1L);
        stock.setCode("600000");
        stock.setMarket(Market.STOCK);
        List<DailyPrice> prices = new ArrayList<>();
        Map<LocalDate, Integer> index = new HashMap<>();
        LocalDate d0 = LocalDate.of(2024, 3, 1);
        for (int i = 0; i < closes.length; i++) {
            DailyPrice p = new DailyPrice();
            p.setStockId(1L);
            p.setTradeDate(d0.plusDays(i));
            BigDecimal c = BigDecimal.valueOf(closes[i]).setScale(2, java.math.RoundingMode.HALF_UP);
            p.setOpen(c);
            p.setHigh(c);
            p.setLow(c);
            p.setClose(c);
            p.setVolume(1000L);
            prices.add(p);
            index.put(p.getTradeDate(), i);
        }
        return new StockData(stock, prices, Map.copyOf(index), Map.of(), Map.of(),
                new double[0], new double[0][0]);
    }

    /** 连续日历日下, 4 月第 10 个交易日 = 4 月 10 日 = 下标 40 (3 月占 31 天)。 */
    private static final int REPORT_IDX = 40;

    @Test
    void 财报日历_只认季月第十交易日() {
        double[] closes = new double[70];
        java.util.Arrays.fill(closes, 100);
        StockData sd = data(closes);
        List<LocalDate> days = service.daysIn(sd, 0, 69);
        assertThat(days).containsExactly(LocalDate.of(2024, 4, 10));
        assertThat(service.on(sd, LocalDate.of(2024, 4, 11))).isEmpty(); // 非财报日
    }

    @Test
    void 卖事实_高涨幅加发布后下跌反标为超预期高预期() {
        double[] closes = new double[70];
        for (int i = 0; i < 70; i++) {
            if (i < REPORT_IDX - 20) closes[i] = 100;
            else if (i <= REPORT_IDX) closes[i] = 100 + (i - (REPORT_IDX - 20)) * 0.6; // 前 20 日 +12%
            else closes[i] = 112 - (i - REPORT_IDX) * 1.5; // 发布后回落
        }
        var e = service.on(data(closes), LocalDate.of(2024, 4, 10)).orElseThrow();
        assertThat(e.epsSurprise().signum()).isPositive();      // 业绩是"超预期"的
        assertThat(e.expectation().doubleValue()).isGreaterThanOrEqualTo(0.7); // 但预期更高
        assertThat(e.explainKey()).isEqualTo("priced_in");
    }

    @Test
    void 指引救场_miss后五日收复() {
        double[] closes = new double[70];
        java.util.Arrays.fill(closes, 100);
        closes[REPORT_IDX + 1] = 95;
        closes[REPORT_IDX + 2] = 94;
        closes[REPORT_IDX + 3] = 94; // post3 = -6%
        closes[REPORT_IDX + 4] = 97;
        closes[REPORT_IDX + 5] = 99; // post5 收复到 -1%
        var e = service.on(data(closes), LocalDate.of(2024, 4, 10)).orElseThrow();
        assertThat(e.epsSurprise().signum()).isNegative();
        assertThat(e.guidanceTone()).isEqualTo("UPBEAT");
        assertThat(e.explainKey()).isEqualTo("guidance_saved");
    }
}
