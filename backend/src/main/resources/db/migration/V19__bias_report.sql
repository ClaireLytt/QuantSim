-- 行为偏差诊断: 结算时从交易流水一次性计算, JSON 落库 (不可变, 复读不重算)
ALTER TABLE game_sessions ADD COLUMN bias_report TEXT NULL;
