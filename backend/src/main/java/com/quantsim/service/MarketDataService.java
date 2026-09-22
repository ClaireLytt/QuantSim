package com.quantsim.service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.AiLevel;
import com.quantsim.entity.DailyIndicator;
import com.quantsim.entity.DailyPrediction;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.Stock;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.DailyIndicatorRepository;
import com.quantsim.repository.DailyPredictionRepository;
import com.quantsim.repository.DailyPriceRepository;
import com.quantsim.repository.StockRepository;

import lombok.RequiredArgsConstructor;

/**
 * 单只股票的全量行情/指标加载并整体缓存 (Caffeine)。
 * 行情数据只由数据管道写入、游戏内只读, 缓存以 expireAfterWrite 过期以便重灌数据后自动刷新。
 */
@Service
@RequiredArgsConstructor
public class MarketDataService {

    private final StockRepository stockRepository;
    private final DailyPriceRepository priceRepository;
    private final DailyIndicatorRepository indicatorRepository;
    private final DailyPredictionRepository predictionRepository;

    public record StockData(
            Stock stock,
            List<DailyPrice> prices,
            Map<LocalDate, Integer> indexByDate,
            Map<LocalDate, DailyIndicator> indicators,
            Map<String, Map<LocalDate, DailyPrediction>> predictionsByModel) {

        public DailyPrice bar(LocalDate date) {
            Integer i = indexByDate.get(date);
            return i == null ? null : prices.get(i);
        }

        public Integer indexOf(LocalDate date) {
            return indexByDate.get(date);
        }

        /** 指定模型无预测数据时退回默认模型 (数据管道未重训多模型前的兼容)。 */
        public DailyPrediction prediction(LocalDate date, String model) {
            Map<LocalDate, DailyPrediction> byDate = predictionsByModel.get(model);
            if (byDate == null) {
                byDate = predictionsByModel.get(AiLevel.EASY.getModel());
            }
            return byDate == null ? null : byDate.get(date);
        }
    }

    @Cacheable("stockData")
    @Transactional(readOnly = true)
    public StockData load(Long stockId) {
        Stock stock = stockRepository.findById(stockId)
                .orElseThrow(() -> new NotFoundException("股票不存在: " + stockId));
        List<DailyPrice> prices = List.copyOf(priceRepository.findByStockIdOrderByTradeDateAsc(stockId));
        Map<LocalDate, Integer> index = new HashMap<>();
        for (int i = 0; i < prices.size(); i++) {
            index.put(prices.get(i).getTradeDate(), i);
        }
        Map<LocalDate, DailyIndicator> indicators = indicatorRepository.findByStockId(stockId).stream()
                .collect(Collectors.toMap(DailyIndicator::getTradeDate, Function.identity()));
        Map<String, Map<LocalDate, DailyPrediction>> predictions = predictionRepository.findByStockId(stockId).stream()
                .collect(Collectors.groupingBy(DailyPrediction::getModel,
                        Collectors.toMap(DailyPrediction::getTradeDate, Function.identity())));
        return new StockData(stock, prices, Map.copyOf(index), Map.copyOf(indicators), Map.copyOf(predictions));
    }
}
