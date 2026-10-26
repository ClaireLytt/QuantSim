package com.quantsim.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;

/** 复盘教练纯函数口径测试: C9 瀑布恒等式与 FIFO 归集 / C1 象限分类的时点纪律。 */
class CoachServiceTest {

    private TradeTransaction tx(long id, String date, TradeTransaction.Direction dir,
                                double price, int shares, double fee) {
        TradeTransaction t = new TradeTransaction();
        t.setTxId(id);
        t.setTradeDate(LocalDate.parse(date));
        t.setDirection(dir);
        t.setPrice(BigDecimal.valueOf(price));
        t.setShares(shares);
        t.setFee(BigDecimal.valueOf(fee));
        return t;
    }

    /** 造一段可控行情: 收盘价数组 + MA5/MA20 由简单均值生成。 */
    private MarketDataService.StockData sd(double... closes) {
        Stock stock = new Stock();
        java.util.List<DailyPrice> prices = new java.util.ArrayList<>();
        java.util.Map<LocalDate, Integer> idxByDate = new java.util.HashMap<>();
        java.util.Map<LocalDate, DailyIndicator> inds = new java.util.HashMap<>();
        LocalDate d0 = LocalDate.of(2026, 1, 1);
        for (int i = 0; i < closes.length; i++) {
            DailyPrice p = new DailyPrice();
            p.setTradeDate(d0.plusDays(i));
            p.setClose(BigDecimal.valueOf(closes[i]));
            prices.add(p);
            idxByDate.put(p.getTradeDate(), i);
            DailyIndicator ind = new DailyIndicator();
            ind.setMa5(avg(closes, i, 5));
            ind.setMa20(avg(closes, i, 20));
            inds.put(p.getTradeDate(), ind);
        }
        return new MarketDataService.StockData(stock, prices, idxByDate, inds,
                java.util.Map.of(), new double[closes.length], new double[closes.length][]);
    }

    private BigDecimal avg(double[] closes, int endIdx, int n) {
        int from = Math.max(0, endIdx - n + 1);
        double s = 0;
        for (int i = from; i <= endIdx; i++) s += closes[i];
        return BigDecimal.valueOf(s / (endIdx - from + 1));
    }

    @Test
    void waterfallIdentityAndFifoAttribution() {
        double[] closes = new double[25];
        java.util.Arrays.fill(closes, 10);
        closes[24] = 12; // 结算日收盘 12
        MarketDataService.StockData data = sd(closes);
        LocalDate d0 = LocalDate.of(2026, 1, 1);
        // 买 100@10, 卖 60@11 (已实现 +60), 余 40 按 12 估值 (浮盈 +80), 费用 5
        List<TradeTransaction> txs = List.of(
                tx(1, d0.plusDays(20).toString(), TradeTransaction.Direction.BUY, 10, 100, 3),
                tx(2, d0.plusDays(22).toString(), TradeTransaction.Direction.SELL, 11, 60, 2));
        BigDecimal initial = new BigDecimal("1000");
        BigDecimal fin = new BigDecimal("1135"); // 60 + 80 - 5 = 135
        CoachService.Waterfall wf = CoachService.waterfall(txs, data, d0.plusDays(24),
                initial, fin, BigDecimal.ZERO);
        assertNotNull(wf);
        assertEquals(0, wf.realized().compareTo(new BigDecimal("60")));
        assertEquals(0, wf.unrealized().compareTo(new BigDecimal("80")));
        assertEquals(0, wf.fees().compareTo(new BigDecimal("5")));
        // FIFO 归集: 全部盈亏归到买入笔 1 (60 + 80)
        assertEquals(0, wf.buyPnl().get(1L).compareTo(new BigDecimal("140")));
        // 恒等式差 1 元以上 → 不出卡
        assertNull(CoachService.waterfall(txs, data, d0.plusDays(24),
                initial, new BigDecimal("1200"), BigDecimal.ZERO));
    }

    @Test
    void quadrantClassification() {
        // 一路上涨后在高位买 = CHASE; 深跌破 MA20 买 = KNIFE
        double[] up = new double[30];
        for (int i = 0; i < 30; i++) up[i] = 10 + i * 0.2;
        assertEquals(CoachService.Quadrant.CHASE,
                CoachService.classify(sd(up), LocalDate.of(2026, 1, 1).plusDays(29)));

        double[] crash = new double[30];
        for (int i = 0; i < 25; i++) crash[i] = 20;
        for (int i = 25; i < 30; i++) crash[i] = 20 - (i - 24) * 1.2; // 跌到 14 (-30% 距近高)
        assertEquals(CoachService.Quadrant.KNIFE,
                CoachService.classify(sd(crash), LocalDate.of(2026, 1, 1).plusDays(29)));

        // 指标缺失 (日期不存在) → null, 不乱归类
        assertNull(CoachService.classify(sd(up), LocalDate.of(2030, 1, 1)));
    }
}
