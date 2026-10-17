package com.quantsim;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.quantsim.exception.BusinessException;
import com.quantsim.service.UserService;

/**
 * 昵称白名单的纯单元测试: 这道防线的声明目标是挡"同形异义码点在公开榜上视觉冒充他人"
 * (见 UserService.NAME_OK 注释), 这里按目标锁行为 —— 西里尔/希腊同形字必须被拒。
 */
class UserNameValidationTest {

    @Test
    void 合法昵称放行_中英文数字与允许符号() {
        for (String ok : new String[] {"claire", "克莱尔", "claire_2024", "a b", "u@x.y-z", "张三abc"}) {
            assertThatCode(() -> UserService.requireValidName(ok)).as(ok).doesNotThrowAnyException();
        }
    }

    @Test
    void 同形异义码点必须被拒() {
        // "сlaire" 首字母是西里尔 с (U+0441), 榜单上与拉丁 claire 肉眼不可分
        for (String bad : new String[] {"сlaire", "clаire", "οwner"}) {
            assertThatThrownBy(() -> UserService.requireValidName(bad))
                    .as("同形字应被白名单拒绝: " + bad)
                    .isInstanceOf(BusinessException.class);
        }
    }

    @Test
    void 控制符与零宽字符仍被拒() {
        for (String bad : new String[] {"a​b", "a\u0000b", "a\nb"}) {
            assertThatThrownBy(() -> UserService.requireValidName(bad)).isInstanceOf(BusinessException.class);
        }
    }
}
