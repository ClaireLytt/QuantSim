-- 限制条件玩法: 每局可选笔数上限与强制交易理由 (开局固化), 理由随流水存档供复盘对照
ALTER TABLE game_sessions
    ADD COLUMN max_trades INT NULL,
    ADD COLUMN require_reason TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE transactions
    ADD COLUMN reason VARCHAR(100) NULL;
