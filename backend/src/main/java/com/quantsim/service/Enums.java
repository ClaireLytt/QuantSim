package com.quantsim.service;

import java.util.Arrays;
import java.util.stream.Collectors;

import com.quantsim.exception.BusinessException;

/**
 * 枚举参数统一解析: trim + 大写后 valueOf, 失败抛带可选值列表的 BusinessException。
 * 之前 Game/Room/Backtest/Order 各养一份 try/valueOf/catch, 错误文案已互相漂移, 收敛到这里。
 */
public final class Enums {

    private Enums() {}

    /** label 形如 "AI 难度"/"市场", 报错格式: 未知{label}: {raw}（可选 A / B / C）。 */
    public static <E extends Enum<E>> E parse(String raw, Class<E> type, String label) {
        try {
            return Enum.valueOf(type, raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            String options = Arrays.stream(type.getEnumConstants())
                    .map(Enum::name)
                    .collect(Collectors.joining(" / "));
            throw new BusinessException("未知" + label + ": " + raw + "（可选 " + options + "）");
        }
    }
}
