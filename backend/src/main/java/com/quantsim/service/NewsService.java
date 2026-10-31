package com.quantsim.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.dto.GameDtos;
import com.quantsim.dto.GameDtos.NewsItem;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.entity.NewsEvent;
import com.quantsim.entity.Stock;
import com.quantsim.repository.NewsEventRepository;

import lombok.RequiredArgsConstructor;

/**
 * 历史事件快讯: 按 (标的, 日历日) 匹配内置事件库。
 * 返回给前端的 NewsItem 不含日期——对局里日期会剧透隐藏区间;
 * 双语标题/正文都下发, 由前端按当前语言取用。
 */
@Service
@RequiredArgsConstructor
public class NewsService {

    private final NewsEventRepository newsRepository;
    private final MarketDataService marketData;

    /**
     * 匹配规则: 事件无 market/stockCode = 全市场; 有 market 需同市场; 有 stockCode 需同标的。
     * 低相关过滤 (审计创意29, 产品拍板): 事件对本标的事后 5 日 |涨跌| < 2% 的不推送——
     * 每条快讯都应值得一个调仓决策, 噪声新闻让"明日快讯"变成仪式。已知代价: "有新闻"
     * 本身携带未来波动信息 (竞技盲局不发新闻, 不受影响); 后市数据不足时无法判定, 保留。
     * 注: 查库曾挂 @Cacheable("newsByDate"), 但唯一调用方是本类自调用, Spring 代理被绕过,
     * 缓存从未生效——事件表很小, 直接查库, 删掉失效缓存。
     */
    @Transactional(readOnly = true)
    public List<NewsItem> eventsFor(Stock stock, LocalDate date) {
        return newsRepository.findByEventDate(date).stream()
                .filter(e -> matches(e, stock))
                .filter(e -> impactful(stock, date))
                .map(e -> toItem(e, null))
                .toList();
    }

    /**
     * 组合模式多腿新闻 (联动设计#4): 主标的拿全部匹配事件 (宏观+自身),
     * 其余腿只拿"点名自己"的标的级事件 (宏观事件不重复下发), 并带 stockCode 标注打在哪条腿上。
     */
    @Transactional(readOnly = true)
    public List<NewsItem> eventsForPortfolio(List<Stock> stocks, LocalDate date) {
        List<NewsItem> out = new ArrayList<>(eventsFor(stocks.get(0), date));
        for (int i = 1; i < stocks.size(); i++) {
            Stock st = stocks.get(i);
            newsRepository.findByEventDate(date).stream()
                    .filter(e -> st.getCode().equals(e.getStockCode()))
                    .filter(e -> impactful(st, date))
                    .map(e -> toItem(e, st.getCode()))
                    .forEach(out::add);
        }
        return out;
    }

    private NewsItem toItem(NewsEvent e, String stockCode) {
        return new NewsItem(e.getSeverity(), e.getTitleZh(), e.getTitleEn(), e.getBodyZh(), e.getBodyEn(),
                e.getDirection(), e.getExpectation(), e.getSourceTier(),
                stockCode != null ? stockCode : e.getStockCode());
    }

    /**
     * 结算新闻复盘 (联动设计 3/5): 窗口内 HIGH 事件 + 事后 1/3/5 日实际走势 (衰减曲线),
     * 以及 |当日涨跌|≥5% 却查无事件的"无消息异动日" (防事后编因果)。最多 10 行。
     */
    @Transactional(readOnly = true)
    public List<GameDtos.NewsRecapItem> recap(Stock stock, MarketDataService.StockData sd,
                                              int startIdx, int endIdx) {
        List<GameDtos.NewsRecapItem> out = new ArrayList<>();
        for (int i = startIdx; i <= endIdx && out.size() < 10; i++) {
            LocalDate day = sd.prices().get(i).getTradeDate();
            NewsEvent big = newsRepository.findByEventDate(day).stream()
                    .filter(e -> matches(e, stock))
                    .filter(e -> "HIGH".equals(e.getSeverity()))
                    .findFirst().orElse(null);
            if (big != null) {
                out.add(new GameDtos.NewsRecapItem(day, "NEWS", big.getTitleZh(), big.getTitleEn(),
                        fwd(sd, i, 1), fwd(sd, i, 3), fwd(sd, i, 5)));
                continue;
            }
            java.math.BigDecimal pct = i == 0 ? null
                    : TradeMath.returnRate(sd.prices().get(i).getClose(), sd.prices().get(i - 1).getClose());
            if (pct != null && pct.abs().doubleValue() >= 0.05) {
                out.add(new GameDtos.NewsRecapItem(day, "SILENT", null, null,
                        pct, fwd(sd, i, 3), fwd(sd, i, 5)));
            }
        }
        return out;
    }

