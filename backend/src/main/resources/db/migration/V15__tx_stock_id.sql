-- 交易流水补记标的 ID: 此前组合模式的流水无法区分属于哪只股票,
-- 结算风险指标需要逐日重放资金曲线才补上。旧行保持 NULL
-- (单股模式重放时缺省回退到会话主标的, 不受影响)。
ALTER TABLE transactions ADD COLUMN stock_id BIGINT NULL;
