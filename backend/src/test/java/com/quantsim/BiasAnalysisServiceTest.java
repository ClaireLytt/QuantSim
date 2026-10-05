package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.quantsim.dto.GameDtos.BiasReport;
import com.quantsim.dto.GameDtos.BiasVerdict;
import com.quantsim.entity.DailyPrice;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Stock;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.service.BiasAnalysisService;
import com.quantsim.service.MarketDataService.StockData;

/** 行为偏差诊断的纯单元测试: 伪造行情与流水, 验证各判定的触发与最小样本护栏。 */
class BiasAnalysisServiceTest {

    private final BiasAnalysisService service = new BiasAnalysisService();

    private static final LocalDate D0 = LocalDate.of(2024, 3, 1);
    private static final long STOCK = 1L;

    /** 伪造一段日线: closes[i] 为第 i 日收盘, 交易日按 D0+i 排布。 */
    private StockData stockData(double... closes) {
        List<DailyPrice> prices = new ArrayList<>();
        Map<LocalDate, Integer> idx = new HashMap<>();
        for (int i = 0; i < closes.length; i++) {
            DailyPrice p = new DailyPrice();
            LocalDate d = D0.plusDays(i);
            p.setTradeDate(d);
            BigDecimal c = BigDecimal.valueOf(closes[i]).setScale(2);
            p.setOpen(c);
            p.setHigh(c);
            p.setLow(c);
            p.setClose(c);
            p.setVolume(1000L);
            prices.add(p);
            idx.put(d, i);
        }
        Stock stock = new Stock();
        return new StockData(stock, prices, idx, Map.of(), Map.of(),
                new double[closes.length], new double[2][closes.length]);
    }

    private GameSession session() {
        GameSession s = new GameSession();
        s.setStockId(STOCK);
        s.setStartDate(D0);
        return s;
    }

    private TradeTransaction tx(int dayIdx, TradeTransaction.Direction dir, double price, int shares) {
        TradeTransaction t = new TradeTransaction();
        t.setSessionId(1L);
        t.setStockId(STOCK);
        t.setTradeDate(D0.plusDays(dayIdx));
        t.setDirection(dir);
        t.setPrice(BigDecimal.valueOf(price).setScale(2));
        t.setShares(shares);
        t.setFee(BigDecimal.ZERO);
        return t;
    }

