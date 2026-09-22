-- AI 对手板块: 每日涨跌预测表 + 会话内 AI 虚拟仓位

CREATE TABLE IF NOT EXISTS daily_prediction (
    id                   BIGINT       PRIMARY KEY AUTO_INCREMENT,
    stock_id             BIGINT       NOT NULL,
    trade_date           DATE         NOT NULL,
    prob_up              DECIMAL(5,4) NOT NULL,
    predicted_direction  VARCHAR(4)   NOT NULL,
    UNIQUE KEY uk_pred_stock_date (stock_id, trade_date),
    CONSTRAINT fk_pred_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

ALTER TABLE game_sessions
    ADD COLUMN ai_cash   DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER days_elapsed,
    ADD COLUMN ai_shares INT           NOT NULL DEFAULT 0 AFTER ai_cash;
