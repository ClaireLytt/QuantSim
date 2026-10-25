-- 首页「我的交易人生」逐日资产曲线: 结算时把逐日净值序列落库
-- (JSON [[date,value]...], 降采样 ≤150 点; MEDIUMTEXT 同 V24 先例, 不走 CHAR)。
-- 老对局该列为 NULL, 聚合时回退单点 (结算日收益率)。
ALTER TABLE game_sessions ADD COLUMN equity_curve MEDIUMTEXT NULL;
