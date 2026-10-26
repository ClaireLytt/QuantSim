-- E11 真退市表: 退市标的入库 (hidden=1 隔离对局与榜单, delisted=1 供实验室幸存者实验调取)
ALTER TABLE stocks
    ADD COLUMN delisted TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN delist_date DATE NULL;

-- E20 实验室周报全服投票: 每人每周一票, 可改票 (upsert)
CREATE TABLE weekly_votes (
    vote_id    BIGINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week_idx   INT        NOT NULL,
    user_id    BIGINT     NOT NULL,
    choice     VARCHAR(8) NOT NULL,
    created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_wv (week_idx, user_id),
    CONSTRAINT fk_wv_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
