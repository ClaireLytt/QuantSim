-- 对局模式 (CLASSIC/PORTFOLIO/DAILY/ROOM)、进阶做空杠杆开关、强平标记
ALTER TABLE game_sessions
    ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'CLASSIC',
    ADD COLUMN advanced TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN liquidated TINYINT(1) NOT NULL DEFAULT 0;

-- 组合模式: 每标的一行持仓 (shares 允许为负 = 做空)
CREATE TABLE positions (
    position_id BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id  BIGINT        NOT NULL,
    stock_id    BIGINT        NOT NULL,
    shares      INT           NOT NULL DEFAULT 0,
    avg_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
    UNIQUE KEY uk_pos (session_id, stock_id),
    CONSTRAINT fk_pos_session FOREIGN KEY (session_id) REFERENCES game_sessions (session_id),
    CONSTRAINT fk_pos_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 组合模式的标的清单 (slot 0 为主标的, 兼容单股逻辑)
CREATE TABLE session_stocks (
    session_id BIGINT  NOT NULL,
    stock_id   BIGINT  NOT NULL,
    slot       TINYINT NOT NULL,
    PRIMARY KEY (session_id, slot),
    CONSTRAINT fk_ss_session FOREIGN KEY (session_id) REFERENCES game_sessions (session_id),
    CONSTRAINT fk_ss_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
