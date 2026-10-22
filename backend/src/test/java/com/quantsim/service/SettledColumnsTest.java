package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantsim.dto.GameDtos.BiasReport;
import com.quantsim.entity.GameSession;

/**
 * 结算落库列集合的纯单元测试 (不起 Spring, 风格同 BacktestEngineTest):
 * 1) applyTo 必须写入 record 的每一个组件——用反射把组件名与实体 getter 对齐,
 *    未来新增结算列而忘了在 applyTo 回填时这里直接红, 防止 Hibernate 整行
 *    回写用旧快照把新列静默抹掉 (bias_report 曾被这样清成 NULL)。
 * 2) bias 报告"序列化失败降级 null、不拖垮结算主流程"的政策收口在工厂里。
 */
class SettledColumnsTest {

    /** 按组件类型造一个非默认哨兵值: 只要 applyTo 漏写某列, 实体上就是默认 null, 断言必红。 */
    private static Object sentinel(Class<?> type, int seed) {
        if (type == GameSession.Status.class) {
            return GameSession.Status.SETTLED;
        }
        if (type == BigDecimal.class) {
            return new BigDecimal(seed + ".42");
        }
        if (type == String.class) {
            return "sentinel-" + seed;
        }
        throw new IllegalStateException("未知组件类型 " + type + ": 请在测试里补充哨兵值构造");
    }

    /**
     * 组件名 -> 实体 getter 的显式登记表: 新增结算列必须同时在 record、applyTo 和这里登记,
     * 漏任何一处本测试直接红——比按命名约定猜 getter 可靠 (biasReportJson 落的实体字段无 Json 后缀)。
     */
    private static final Map<String, String> COMPONENT_GETTERS = Map.of(
            "status", "getStatus",
            "finalReturnRate", "getFinalReturnRate",
            "finalSharpe", "getFinalSharpe",
            "biasReportJson", "getBiasReport");

    @Test
    void applyToWritesEveryRecordComponent() throws Exception {
        RecordComponent[] components = SettledColumns.class.getRecordComponents();
        Object[] args = new Object[components.length];
        Class<?>[] types = new Class<?>[components.length];
        for (int i = 0; i < components.length; i++) {
            args[i] = sentinel(components[i].getType(), i);
            types[i] = components[i].getType();
        }
        SettledColumns columns = (SettledColumns) SettledColumns.class
                .getDeclaredConstructor(types).newInstance(args);

        GameSession session = new GameSession();
        columns.applyTo(session);

        for (int i = 0; i < components.length; i++) {
            String name = components[i].getName();
            String getterName = COMPONENT_GETTERS.get(name);
            assertThat(getterName)
                    .as("新增结算列组件 %s 未在 COMPONENT_GETTERS 登记对应的实体 getter", name)
                    .isNotNull();
            Object actual = GameSession.class.getMethod(getterName).invoke(session);
            assertThat(actual)
                    .as("applyTo 必须把组件 %s 写入 GameSession.%s", name, getterName)
                    .isEqualTo(args[i]);
        }
    }

    @Test
    void factorySerializationFailureDegradesToNullJson() {
        // 覆写 writeValueAsString 直接抛异常模拟任意序列化失败 -> 政策要求降级 null, 不中断结算
        BiasReport report = new BiasReport(1, List.of());
        ObjectMapper broken = new ObjectMapper() {
            @Override
            public String writeValueAsString(Object value) {
                throw new RuntimeException("boom");
            }
        };
        SettledColumns.Prepared prepared = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, null, report, broken);
        assertThat(prepared.columns().biasReportJson()).isNull();
        assertThat(prepared.columns().status()).isEqualTo(GameSession.Status.SETTLED);
        // 响应侧口径与落库由构造绑定: JSON 为 null 时响应侧一起为 null (否则刷新后报告消失)
        assertThat(prepared.responseReport()).isNull();
    }

    @Test
    void factoryNullReportYieldsNullJson() {
        SettledColumns.Prepared prepared = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, null, null, new ObjectMapper());
        assertThat(prepared.columns().biasReportJson()).isNull();
        assertThat(prepared.responseReport()).isNull();
    }

    @Test
    void factorySerializesReportToJson() {
        BiasReport report = new BiasReport(3, List.of());
        SettledColumns.Prepared prepared = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, BigDecimal.TEN,
                report, new ObjectMapper());
        assertThat(prepared.columns().biasReportJson()).contains("\"totalTrades\":3");
        // 序列化成功时响应侧携带的就是被序列化的那份报告
        assertThat(prepared.responseReport()).isSameAs(report);
    }
}
