-- 策略单一化审计 (创意 22/26) 落地:
--  - blind_week_salts: 盲测擂台的周盐 (commit-reveal)。窗口种子曾是 SHA("QS-BLIND-"+week)
--    纯公开可预计算, 报名前即可本地算出三段窗口过拟合; 加服务端随机盐后赛中不可知,
--    揭晓时随榜公布盐值保审计性 (任何人可复算窗口)。
--  - game_sessions.settled_at: 结算时刻。每日挑战榜单下发完赛用时,
--    给"异常快速的完美局"(多账号偷跑) 留下可见指纹。
CREATE TABLE blind_week_salts (
    week_idx   INT      NOT NULL PRIMARY KEY,
    salt       BIGINT   NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE game_sessions ADD COLUMN settled_at DATETIME NULL;
