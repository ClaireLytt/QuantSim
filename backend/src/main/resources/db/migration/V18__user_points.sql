-- 积分系统后端化: 余额/道具/连胜/签到/转盘/每日任务全部服务端权威,
-- 防 localStorage 改存档作弊, 并支撑跨设备同步与积分排行榜
CREATE TABLE IF NOT EXISTS user_points (
    user_id      BIGINT   PRIMARY KEY,
    balance      INT      NOT NULL DEFAULT 0,
    item_peek    INT      NOT NULL DEFAULT 0,
    item_undo    INT      NOT NULL DEFAULT 0,
    item_fast    INT      NOT NULL DEFAULT 0,
    win_streak   INT      NOT NULL DEFAULT 0,
    last_sign_in DATE     NULL,
    last_spin    DATE     NULL,
    task_date    DATE     NULL,
    task_flags   INT      NOT NULL DEFAULT 0,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_points_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);
