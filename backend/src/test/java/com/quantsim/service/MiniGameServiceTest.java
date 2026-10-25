package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.NewsEvent;
import com.quantsim.entity.Stock;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.NewsEventRepository;
import com.quantsim.repository.StockRepository;

/**
 * 小游戏真实行情接入的口径单测 (纯 Mock):
 * M1 窗口长度/揭晓区间/行情不足跳过; M2 实战题答案推导/±2% 边界/无后市过滤。
 */
class MiniGameServiceTest {

    private final StockRepository stocks = mock(StockRepository.class);
    private final NewsEventRepository news = mock(NewsEventRepository.class);
    private final MarketDataService market = mock(MarketDataService.class);
    private final MiniGameService service = new MiniGameService(stocks, news, market);

    private Stock stock(long id, String code) {
        Stock s = new Stock();
        s.setStockId(id);
        s.setCode(code);
        s.setName("测试股" + id);
        return s;
    }

    /** n 根日线, 收盘价由 closeFn 给出 (indexByDate 对齐, 其余聚合字段给空实现) */
    private MarketDataService.StockData data(long id, int n, java.util.function.IntToDoubleFunction closeFn) {
        List<DailyPrice> prices = new ArrayList<>(n);
        java.util.Map<LocalDate, Integer> idx = new java.util.HashMap<>();
        for (int i = 0; i < n; i++) {
            DailyPrice p = new DailyPrice();
            LocalDate d = LocalDate.of(2020, 1, 1).plusDays(i);
            p.setTradeDate(d);
            BigDecimal c = BigDecimal.valueOf(closeFn.applyAsDouble(i)).setScale(2, java.math.RoundingMode.HALF_UP);
            p.setOpen(c);
            p.setHigh(c);
            p.setLow(c);
            p.setClose(c);
            prices.add(p);
            idx.put(d, i);
        }
        return new MarketDataService.StockData(stock(id, "X" + id), prices, idx,
                java.util.Map.of(), java.util.Map.of(), new double[n], new double[2][n]);
    }

    // ---------- M1 guessWindow ----------

    @Test
    void 窗口恒为40根且揭晓区间与切片首尾一致() {
        when(stocks.findByHiddenFalse()).thenReturn(List.of(stock(1, "600000")));
        when(market.load(1L)).thenReturn(data(1, 100, i -> 100 + i));

        var w = service.guessWindow();
        assertThat(w.bars()).hasSize(40);
        assertThat(w.reveal().code()).isEqualTo("600000");
        // 揭晓首尾日期相距恰 39 个自然日 (测试数据逐日连续)
        assertThat(w.reveal().endDate()).isEqualTo(w.reveal().startDate().plusDays(39));
    }

    @Test
    void 行情不足40根的标的被跳过_全部不足则报错() {
        when(stocks.findByHiddenFalse()).thenReturn(List.of(stock(1, "A"), stock(2, "B")));
        when(market.load(1L)).thenReturn(data(1, 39, i -> 100));
        when(market.load(2L)).thenReturn(data(2, 40, i -> 100));

        assertThat(service.guessWindow().reveal().code()).isEqualTo("B"); // 39 根的 A 被跳过

        when(market.load(2L)).thenReturn(data(2, 10, i -> 100));
        assertThatThrownBy(service::guessWindow).isInstanceOf(BusinessException.class);
    }

    // ---------- M2 newsQuiz ----------

    private NewsEvent event(String code, LocalDate date) {
        NewsEvent ev = new NewsEvent();
        ev.setStockCode(code);
        ev.setEventDate(date);
        ev.setTitleZh("t");
        ev.setTitleEn("t");
        ev.setBodyZh("b");
        ev.setBodyEn("b");
        ev.setSeverity("HIGH");
        return ev;
    }

    @Test
    void 实战题答案由后5日涨跌推导_含边界() {
        // 事件日 idx=2 收盘 100; idx=7 收盘分别造 103 / 97 / 101 → bull / bear / flat
        LocalDate evDate = LocalDate.of(2020, 1, 3);
        when(news.findAll()).thenReturn(List.of(event("A", evDate)));
        when(stocks.findByCode("A")).thenReturn(Optional.of(stock(1, "A")));

        when(market.load(1L)).thenReturn(data(1, 20, i -> i == 7 ? 103 : 100));
        var bull = service.newsQuiz();
        assertThat(bull).hasSize(1);
        assertThat(bull.get(0).ans()).isEqualTo("bull");
        assertThat(bull.get(0).pct()).isEqualByComparingTo("0.0300");
        assertThat(bull.get(0).closes()).hasSize(6); // 事件日起 6 个收盘供 mini 图

        when(market.load(1L)).thenReturn(data(1, 20, i -> i == 7 ? 97 : 100));
        assertThat(service.newsQuiz().get(0).ans()).isEqualTo("bear");

        when(market.load(1L)).thenReturn(data(1, 20, i -> i == 7 ? 101 : 100));
        assertThat(service.newsQuiz().get(0).ans()).isEqualTo("flat"); // |1%| < 2% 判中性

        when(market.load(1L)).thenReturn(data(1, 20, i -> i == 7 ? 102 : 100));
        assertThat(service.newsQuiz().get(0).ans()).isEqualTo("bull"); // 恰 +2% 落 bull 侧
    }

    @Test
    void 市场级新闻按市场随机配标的_事件日非交易日取下一交易日() {
        // stock_code 为空的宏观新闻 (现库 24 条全是这种): 按 market 配股
        NewsEvent macro = event(null, LocalDate.of(2020, 1, 3).plusDays(1)); // 1-4 非行情日
        macro.setMarket("STOCK");
        when(news.findAll()).thenReturn(List.of(macro));
        Stock s = stock(1, "600000");
        when(stocks.findByHiddenFalse()).thenReturn(List.of(s));
        // 去掉 2020-01-04 造停牌日: ceiling 落 1-5 (gapped idx=3), +5 = gapped idx=8 (原 i=9)
        List<DailyPrice> prices = data(1, 20, i -> i == 9 ? 103 : 100).prices();
        List<DailyPrice> gapped = new ArrayList<>(prices);
        gapped.remove(3);
        java.util.Map<LocalDate, Integer> idx = new java.util.HashMap<>();
        for (int i = 0; i < gapped.size(); i++) {
            idx.put(gapped.get(i).getTradeDate(), i);
        }
        when(market.load(1L)).thenReturn(new MarketDataService.StockData(s, gapped, idx,
                java.util.Map.of(), java.util.Map.of(), new double[0], new double[0][0]));

        var items = service.newsQuiz();
        assertThat(items).hasSize(1);
        // ceiling 落在 2020-01-05 (gapped idx=3, close 100), +5 = 原 i=8 的 103 → bull
        assertThat(items.get(0).ans()).isEqualTo("bull");
        assertThat(items.get(0).code()).isEqualTo("600000");
    }

    @Test
    void 无后市或标的缺失的新闻不入池() {
        LocalDate evDate = LocalDate.of(2020, 1, 1).plusDays(17); // idx=17, +5 越界 (n=20)
        when(news.findAll()).thenReturn(List.of(
                event("A", evDate),
                event("GONE", LocalDate.of(2020, 1, 3)),
                event("A", LocalDate.of(1999, 1, 1)))); // 远在行情起点前: 禁止被 ceiling 吸附到起点
        when(stocks.findByCode("A")).thenReturn(Optional.of(stock(1, "A")));
        when(stocks.findByCode("GONE")).thenReturn(Optional.empty());
        when(market.load(anyLong())).thenReturn(data(1, 20, i -> 100));

        assertThat(service.newsQuiz()).isEmpty();
    }
}
