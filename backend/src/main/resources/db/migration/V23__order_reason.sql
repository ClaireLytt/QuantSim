-- 交易日志模式补洞: 挂单也要写理由 (之前只有手动交易强制, 挂单成交的流水 reason 恒为 null)
-- 用 VARCHAR 不用 CHAR (validate 模式下 CHAR 列拒启, 见 V12/V13 教训)
ALTER TABLE pending_orders ADD COLUMN reason VARCHAR(100) NULL;
