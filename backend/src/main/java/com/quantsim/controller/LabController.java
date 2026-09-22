package com.quantsim.controller;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Stock;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.StockRepository;
import com.quantsim.service.MarketDataService;

import lombok.RequiredArgsConstructor;

/** 量化研究所: 单只股票的全量历史序列 (行情/指标/多模型预测), 统计分析在前端完成。 */
@RestController
@RequestMapping("/api/lab")
@RequiredArgsConstructor
public class LabController {

    private final StockRepository stockRepository;
    private final MarketDataService marketDataService;

    public record LabHistory(
            String code,
            String name,
            String market,
            List<LocalDate> dates,
            List<BigDecimal> close,
            List<BigDecimal> ma5,
            List<BigDecimal> ma20,
            List<BigDecimal> volatility,
            List<BigDecimal> pctChange,
            Map<String, List<BigDecimal>> probUp) {}

    public record OverviewRow(
            String code,
            String name,
            String market,
            Double ret30,
            Double lastChange,
            Double volatility,
            Double aiProb) {}

    @GetMapping("/overview")
    public List<OverviewRow> overview() {
        List<OverviewRow> rows = new ArrayList<>();
        for (Stock stock : stockRepository.findAll()) {
            MarketDataService.StockData data = marketDataService.load(stock.getStockId());
            List<DailyPrice> prices = data.prices();
            if (prices.isEmpty()) {
                continue;
            }
            DailyPrice last = prices.get(prices.size() - 1);
            DailyPrice base = prices.get(Math.max(0, prices.size() - 31));
            Double ret30 = base.getClose().signum() == 0 ? null
                    : last.getClose().doubleValue() / base.getClose().doubleValue() - 1;

            DailyIndicator ind = data.indicators().get(last.getTradeDate());
            Double lastChange = ind == null || ind.getPctChange() == null ? null : ind.getPctChange().doubleValue();
            Double volatility = ind == null || ind.getVolatility() == null ? null : ind.getVolatility().doubleValue();

            double probSum = 0;
            int probCount = 0;
            for (Map<LocalDate, DailyPrediction> byDate : data.predictionsByModel().values()) {
                DailyPrediction pred = byDate.get(last.getTradeDate());
                if (pred != null && pred.getProbUp() != null) {
                    probSum += pred.getProbUp().doubleValue();
                    probCount++;
                }
            }
            Double aiProb = probCount == 0 ? null : probSum / probCount;

            rows.add(new OverviewRow(stock.getCode(), stock.getName(), stock.getMarket().name(),
                    ret30, lastChange, volatility, aiProb));
        }
        return rows;
    }

    @GetMapping("/history/{code}")
    public LabHistory history(@PathVariable String code) {
        Stock stock = stockRepository.findByCode(code)
                .orElseThrow(() -> new NotFoundException("股票不存在: " + code));
        MarketDataService.StockData data = marketDataService.load(stock.getStockId());
        List<DailyPrice> prices = data.prices();

        List<LocalDate> dates = new ArrayList<>(prices.size());
        List<BigDecimal> close = new ArrayList<>(prices.size());
        List<BigDecimal> ma5 = new ArrayList<>(prices.size());
        List<BigDecimal> ma20 = new ArrayList<>(prices.size());
        List<BigDecimal> volatility = new ArrayList<>(prices.size());
        List<BigDecimal> pctChange = new ArrayList<>(prices.size());
        Map<String, List<BigDecimal>> probUp = new HashMap<>();
        data.predictionsByModel().keySet().forEach(m -> probUp.put(m, new ArrayList<>(prices.size())));

        for (DailyPrice p : prices) {
            LocalDate d = p.getTradeDate();
            dates.add(d);
            close.add(p.getClose());
            DailyIndicator ind = data.indicators().get(d);
            ma5.add(ind == null ? null : ind.getMa5());
            ma20.add(ind == null ? null : ind.getMa20());
            volatility.add(ind == null ? null : ind.getVolatility());
            pctChange.add(ind == null ? null : ind.getPctChange());
            for (Map.Entry<String, List<BigDecimal>> e : probUp.entrySet()) {
                DailyPrediction pred = data.predictionsByModel().get(e.getKey()).get(d);
                e.getValue().add(pred == null ? null : pred.getProbUp());
            }
        }
        return new LabHistory(stock.getCode(), stock.getName(), stock.getMarket().name(),
                dates, close, ma5, ma20, volatility, pctChange, probUp);
    }
}
