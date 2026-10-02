-- 夏普榜: 结算时把风险调整后收益落库, 排行榜可按夏普排序 (防 all-in 赌徒霸榜)
ALTER TABLE game_sessions ADD COLUMN final_sharpe DECIMAL(10,4) NULL;
-- 移动止损挂单: 跟踪百分比 (仅 TRAIL_STOP 类型使用), 触发价随收盘价上移
ALTER TABLE pending_orders ADD COLUMN trail_pct DECIMAL(5,2) NULL;
