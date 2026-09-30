-- 交易费用留痕
ALTER TABLE transactions
    ADD COLUMN fee DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 挂单: 限价/止损/止盈, 在「下一天」按次日 OHLC 撮合
CREATE TABLE pending_orders (
    order_id      BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id    BIGINT        NOT NULL,
    stock_id      BIGINT        NOT NULL,
    order_type    VARCHAR(12)   NOT NULL,                -- LIMIT_BUY / LIMIT_SELL / STOP_LOSS / TAKE_PROFIT
    trigger_price DECIMAL(10,2) NOT NULL,
    shares        INT           NOT NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'OPEN', -- OPEN / FILLED / CANCELLED
    placed_date   DATE          NOT NULL,
    filled_date   DATE          NULL,
    filled_price  DECIMAL(10,2) NULL,
    created_at    DATETIME      NOT NULL,
    INDEX idx_po_sess (session_id, status),
    CONSTRAINT fk_po_session FOREIGN KEY (session_id) REFERENCES game_sessions (session_id),
    CONSTRAINT fk_po_stock FOREIGN KEY (stock_id) REFERENCES stocks (stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
