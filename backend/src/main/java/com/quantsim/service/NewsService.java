package com.quantsim.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.cache.annotation.Cacheable;
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

    @Cacheable(cacheNames = "newsByDate")
    @Transactional(readOnly = true)
    public List<NewsEvent> byDate(LocalDate date) {
        return newsRepository.findByEventDate(date);
    }

    /** 匹配规则: 事件无 market/stockCode = 全市场; 有 market 需同市场; 有 stockCode 需同标的。 */
    public List<NewsItem> eventsFor(Stock stock, LocalDate date) {
        return byDate(date).stream()
                .filter(e -> matches(e, stock))
                .map(e -> new NewsItem(e.getSeverity(),
                        e.getTitleZh(), e.getTitleEn(), e.getBodyZh(), e.getBodyEn()))
                .toList();
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
