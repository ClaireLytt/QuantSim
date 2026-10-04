-- 用户账户: 密码列 (游客行为 NULL, 注册后填充即 "认领"), 最近登录时间
ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(60) NULL,
    ADD COLUMN last_login_at DATETIME NULL;

-- 学堂/成长进度云端同步 (整份 JSON, 客户端为写入方)
CREATE TABLE user_progress (
    user_id       BIGINT       NOT NULL PRIMARY KEY,
    progress_json TEXT         NOT NULL,
    updated_at    DATETIME     NOT NULL,
    CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
