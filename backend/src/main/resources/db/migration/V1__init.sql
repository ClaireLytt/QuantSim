-- QuantSim 建表迁移 (MySQL 8.x)
-- 注意: PRD 中 game_sessions.current_date 为 MySQL 保留字, 此处命名为 current_trade_date

CREATE TABLE IF NOT EXISTS stocks (
    stock_id    BIGINT       PRIMARY KEY AUTO_INCREMENT,
    code        VARCHAR(10)  NOT NULL UNIQUE,
    name        VARCHAR(50)  NOT NULL,
    industry    VARCHAR(50)  NULL
);

CREATE TABLE IF NOT EXISTS daily_price (
    id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    stock_id    BIGINT        NOT NULL,
    trade_date  DATE          NOT NULL,
    open        DECIMAL(10,2) NOT NULL,
    high        DECIMAL(10,2) NOT NULL,
    low         DECIMAL(10,2) NOT NULL,
    close       DECIMAL(10,2) NOT NULL,
    volume      BIGINT        NOT NULL,
    UNIQUE KEY uk_stock_date (stock_id, trade_date),
    CONSTRAINT fk_price_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

CREATE TABLE IF NOT EXISTS daily_indicator (
    id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    stock_id    BIGINT        NOT NULL,
    trade_date  DATE          NOT NULL,
    ma5         DECIMAL(10,2) NULL,
    ma20        DECIMAL(10,2) NULL,
    volatility  DECIMAL(10,4) NULL,
    pct_change  DECIMAL(10,4) NULL,
    UNIQUE KEY uk_ind_stock_date (stock_id, trade_date),
    CONSTRAINT fk_ind_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

CREATE TABLE IF NOT EXISTS users (
    user_id     BIGINT      PRIMARY KEY AUTO_INCREMENT,
    username    VARCHAR(50) NOT NULL UNIQUE,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_sessions (
    session_id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT        NOT NULL,
    stock_id            BIGINT        NOT NULL,
    start_date          DATE          NOT NULL,
    current_trade_date  DATE          NOT NULL,
    days_elapsed        INT           NOT NULL DEFAULT 0,
    status              VARCHAR(20)   NOT NULL DEFAULT 'IN_PROGRESS',
    initial_cash        DECIMAL(12,2) NOT NULL,
    final_return_rate   DECIMAL(10,4) NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sessions_return (status, final_return_rate DESC),
    CONSTRAINT fk_session_user  FOREIGN KEY (user_id)  REFERENCES users(user_id),
    CONSTRAINT fk_session_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id      BIGINT        PRIMARY KEY AUTO_INCREMENT,
    session_id      BIGINT        NOT NULL UNIQUE,
    cash_balance    DECIMAL(12,2) NOT NULL,
    holding_shares  INT           NOT NULL DEFAULT 0,
    holding_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_account_session FOREIGN KEY (session_id) REFERENCES game_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    tx_id       BIGINT        PRIMARY KEY AUTO_INCREMENT,
    session_id  BIGINT        NOT NULL,
    trade_date  DATE          NOT NULL,
    direction   VARCHAR(10)   NOT NULL,
    price       DECIMAL(10,2) NOT NULL,
    shares      INT           NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tx_session FOREIGN KEY (session_id) REFERENCES game_sessions(session_id)
);
