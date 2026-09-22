-- 策略回测竞技场: 玩家配置经典策略在全量历史数据上回测, 结果入库排行

CREATE TABLE IF NOT EXISTS backtest_results (
    backtest_id    BIGINT        PRIMARY KEY AUTO_INCREMENT,
    user_id        BIGINT        NOT NULL,
    stock_id       BIGINT        NOT NULL,
    strategy       VARCHAR(20)   NOT NULL,
    params         VARCHAR(100)  NOT NULL DEFAULT '',
    start_date     DATE          NOT NULL,
    end_date       DATE          NOT NULL,
    total_return   DECIMAL(10,4) NOT NULL,
    annual_return  DECIMAL(10,4) NULL,
    sharpe_ratio   DECIMAL(10,4) NULL,
    max_drawdown   DECIMAL(10,4) NOT NULL,
    trade_count    INT           NOT NULL,
    win_rate       DECIMAL(5,4)  NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bt_return (total_return DESC),
    CONSTRAINT fk_bt_user  FOREIGN KEY (user_id)  REFERENCES users(user_id),
    CONSTRAINT fk_bt_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);
