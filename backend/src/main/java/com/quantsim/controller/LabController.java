package com.quantsim.controller;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
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
    private final com.quantsim.repository.WeeklyVoteRepository weeklyVoteRepository;

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

    /**
     * 今日市场速览 (首页天气播报): 数据库里最新一个交易日的全市场聚合——
     * 涨跌家数 / 平均涨跌幅 / 量比 (今日总量 vs 前一日), regime 由纯函数分类,
     * 前端按 regime 映射播报文案与推荐玩法。只读聚合, 无个体信息, 游客可访。
     */
    public record MarketPulse(
            String market, LocalDate tradeDate, int upCount, int downCount,
            double avgChgPct, double volRatio, String regime) {}

    /** regime 分类纯函数 (供测试对拍): WILD 波动优先, 其次按涨家占比分涨跌, 默认分化。 */
    public static String classifyRegime(int up, int down, double avgAbsChgPct, double volRatio) {
        int total = up + down;
        if (total < 8) {
            return "THIN"; // 样本太少不播报, 前端走兜底文案
        }
        if (avgAbsChgPct >= 2.5) {
            return "WILD";
        }
        double upRatio = (double) up / total;
        if (upRatio >= 0.6) {
            return volRatio >= 1.15 ? "SURGE_HOT" : "SURGE";
        }
        if (upRatio <= 0.4) {
            return "SLUMP";
        }
        return "MIXED";
    }

    // 播报 10 分钟缓存: 行情按天更新, 每次请求全量扫缓存里的价格序列纯属浪费
    private volatile MarketPulse pulseCache;
    private volatile long pulseCachedAt;

    @GetMapping("/market-pulse")
    public MarketPulse marketPulse() {
        MarketPulse cached = pulseCache;
        if (cached != null && System.currentTimeMillis() - pulseCachedAt < 10 * 60_000) {
            return cached;
        }
        // 以 A股为口径 (首页播报"今日 A 股"); 逐股取各自最新两根, 只聚合落在全局最新日的
        List<Stock> stocks = stockRepository.findByHiddenFalse().stream()
                .filter(s -> "STOCK".equals(s.getMarket().name()))
                .toList();
        LocalDate latest = null;
        for (Stock s : stocks) {
            List<DailyPrice> p = marketDataService.load(s.getStockId()).prices();
            if (!p.isEmpty()) {
                LocalDate d = p.get(p.size() - 1).getTradeDate();
                if (latest == null || d.isAfter(latest)) {
                    latest = d;
                }
            }
        }
        int up = 0;
        int down = 0;
        double chgSum = 0;
        double absSum = 0;
        double volToday = 0;
        double volPrev = 0;
        if (latest != null) {
            for (Stock s : stocks) {
                List<DailyPrice> p = marketDataService.load(s.getStockId()).prices();
                if (p.size() < 2 || !p.get(p.size() - 1).getTradeDate().equals(latest)) {
                    continue; // 停牌/数据滞后的标的不进当日统计
                }
                double prev = p.get(p.size() - 2).getClose().doubleValue();
                if (prev <= 0) {
                    continue;
                }
                double chg = (p.get(p.size() - 1).getClose().doubleValue() / prev - 1) * 100;
                if (chg > 0) {
                    up++;
                } else if (chg < 0) {
                    down++;
                }
                chgSum += chg;
                absSum += Math.abs(chg);
                volToday += p.get(p.size() - 1).getVolume() == null ? 0 : p.get(p.size() - 1).getVolume().doubleValue();
                volPrev += p.get(p.size() - 2).getVolume() == null ? 0 : p.get(p.size() - 2).getVolume().doubleValue();
            }
        }
        int total = up + down;
        double avgChg = total == 0 ? 0 : chgSum / total;
        double avgAbs = total == 0 ? 0 : absSum / total;
        double volRatio = volPrev <= 0 ? 1 : volToday / volPrev;
        MarketPulse pulse = new MarketPulse("STOCK", latest, up, down,
                Math.round(avgChg * 100) / 100.0, Math.round(volRatio * 100) / 100.0,
                classifyRegime(up, down, avgAbs, volRatio));
        pulseCache = pulse;
        pulseCachedAt = System.currentTimeMillis();
        return pulse;
    }

    /** E11 真退市表: 退市标的清单 (历史行情经 /history/{code} 正常取, 对局与榜单不可见)。 */
    public record DelistedStock(String code, String name, java.time.LocalDate delistDate) {}

    @GetMapping("/delisted")
    public List<DelistedStock> delisted() {
        return stockRepository.findAll().stream()
                .filter(Stock::isDelisted)
                .map(s -> new DelistedStock(s.getCode(), s.getName(), s.getDelistDate()))
                .sorted(java.util.Comparator.comparing(DelistedStock::code))
                .toList();
    }

    /** E20 周报投票: 每人每周一票可改票; 周序号服务端按日期算, 防客户端伪造跨周刷票。 */
    public record WeeklyVoteBoard(int week, long hold, long brk, String mine) {}

    public record VoteRequest(String choice) {}

    /** 与前端 qsWeekIndex 同口径: 1970-01-05 (周一) 起算的周序号。 */
    static int weekIdx(java.time.LocalDate d) {
        return (int) Math.floorDiv(d.toEpochDay() - 4, 7);
    }

    @GetMapping("/weekly-vote")
    public WeeklyVoteBoard weeklyVote(jakarta.servlet.http.HttpServletRequest request) {
        int week = weekIdx(java.time.LocalDate.now(com.quantsim.service.GameService.GAME_ZONE));
        Long userId = com.quantsim.config.CurrentUser.idOrNull(request);
        String mine = userId == null ? null : weeklyVoteRepository
                .findByWeekIdxAndUserId(week, userId).map(com.quantsim.entity.WeeklyVote::getChoice).orElse(null);
        return new WeeklyVoteBoard(week,
                weeklyVoteRepository.countByWeekIdxAndChoice(week, "HOLD"),
                weeklyVoteRepository.countByWeekIdxAndChoice(week, "BREAK"), mine);
    }

    @org.springframework.web.bind.annotation.PostMapping("/weekly-vote")
    @org.springframework.transaction.annotation.Transactional
    public WeeklyVoteBoard vote(@RequestBody VoteRequest req,
                                jakarta.servlet.http.HttpServletRequest request) {
        Long userId = com.quantsim.config.CurrentUser.idOrNull(request);
        if (userId == null) {
            throw new com.quantsim.exception.BusinessException("投票需要登录（一周一票要记在名下）");
        }
        String choice = req.choice() == null ? "" : req.choice().trim().toUpperCase();
        if (!choice.equals("HOLD") && !choice.equals("BREAK")) {
            throw new com.quantsim.exception.BusinessException("无效选项（可选 HOLD / BREAK）");
        }
        int week = weekIdx(java.time.LocalDate.now(com.quantsim.service.GameService.GAME_ZONE));
        com.quantsim.entity.WeeklyVote vote = weeklyVoteRepository
                .findByWeekIdxAndUserId(week, userId).orElseGet(() -> {
                    com.quantsim.entity.WeeklyVote v = new com.quantsim.entity.WeeklyVote();
                    v.setWeekIdx(week);
                    v.setUserId(userId);
                    return v;
                });
        vote.setChoice(choice); // 改票 = 覆盖 (每周一票的唯一键兜底并发)
        weeklyVoteRepository.save(vote);
        return weeklyVote(request);
    }

    /** probUp 分桶 vs 实际次日上涨频率: 校准好的模型两者应接近 (全部标的聚合)。 */
    public record CalibrationBucket(double probFrom, double probTo, int samples, double actualUpRate) {}

    public record CalibrationRow(String model, List<CalibrationBucket> buckets) {}

    @GetMapping("/calibration")
    public List<CalibrationRow> calibration() {
        Map<String, int[][]> agg = new TreeMap<>(); // model -> [10桶][命中, 样本]
        for (Stock stock : stockRepository.findByHiddenFalse()) {
            MarketDataService.StockData data = marketDataService.load(stock.getStockId());
            List<DailyPrice> prices = data.prices();
            for (int i = 0; i + 1 < prices.size(); i++) {
                boolean actualUp = prices.get(i + 1).getClose().compareTo(prices.get(i).getClose()) > 0;
                LocalDate d = prices.get(i).getTradeDate();
                for (Map.Entry<String, Map<LocalDate, DailyPrediction>> e
                        : data.predictionsByModel().entrySet()) {
                    DailyPrediction pred = e.getValue().get(d);
                    if (pred == null || pred.getProbUp() == null) {
                        continue;
                    }
                    int bucket = Math.min(9, (int) (pred.getProbUp().doubleValue() * 10));
                    int[][] cells = agg.computeIfAbsent(e.getKey(), k -> new int[10][2]);
                    cells[bucket][1]++;
                    if (actualUp) {
                        cells[bucket][0]++;
                    }
                }
            }
        }
        List<CalibrationRow> rows = new ArrayList<>();
        for (Map.Entry<String, int[][]> e : agg.entrySet()) {
            List<CalibrationBucket> buckets = new ArrayList<>();
            for (int b = 0; b < 10; b++) {
                int total = e.getValue()[b][1];
                if (total == 0) {
                    continue;
                }
                buckets.add(new CalibrationBucket(b / 10.0, (b + 1) / 10.0, total,
                        (double) e.getValue()[b][0] / total));
            }
            rows.add(new CalibrationRow(e.getKey(), buckets));
        }
        return rows;
    }

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
        for (Stock stock : stockRepository.findByHiddenFalse()) {
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
        // 场景行情不对公开接口暴露 (防比对泄题); 退市标的虽 hidden 但属公开历史, 放行给 E11
        Stock stock = stockRepository.findByCode(code)
                .filter(st -> !st.isHidden() || st.isDelisted())
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
