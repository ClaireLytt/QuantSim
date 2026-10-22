package com.quantsim.service;

import java.math.BigDecimal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.dto.GameDtos.BiasReport;
import com.quantsim.entity.GameSession;

/**
 * 一局结算后写回 game_session 的全部列, 收口成单一模块。
 *
 * 为什么: 结算内层事务 (REQUIRES_NEW) 写的列必须由调用方逐一回填到父事务的旧托管
 * 实体上, 漏任何一列 Hibernate 整行回写就会用旧快照把它静默抹掉 (bias_report 曾被
 * 这样清成 NULL)。把"结算写哪些列"定义在这一个 record 里: 新增结算列只改这里,
 * applyTo 的完整性由 SettledColumnsTest 反射对齐保证, 不再靠注释和集成测试守护。
 *
 * @param status          结算后状态 (恒为 SETTLED)
 * @param finalReturnRate 最终收益率
 * @param finalSharpe     最终夏普 (权益曲线不可得时为 null)
 * @param biasReportJson  行为偏差诊断 JSON (序列化失败/无报告时为 null)
 */
public record SettledColumns(
        GameSession.Status status,
        BigDecimal finalReturnRate,
        BigDecimal finalSharpe,
        String biasReportJson) {

    private static final Logger log = LoggerFactory.getLogger(SettledColumns.class);

    /**
     * bias 报告"序列化为 JSON、失败降级 null、不拖垮结算主流程"的唯一政策实现:
     * 诊断是增值信息, JSON 转换抛异常只记 warn, 结算照常落库其余三列。
     */
    public static SettledColumns of(GameSession.Status status, BigDecimal finalReturnRate,
            BigDecimal finalSharpe, BiasReport report, ObjectMapper objectMapper) {
        String json = null;
        if (report != null) {
            try {
                json = objectMapper.writeValueAsString(report);
            } catch (Exception e) {
                log.warn("偏差诊断报告序列化失败, 降级为 null", e);
            }
        }
        return new SettledColumns(status, finalReturnRate, finalSharpe, json);
    }

    /** 把全部结算列写到实体上——调用方只调这一个方法, 回填知识不外泄。 */
    public void applyTo(GameSession session) {
        session.setStatus(status);
        session.setFinalReturnRate(finalReturnRate);
        session.setFinalSharpe(finalSharpe);
        session.setBiasReport(biasReportJson);
    }
}