    private BiasVerdict verdict(BiasReport report, String key) {
        return report.verdicts().stream().filter(v -> v.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void tooFewTradesYieldInsufficientNotDiagnosis() {
        StockData sd = stockData(10, 10, 10, 10, 10, 10);
        List<TradeTransaction> txs = List.of(
                tx(2, TradeTransaction.Direction.BUY, 10, 100),
                tx(4, TradeTransaction.Direction.SELL, 10, 100));
        BiasReport report = service.analyze(session(), txs, id -> sd);
        assertThat(report.totalTrades()).isEqualTo(2);
        assertThat(verdict(report, "disposition").insufficient()).isTrue();
        assertThat(verdict(report, "revenge").insufficient()).isTrue();
        assertThat(verdict(report, "chase").insufficient()).isTrue();
        assertThat(verdict(report, "panic").insufficient()).isTrue();
        assertThat(verdict(report, "overtrade").triggered()).isFalse();
    }

    @Test
    void dispositionTriggersWhenLosersHeldMuchLonger() {
        // 两笔盈利单各持有 1 tick 即卖, 一笔亏损单拿了 8 tick: ratio = 8/1 >= 1.8
        StockData sd = stockData(10, 10, 10, 12, 10, 10, 12, 10, 10, 10, 10, 10, 8);
        List<TradeTransaction> txs = List.of(
                tx(2, TradeTransaction.Direction.BUY, 10, 100),
                tx(3, TradeTransaction.Direction.SELL, 12, 100),  // 赢, 持 1 tick
                tx(5, TradeTransaction.Direction.BUY, 10, 100),
                tx(6, TradeTransaction.Direction.SELL, 12, 100),  // 赢, 持 1 tick
                tx(4, TradeTransaction.Direction.BUY, 10, 100),   // 注: 顺序按列表重放
                tx(12, TradeTransaction.Direction.SELL, 8, 100)); // 亏, 持 8 tick
        BiasReport report = service.analyze(session(), txs, id -> sd);
        BiasVerdict v = verdict(report, "disposition");
        assertThat(v.insufficient()).isFalse();
        assertThat(v.triggered()).isTrue();
        assertThat(v.stats().get("ratio")).isGreaterThanOrEqualTo(new BigDecimal("1.8"));
    }

    @Test
    void chaseTriggersWhenMostBuysFollowBigUpDays() {
        // 收盘序列: 第 2/4/6 日买入时, 前一日涨幅都 > 3%
        StockData sd = stockData(10, 10.5, 10.5, 11.1, 11.1, 11.8, 11.8, 11.8);
        List<TradeTransaction> txs = List.of(
                tx(2, TradeTransaction.Direction.BUY, 10.5, 100),
                tx(4, TradeTransaction.Direction.BUY, 11.1, 100),
                tx(6, TradeTransaction.Direction.BUY, 11.8, 100));
        BiasReport report = service.analyze(session(), txs, id -> sd);
        BiasVerdict v = verdict(report, "chase");
        assertThat(v.insufficient()).isFalse();
        assertThat(v.triggered()).isTrue();
        assertThat(v.stats().get("rate")).isEqualByComparingTo(BigDecimal.ONE);
    }

    @Test
    void panicTriggersOnLossSalesAfterBigDrops() {
        // 第 3/6 日卖出: 前一日跌幅 > 3% 且卖价低于成本
        StockData sd = stockData(10, 10, 9.5, 9.0, 10, 10, 9.4, 9.0);
        List<TradeTransaction> txs = List.of(
                tx(2, TradeTransaction.Direction.BUY, 9.5, 100),
                tx(3, TradeTransaction.Direction.SELL, 9.0, 100),
                tx(5, TradeTransaction.Direction.BUY, 10, 100),
                tx(7, TradeTransaction.Direction.SELL, 9.0, 100));
        BiasReport report = service.analyze(session(), txs, id -> sd);
        BiasVerdict v = verdict(report, "panic");
        assertThat(v.insufficient()).isFalse();
        // 第 3 日卖: 前日 9.5/10-1 = -5%; 第 7 日卖: 前日 9.4/10-1 = -6%; 两笔都实亏
        assertThat(v.triggered()).isTrue();
    }

    @Test
    void overtradeTriggersAboveFifteenTrades() {
        StockData sd = stockData(fill(30, 10));
        List<TradeTransaction> txs = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            txs.add(tx(2 + (i % 20), i % 2 == 0
                    ? TradeTransaction.Direction.BUY : TradeTransaction.Direction.SELL, 10, 100));
        }
        BiasReport report = service.analyze(session(), txs, id -> sd);
        assertThat(verdict(report, "overtrade").triggered()).isTrue();
    }

    @Test
    void revengeTriggersWhenSizingUpAfterLoss() {
        // 亏损卖出后 2 tick 内下单额远超全局中位
        StockData sd = stockData(fill(20, 10));
        List<TradeTransaction> txs = List.of(
                tx(2, TradeTransaction.Direction.BUY, 10, 100),
                tx(4, TradeTransaction.Direction.SELL, 8, 100),   // 实亏 (tick 4)
                tx(5, TradeTransaction.Direction.BUY, 10, 500),   // 亏后 1 tick, 5 倍额
                tx(6, TradeTransaction.Direction.BUY, 10, 500));  // 亏后 2 tick, 5 倍额
        BiasReport report = service.analyze(session(), txs, id -> sd);
        BiasVerdict v = verdict(report, "revenge");
        assertThat(v.insufficient()).isFalse();
        assertThat(v.triggered()).isTrue();
    }

    // ---------- 跨对局偏差档案 ----------

    private BiasReport report(boolean chaseTriggered, boolean insufficient) {
        return new BiasReport(5, List.of(
                new BiasVerdict("chase", chaseTriggered, chaseTriggered ? "WARN" : "INFO",
                        Map.of("rate", BigDecimal.valueOf(chaseTriggered ? 0.8 : 0.1)), insufficient)));
    }

    @Test
    void profileDetectsImprovingTrend() {
        // 早期 4 局全触发, 近 3 局全没触发 -> 触发率下降 = IMPROVING
        List<BiasReport> reports = new ArrayList<>(List.of(
                report(true, false), report(true, false), report(true, false), report(true, false),
                report(false, false), report(false, false), report(false, false)));
        var profile = service.profile(reports);
        assertThat(profile.totalGames()).isEqualTo(7);
        var chase = profile.trends().stream().filter(t -> t.key().equals("chase")).findFirst().orElseThrow();
        assertThat(chase.games()).isEqualTo(7);
        assertThat(chase.triggered()).isEqualTo(4);
        assertThat(chase.trend()).isEqualTo("IMPROVING");
        assertThat(chase.history()).hasSize(7);
    }

    @Test
    void profileSkipsInsufficientGamesAndNeedsSamples() {
        // 样本不足的局不计入; 不足 4 局有效样本不下趋势结论
        List<BiasReport> reports = List.of(
                report(true, false), report(true, true), report(false, false), report(false, true));
        var profile = service.profile(reports);
        var chase = profile.trends().stream().filter(t -> t.key().equals("chase")).findFirst().orElseThrow();
        assertThat(chase.games()).isEqualTo(2);
        assertThat(chase.trend()).isEqualTo("NA");
        // 其他偏差项一局有效样本都没有
        var disp = profile.trends().stream().filter(t -> t.key().equals("disposition")).findFirst().orElseThrow();
        assertThat(disp.games()).isZero();
    }

    private static double[] fill(int n, double v) {
        double[] a = new double[n];
        java.util.Arrays.fill(a, v);
        return a;
    }
}
