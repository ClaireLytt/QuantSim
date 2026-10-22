package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.util.List;

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

    @Test
    void applyToWritesEveryRecordComponent() throws Exception {
        RecordComponent[] components = SettledColumns.class.getRecordComponents();
        Object[] args = new Object[components.length];
        for (int i = 0; i < components.length; i++) {
            args[i] = sentinel(components[i].getType(), i);
        }
        Class<?>[] types = new Class<?>[components.length];
        for (int i = 0; i < components.length; i++) {
            types[i] = components[i].getType();
        }
        SettledColumns columns = (SettledColumns) SettledColumns.class
                .getDeclaredConstructor(types).newInstance(args);

        GameSession session = new GameSession();
        columns.applyTo(session);

        for (int i = 0; i < components.length; i++) {
            // 组件名 -> 实体 getter: finalReturnRate -> getFinalReturnRate;
            // biasReportJson 落的是实体的 biasReport 列 (实体字段名无 Json 后缀)
            String name = components[i].getName();
            String getterName = "get" + Character.toUpperCase(name.charAt(0))
                    + (name.endsWith("Json") ? name.substring(1, name.length() - 4) : name.substring(1));
            Object actual = GameSession.class.getMethod(getterName).invoke(session);
            assertThat(actual)
                    .as("applyTo 必须把组件 %s 写入 GameSession.%s", name, getterName)
                    .isEqualTo(args[i]);
        }
    }

    @Test
    void factorySerializationFailureDegradesToNullJson() {
        // 自引用 Map 让 Jackson 序列化必炸 -> 政策要求降级 null, 不中断结算
        BiasReport report = new BiasReport(1, List.of());
        ObjectMapper broken = new ObjectMapper() {
            @Override
            public String writeValueAsString(Object value) {
                throw new RuntimeException("boom");
            }
        };
        SettledColumns columns = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, null, report, broken);
        assertThat(columns.biasReportJson()).isNull();
        assertThat(columns.status()).isEqualTo(GameSession.Status.SETTLED);
    }

    @Test
    void factoryNullReportYieldsNullJson() {
        SettledColumns columns = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, null, null, new ObjectMapper());
        assertThat(columns.biasReportJson()).isNull();
    }

    @Test
    void factorySerializesReportToJson() {
        SettledColumns columns = SettledColumns.of(
                GameSession.Status.SETTLED, BigDecimal.ONE, BigDecimal.TEN,
                new BiasReport(3, List.of()), new ObjectMapper());
        assertThat(columns.biasReportJson()).contains("\"totalTrades\":3");
    }
}
