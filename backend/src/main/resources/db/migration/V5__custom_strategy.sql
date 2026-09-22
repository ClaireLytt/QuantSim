-- 自定义策略: 条件组合的参数描述更长, 加宽 params 列

ALTER TABLE backtest_results MODIFY params VARCHAR(255) NOT NULL DEFAULT '';
