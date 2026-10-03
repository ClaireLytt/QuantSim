-- 同 V12/V13 一类问题: V9 的 session_stocks.slot 建成 TINYINT, 实体是 Integer (映射 INT),
-- validate 模式下类型不符拒启。改为 INT 与实体一致 (slot 取值 0~2, 值域不受影响)。
ALTER TABLE session_stocks MODIFY COLUMN slot INT NOT NULL;
