-- 市场维度: A股 (STOCK) / 加密货币 (CRYPTO), 交易规则按市场区分 (整手股数)

ALTER TABLE stocks ADD COLUMN market VARCHAR(10) NOT NULL DEFAULT 'STOCK';
