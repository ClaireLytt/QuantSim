-- 策略擂台结算页需要多策略净值曲线同图对比: 入榜时保存降采样后的策略净值序列
-- (JSON 数组, ≤150 点, 预回测不落库)。MEDIUMTEXT 足够且不走 CHAR (validate 教训)。
ALTER TABLE backtest_results ADD COLUMN equity_curve MEDIUMTEXT NULL;
