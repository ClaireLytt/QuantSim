package com.quantsim;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.quantsim.config.GameProperties;
import com.quantsim.controller.LabController;

/** 今日播报 regime 分类 + INTRO 短局天数的口径测试 (纯函数, 不碰库)。 */
class MarketPulseRegimeTest {

    @Test
    void thinSampleNeverBroadcasts() {
        assertEquals("THIN", LabController.classifyRegime(3, 2, 1.0, 1.0));
    }

    @Test
    void wildBeatsDirection() {
        // 高波动优先于涨跌方向: 普涨但波动 2.5%+ 仍判 WILD
        assertEquals("WILD", LabController.classifyRegime(20, 2, 3.1, 1.0));
    }

    @Test
    void surgeSplitsByVolume() {
        assertEquals("SURGE_HOT", LabController.classifyRegime(15, 5, 1.2, 1.3));
        assertEquals("SURGE", LabController.classifyRegime(15, 5, 1.2, 1.0));
    }

    @Test
    void slumpAndMixed() {
        assertEquals("SLUMP", LabController.classifyRegime(4, 16, 1.2, 1.0));
        assertEquals("MIXED", LabController.classifyRegime(10, 10, 1.2, 1.0));
    }

    @Test
    void introTicksShorterAndPointsGateStaysOnTotal() {
        GameProperties props = new GameProperties();
        assertEquals(props.getIntroTicks(), props.ticksFor("INTRO"));
        assertEquals(props.getTotalTicks(), props.ticksFor("CLASSIC"));
        assertEquals(props.getTotalTicks(), props.ticksFor("DAILY"));
        // 免刷分结构保证: INTRO 结算天数永远小于计分门槛
        org.junit.jupiter.api.Assertions.assertTrue(props.getIntroTicks() < props.getTotalTicks());
    }
}
