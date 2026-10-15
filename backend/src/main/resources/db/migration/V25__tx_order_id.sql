-- 交易流水补记来源挂单 ID: 「后悔药」撤销的是流水, 若这笔成交来自挂单,
-- 挂单仍停在 FILLED —— 账实分叉 (复盘显示已成交但资金里没有这笔),
-- 且该单从笔数预算 (已成交数 + 在挂单数) 两侧同时消失, 限笔模式可借此刷额度。
-- undo 据此列把挂单回滚为 OPEN。手动交易保持 NULL。
ALTER TABLE transactions ADD COLUMN order_id BIGINT NULL;
