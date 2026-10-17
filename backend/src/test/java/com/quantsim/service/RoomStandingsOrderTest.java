package com.quantsim.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.quantsim.dto.CompetitiveDtos.RoomMemberView;

/**
 * 战况表比较器的契约单测: Comparator 必须反对称 (sgn(compare(a,b)) == -sgn(compare(b,a)))。
 * 曾经双 null returnRate 时两个方向都返回 1 —— 小房间走二分插入侥幸不炸,
 * TimSort (>=32 元素) 或未来换排序实现时会抛 "Comparison method violates its general contract"。
 */
class RoomStandingsOrderTest {

    private RoomMemberView member(String name, String rate) {
        return new RoomMemberView(name, true, rate != null, rate != null,
                0, 20, rate == null ? null : new BigDecimal(rate), false);
    }

    @Test
    void 比较器反对称_含双null() {
        RoomMemberView a = member("a", null);
        RoomMemberView b = member("b", null);
        RoomMemberView c = member("c", "0.05");
        RoomMemberView[] all = {a, b, c};
        for (RoomMemberView x : all) {
            for (RoomMemberView y : all) {
                int xy = Integer.signum(RoomService.STANDINGS_ORDER.compare(x, y));
                int yx = Integer.signum(RoomService.STANDINGS_ORDER.compare(y, x));
                assertThat(xy).as("反对称: " + x.username() + " vs " + y.username()).isEqualTo(-yx);
            }
        }
    }

    @Test
    void 大列表排序不抛契约异常_且null垫底() {
        // 33+ 元素让 List.sort 走 TimSort 合并路径, 契约违规在这里才会真正炸
        List<RoomMemberView> many = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            many.add(member("n" + i, i % 2 == 0 ? null : "0.0" + (i % 10)));
        }
        assertThatCode(() -> many.sort(RoomService.STANDINGS_ORDER)).doesNotThrowAnyException();
        many.sort(RoomService.STANDINGS_ORDER);
        // 排序后所有 null 都在非 null 之后
        boolean seenNull = false;
        for (RoomMemberView v : many) {
            if (v.returnRate() == null) {
                seenNull = true;
            } else {
                assertThat(seenNull).as("非 null 不应出现在 null 之后").isFalse();
            }
        }
    }
}
