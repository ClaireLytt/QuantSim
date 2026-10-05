-- 事件回放模式 (EVENT): 把玩家扔回真实历史时刻盲测, 结算揭晓场景与大事记时间线。
-- 防泄题: 场景行情挂在 hidden 标的行上 (code 形如 600519@CN_2015_CRASH),
-- hidden 行不进研究所/回测/随机开局等任何公开列表, 只有 EVENT 对局内部引用。

ALTER TABLE stocks ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0;
-- 场景标的 code 形如 "600519@CN_2015_CRASH", 原 VARCHAR(10) 不够放
ALTER TABLE stocks MODIFY COLUMN code VARCHAR(32) NOT NULL;
ALTER TABLE game_sessions ADD COLUMN scenario_id BIGINT NULL;

CREATE TABLE event_scenarios (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(32)  NOT NULL,
    name_zh         VARCHAR(64)  NOT NULL,
    name_en         VARCHAR(64)  NOT NULL,
    market          VARCHAR(8)   NOT NULL,
    window_start    DATE         NOT NULL,
    window_end      DATE         NOT NULL,
    -- 候选标的的真实行情代码 (逗号分隔); 对应 hidden 股票行 code = "<真实代码>@<场景code>"
    tickers         VARCHAR(255) NOT NULL,
    force_real_rules TINYINT(1)  NOT NULL DEFAULT 0,
    difficulty      VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    CONSTRAINT uk_scenario_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE event_timeline (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    scenario_id BIGINT       NOT NULL,
    event_date  DATE         NOT NULL,
    severity    VARCHAR(8)   NOT NULL,
    title_zh    VARCHAR(128) NOT NULL,
    title_en    VARCHAR(128) NOT NULL,
    body_zh     VARCHAR(512) NOT NULL,
    body_en     VARCHAR(512) NOT NULL,
    KEY idx_timeline_scenario (scenario_id, event_date),
    CONSTRAINT fk_timeline_scenario FOREIGN KEY (scenario_id) REFERENCES event_scenarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 场景目录: 候选全部是窗口期内已上市的大盘股; A股场景强制真实规则 (涨跌停/T+1 正是剧情本体)
INSERT INTO event_scenarios (code, name_zh, name_en, market, window_start, window_end, tickers, force_real_rules, difficulty) VALUES
('CN_2015_CRASH',    '2015年A股股灾',    '2015 A-Share Crash',          'STOCK', '2015-05-15', '2015-07-31', '600519,601318,600030,601988', 1, 'HARD'),
('CN_2016_FUSE',     '2016年A股熔断',    '2016 China Circuit Breaker',  'STOCK', '2015-12-15', '2016-02-05', '600519,601318,600036,000858', 1, 'HARD'),
('CN_2018_TRADEWAR', '2018年中美贸易战', '2018 US-China Trade War',     'STOCK', '2018-03-15', '2018-07-15', '600519,601318,600036,000858', 1, 'NORMAL'),
('US_2020_COVID',    '2020年3月美股熔断','2020 COVID Crash',            'US',    '2020-02-14', '2020-04-15', 'AAPL,MSFT,JPM,XOM',           0, 'HARD'),
('US_2008_LEHMAN',   '2008年雷曼危机',   '2008 Lehman Crisis',          'US',    '2008-08-15', '2008-11-15', 'AAPL,MSFT,JPM,GS',            0, 'HARD');

-- 大事记时间线 (结算后才揭晓, 进行中绝不下发 —— 文本会暴露真实时间)
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2015-06-12', 'HIGH', '沪指见顶 5178 点', 'SHCOMP tops at 5178',
       '上证指数盘中触及 5178.19 点后掉头, 杠杆疯牛的最后一个高点。', 'The Shanghai Composite touches 5178.19 intraday and turns — the final high of the leveraged bull.'
FROM event_scenarios WHERE code = 'CN_2015_CRASH';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2015-06-26', 'HIGH', '千股跌停', 'A thousand stocks limit-down',
       '两市超两千只个股跌停, 场外配资强平引发连环踩踏。', 'Over two thousand stocks hit limit-down as margin calls trigger cascading liquidations.'
FROM event_scenarios WHERE code = 'CN_2015_CRASH';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2015-07-04', 'MED', '21 家券商联合救市', '21 brokers announce rescue',
       '21 家券商出资 1200 亿护盘, IPO 暂停, "国家队"进场。', '21 brokerages commit 120B yuan to support the market; IPOs halt; the "national team" steps in.'
FROM event_scenarios WHERE code = 'CN_2015_CRASH';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2015-07-08', 'HIGH', '千股停牌避险', 'Mass trading halts',
       '近半数上市公司停牌躲跌, 流动性几近冻结。', 'Nearly half of all listed companies suspend trading; liquidity all but freezes.'
FROM event_scenarios WHERE code = 'CN_2015_CRASH';

INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2016-01-04', 'HIGH', '熔断机制首日即触发', 'Circuit breaker trips on day one',
       '新年首个交易日沪深 300 两档熔断, 全天提前收盘。', 'On the first trading day of 2016 the CSI 300 trips both circuit-breaker levels; the session ends early.'
FROM event_scenarios WHERE code = 'CN_2016_FUSE';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2016-01-07', 'HIGH', '开盘 29 分钟收市', 'Market closes after 29 minutes',
       '开盘不足半小时再度两档熔断, 创 A 股最短交易日纪录。', 'Barely half an hour after the open both levels trip again — the shortest trading day in A-share history.'
FROM event_scenarios WHERE code = 'CN_2016_FUSE';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2016-01-08', 'MED', '熔断机制紧急叫停', 'Circuit breaker suspended',
       '证监会宣布暂停熔断机制, 实施仅 4 个交易日。', 'The CSRC suspends the circuit breaker after just four trading days.'
FROM event_scenarios WHERE code = 'CN_2016_FUSE';

INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2018-03-23', 'HIGH', '美国宣布对华关税', 'US announces China tariffs',
       '美国公布 500 亿美元关税清单, 贸易战正式开打, 沪指单日跌逾 3%。', 'The US unveils a $50B tariff list; the trade war begins and Shanghai falls over 3% in a day.'
FROM event_scenarios WHERE code = 'CN_2018_TRADEWAR';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2018-06-19', 'HIGH', '沪指击穿 3000 点', 'SHCOMP breaks 3000',
       '关税升级威胁下沪指跌破 3000 点整数关口, 单日跌 3.8%。', 'Under escalation threats the index knifes through 3000, down 3.8% in a session.'
FROM event_scenarios WHERE code = 'CN_2018_TRADEWAR';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2018-07-06', 'MED', '首批关税正式生效', 'First tariffs take effect',
       '340 亿美元商品关税落地, 靴子落地后市场反而企稳反弹。', 'Tariffs on $34B of goods go live — and with the shoe finally dropped, the market steadies.'
FROM event_scenarios WHERE code = 'CN_2018_TRADEWAR';

INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2020-02-24', 'MED', '疫情恐慌蔓延', 'Pandemic fear goes global',
       '意大利疫情暴发, 道指单日跌千点, 避险情绪全面升温。', 'Italy''s outbreak jolts markets; the Dow sheds a thousand points in a day.'
FROM event_scenarios WHERE code = 'US_2020_COVID';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2020-03-09', 'HIGH', '首次熔断', 'First circuit breaker',
       '油价战叠加疫情, 标普开盘暴跌 7% 触发 1997 年后首次熔断。', 'An oil-price war on top of the pandemic sends the S&P down 7% at the open — the first breaker since 1997.'
FROM event_scenarios WHERE code = 'US_2020_COVID';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2020-03-16', 'HIGH', '一周三次熔断', 'Third breaker in a week',
       '美联储紧急降息至零也没能止住恐慌, 道指单日跌近 13%。', 'Even an emergency cut to zero cannot stem the panic; the Dow drops almost 13% in a day.'
FROM event_scenarios WHERE code = 'US_2020_COVID';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2020-03-23', 'MED', '无限量 QE 救市', 'Unlimited QE announced',
       '美联储宣布无上限量化宽松, 史上最快熊市触底, V 型反转开启。', 'The Fed announces unlimited QE; the fastest bear market ever bottoms and a V-shaped rally begins.'
FROM event_scenarios WHERE code = 'US_2020_COVID';

INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2008-09-15', 'HIGH', '雷曼兄弟破产', 'Lehman Brothers collapses',
       '158 年历史的投行申请破产保护, 全球金融体系信心崩塌。', 'The 158-year-old investment bank files for bankruptcy; confidence in the global financial system shatters.'
FROM event_scenarios WHERE code = 'US_2008_LEHMAN';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2008-09-29', 'HIGH', '救市法案首投被否', 'Bailout bill rejected',
       '7000 亿美元救市法案在众议院被否, 道指单日暴跌 777 点创纪录。', 'The House votes down the $700B bailout; the Dow plunges a record 777 points.'
FROM event_scenarios WHERE code = 'US_2008_LEHMAN';
INSERT INTO event_timeline (scenario_id, event_date, severity, title_zh, title_en, body_zh, body_en)
SELECT id, '2008-10-03', 'MED', 'TARP 救市法案通过', 'TARP signed into law',
       '修订版救市法案获通过, 但市场恐慌仍在蔓延, 十月成为最惨月份之一。', 'The revised bailout passes, yet panic keeps spreading — October becomes one of the worst months on record.'
FROM event_scenarios WHERE code = 'US_2008_LEHMAN';
