-- 新闻语义层 (系统联动审计设计 1/2/4): 方向/预期消化度/传闻链/信源级别。
--  - direction: +1 利好 / -1 利空 / 0 中性 (同一事件可对不同标的给相反方向, 设计#4)
--  - expectation: 0~1, 市场已提前消化的程度 (高预期利好落地常见"卖事实", 设计#1/#8)
--  - chain_id: 传闻→证实/辟谣 的事件链 (设计#2)
--  - source_tier: OFFICIAL / RUMOR (传闻可信度分层)
ALTER TABLE news_events
    ADD COLUMN direction   INT          NOT NULL DEFAULT 0,
    ADD COLUMN expectation DECIMAL(3,2) NULL,
    ADD COLUMN chain_id    BIGINT       NULL,
    ADD COLUMN source_tier VARCHAR(8)   NOT NULL DEFAULT 'OFFICIAL';

-- 既有精选事件补方向与预期 (按日期+标题锚定, 不动其他字段)
UPDATE news_events SET direction = -1, expectation = 0.30 WHERE event_date = '2024-01-22';
UPDATE news_events SET direction = -1, expectation = 0.20 WHERE event_date = '2024-02-05';
UPDATE news_events SET direction = 1,  expectation = 0.30 WHERE event_date = '2024-02-06';
UPDATE news_events SET direction = 1,  expectation = 0.50 WHERE event_date = '2024-04-12';
UPDATE news_events SET direction = 1,  expectation = 0.60 WHERE event_date = '2024-09-24' AND title_zh LIKE '一揽子%';
UPDATE news_events SET direction = 1,  expectation = 0.90 WHERE event_date = '2024-09-30';
UPDATE news_events SET direction = -1, expectation = 0.85 WHERE event_date = '2024-10-08';
UPDATE news_events SET direction = 0,  expectation = 0.70 WHERE event_date = '2024-11-08';
UPDATE news_events SET direction = -1, expectation = 0.30 WHERE event_date = '2025-04-07';
UPDATE news_events SET direction = 1,  expectation = 0.40 WHERE event_date = '2025-05-12';
UPDATE news_events SET direction = 1,  expectation = 0.75 WHERE event_date = '2025-08-18';
UPDATE news_events SET direction = -1, expectation = 0.20 WHERE event_date = '2024-08-05' AND market = 'US';
UPDATE news_events SET direction = 1,  expectation = 0.50 WHERE event_date = '2025-04-09' AND market = 'US';
UPDATE news_events SET direction = -1, expectation = 0.60 WHERE event_date = '2025-04-03' AND market = 'US';

-- 设计#2 传闻链: 924 行情前的政策传闻 (chain 1, 应验) 与一条被澄清的税改传闻 (chain 2)
UPDATE news_events SET chain_id = 1 WHERE event_date = '2024-09-24' AND title_zh LIKE '一揽子%';
INSERT INTO news_events (market, stock_code, event_date, severity, title_zh, title_en, body_zh, body_en,
                         direction, expectation, chain_id, source_tier) VALUES
('STOCK', NULL, '2024-09-20', 'MED', '传闻：一揽子增量政策在路上', 'Rumor: sweeping stimulus in the works',
 '多个渠道传出重磅金融政策将于下周公布，真伪未辨，资金开始躁动。',
 'Multiple channels whisper that heavyweight policies land next week. Unverified, but money is stirring.',
 1, 0.30, 1, 'RUMOR'),
('STOCK', NULL, '2025-08-11', 'MED', '传闻：印花税将再度调整', 'Rumor: another stamp-tax tweak',
 '市场流传印花税调整窗口临近，消息源模糊。', 'Talk of an imminent stamp-tax change; sourcing is murky.',
 1, 0.20, 2, 'RUMOR'),
('STOCK', NULL, '2025-08-13', 'LOW', '官方澄清：无印花税调整计划', 'Official: no stamp-tax change planned',
 '相关部门回应，近期无调整安排——传闻证伪。', 'Authorities respond: nothing planned. Rumor busted.',
 0, NULL, 2, 'OFFICIAL'),
-- 设计#4 同一事件相反影响: 关税冲击对出口链与内需链的分化 (标的级, 组合模式可同屏对照)
('STOCK', '000333', '2025-04-07', 'HIGH', '关税冲击出口链', 'Tariffs slam exporters',
 '对等关税落地，白电出口敞口首当其冲，市场担忧订单转移。',
 'Reciprocal tariffs land; white-goods export books take the first hit.',
 -1, 0.30, 3, 'OFFICIAL'),
('STOCK', '600519', '2025-04-07', 'HIGH', '避险资金转向内需', 'Flight to domestic demand',
 '外需承压下资金涌向纯内需资产，白酒龙头被视作避风港。',
 'With external demand under pressure, money rotates into pure domestic plays; premium baijiu is the bolt-hole.',
 1, 0.30, 3, 'OFFICIAL');
