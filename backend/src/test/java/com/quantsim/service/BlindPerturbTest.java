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
 * 盲局行情扰动 (审计创意24) 的纯单测: 确定性 / OHLC 不变式 /
 * 收益率序列被破坏 (指纹不可比对) / 指标按扰动收盘重算。
 */
class BlindPerturbTest {

    /** 60 根正弦波 K 线 (open=close, high=close+1, low=close-1)。 */
    private StockData sine() {
        Stock stock = new Stock();
        stock.setStockId(7L);
        stock.setCode("600000");
        stock.setMarket(Market.STOCK);
        List<DailyPrice> prices = new ArrayList<>();
        Map<LocalDate, Integer> index = new HashMap<>();
        LocalDate d0 = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < 60; i++) {
            BigDecimal close = BigDecimal.valueOf(50 + 10 * Math.sin(i / 5.0)).setScale(2,
                    java.math.RoundingMode.HALF_UP);
            DailyPrice p = new DailyPrice();
            p.setStockId(7L);
            p.setTradeDate(d0.plusDays(i));
            p.setOpen(close);
            p.setClose(close);
            p.setHigh(close.add(BigDecimal.ONE));
            p.setLow(close.subtract(BigDecimal.ONE));
            p.setVolume(10000L);
            prices.add(p);
            index.put(p.getTradeDate(), i);
        }
        double[] closes = prices.stream().mapToDouble(p -> p.getClose().doubleValue()).toArray();
        return new StockData(stock, prices, Map.copyOf(index), Map.of(), Map.of(),
                IndicatorMath.rsi(closes, 14), IndicatorMath.macd(closes, 12, 26, 9));
    }

    @Test
    void 同种子确定_异种子不同() {
        StockData sd = sine();
        StockData a = BlindPerturb.perturb(sd, 42L);
        StockData b = BlindPerturb.perturb(sd, 42L);
        StockData c = BlindPerturb.perturb(sd, 43L);
        for (int i = 0; i < 60; i++) {
            assertThat(a.prices().get(i).getClose()).isEqualByComparingTo(b.prices().get(i).getClose());
        }
        boolean anyDiff = false;
        for (int i = 0; i < 60; i++) {
            anyDiff |= a.prices().get(i).getClose().compareTo(c.prices().get(i).getClose()) != 0;
        }
        assertThat(anyDiff).isTrue();
    }

    @Test
    void OHLC不变式与正价保持() {
        StockData out = BlindPerturb.perturb(sine(), 7L);
        for (DailyPrice p : out.prices()) {
            assertThat(p.getHigh()).isGreaterThanOrEqualTo(p.getOpen().max(p.getClose()));
            assertThat(p.getLow()).isLessThanOrEqualTo(p.getOpen().min(p.getClose()));
            assertThat(p.getLow()).isGreaterThanOrEqualTo(new BigDecimal("0.01"));
            assertThat(p.getVolume()).isPositive();
        }
    }

    @Test
    void 收益率序列被扰动_指纹不可比对() {
        StockData sd = sine();
        StockData out = BlindPerturb.perturb(sd, 99L);
        // 逐日收益率与原序列不再一致: 任何滑窗 pct-change 匹配都会失配
        int differing = 0;
        for (int i = 1; i < 60; i++) {
            double orig = sd.prices().get(i).getClose().doubleValue()
                    / sd.prices().get(i - 1).getClose().doubleValue() - 1;
            double pert = out.prices().get(i).getClose().doubleValue()
                    / out.prices().get(i - 1).getClose().doubleValue() - 1;
            if (Math.abs(orig - pert) > 1e-4) {
                differing++;
            }
        }
        assertThat(differing).isGreaterThan(30); // 逐日 ±0.4% 噪声: 绝大多数日的收益率都变了
        // 但量级不失真: 扰动收盘 / (原收盘×全局系数) 的漂移限于累计噪声范围
        double ratio0 = out.prices().get(0).getClose().doubleValue()
                / sd.prices().get(0).getClose().doubleValue();
        double ratioN = out.prices().get(59).getClose().doubleValue()
                / sd.prices().get(59).getClose().doubleValue();
        assertThat(Math.abs(Math.log(ratioN / ratio0))).isLessThan(60 * BlindPerturb.DRIFT * 1.1);
    }

    @Test
    void 指标按扰动收盘重算() {
        StockData out = BlindPerturb.perturb(sine(), 5L);
        LocalDate d = LocalDate.of(2024, 1, 1).plusDays(30);
        var ind = out.indicators().get(d);
        double expect = 0;
        for (int i = 26; i <= 30; i++) {
            expect += out.prices().get(i).getClose().doubleValue();
        }
        assertThat(ind.getMa5().doubleValue()).isCloseTo(expect / 5,
                org.assertj.core.data.Offset.offset(1e-3));
        assertThat(ind.getPctChange().doubleValue()).isCloseTo(
                out.prices().get(30).getClose().doubleValue()
                        / out.prices().get(29).getClose().doubleValue() - 1,
                org.assertj.core.data.Offset.offset(1e-3));
    }
}
