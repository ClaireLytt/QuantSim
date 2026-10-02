-- A股真实规则开关 (T+1 + 涨跌停) 与闲置现金计息
ALTER TABLE game_sessions ADD COLUMN real_rules TINYINT(1) NOT NULL DEFAULT 0;
-- 累计利息 (正=存款利息, 负=进阶模式融资成本), 教学展示用
ALTER TABLE accounts ADD COLUMN interest_total DECIMAL(12,2) NOT NULL DEFAULT 0;
