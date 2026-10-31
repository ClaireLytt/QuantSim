package com.quantsim.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.Account;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.TradeTransaction;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.AccountRepository;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.TransactionRepository;
import com.quantsim.service.MeSummaryService.ClosedTrade;
import com.quantsim.service.MeSummaryService.OpenLot;
import com.quantsim.service.MeSummaryService.TradeStats;

import lombok.RequiredArgsConstructor;

/**
 * 赛后交易复盘 (设计稿 .scratch/recap-system/design.md):
 * 把一局已结算对局的流水折成「已实现 / 未实现 / 费用 / 利息」四分解与逐笔配对表。
 *
 * 口径 (指标字典 §1/§2, RecapServiceTest 以现金流恒等式钉死):
 *  - 配对 = MeSummaryService.pairTrades 均价法 (买入费入均价, 平仓费入当笔 pnl);
 *  - 已实现 = Σ平仓 pnl (因此含全部已平部分的费);
 *  - 未实现 = Σ期末敞口 (结算收盘 − 含费均价) × 带符号数量;
 *  - 恒等式: finalAssets − initialCash = realized + unrealized − 未平部分摊入均价的费差 + interest
 *    —— 以"现金流重放"对拍, 而非各算各的再凑;
 *  - 滑点不展示: 撮合规则只按收盘价成交, 该自由度在规则内不存在;
 *  - 卖后走势只陈述事实 (样本数随行), 动机归因仍归 bias 报告。
 * 只读, 不落库; 竞技/事件局的标的与日期沿用 BlindDates 政策。
 */
@Service
@RequiredArgsConstructor
public class RecapService {

    /** 样本护栏: 平仓笔数低于该值时胜率/盈亏比标 insufficient (对齐 bias 报告的护栏思路) */
    public static final int MIN_SAMPLE = 5;

    /** 卖后走势观察窗 (交易日) */
    public static final int SELL_AFTER_DAYS = 5;

    private final GameSessionRepository sessionRepository;
    private final TransactionRepository transactionRepository;
    private final AccountRepository accountRepository;
    private final MarketDataService marketData;
    private final SessionMarketData sessionData;
    private final TradeEngine tradeEngine;

    public record RecapTrade(String stockCode, boolean isLong, int qty, BigDecimal entryAvg,
            BigDecimal exitPrice, LocalDate exitDate, long holdDays, BigDecimal pnl, String reason) {}

    public record OpenPosition(String stockCode, int qty, BigDecimal avg, BigDecimal close,
            BigDecimal unrealized) {}

    public record RecapResponse(
            BigDecimal initialCash, BigDecimal finalAssets, BigDecimal returnRate,
            BigDecimal realizedPnl, BigDecimal unrealizedPnl, BigDecimal feesTotal,
            BigDecimal interestTotal,
            int closedCount, int winCount, BigDecimal tradeWinRate,
            BigDecimal profitLossRatio, boolean noLossSample, boolean insufficientSample,
            List<RecapTrade> trades, List<OpenPosition> openPositions,
            BigDecimal concentration,
            BigDecimal sellAfterAvgPct, int sellSamples) {}

    @Transactional(readOnly = true)
    public RecapResponse recap(Long sessionId) {
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        if (session.getStatus() != GameSession.Status.SETTLED) {
            throw new BusinessException("对局尚未结算, 结算后才能复盘");
        }
        Account account = accountRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NotFoundException("账户不存在"));
        List<TradeTransaction> txs =
                transactionRepository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        Map<Long, BigDecimal> closes = tradeEngine.currentCloses(session);
        TradeStats stats = MeSummaryService.pairTrades(txs);

        BigDecimal realized = stats.trades().stream().map(ClosedTrade::pnl)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        BigDecimal unrealized = BigDecimal.ZERO;
        List<OpenPosition> open = new ArrayList<>();
        for (OpenLot lot : stats.open()) {
            BigDecimal close = closes.get(lot.stockId() == null ? session.getStockId() : lot.stockId());
            if (close == null) {
                continue; // 旧流水缺 stock_id 且非单票局: 该敞口无法估值, 跳过并少报不多报
            }
            BigDecimal u = close.subtract(lot.avg())
                    .multiply(BigDecimal.valueOf(lot.qty())).setScale(2, RoundingMode.HALF_UP);
            unrealized = unrealized.add(u);
            open.add(new OpenPosition(maskedCode(session, lot.stockId()), lot.qty(),
                    lot.avg().setScale(4, RoundingMode.HALF_UP), close, u));
        }
        BigDecimal fees = transactionRepository.sumFeesBySessionId(sessionId)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal interest = account.getInterestTotal() == null
                ? BigDecimal.ZERO : account.getInterestTotal();
        BigDecimal finalAssets = tradeEngine.equity(session, account, closes);

