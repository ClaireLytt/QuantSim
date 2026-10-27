package com.quantsim.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.dto.GameDtos.NewsItem;
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
                .map(e -> new NewsItem(e.getSeverity(),
                        e.getTitleZh(), e.getTitleEn(), e.getBodyZh(), e.getBodyEn()))
                .toList();
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