    /** 事后 n 日累计涨跌; 数据不足返回 null。 */
    private static java.math.BigDecimal fwd(MarketDataService.StockData sd, int idx, int n) {
        if (idx + n >= sd.prices().size()) {
            return null;
        }
        return TradeMath.returnRate(sd.prices().get(idx + n).getClose(), sd.prices().get(idx).getClose());
    }

    /**
     * 预期差发现 (联动设计#1): 在 高预期(≥0.7) 利好 HIGH 事件当日买入、次日即下跌的交易,
     * 结算复盘指认"利好已提前被价格消化"。用到次日数据, hindsight=true。
     */
    @Transactional(readOnly = true)
    public java.util.Optional<GameDtos.CoachFinding> pricedInFinding(
            Stock stock, MarketDataService.StockData sd, List<TradeTransaction> txs) {
        for (TradeTransaction tx : txs) {
            if (tx.getDirection() != TradeTransaction.Direction.BUY) {
                continue;
            }
            Integer idx = sd.indexOf(tx.getTradeDate());
            if (idx == null || idx + 1 >= sd.prices().size()
                    || sd.prices().get(idx + 1).getClose().compareTo(sd.prices().get(idx).getClose()) >= 0) {
                continue;
            }
            NewsEvent hot = newsRepository.findByEventDate(tx.getTradeDate()).stream()
                    .filter(e -> matches(e, stock))
                    .filter(e -> e.getDirection() > 0 && "HIGH".equals(e.getSeverity()))
                    .filter(e -> e.getExpectation() != null
                            && e.getExpectation().doubleValue() >= 0.7)
                    .findFirst().orElse(null);
            if (hot != null) {
                java.math.BigDecimal nextPct = TradeMath.returnRate(
                        sd.prices().get(idx + 1).getClose(), sd.prices().get(idx).getClose());
                return java.util.Optional.of(new GameDtos.CoachFinding("NEWS", "coach.newsPricedIn",
                        List.of(hot.getTitleZh() + " / " + hot.getTitleEn(),
                                nextPct.multiply(java.math.BigDecimal.valueOf(100))
                                        .setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() + "%"),
                        "LEAN", true,
                        List.of(new GameDtos.CoachAnchor("TX", tx.getTxId(), null, null))));
            }
        }
        return java.util.Optional.empty();
    }

    /** 事件对本标的的事后影响 ≥2% 才算"有料"; 口径与实战题 (MiniGameService) 完全一致。 */
    private boolean impactful(Stock stock, LocalDate date) {
        MarketDataService.StockData sd = marketData.load(stock.getStockId());
        Integer idx = MiniGameService.ceilingIndex(sd, date);
        if (idx == null || idx + MiniGameService.QUIZ_HORIZON >= sd.prices().size()) {
            return true; // 后市不足 5 日: 无法判定, 保守保留
        }
        java.math.BigDecimal base = sd.prices().get(idx).getClose();
        if (base.signum() <= 0) {
            return true;
        }
        java.math.BigDecimal after = sd.prices().get(idx + MiniGameService.QUIZ_HORIZON).getClose();
        java.math.BigDecimal pct = after.subtract(base)
                .divide(base, 4, java.math.RoundingMode.HALF_UP);
        return pct.abs().compareTo(MiniGameService.QUIZ_FLAT_BAND) >= 0;
    }

    private boolean matches(NewsEvent e, Stock stock) {
        if (e.getStockCode() != null && !e.getStockCode().isBlank()) {
            return e.getStockCode().equals(stock.getCode());
        }
        if (e.getMarket() != null && !e.getMarket().isBlank()) {
            return e.getMarket().equals(stock.getMarket().name());
        }
        return true;
    }
}
