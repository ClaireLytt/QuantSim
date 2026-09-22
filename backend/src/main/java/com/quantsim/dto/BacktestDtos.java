package com.quantsim.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class BacktestDtos {

    private BacktestDtos() {}

    /**
     * 自定义策略条件: left op right。
     * 字段: CLOSE / MA5 / MA20 / PCT_CHANGE; 算子: GT / LT / CROSS_UP / CROSS_DOWN。
     * 右侧二选一: rightField (字段) 或 rightValue (常数)。
     */
    public record CustomCondition(
            @NotBlank String left,
            @NotBlank String op,
            String rightField,
            BigDecimal rightValue) {}

    /**
     * 策略参数按类型取用: MA_CROSS 用 fastWindow/slowWindow, MOMENTUM 用 lookbackDays,
     * MEAN_REVERSION 用 maWindow/threshold, CUSTOM 用 buyConditions/sellConditions,
     * BUY_HOLD 无参数。缺省时用默认值。
     */
    public record RunRequest(
            @NotBlank @Size(max = 50) String username,
            @NotBlank String stockCode,
            @NotBlank String strategy,
            Integer fastWindow,
            Integer slowWindow,
            Integer lookbackDays,
            Integer maWindow,
            BigDecimal threshold,
            @Valid List<CustomCondition> buyConditions,
            @Valid List<CustomCondition> sellConditions) {}

    public record EquityPoint(LocalDate date, BigDecimal strategy, BigDecimal hold) {}

    public record RunResponse(
            Long backtestId,
            String stockCode,
            String stockName,
            String strategy,
            String params,
            LocalDate startDate,
            LocalDate endDate,
            int tradingDays,
            BigDecimal totalReturn,
            BigDecimal annualReturn,
            BigDecimal sharpeRatio,
            BigDecimal maxDrawdown,
            int tradeCount,
            BigDecimal winRate,
            BigDecimal holdReturn,
            List<EquityPoint> equityCurve) {}

    /** 自动调参: 对指定策略做网格搜索, 仅支持 MA_CROSS / MOMENTUM / MEAN_REVERSION。 */
    public record TuneRequest(
            @NotBlank @Size(max = 50) String username,
            @NotBlank String stockCode,
            @NotBlank String strategy) {}

    /** 最优参数按策略只填对应字段, 其余为 null; result 为用最优参数正式回测并入榜的结果。 */
    public record TuneResponse(
            String strategy,
            int triedCount,
            Integer fastWindow,
            Integer slowWindow,
            Integer lookbackDays,
            Integer maWindow,
            BigDecimal threshold,
            RunResponse result) {}

    public record StockInfo(String code, String name, String market) {}

    public record ArenaEntry(
            Long backtestId,
            String username,
            String stockCode,
            String stockName,
            String strategy,
            String params,
            BigDecimal totalReturn,
            BigDecimal sharpeRatio,
            BigDecimal maxDrawdown,
            int tradeCount) {}
}
