package com.quantsim.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class GameDtos {

    private GameDtos() {}

    /**
     * market 可选: STOCK / US / CRYPTO, 缺省全市场随机; aiLevel 可选: EASY / NORMAL / HARD / HELL, 缺省 NORMAL;
     * mode 可选: CLASSIC / PORTFOLIO, 缺省 CLASSIC; advanced 开启做空/杠杆 (仅 US/CRYPTO);
     * realRules 开启 A股真实规则 T+1/涨跌停 (仅 A股市场)。
     */
    public record StartGameRequest(
            @NotBlank @Size(max = 50) String username,
            @Size(max = 10) String market,
            @Size(max = 10) String aiLevel,
            @Size(max = 16) String mode,
            Boolean advanced,
            Boolean realRules) {}

    public record StockLite(String code, String name) {}

    public record StartGameResponse(
            Long sessionId,
            String stockCode,
            String stockName,
            String market,
            int lotSize,
            LocalDate startDate,
            BigDecimal initialCash,
            int totalTicks,
            String aiLevel,
            String mode,
            boolean advanced,
            boolean realRules,
            List<StockLite> stocks,
            String status) {}

    public record KlinePoint(
            LocalDate tradeDate,
            BigDecimal open,
            BigDecimal high,
            BigDecimal low,
            BigDecimal close,
            Long volume,
            BigDecimal ma5,
            BigDecimal ma20,
            BigDecimal pctChange,
            BigDecimal rsi14,
            BigDecimal macdDif,
            BigDecimal macdDea) {}

    public record HistoryResponse(
            Long sessionId,
            String stockCode,
            String stockName,
            LocalDate startDate,
            LocalDate currentTradeDate,
            List<KlinePoint> klines) {}

    /** 挂单成交回执 */
    public record FilledOrder(String orderType, BigDecimal price, int shares, String stockCode) {}

    /** 当日揭示的历史事件 (不含日历日期, 防剧透); 双语字段由前端按当前语言取用 */
    public record NewsItem(String severity, String titleZh, String titleEn, String bodyZh, String bodyEn) {}

    /** aiTradeShares: AI 当日动作 (正=买入股数, 负=卖出, 0=持有不动), 前端时间线用 */
    public record TickResponse(
            LocalDate currentTradeDate,
            int daysElapsed,
            int totalTicks,
            boolean settled,
            KlinePoint newBar,
            SettleResponse settleResult,
            StatusResponse status,
            List<FilledOrder> filledOrders,
            int autoCancelledOrders,
            boolean liquidated,
            List<NewsItem> news,
            int aiTradeShares) {}

    /** stockCode 仅组合模式需要 (指定买卖哪只), 单股模式缺省主标的。 */
    public record TradeRequest(
            @NotBlank String direction,
            @NotNull BigDecimal price,
            @Min(1) int shares,
            String stockCode) {}

    public record TradeResponse(
            BigDecimal cashBalance,
            int holdingShares,
            BigDecimal holdingCost,
            BigDecimal fee) {}

    /** 组合模式分标的持仓快照 */
    public record PositionInfo(
            String stockCode,
            String stockName,
            int shares,
            BigDecimal avgCost,
            BigDecimal price,
            BigDecimal marketValue) {}

    /** 挂单信息 */
    public record OrderInfo(
            Long orderId,
            String orderType,
            BigDecimal triggerPrice,
            int shares,
            String status,
            String stockCode,
            LocalDate placedDate,
            LocalDate filledDate,
            BigDecimal filledPrice,
            BigDecimal trailPct) {}

    /** trailPct: 仅 TRAIL_STOP 用, 触发价 = 收盘价*(1-trailPct%) 并随收盘上移 */
    public record PlaceOrderRequest(
            @NotBlank String orderType,
            @NotNull BigDecimal price,
            @Min(1) int shares,
            String stockCode,
            BigDecimal trailPct) {}

    /** 模型对"次日涨跌"的预测: direction UP/DOWN, probUp 为上涨概率 (0~1)。 */
    public record PredictionInfo(String direction, BigDecimal probUp) {}

    /** AI 对手当前仓位快照。 */
    public record AiStatus(
            BigDecimal cash,
            int shares,
            BigDecimal totalAssets,
            BigDecimal returnRate) {}

    public record StatusResponse(
            Long sessionId,
            String status,
            LocalDate currentTradeDate,
            int daysElapsed,
            int totalTicks,
            BigDecimal cashBalance,
            int holdingShares,
            BigDecimal holdingCost,
            BigDecimal currentPrice,
            BigDecimal marketValue,
            BigDecimal totalAssets,
            BigDecimal floatingPnl,
            BigDecimal returnRate,
            PredictionInfo prediction,
            AiStatus ai,
            String mode,
            boolean advanced,
            boolean liquidated,
            BigDecimal feesPaid,
            BigDecimal marginRatio,
            BigDecimal interestTotal,
            Integer sellableShares,
            List<PositionInfo> positions) {}

    /** 本局某一天的 AI 预测复盘: 预测方向与实际是否命中。 */
    public record PredictionDay(LocalDate date, boolean predictedUp, boolean correct) {}

    /**
     * 资金曲线风险指标 (结算复盘)。回撤/波动率/胜率为正分数 (0.15 = 15%),
     * 夏普/索提诺/盈亏比为纯数; 样本不足或指标无意义时对应字段为 null。
     */
    public record RiskMetrics(
            BigDecimal maxDrawdown,
            BigDecimal volatility,
            BigDecimal sharpe,
            BigDecimal sortino,
            BigDecimal winRate,
            BigDecimal profitLossRatio) {}

    /** stockCode/stockName: 结算时的真实标的 —— 竞技模式全程匿名, 在这里才揭晓。 */
    public record SettleResponse(
            Long sessionId,
            BigDecimal initialCash,
            BigDecimal finalAssets,
            BigDecimal returnRate,
            BigDecimal aiFinalAssets,
            BigDecimal aiReturnRate,
            BigDecimal holdReturnRate,
            BigDecimal maCrossReturnRate,
            BigDecimal dcaReturnRate,
            RiskMetrics risk,
            RiskMetrics holdRisk,
            BigDecimal interestTotal,
            List<BigDecimal> equityCurve,
            List<BigDecimal> holdEquityCurve,
            List<PredictionDay> predictionDays,
            String styleTag,
            String stockCode,
            String stockName) {}

    /** LLM 交易顾问的解说与建议。 */
    public record AdvisorResponse(String advice, String model) {}

    public record LeaderboardEntry(
            Long sessionId,
            String username,
            String stockName,
            String stockCode,
            LocalDate startDate,
            BigDecimal returnRate,
            BigDecimal sharpe) {}
}
