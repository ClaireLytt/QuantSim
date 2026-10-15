package com.quantsim.service;

/**
 * 公开榜单的用户名处理 (2026-10 审计 P1):
 * 1. 邮箱形态的用户名脱敏 —— 注册名允许是邮箱, 直接上公开榜等于泄露联系方式;
 * 2. 自动化测试账号过滤 —— 冒烟/按钮体检每跑一次就注册新号打榜, 污染真实榜单。
 * 只影响"公开展示"场景; 好友房间 (互相认识) 与本人视角不经过这里。
 */
public final class PublicNames {

    /** 自动化脚本的注册名前缀 (见 tools/ui_smoke 的 enterApp userPrefix)。 */
    private static final String[] TEST_PREFIXES = { "smoke_", "btncheck_", "shot_" };

    private PublicNames() {}

    /**
     * 邮箱形态脱敏: claire040217@163.com -> cl***@163.com; 非邮箱原样返回。
     * local 不足 3 字符时全遮 (保留前 2 等于没脱: "ab@x.com" 的 local 就 2 字符)。
     */
    public static String mask(String username) {
        if (username == null) {
            return null;
        }
        int at = username.indexOf('@');
        if (at <= 0) {
            return username;
        }
        String local = username.substring(0, at);
        String kept = local.length() >= 3 ? local.substring(0, 2) : "";
        return kept + "***" + username.substring(at);
    }

    /** 冒烟/体检脚本注册的一次性账号, 公开榜单一律不展示。 */
    public static boolean isTestAccount(String username) {
        if (username == null) {
            return false;
        }
        for (String prefix : TEST_PREFIXES) {
            if (username.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    /** 榜单行是否属于当前登录用户 (脱敏后前端认不出自己, 由后端标记)。单一来源, 各榜共用。 */
    public static boolean isSelf(Long rowUserId, Long authUserId) {
        return rowUserId != null && rowUserId.equals(authUserId);
    }
}
