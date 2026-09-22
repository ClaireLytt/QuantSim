-- 多模型 AI 对手: 预测按模型区分, 对局记录所选 AI 模型 (历史数据视为逻辑回归)

ALTER TABLE daily_prediction
    ADD COLUMN model VARCHAR(16) NOT NULL DEFAULT 'LOGISTIC' AFTER trade_date;

ALTER TABLE daily_prediction
    DROP KEY uk_pred_stock_date,
    ADD UNIQUE KEY uk_pred_stock_date_model (stock_id, trade_date, model);

ALTER TABLE game_sessions
    ADD COLUMN ai_model VARCHAR(16) NOT NULL DEFAULT 'LOGISTIC' AFTER ai_shares;
