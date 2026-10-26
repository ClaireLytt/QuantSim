-- 擂台盲测赛 (研究游戏化 #10): 每周提交一份策略配置, 报名即锁死;
-- 赛果在周序号成为过去后按三段保密窗口统一计算 (窗口由周种子派生, 赛中不下发)。
CREATE TABLE blind_entries (
    entry_id    BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week_idx    INT           NOT NULL,
    user_id     BIGINT        NOT NULL,
    config_json VARCHAR(2000) NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_be (week_idx, user_id),
    CONSTRAINT fk_be_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
