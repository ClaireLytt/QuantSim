-- 赛季 (YYYY-MM) + 每日挑战 + 好友房间

ALTER TABLE game_sessions
    ADD COLUMN season CHAR(7) NULL,
    ADD COLUMN challenge_date DATE NULL,
    ADD UNIQUE KEY uk_user_daily (user_id, challenge_date);

ALTER TABLE backtest_results
    ADD COLUMN season CHAR(7) NULL;

-- 历史数据按创建时间回填赛季
UPDATE game_sessions SET season = DATE_FORMAT(created_at, '%Y-%m') WHERE season IS NULL;
UPDATE backtest_results SET season = DATE_FORMAT(created_at, '%Y-%m') WHERE season IS NULL;

-- 每日挑战: 当日首个请求生成并固化 (标的, 起始日), 全服共用
CREATE TABLE daily_challenges (
    challenge_date DATE     NOT NULL PRIMARY KEY,
    stock_id       BIGINT   NOT NULL,
    start_date     DATE     NOT NULL,
    created_at     DATETIME NOT NULL,
    CONSTRAINT fk_dc_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 好友房间: 异步同题对战
CREATE TABLE rooms (
    room_id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code            CHAR(6)     NOT NULL UNIQUE,
    creator_user_id BIGINT      NOT NULL,
    stock_id        BIGINT      NOT NULL,
    start_date      DATE        NOT NULL,
    ai_level        VARCHAR(16) NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    max_players     INT         NOT NULL DEFAULT 8,
    expires_at      DATETIME    NOT NULL,
    created_at      DATETIME    NOT NULL,
    CONSTRAINT fk_room_user FOREIGN KEY (creator_user_id) REFERENCES users (user_id),
    CONSTRAINT fk_room_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE room_members (
    room_id    BIGINT   NOT NULL,
    user_id    BIGINT   NOT NULL,
    session_id BIGINT   NULL,
    joined_at  DATETIME NOT NULL,
    PRIMARY KEY (room_id, user_id),
    CONSTRAINT fk_rm_room FOREIGN KEY (room_id) REFERENCES rooms (room_id),
    CONSTRAINT fk_rm_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT fk_rm_session FOREIGN KEY (session_id) REFERENCES game_sessions (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
