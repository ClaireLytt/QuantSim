package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.quantsim.service.PublicNames;

/**
 * 公开榜单用户名处理的回归矩阵 (2026-10 回归评估 T-08):
 * mask 站在隐私第一线, isTestAccount 决定谁从榜上消失——两者都不允许静默变形。
 */
class PublicNamesTest {

    @Test
    void maskMatrix() {
        // 非邮箱 / 空值: 原样
        assertThat(PublicNames.mask(null)).isNull();
        assertThat(PublicNames.mask("abc")).isEqualTo("abc");
        assertThat(PublicNames.mask("玩家一号")).isEqualTo("玩家一号");
        // @ 开头 (at<=0) 不是邮箱形态: 原样
        assertThat(PublicNames.mask("@x")).isEqualTo("@x");
        assertThat(PublicNames.mask("@")).isEqualTo("@");
        // 标准邮箱: 留 local 前 2 字符
        assertThat(PublicNames.mask("claire040217@163.com")).isEqualTo("cl***@163.com");
        // 短 local (1~2 字符): 全遮——留前 2 等于没脱
        assertThat(PublicNames.mask("a@x.com")).isEqualTo("***@x.com");
        assertThat(PublicNames.mask("ab@x.com")).isEqualTo("***@x.com");
        // 恰好 3 字符: 留 2 遮 1
        assertThat(PublicNames.mask("abc@x.com")).isEqualTo("ab***@x.com");
    }

    @Test
    void testAccountPrefixes() {
        assertThat(PublicNames.isTestAccount("smoke_12345678")).isTrue();
        assertThat(PublicNames.isTestAccount("btncheck_1")).isTrue();
        assertThat(PublicNames.isTestAccount("shot_x")).isTrue();
        // 边界: 前缀必须带下划线整段匹配开头
        assertThat(PublicNames.isTestAccount("smoke")).isFalse();
        assertThat(PublicNames.isTestAccount("xsmoke_1")).isFalse();
        assertThat(PublicNames.isTestAccount(null)).isFalse();
    }
}
