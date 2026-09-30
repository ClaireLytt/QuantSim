-- 内置历史事件库: market 与 stock_code 都空 = 全市场事件
CREATE TABLE news_events (
    event_id   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    market     VARCHAR(10)  NULL,
    stock_code VARCHAR(16)  NULL,
    event_date DATE         NOT NULL,
    severity   VARCHAR(8)   NULL,
    title_zh   VARCHAR(120) NOT NULL,
    title_en   VARCHAR(120) NOT NULL,
    body_zh    VARCHAR(500) NULL,
    body_en    VARCHAR(500) NULL,
    INDEX idx_news_date (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 精选事件 (A股为主, 数据区间 2024-01 ~ 2025-12; 美股/币圈行情为 mock 时事件仅作氛围彩蛋)
INSERT INTO news_events (market, stock_code, event_date, severity, title_zh, title_en, body_zh, body_en) VALUES
('STOCK', NULL, '2024-01-22', 'HIGH', '沪指跌破 2800 点', 'SSE Composite breaks below 2,800', '两市普跌，雪球产品敲入压力与流动性担忧交织，市场情绪降至冰点。', 'Broad selloff in Chinese equities as snowball knock-ins and liquidity fears stack up; sentiment hits a freezing point.'),
('STOCK', NULL, '2024-02-05', 'HIGH', '小微盘股流动性危机', 'Small-cap liquidity crunch', '量化基金遭遇赎回与风控双杀，小微盘股连续跌停，监管出手稳定市场。', 'Quant funds hit by redemptions and risk limits; micro-caps go limit-down for days before regulators step in.'),
('STOCK', NULL, '2024-02-06', 'MED', '中央汇金宣布扩大增持', 'Central Huijin expands ETF buying', '国家队宣布扩大 ETF 增持范围，市场绝地反弹。', 'The national team widens its ETF purchases; the market stages a sharp rebound.'),
('STOCK', NULL, '2024-04-12', 'MED', '新国九条发布', 'New Nine Measures released', '国务院印发资本市场新国九条，强调分红与退市监管，蓝筹风格受益。', 'The State Council issues new capital-market guidelines emphasizing dividends and delisting rules; blue chips benefit.'),
('STOCK', NULL, '2024-09-24', 'HIGH', '一揽子金融支持政策出台', 'Sweeping stimulus package announced', '央行宣布降准降息、创设互换便利与回购增持再贷款，A股放量暴涨，牛市启动。', 'PBoC unveils rate and RRR cuts plus new facilities for stock buying; A-shares surge on record volume as a bull run ignites.'),
('STOCK', NULL, '2024-09-30', 'HIGH', '节前最后交易日天量成交', 'Record turnover before Golden Week', '沪深两市成交额创历史纪录，散户跑步入场，开户数激增。', 'Combined turnover hits an all-time record as retail investors rush in; new account openings explode.'),
('STOCK', NULL, '2024-10-08', 'HIGH', '节后天量高开回落', 'Post-holiday spike and fade', '国庆后首个交易日巨量高开，随后剧烈分化，追高资金被套。', 'First session after Golden Week gaps up on epic volume then fades sharply; chasers get trapped.'),
('STOCK', NULL, '2024-11-08', 'MED', '化债方案落地', 'Local-debt swap plan lands', '10 万亿化债组合拳公布，市场对财政刺激力度分歧加大，指数震荡。', 'A CNY 10tn debt-swap package is announced; markets debate the fiscal punch and churn sideways.'),
('STOCK', NULL, '2025-01-17', 'LOW', '2024 年 GDP 数据公布', '2024 GDP data released', '全年经济数据出炉，市场聚焦政策接力与开年信贷。', 'Full-year data lands; focus shifts to policy follow-through and January credit.'),
('STOCK', NULL, '2025-04-07', 'HIGH', '关税冲击波及全球', 'Tariff shock hits global markets', '对等关税落地引发全球股市重挫，A股避险情绪升温，国家队护盘。', 'Sweeping tariffs trigger a global rout; A-shares wobble as the national team defends the tape.'),
('STOCK', NULL, '2025-05-12', 'MED', '中美关税谈判现缓和', 'Tariff truce signals emerge', '双方宣布大幅互降关税 90 天，风险偏好回升，出口链领涨。', 'A 90-day mutual tariff rollback is announced; risk appetite returns with exporters leading.'),
('STOCK', NULL, '2025-08-18', 'MED', '沪指创十年新高', 'SSE hits a decade high', '流动性宽松与增量资金共振，沪指突破 3700 点，成交额重回 2 万亿。', 'Ample liquidity and fresh inflows push the index past 3,700 with CNY 2tn daily turnover.'),
('US', NULL, '2024-08-05', 'HIGH', '全球黑色星期一', 'Global Black Monday', '日元套息交易逆转引发全球股市闪崩，VIX 一度飙升至 65。', 'Yen carry-trade unwind sparks a global flash crash; VIX spikes to 65 intraday.'),
('US', NULL, '2024-11-06', 'MED', '美国大选结果揭晓', 'US election decided', '选举结果落地，美股大涨，小盘股与金融股领涨。', 'Election clarity sends US stocks sharply higher, led by small caps and financials.'),
('US', NULL, '2025-01-27', 'HIGH', 'DeepSeek 冲击 AI 股', 'DeepSeek shakes AI stocks', '低成本大模型发布引发算力叙事重估，英伟达单日蒸发创纪录市值。', 'A low-cost model release triggers an AI-capex rethink; Nvidia posts a record one-day value loss.'),
('US', NULL, '2025-04-03', 'HIGH', '关税重挫美股', 'Tariffs slam Wall Street', '解放日关税宣布，标普创 2020 年以来最大单日跌幅。', 'Liberation Day tariffs land; the S&P suffers its worst day since 2020.'),
('US', NULL, '2025-04-09', 'HIGH', '关税暂停引发史诗逼空', 'Tariff pause sparks epic squeeze', '90 天关税暂停宣布，标普单日暴涨 9.5%，创 2008 年以来最大涨幅。', 'A 90-day tariff pause ignites a 9.5 percent single-day S&P melt-up, the largest since 2008.'),
('CRYPTO', NULL, '2024-01-10', 'HIGH', '比特币现货 ETF 获批', 'Spot Bitcoin ETFs approved', 'SEC 批准 11 只比特币现货 ETF，机构资金入场通道打开。', 'The SEC approves 11 spot Bitcoin ETFs, opening the floodgates for institutional money.'),
('CRYPTO', NULL, '2024-04-20', 'MED', '比特币第四次减半', 'Bitcoin fourth halving', '区块奖励减半至 3.125 BTC，市场博弈减半后走势。', 'Block rewards halve to 3.125 BTC; traders battle over the post-halving script.'),
('CRYPTO', NULL, '2024-11-06', 'HIGH', '大选点燃币圈', 'Election lights up crypto', '亲加密候选人胜选预期兑现，比特币突破 75000 美元创新高。', 'A crypto-friendly election outcome sends Bitcoin past 75,000 dollars to fresh highs.'),
('CRYPTO', NULL, '2024-12-05', 'HIGH', '比特币首破 10 万美元', 'Bitcoin tops 100k', '比特币历史性突破 10 万美元关口，全网狂欢。', 'Bitcoin crosses the historic 100,000-dollar mark; the whole market celebrates.'),
('CRYPTO', NULL, '2025-02-21', 'HIGH', 'Bybit 遭史上最大盗币', 'Bybit hit by record hack', '交易所被盗约 15 亿美元 ETH，币价急挫，行业安全性再遭拷问。', 'Roughly 1.5 billion dollars in ETH is stolen from Bybit; prices lurch lower as security fears resurface.'),
(NULL, NULL, '2024-06-28', 'LOW', '半年度资金面收官', 'Half-year book-squaring', '机构半年度调仓与考核窗口，波动放大属正常现象。', 'Institutional rebalancing into the half-year close amplifies swings; nothing sinister.'),
(NULL, NULL, '2025-06-30', 'LOW', '年中资金面扰动', 'Mid-year liquidity wobble', '跨半年资金价格抬升，短线波动加剧。', 'Funding costs firm into mid-year; expect choppier intraday action.');
