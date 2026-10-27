-- 策略单一化审计 (创意 1-10) 落地:
--  - game_sessions.item_used: 本局用过预知卡/后悔药则结算不发胜AI/赢基准加成 (道具不应影响计分项)
--  - user_points.settle_count: 当日已计分结算局数, 用于基础分衰减 (前 3 局全额, 之后降额)
--  - points_ledger: 积分流水账本 (服务端权威审计; 大额兑换校验非盲盒净收入)
ALTER TABLE game_sessions ADD COLUMN item_used TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE user_points ADD COLUMN settle_count INT NOT NULL DEFAULT 0;

CREATE TABLE points_ledger (
    ledger_id  BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    delta      INT         NOT NULL,
    reason     VARCHAR(32) NOT NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ledger_user (user_id),
    CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
