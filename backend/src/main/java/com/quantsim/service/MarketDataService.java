package com.quantsim.service;

import java.math.BigDecimal;
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
            Map<String, Map<LocalDate, DailyPrediction>> predictionsByModel,
            double[] rsi14,
            double[][] macdDifDea) {

        public DailyPrice bar(LocalDate date) {
            Integer i = indexByDate.get(date);
            return i == null ? null : prices.get(i);
        }

        public Integer indexOf(LocalDate date) {
            return indexByDate.get(date);
        }

        /** 某日 RSI14; 预热期内 (NaN) 返回 null。 */
        public BigDecimal rsiAt(LocalDate date) {
            Integer i = indexByDate.get(date);
            return i == null || Double.isNaN(rsi14[i]) ? null : round4(rsi14[i]);
        }

        /** 某日 MACD [DIF, DEA]; 预热期内返回 null。 */
        public BigDecimal[] macdAt(LocalDate date) {
            Integer i = indexByDate.get(date);
            if (i == null || Double.isNaN(macdDifDea[0][i]) || Double.isNaN(macdDifDea[1][i])) {
                return null;
            }
            return new BigDecimal[] { round4(macdDifDea[0][i]), round4(macdDifDea[1][i]) };
        }

        private static BigDecimal round4(double v) {
            return BigDecimal.valueOf(v).setScale(4, java.math.RoundingMode.HALF_UP);
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
        // K 线副图指标: 加载时从收盘序列一次算好 (标准参数), 随整股缓存, 不依赖数据管道加列
        double[] closes = new double[prices.size()];
        for (int i = 0; i < prices.size(); i++) {
            closes[i] = prices.get(i).getClose().doubleValue();
        }
        double[] rsi14 = IndicatorMath.rsi(closes, 14);
        double[][] macd = IndicatorMath.macd(closes, 12, 26, 9);
        return new StockData(stock, prices, Map.copyOf(index), Map.copyOf(indicators), Map.copyOf(predictions),
                rsi14, macd);
    }
}
