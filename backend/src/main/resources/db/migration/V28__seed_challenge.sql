-- 同局战书 (好友异步对战, docs/friend-play-2026-10.md 玩法 1/8):
-- 战书 = 锁死的开局条件 (标的+窗口), 应战者打完全相同的一局; 同一战书 ≥4 人即小锦标赛。
CREATE TABLE seed_challenges (
    challenge_id    BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(12) NOT NULL,
    creator_user_id BIGINT      NOT NULL,
    stock_id        BIGINT      NOT NULL,
    start_date      DATE        NOT NULL,
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sc_code (code),
    CONSTRAINT fk_sc_user FOREIGN KEY (creator_user_id) REFERENCES users (user_id),
    CONSTRAINT fk_sc_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 应战记录: 一人一战书一局 (发起者的原局也占一行, 口径统一)
CREATE TABLE seed_challenge_entries (
    entry_id     BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    challenge_id BIGINT   NOT NULL,
    user_id      BIGINT   NOT NULL,
    session_id   BIGINT   NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sce_user (challenge_id, user_id),
    CONSTRAINT fk_sce_challenge FOREIGN KEY (challenge_id) REFERENCES seed_challenges (challenge_id),
    CONSTRAINT fk_sce_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT fk_sce_session FOREIGN KEY (session_id) REFERENCES game_sessions (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
