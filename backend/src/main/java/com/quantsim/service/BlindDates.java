package com.quantsim.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.quantsim.entity.GameSession;

/**
 * 竞技模式 (每日挑战/好友房间) 的日期脱敏: 行情窗口对全服保密,
 * 但 K 线响应若带真实日历日, 玩家拿日期去 /api/lab 查全量历史即可看到"未来"。
 * 对策: 对外输出的所有日期统一平移到虚拟纪元 (起始日 -> BASE), 相对间隔不变,
 * 前端图表/挂单/复盘照常渲染。注意这只挡住"按日期查未来", 标的代码仍然公开,
 * 有心人仍可用价格形态在研究所比对定位窗口 (见 CLAUDE.md 待办)。
 */
public final class BlindDates {

    /** 虚拟纪元, 取一个周一, 让平移后的"交易日"看起来自然。 */
    public static final LocalDate BASE = LocalDate.of(2000, 1, 3);

    private BlindDates() {}

    /** 该对局是否需要隐藏真实日期。 */
    public static boolean blind(GameSession session) {
        return "DAILY".equals(session.getMode()) || "ROOM".equals(session.getMode());
    }

    /** 竞技模式把 d 平移到虚拟纪元 (startDate -> BASE), 普通模式原样返回。 */
    public static LocalDate mask(GameSession session, LocalDate d) {
        if (d == null || !blind(session)) {
            return d;
        }
        return BASE.plusDays(ChronoUnit.DAYS.between(session.getStartDate(), d));
    }

    // ---------- 标的匿名化: 竞技对局进行中连"是哪只股票"都保密, 结算才揭晓 ----------
    // 动机: 日期脱敏后仍可"标的代码 + 价格形态"去研究所比对定位窗口; 隐藏标的把这条路也堵死,
    // 同时"神秘标的"到结算揭晓反而成了游戏悬念点。

    /** 前端识别用的占位代码; i18n 按它显示「神秘标的 / Mystery Stock」。 */
    public static final String MASK_CODE = "???";
    public static final String MASK_NAME = "神秘标的";

    /** 进行中的竞技对局隐藏标的代码。 */
    public static String maskCode(GameSession session, String code) {
        return hideStock(session) ? MASK_CODE : code;
    }

    /** 进行中的竞技对局隐藏标的名称。 */
    public static String maskName(GameSession session, String name) {
        return hideStock(session) ? MASK_NAME : name;
    }

    private static boolean hideStock(GameSession session) {
        return blind(session) && session.getStatus() != GameSession.Status.SETTLED;
    }
}