        // 胜率/盈亏比 (平均盈 ÷ 平均亏); 样本不足与无亏损样本显式降级, 不编数字
        int closed = stats.closed();
        int wins = stats.wins();
        BigDecimal winRate = closed == 0 ? null
                : BigDecimal.valueOf(wins).divide(BigDecimal.valueOf(closed), 4, RoundingMode.HALF_UP);
        BigDecimal sumWin = stats.trades().stream().map(ClosedTrade::pnl)
                .filter(p -> p.signum() > 0).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal sumLoss = stats.trades().stream().map(ClosedTrade::pnl)
                .filter(p -> p.signum() < 0).reduce(BigDecimal.ZERO, BigDecimal::add).abs();
        int losses = closed - wins
                - (int) stats.trades().stream().filter(ct -> ct.pnl().signum() == 0).count();
        boolean noLoss = closed > 0 && losses == 0;
        BigDecimal plRatio = (wins == 0 || losses == 0) ? null
                : sumWin.divide(BigDecimal.valueOf(wins), 4, RoundingMode.HALF_UP)
                        .divide(sumLoss.divide(BigDecimal.valueOf(losses), 4, RoundingMode.HALF_UP),
                                4, RoundingMode.HALF_UP);

        List<RecapTrade> trades = stats.trades().stream()
                .map(ct -> new RecapTrade(maskedCode(session, ct.stockId()), ct.isLong(), ct.qty(),
                        ct.entryAvg(), ct.exitPrice(), BlindDates.mask(session, ct.exitDate()),
                        ct.holdDays(), ct.pnl(), reasonOf(txs, ct)))
                .toList();

        // 持仓集中度: 组合模式且有敞口才有信息量 (单票局恒 100%)
        BigDecimal concentration = null;
        if ("PORTFOLIO".equals(session.getMode()) && !open.isEmpty()) {
            BigDecimal total = open.stream()
                    .map(p -> p.close().multiply(BigDecimal.valueOf(Math.abs(p.qty()))))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal max = open.stream()
                    .map(p -> p.close().multiply(BigDecimal.valueOf(Math.abs(p.qty()))))
                    .max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
            if (total.signum() > 0) {
                concentration = max.divide(total, 4, RoundingMode.HALF_UP);
            }
        }

        // 卖后走势事实: 每笔 SELL 之后 5 个交易日的实际涨跌均值 (只陈述, 不归因)
        BigDecimal sellAfterSum = BigDecimal.ZERO;
        int sellSamples = 0;
        for (TradeTransaction tx : txs) {
            if (tx.getDirection() != TradeTransaction.Direction.SELL) {
                continue;
            }
            Long sid = tx.getStockId() == null ? session.getStockId() : tx.getStockId();
            MarketDataService.StockData sd = sessionData.of(session, sid);
            Integer idx = sd.indexOf(tx.getTradeDate());
            if (idx == null || idx + SELL_AFTER_DAYS >= sd.prices().size()) {
                continue;
            }
            BigDecimal base = sd.prices().get(idx).getClose();
            if (base.signum() <= 0) {
                continue;
            }
            sellAfterSum = sellAfterSum.add(sd.prices().get(idx + SELL_AFTER_DAYS).getClose()
                    .subtract(base).divide(base, 6, RoundingMode.HALF_UP));
            sellSamples++;
        }
        BigDecimal sellAfterAvg = sellSamples == 0 ? null
                : sellAfterSum.divide(BigDecimal.valueOf(sellSamples), 4, RoundingMode.HALF_UP);

        return new RecapResponse(session.getInitialCash(), finalAssets,
                session.getFinalReturnRate(), realized, unrealized, fees, interest,
                closed, wins, winRate, plRatio, noLoss, closed < MIN_SAMPLE,
                trades, open, concentration, sellAfterAvg, sellSamples);
    }

    private String maskedCode(GameSession session, Long stockId) {
        Long sid = stockId == null ? session.getStockId() : stockId;
        return BlindDates.maskCode(session, marketData.load(sid).stock().getCode());
    }

    /** 当笔理由: 平仓流水对应的 reason (限制条件玩法写过才有) */
    private static String reasonOf(List<TradeTransaction> txs, ClosedTrade ct) {
        return txs.stream()
                .filter(tx -> tx.getTradeDate().equals(ct.exitDate())
                        && tx.getPrice().compareTo(ct.exitPrice()) == 0
                        && tx.getReason() != null && !tx.getReason().isBlank())
                .map(TradeTransaction::getReason)
                .findFirst().orElse(null);
    }
}
