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

    /** market 可选: STOCK / US / CRYPTO, 缺省全市场随机; aiLevel 可选: EASY / NORMAL / HARD, 缺省 NORMAL。 */
    public record StartGameRequest(
            @NotBlank @Size(max = 50) String username,
            @Size(max = 10) String market,
            @Size(max = 10) String aiLevel) {}

    public record StartGameResponse(
            Long sessionId,
            String stockCode,
            String stockName,
            String market,
            int lotSize,
            LocalDate startDate,
            BigDecimal initialCash,
            int totalTicks,
            String aiLevel) {}

    public record KlinePoint(
            LocalDate tradeDate,
            BigDecimal open,
            BigDecimal high,
            BigDecimal low,
            BigDecimal close,
            Long volume,
            BigDecimal ma5,
            BigDecimal ma20,
            BigDecimal pctChange) {}

    public record HistoryResponse(
            Long sessionId,
            String stockCode,
            String stockName,
            LocalDate startDate,
            LocalDate currentTradeDate,
            List<KlinePoint> klines) {}

    public record TickResponse(
            LocalDate currentTradeDate,
            int daysElapsed,
            int totalTicks,
            boolean settled,
            KlinePoint newBar,
            SettleResponse settleResult,
            StatusResponse status) {}

    public record TradeRequest(
            @NotBlank String direction,
            @NotNull BigDecimal price,
            @Min(1) int shares) {}

    public record TradeResponse(
            BigDecimal cashBalance,
            int holdingShares,
            BigDecimal holdingCost) {}

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
            AiStatus ai) {}

    /** 本局某一天的 AI 预测复盘: 预测方向与实际是否命中。 */
    public record PredictionDay(LocalDate date, boolean predictedUp, boolean correct) {}

    public record SettleResponse(
            Long sessionId,
            BigDecimal initialCash,
            BigDecimal finalAssets,
            BigDecimal returnRate,
            BigDecimal aiFinalAssets,
            BigDecimal aiReturnRate,
            BigDecimal holdReturnRate,
            BigDecimal maCrossReturnRate,
            List<PredictionDay> predictionDays,
            String styleTag) {}

    /** LLM 交易顾问的解说与建议。 */
    public record AdvisorResponse(String advice, String model) {}

    public record LeaderboardEntry(
            Long sessionId,
            String username,
            String stockName,
            String stockCode,
            LocalDate startDate,
            BigDecimal returnRate) {}
}
