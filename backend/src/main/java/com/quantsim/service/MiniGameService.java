package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.NewsEvent;
import com.quantsim.entity.Stock;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.NewsEventRepository;
import com.quantsim.repository.StockRepository;
import com.quantsim.service.MarketDataService.StockData;

import lombok.RequiredArgsConstructor;

/**
 * 小游戏接真实行情的只读聚合 (统一游戏体验 M1/M2, 设计见
 * .scratch/unified-game-experience/design.md):
 *  - M1 guessWindow: 盲抽一段真实 K 线给「猜涨跌·真实历史模式」, 不下发日期与标的,
 *    揭晓信息随包下发 —— 该玩法无竞技计分/无榜, 客户端持有揭晓不构成防剧透守则
 *    (docs/security-lessons.md 针对竞技对局) 的违背; hidden 场景股永不入池 (防比对泄题)。
 *  - M2 newsQuiz: 从 news_events 抽真实新闻, 答案 = 事件日后 5 个交易日实际涨跌
 *    (|涨跌| < 2% 判中性); 无后市数据的新闻不入池。
 * 全部走 MarketDataService 整股缓存, 无新表、无写库。
 */
@Service
@RequiredArgsConstructor
public class MiniGameService {

    /** 猜涨跌窗口: 30 根可见历史 + 10 根逐一揭晓 */
    public static final int GUESS_VISIBLE = 30;
    public static final int GUESS_REVEAL = 10;
    private static final int GUESS_TOTAL = GUESS_VISIBLE + GUESS_REVEAL;

    /** 实战题口径: 事件日收盘 → 后 5 个交易日收盘, |涨跌| < 2% 判中性 */
    private static final int QUIZ_HORIZON = 5;
    private static final BigDecimal QUIZ_FLAT_BAND = new BigDecimal("0.02");
    private static final int QUIZ_MAX_ITEMS = 5;

    private final StockRepository stockRepository;
    private final NewsEventRepository newsEventRepository;
    private final MarketDataService marketData;

    /** 一根 K 线 (无日期, 防剧透式呈现与合成模式对齐) */
    public record Bar(BigDecimal open, BigDecimal high, BigDecimal low, BigDecimal close) {}

    public record GuessReveal(String code, String name, LocalDate startDate, LocalDate endDate) {}

    public record GuessWindow(List<Bar> bars, GuessReveal reveal) {}

    @Transactional(readOnly = true)
    public GuessWindow guessWindow() {
        List<Stock> candidates = new ArrayList<>(stockRepository.findByHiddenFalse());
        Collections.shuffle(candidates, ThreadLocalRandom.current());
        for (Stock stock : candidates) {
            StockData sd = marketData.load(stock.getStockId());
            int n = sd.prices().size();
            if (n < GUESS_TOTAL) {
                continue; // 行情不足一窗的标的跳过
            }
            int start = ThreadLocalRandom.current().nextInt(n - GUESS_TOTAL + 1);
            List<DailyPrice> slice = sd.prices().subList(start, start + GUESS_TOTAL);
            List<Bar> bars = slice.stream()
                    .map(p -> new Bar(p.getOpen(), p.getHigh(), p.getLow(), p.getClose()))
                    .toList();
            return new GuessWindow(bars, new GuessReveal(stock.getCode(), stock.getName(),
                    slice.get(0).getTradeDate(), slice.get(GUESS_TOTAL - 1).getTradeDate()));
        }
        throw new BusinessException("没有数据量足够的股票, 请先运行数据管道导入行情数据");
    }

    /** 实战题: 真实新闻 + 后市走势; closes 含事件日起 6 个收盘, 供判后 mini 走势图 */
    public record QuizItem(String titleZh, String titleEn, String bodyZh, String bodyEn,
            String severity, String ans, BigDecimal pct, String code, String name,
            List<BigDecimal> closes) {}

    @Transactional(readOnly = true)
    public List<QuizItem> newsQuiz() {
        List<NewsEvent> pool = new ArrayList<>(newsEventRepository.findAll());
        Collections.shuffle(pool, ThreadLocalRandom.current());
        List<QuizItem> items = new ArrayList<>(QUIZ_MAX_ITEMS);
        for (NewsEvent ev : pool) {
            if (items.size() >= QUIZ_MAX_ITEMS) {
                break;
            }
            QuizItem item = toQuizItem(ev);
            if (item != null) {
                items.add(item);
            }
        }
        return items;
    }

    /** 单条新闻 → 题目; 标的缺失/事件日无行情/后市不足 5 日的返回 null (不入池) */
    private QuizItem toQuizItem(NewsEvent ev) {
        Stock stock = resolveStock(ev);
        if (stock == null) {
            return null;
        }
        StockData sd = marketData.load(stock.getStockId());
        Integer idx = ceilingIndex(sd, ev.getEventDate());
        if (idx == null || idx + QUIZ_HORIZON >= sd.prices().size()) {
            return null;
        }
        BigDecimal base = sd.prices().get(idx).getClose();
        if (base.signum() <= 0) {
            return null;
        }
        BigDecimal after = sd.prices().get(idx + QUIZ_HORIZON).getClose();
        BigDecimal pct = after.subtract(base).divide(base, 4, RoundingMode.HALF_UP);
        String ans = pct.compareTo(QUIZ_FLAT_BAND) >= 0 ? "bull"
                : pct.compareTo(QUIZ_FLAT_BAND.negate()) <= 0 ? "bear" : "flat";
        List<BigDecimal> closes = sd.prices().subList(idx, idx + QUIZ_HORIZON + 1).stream()
                .map(DailyPrice::getClose).toList();
        return new QuizItem(ev.getTitleZh(), ev.getTitleEn(), ev.getBodyZh(), ev.getBodyEn(),
                ev.getSeverity(), ans, pct, stock.getCode(), stock.getName(), closes);
    }

    /**
     * 新闻 → 标的, 匹配规则与对局内 NewsService 同口径:
     * 有 stockCode 配该标的; 否则按 market 在非隐藏股里随机抽一只 (宏观新闻作用于它所在市场);
     * 都没有 = 全市场新闻, 任意标的。
     */
    private Stock resolveStock(NewsEvent ev) {
        if (ev.getStockCode() != null && !ev.getStockCode().isBlank()) {
            return stockRepository.findByCode(ev.getStockCode())
                    .filter(s -> !s.isHidden()).orElse(null);
        }
        List<Stock> pool = stockRepository.findByHiddenFalse();
        if (ev.getMarket() != null && !ev.getMarket().isBlank()) {
            pool = pool.stream().filter(s -> ev.getMarket().equals(s.getMarket().name())).toList();
        }
        return pool.isEmpty() ? null : pool.get(ThreadLocalRandom.current().nextInt(pool.size()));
    }

    /** 事件日若非该标的交易日 (周末/停牌) 取下一交易日; 超出行情范围、或下一交易日
     *  离事件日超过 7 天 (事件远在行情起点之前, 被吸附到无关日期) 返回 null */
    private static Integer ceilingIndex(StockData sd, LocalDate date) {
        Integer exact = sd.indexOf(date);
        if (exact != null) {
            return exact;
        }
        List<DailyPrice> prices = sd.prices();
        for (int i = 0; i < prices.size(); i++) {
            LocalDate d = prices.get(i).getTradeDate();
            if (!d.isBefore(date)) {
                return d.isAfter(date.plusDays(7)) ? null : i;
            }
        }
        return null;
    }
}
