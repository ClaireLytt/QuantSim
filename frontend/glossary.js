// 名词解释: 页面中带 .term 类和 data-term 属性的词, 点击弹出双语释义。
const GLOSSARY = {
  kline: {
    zh: { term: "K 线", def: "一根 K 线记录一天的 4 个价格：开盘价、收盘价、最高价、最低价。本游戏采用 A 股习惯：红色空心 = 上涨，绿色实心 = 下跌。" },
    en: { term: "Candlestick", def: "One candle records four prices for a single day: open, close, high, low. This game follows the Chinese convention: hollow red = up, solid green = down." },
  },
  body: {
    zh: { term: "实体", def: "K 线中间较粗的矩形部分，由开盘价和收盘价围成。实体越长，说明当天买卖双方力量越悬殊。" },
    en: { term: "Body", def: "The thick rectangle of a candle, spanning open to close. A longer body means one side (buyers or sellers) dominated the day." },
  },
  shadow: {
    zh: { term: "影线", def: "实体上下延伸的细线，代表当天冲到过的最高价和最低价。长上影线常意味着冲高回落、上方抛压重。" },
    en: { term: "Shadow (wick)", def: "The thin lines above and below the body, marking the day's high and low. A long upper shadow often means the price spiked up but was pushed back." },
  },
  doji: {
    zh: { term: "十字星", def: "开盘价与收盘价几乎相同的 K 线，形似十字。代表多空力量暂时均衡，出现在趋势末端时常预示变盘。" },
    en: { term: "Doji", def: "A candle where open and close are nearly equal, shaped like a cross. It signals a temporary standoff between buyers and sellers, often hinting at a reversal near trend ends." },
  },
  ma: {
    zh: { term: "均线 (MA)", def: "把最近 N 天的收盘价取平均连成的线。MA5 = 5 日均线（短期趋势），MA20 = 20 日均线（中期趋势）。价格在均线上方通常偏强。" },
    en: { term: "Moving Average (MA)", def: "A line made by averaging the last N closing prices. MA5 = 5-day average (short-term trend), MA20 = 20-day (mid-term). Price above the MA usually means strength." },
  },
  goldencross: {
    zh: { term: "金叉", def: "短期均线（如 MA5）从下往上穿过长期均线（如 MA20），常被视为看涨信号。反之叫死叉。" },
    en: { term: "Golden Cross", def: "The short-term MA (e.g. MA5) crossing above the long-term MA (e.g. MA20) — a classic bullish signal. The opposite is a Death Cross." },
  },
  deathcross: {
    zh: { term: "死叉", def: "短期均线从上往下穿过长期均线，常被视为看跌信号，与金叉相反。" },
    en: { term: "Death Cross", def: "The short-term MA crossing below the long-term MA — a classic bearish signal, the opposite of a Golden Cross." },
  },
  volume: {
    zh: { term: "成交量", def: "当天买卖成交的总数量。放量（成交量明显放大）时的价格变动，通常比缩量时更可信。" },
    en: { term: "Volume", def: "The total quantity traded that day. Price moves on high volume are usually more meaningful than moves on thin volume." },
  },
  pctchange: {
    zh: { term: "涨跌幅", def: "今天收盘价相对昨天收盘价的变动百分比。+3% 表示比昨天涨了 3%。" },
    en: { term: "Daily change", def: "Today's close versus yesterday's close, in percent. +3% means the price rose 3% from yesterday." },
  },
  lot: {
    zh: { term: "一手", def: "A 股的最小交易单位：1 手 = 100 股，买卖数量必须是 100 的整数倍。美股和加密货币按 1 股 / 1 枚起买。" },
    en: { term: "Lot", def: "The minimum trading unit for China A-shares: 1 lot = 100 shares, so quantities must be multiples of 100. US stocks and crypto trade from 1 share / 1 coin." },
  },
  short: {
    zh: { term: "做空", def: "先借入并卖出，等价格下跌后再买回还券赚差价——跌了反而赚钱。本游戏不支持做空。" },
    en: { term: "Short selling", def: "Borrowing and selling first, then buying back cheaper after the price falls — profiting from a decline. Not supported in this game." },
  },
  leverage: {
    zh: { term: "杠杆", def: "借钱放大仓位，收益和亏损同时被放大。10 倍杠杆下跌 10% 就会亏光本金。本游戏不支持杠杆。" },
    en: { term: "Leverage", def: "Borrowing money to amplify a position — gains and losses are both magnified. At 10x leverage, a 10% drop wipes out your capital. Not supported in this game." },
  },
  fullposition: {
    zh: { term: "全仓", def: "把手里全部现金一次性买入，不留余钱。收益最大化的同时风险也最大。" },
    en: { term: "All-in", def: "Spending all available cash on one buy, keeping no reserve. Maximizes both potential gain and risk." },
  },
  clearposition: {
    zh: { term: "清仓", def: "把持有的股票全部卖出，变回现金。" },
    en: { term: "Sell all (liquidate)", def: "Selling every share you hold, converting the position back to cash." },
  },
  holdingcost: {
    zh: { term: "持仓成本", def: "你买入股票的平均价格（多次买入按数量加权平均）。最新价高于成本就是浮盈。" },
    en: { term: "Average cost", def: "The average price you paid per share (weighted across multiple buys). When the last price is above it, you have an unrealized gain." },
  },
  floatingpnl: {
    zh: { term: "浮动盈亏", def: "还没卖出时账面上的赚亏：（最新价 − 持仓成本）× 持仓数量。只有卖出后才落袋为安。" },
    en: { term: "Unrealized P&L", def: "Paper profit or loss on shares you still hold: (last price − average cost) × shares. It only becomes real when you sell." },
  },
  marketvalue: {
    zh: { term: "持仓市值", def: "手里股票按最新价折算的总价值：最新价 × 持仓数量。" },
    en: { term: "Market value", def: "What your shares are worth at the latest price: last price × shares held." },
  },
  returnrate: {
    zh: { term: "收益率", def: "赚亏相对本金的百分比：（总资产 − 初始资金）÷ 初始资金。+10% 表示 10 万本金赚了 1 万。" },
    en: { term: "Return", def: "Profit or loss as a percentage of starting capital: (total assets − starting cash) ÷ starting cash. +10% means a 100k stake earned 10k." },
  },
  confidence: {
    zh: { term: "置信度", def: "AI 模型对自己预测的把握程度。60% 置信度看涨 ≈「涨的可能性稍大」，绝不是保证——预测股价本质上高度不确定。" },
    en: { term: "Confidence", def: "How sure the AI model is about its own forecast. 60% confidence in a rise means \"slightly more likely up than down\" — never a guarantee. Price prediction is inherently uncertain." },
  },
  backtest: {
    zh: { term: "回测", def: "把一个交易策略放到历史行情上模拟运行，看它过去会赚多少、亏多少。回测好不代表未来一定好。" },
    en: { term: "Backtest", def: "Simulating a trading strategy on historical prices to see how it would have performed. Good backtest results do not guarantee future profits." },
  },
  sharpe: {
    zh: { term: "夏普比率", def: "衡量「每承担一份波动风险，换来多少收益」。同样赚 20%，波动小的策略夏普更高、体验更好。一般 >1 算优秀。" },
    en: { term: "Sharpe ratio", def: "Return earned per unit of volatility (risk). Two strategies both earning 20%: the smoother one has the higher Sharpe. Above 1 is generally considered good." },
  },
  drawdown: {
    zh: { term: "最大回撤", def: "资金曲线从最高点跌到最低点的最大跌幅，衡量「最坏情况下会亏掉多少」。-30% 回撤意味着资产曾从峰值缩水三成。" },
    en: { term: "Max drawdown", def: "The largest peak-to-trough drop of your equity curve — the worst-case loss along the way. A -30% drawdown means assets once shrank 30% from their peak." },
  },
  winrate: {
    zh: { term: "胜率", def: "完整的「买入→卖出」回合中，赚钱回合所占的比例。胜率高不等于赚得多——还要看单次盈亏的大小。" },
    en: { term: "Win rate", def: "The fraction of complete buy-then-sell round trips that made money. A high win rate doesn't guarantee high profit — the size of wins vs losses matters too." },
  },
  annual: {
    zh: { term: "年化收益", def: "把一段时间的收益按复利折算成「一年能赚多少」，方便不同时长的策略互相比较。" },
    en: { term: "Annualized return", def: "The return converted to a per-year rate (with compounding), so strategies tested over different periods can be compared fairly." },
  },
  momentum: {
    zh: { term: "动量", def: "「强者恒强」的思路：最近在涨的标的倾向继续涨。动量策略追涨杀跌，赌趋势的延续。" },
    en: { term: "Momentum", def: "The idea that recent winners tend to keep winning. Momentum strategies buy strength and sell weakness, betting the trend continues." },
  },
  meanreversion: {
    zh: { term: "均值回归", def: "「涨多必跌、跌多必涨」的思路：价格大幅偏离均线后，倾向回到均线附近。适合震荡行情，单边趋势中会持续吃亏。" },
    en: { term: "Mean reversion", def: "The idea that prices stretched far from their average tend to snap back. Works in range-bound markets; loses repeatedly in strong one-way trends." },
  },
  buyhold: {
    zh: { term: "买入持有", def: "第一天全仓买入，然后什么都不做拿到最后。它是衡量主动交易的基准：折腾一通还跑不赢它，不如不折腾。" },
    en: { term: "Buy & hold", def: "Buy everything on day one and simply hold to the end. It's the benchmark for active trading: if your trading can't beat it, the trading added no value." },
  },
  overfit: {
    zh: { term: "过拟合", def: "对着历史数据反复调参，把「噪声」当成了「规律」。回测收益极高但参数稍改就崩的策略，多半是过拟合，实盘会失效。" },
    en: { term: "Overfitting", def: "Tuning parameters until they fit the noise in historical data rather than a real pattern. A strategy with stellar backtests that collapses when parameters change slightly is likely overfit." },
  },
  equitycurve: {
    zh: { term: "资金曲线", def: "账户总资产随时间变化的曲线。曲线越平稳向上越好；深深的凹坑就是回撤。" },
    en: { term: "Equity curve", def: "Your total assets plotted over time. Smooth and rising is ideal; deep dips are drawdowns." },
  },
  bull: {
    zh: { term: "牛市", def: "持续上涨、赚钱效应扩散的市场阶段。当身边人人都在谈论股票时，牛市往往已进入后半场。" },
    en: { term: "Bull market", def: "A prolonged rising market where making money looks easy. When everyone around you is talking stocks, the bull is usually in its late innings." },
  },
  bear: {
    zh: { term: "熊市", def: "持续下跌的市场阶段，反弹一个比一个弱。熊市里活下来比赚钱重要。" },
    en: { term: "Bear market", def: "A prolonged falling market where every bounce is weaker than the last. In a bear, survival beats profit." },
  },
  mainwave: {
    zh: { term: "主升浪", def: "一轮牛市中涨得最快、最猛的主体阶段，成交量和情绪同时到达顶峰。吃到主升浪是趋势交易者的核心目标。" },
    en: { term: "Main wave", def: "The steepest, most powerful leg of a bull run, where volume and euphoria peak together. Riding it is the core goal of trend traders." },
  },
  escapetop: {
    zh: { term: "逃顶", def: "在行情见顶崩盘前卖出离场。没人能精确卖在最高点——目标是卖在「顶部区域」，把大部分利润带走。" },
    en: { term: "Escaping the top", def: "Selling out before the peak collapses. Nobody nails the exact high — the goal is to sell somewhere in the top zone and keep most of the gain." },
  },
  otcfinancing: {
    zh: { term: "场外配资", def: "绕开券商监管、向民间渠道借钱炒股的高杠杆融资，杠杆可达 5~10 倍。它是 2015 年疯牛的燃料，也是崩盘时的加速器。" },
    en: { term: "OTC financing", def: "High-leverage stock loans arranged outside regulated brokers, often 5-10x. It fueled China's 2015 mania — and accelerated the crash." },
  },
  limitband: {
    zh: { term: "涨跌停", def: "A 股单日涨跌幅限制（一般 ±10%）。跌停封死时想卖也卖不掉，「千股跌停」就是恐慌的顶点。" },
    en: { term: "Limit up/down", def: "China A-shares cap daily moves (usually ±10%). At limit-down you can't sell even if you want to — 'a thousand stocks limit-down' marks peak panic." },
  },
  dipbuy: {
    zh: { term: "抄底", def: "在大跌后买入、赌价格已经见底。底部远比想象中难抄——「不要接飞刀」说的就是它。" },
    en: { term: "Bottom fishing", def: "Buying after a big fall, betting the bottom is in. Bottoms are far harder to call than they look — hence 'don't catch a falling knife'." },
  },
  chase: {
    zh: { term: "追高", def: "在价格急涨后忍不住买入，常常正好买在短期顶部。急拉之后等回调，是对抗追高冲动的基本纪律。" },
    en: { term: "Chasing", def: "Buying right after a sharp spike — often exactly at the short-term top. Waiting for the pullback is the basic discipline against it." },
  },
  squeeze: {
    zh: { term: "轧空", def: "股价被推高迫使做空者亏损平仓（买回股票），而买回本身又进一步推高股价的连锁反应。" },
    en: { term: "Short squeeze", def: "A rising price forces short sellers to buy back at a loss — and that buying pushes the price even higher, in a self-feeding loop." },
  },
  blowup: {
    zh: { term: "爆仓", def: "亏损吃穿保证金，仓位被强制清算、本金归零（极端时还会倒欠）。杠杆越高，离爆仓越近。" },
    en: { term: "Blow up (liquidation)", def: "Losses eat through your margin and the position is force-closed — capital wiped out (or worse). The higher the leverage, the closer the edge." },
  },
  forceclose: {
    zh: { term: "强制平仓", def: "保证金不足或跌破平仓线时，券商不问价格强行卖出你的仓位。强平盘不计成本，常常越卖越跌。" },
    en: { term: "Forced liquidation", def: "When margin runs out or a threshold breaks, the broker sells your position at any price. Forced selling ignores cost — and often begets more selling." },
  },
  pledge: {
    zh: { term: "股权质押", def: "大股东把持股抵押给券商借钱。股价跌破平仓线时质押股会被强制卖出，可能引发「下跌→强平→再下跌」的连锁螺旋。" },
    en: { term: "Share pledge", def: "A major shareholder pawns shares to a broker for loans. If the price breaks the liquidation line, the pledged shares get force-sold — risking a fall/liquidate/fall spiral." },
  },
  pullback: {
    zh: { term: "回调", def: "上涨趋势中的短暂下跌休整。健康的回调不破坏趋势；跌破关键均线的「回调」要警惕是反转。" },
    en: { term: "Pullback", def: "A brief dip inside an uptrend. A healthy pullback leaves the trend intact; one that breaks key MAs may be a reversal in disguise." },
  },
  stoploss: {
    zh: { term: "止损", def: "亏到预先设定的幅度就果断卖出，防止小亏变大亏。止损是交易里最重要的纪律，永远不丢人。" },
    en: { term: "Stop loss", def: "Selling decisively once a preset loss is hit, so small losses never become big ones. The most important discipline in trading — never shameful." },
  },
  insidertrading: {
    zh: { term: "内幕交易", def: "利用未公开的重大信息买卖证券，认定要件是「知悉消息 + 利用消息交易」。属于违法行为，罚没、市场禁入甚至刑责。" },
    en: { term: "Insider trading", def: "Trading on material non-public information. The test is 'knew it AND traded on it' — illegal, with fines, market bans and even criminal liability." },
  },
  circuitbreaker: {
    zh: { term: "熔断", def: "指数单日跌幅触及阈值时全市场暂停交易的机制，目的是给恐慌降温。2020 年 3 月美股十天内触发四次，极为罕见。" },
    en: { term: "Circuit breaker", def: "A market-wide trading halt triggered when an index falls past a threshold, meant to cool panic. US stocks tripped it four times in ten days in March 2020 — vanishingly rare." },
  },
  bubble: {
    zh: { term: "泡沫", def: "价格远超真实价值、靠情绪和资金堆起来的行情。「市梦率」是泡沫期的黑话——不看盈利看梦想。泡沫破裂通常是漫长阴跌而非 V 型反弹。" },
    en: { term: "Bubble", def: "Prices propped far above real value by emotion and inflowing money. 'Price-to-dream' was the mania-era joke — valuing dreams, not earnings. Burst bubbles usually grind down for years rather than V back up." },
  },
  subprime: {
    zh: { term: "次贷危机", def: "2007-2008 年由美国低信用房贷(次级贷款)违约引发的全球金融危机，雷曼兄弟倒闭是标志性事件，全球股市近乎腰斩。" },
    en: { term: "Subprime crisis", def: "The 2007-08 global financial crisis sparked by defaults on low-quality US mortgages. Lehman Brothers' collapse was its defining moment; world markets were nearly halved." },
  },
  rattrading: {
    zh: { term: "老鼠仓", def: "基金经理等管理人先用自己控制的账户潜伏买入，再动用客户资金拉升，让自己先赚钱的违法行为。本质是偷基民的收益。" },
    en: { term: "Rat trading (front-running)", def: "A fund manager secretly buys with a personal or proxy account first, then deploys client money to push the price up. Illegal — it steals returns that belong to investors." },
  },
  manipulation: {
    zh: { term: "坐庄", def: "用大量资金和账户控制一只股票的价格：低位吸筹、对倒拉升、诱人接盘、高位出货。即操纵股价，证券市场最重的违法行为之一。" },
    en: { term: "Market manipulation", def: "Controlling a stock's price with massed money and accounts: quiet accumulation, wash-traded ramps, luring buyers, unloading at the top. One of the gravest market crimes." },
  },
  washtrade: {
    zh: { term: "对倒", def: "同一控制人的账户之间自买自卖，制造成交活跃、价格上涨的假象。是坐庄拉抬股价的核心手法。" },
    en: { term: "Wash trading", def: "Accounts under one controller trading with each other to fake volume and rising prices — the core mechanic of a pump." },
  },
  lhb: {
    zh: { term: "龙虎榜", def: "交易所每日公布的异动股票买卖前五席位名单。同一营业部反复霸榜买一卖一，往往是坐庄资金的指纹。" },
    en: { term: "Top-trader list", def: "The exchange's daily disclosure of the top five buying and selling branches in unusual movers. One branch dominating both sides is often a manipulator's fingerprint." },
  },
  qe: {
    zh: { term: "量化宽松", def: "央行大规模购买资产向市场注入流动性，俗称「放水」。2008 年后和 2020 年 3 月的无限量宽松，都直接扭转了股市走势。" },
    en: { term: "Quantitative easing", def: "Central banks buying assets at scale to flood markets with liquidity. Post-2008 QE and the unlimited version of March 2020 both directly reversed the stock market's direction." },
  },
  programtrading: {
    zh: { term: "程序化交易", def: "由计算机按预设规则自动下单的交易方式。1987 年黑色星期一的元凶之一：止损程序互相触发，把下跌放大成单日 22.6% 的崩盘。" },
    en: { term: "Program trading", def: "Orders placed automatically by computers following preset rules. A prime culprit of Black Monday 1987: stop-loss programs triggered each other, amplifying a dip into a 22.6% one-day crash." },
  },
  magnet: {
    zh: { term: "磁吸效应", def: "价格越接近涨跌停或熔断阈值，交易者越抢着提前出手，反而把价格更快推向阈值——像被磁铁吸过去。2016 年 A股熔断七天夭折的核心原因。" },
    en: { term: "Magnet effect", def: "The closer price gets to a limit or halt threshold, the harder traders rush to act first — dragging price into the threshold like a magnet. The core reason China's 2016 circuit breaker died in seven days." },
  },
  vshape: {
    zh: { term: "V 型反转", def: "暴跌后几乎不作停留、以同样陡的斜率涨回去的走势。2020 年 3 月是教科书案例——但它是例外，不是规律。" },
    en: { term: "V-shaped recovery", def: "A crash that reverses almost immediately and climbs back just as steeply. March 2020 is the textbook case — but it's the exception, not the rule." },
  },
  fraud: {
    zh: { term: "财务造假", def: "上市公司虚构收入、利润或资产骗过投资者和审计。识别信号：存贷双高、离奇减值（「扇贝跑了」）、审计机构突然辞任、大股东高比例质押。" },
    en: { term: "Financial fraud", def: "A listed company fabricating revenue, profit or assets to deceive investors and auditors. Red flags: high cash alongside high debt, bizarre write-downs ('the scallops swam away'), sudden auditor resignations, heavy shareholder pledging." },
  },
  highdepositloan: {
    zh: { term: "存贷双高", def: "账上「货币资金」很多，却同时借着高息债——真有钱的公司不会去借高利贷。这是识别虚构现金类财务造假最经典的信号。" },
    en: { term: "High cash, high debt", def: "Huge 'cash' balances on the books alongside expensive borrowing — a truly cash-rich company doesn't take out payday loans. The classic red flag for fabricated cash." },
  },
  impairment: {
    zh: { term: "资产减值", def: "资产价值缩水时在报表上计提损失。正常经营会有，但「精准」出现在需要洗掉窟窿的年份、且金额离奇的减值（存货说没就没），往往是造假的橡皮擦。" },
    en: { term: "Impairment", def: "A write-down booked when an asset loses value. Normal in business — but write-downs that land 'precisely' in years a hole needs hiding, with inventory that simply vanishes, are often fraud's eraser." },
  },
  tunneling: {
    zh: { term: "掏空上市公司", def: "大股东通过关联交易、违规担保、资金占用等手段把上市公司的钱转进自己口袋，留给中小股东一个空壳。" },
    en: { term: "Tunneling", def: "A controlling shareholder siphoning the listed company's money into their own pocket via related-party deals, illegal guarantees or fund appropriation — leaving minority holders an empty shell." },
  },
  pigbutchering: {
    zh: { term: "杀猪盘", def: "网络交易诈骗：先社交软件养熟（养猪），假平台小额让利骗信任（喂猪），等你重仓后无法提现、平台跑路（杀猪）。凡是「稳赚」「导师带单」「加群下软件」都是它。" },
    en: { term: "Pig butchering", def: "An online trading scam: befriend the target ('raise the pig'), let them win small on a fake platform ('fatten'), then freeze withdrawals and vanish once they're all-in ('butcher'). 'Guaranteed profit', 'guru-led trades', 'join the group to install the app' — all tells." },
  },
  fatfinger: {
    zh: { term: "乌龙指", def: "交易员或程序错误地打出远超本意的订单。著名案例：2013 年光大证券套利系统失控，2 秒打出 234 亿买单，大盘瞬间拉升——乌龙本身是事故，但公告前反向对冲被认定为内幕交易。" },
    en: { term: "Fat finger", def: "A trader or program firing an order far beyond what was intended. Famous case: Everbright Securities 2013 — a rogue arbitrage system bought 23.4 billion yuan in 2 seconds. The error was an accident; hedging it before disclosure was ruled insider trading." },
  },
  hedge: {
    zh: { term: "对冲", def: "建立一笔与现有持仓方向相反的交易来抵消风险，比如持有大量股票时卖空股指期货。本身是正常的风险管理——但利用未公开的重大信息对冲，就是内幕交易。" },
    en: { term: "Hedge", def: "An offsetting trade in the opposite direction of an existing position — e.g., shorting index futures against a large stock book. Normal risk management — unless it trades on undisclosed material information, which makes it insider trading." },
  },
  ponzi: {
    zh: { term: "庞氏骗局", def: "收益不来自资产，而来自下一个投资人本金的骗局——借新还旧，直到新钱进不来的那天崩盘。识别三信号：保本保息、看不见底层资产、只进不出的资金池。" },
    en: { term: "Ponzi scheme", def: "A scam whose 'returns' come not from assets but from the next investor's principal — new money pays old interest until inflows stop and it collapses. Three tells: guaranteed returns, invisible underlying assets, a one-way cash pool." },
  },
  fundpool: {
    zh: { term: "资金池", def: "把所有投资人的钱混在一个池子里、不与具体资产一一对应的运作方式。钱进了池子就说不清去向，是庞氏骗局和挪用资金的温床。正规产品要求资金托管、专款专用。" },
    en: { term: "Cash pool", def: "Mixing all investors' money in one pool with no mapping to specific assets. Once inside, the money's path is untraceable — the breeding ground of Ponzi schemes and misappropriation. Legitimate products require custodian banks and earmarked funds." },
  },
  selffinance: {
    zh: { term: "自融", def: "平台名义上撮合借贷，实际借款方是平台老板自己注册的壳公司——投资人的钱转一圈流回设局者口袋。P2P 爆雷案的标准配方。" },
    en: { term: "Self-dealing", def: "A platform that nominally matches lenders and borrowers, where the 'borrowers' are shell companies its own boss registered — investor money loops straight back to the architect. The standard recipe of P2P blowups." },
  },
  fakeplatform: {
    zh: { term: "虚假交易平台", def: "根本没接入真实市场的诈骗软件——K线由后台随意「画」出来，你的盈亏只是数据库里的数字，充值的钱早已被转走。真正的券商软件在应用商店下载，不需要谁发链接给你。" },
    en: { term: "Fake trading platform", def: "Scam software connected to no real market — the candles are 'painted' by a back office, your P&L is just a database number, and your deposits are long gone. Real broker apps live in app stores; nobody needs to send you a link." },
  },
  heavyposition: {
    zh: { term: "重仓", def: "把大部分资金押在一只标的上（通常指仓位超过五成）。拿对了收益惊人，拿错了亏损同样惊人——重仓的底气必须来自足够深的研究。" },
    en: { term: "Heavy position", def: "Putting most of your capital into a single asset (often over half the account). Spectacular when right, brutal when wrong — a heavy position must be earned by deep research." },
  },
  addposition: {
    zh: { term: "补仓", def: "股价下跌后追加买入，拉低平均持仓成本。用得好是从容布局，用不好是「越跌越买、越买越亏」的无底洞。补仓前先问一句：当初买入的逻辑还成立吗？" },
    en: { term: "Averaging down", def: "Buying more after the price falls to lower your average cost. Done well it's planned accumulation; done badly it's a bottomless pit. Before adding, ask: is the original thesis still intact?" },
  },
  memestock: {
    zh: { term: "妖股", def: "短期暴涨、走势完全脱离基本面的股票，背后常有游资炒作和跟风盘。涨起来像坐火箭，崩下来毫无征兆——最后赚到钱的永远只是先跑的少数人。" },
    en: { term: "Meme stock", def: "A stock rocketing far beyond its fundamentals, driven by hot money and crowd mania. It moons like a rocket and collapses without warning — only the early leavers keep the profit." },
  },
  financialreport: {
    zh: { term: "财报", def: "上市公司定期披露的财务报告（年报、季报），包含营收、利润、现金流和资产负债。基本面分析的第一手材料——最关键的细节往往藏在附注里。" },
    en: { term: "Financial statements", def: "The periodic reports (annual / quarterly) a listed company must publish: revenue, profit, cash flow and balance sheet. The raw material of fundamental analysis — the juiciest details hide in the footnotes." },
  },
  valuation: {
    zh: { term: "估值", def: "判断一家公司「值多少钱」，常用市盈率（股价÷每股盈利）、市净率等指标。估值要和同行、和公司自己的历史比着看，孤立的数字没有意义。" },
    en: { term: "Valuation", def: "Judging what a company is actually worth, using ratios like P/E (price ÷ earnings per share) or P/B. A ratio only means something compared with peers and the company's own history." },
  },
  gutfeel: {
    zh: { term: "盘感", def: "长年看盘积累出的直觉判断。它真实存在但极难验证——可能是经验的结晶，也可能只是幸存者偏差。把盘感当决策依据之前，先用数据验证它。" },
    en: { term: "Gut feel", def: "Intuition built from years of watching the tape. Real but hard to verify — it may be distilled experience, or just survivorship bias. Test it against data before trading on it." },
  },
  takeprofit: {
    zh: { term: "止盈", def: "涨到预设目标后主动卖出、锁定利润，是止损的镜像。「分批止盈」= 分几次卖出，既落袋为安，又保留继续上涨的仓位。" },
    en: { term: "Take profit", def: "Selling to lock in gains once a preset target is hit — the mirror of a stop loss. Selling in tranches banks some profit while keeping upside exposure." },
  },
  compounding: {
    zh: { term: "复利", def: "收益再投入、利滚利的雪球效应。年化 10% 复利 30 年，本金翻约 17 倍。复利的关键是「别中断」——一次大亏会毁掉多年的积累。" },
    en: { term: "Compounding", def: "The snowball of returns earning returns: 10% a year compounds to roughly 17x in 30 years. The key is never breaking the chain — one big loss destroys years of growth." },
  },
  watchposition: {
    zh: { term: "观察仓", def: "先用很小的仓位买入，目的不是赚钱，而是逼自己认真跟踪这只标的。逻辑得到确认后再逐步加仓。" },
    en: { term: "Tracker position", def: "A deliberately tiny starter position, bought not to profit but to force yourself to follow the stock seriously. Size up only after the thesis is confirmed." },
  },
  assetallocation: {
    zh: { term: "资产配置", def: "把钱按比例分散到股票、债券、现金等不同资产类别。研究表明，配置比例对长期收益的影响远大于「选中哪只股票」。" },
    en: { term: "Asset allocation", def: "Splitting money across asset classes — stocks, bonds, cash. Research shows the split drives long-term results far more than which single stock you pick." },
  },
  indexfund: {
    zh: { term: "指数基金", def: "被动复制某个指数（如沪深 300、标普 500）的基金：费率低，不依赖基金经理的水平。长期看，多数主动基金跑不赢指数。" },
    en: { term: "Index fund", def: "A fund that passively tracks an index (CSI 300, S&P 500), with low fees and no reliance on a star manager. Over the long run most active funds fail to beat it." },
  },
  dca: {
    zh: { term: "定投", def: "定期定额买入（比如每月发工资买 1000 元指数基金），不猜高低点。下跌时同样的钱买到更多份额，自动摊低成本——用纪律代替择时。" },
    en: { term: "Dollar-cost averaging (DCA)", def: "Investing a fixed amount on a fixed schedule regardless of price. Dips buy you more shares, averaging your cost down automatically — discipline instead of market timing." },
  },
  positionsizing: {
    zh: { term: "仓位管理", def: "决定每笔交易投多少钱的一整套规则：单笔风险上限、总仓位上限、加减仓节奏。老手常说：怎么买，比买什么更重要。" },
    en: { term: "Position sizing", def: "The rules deciding how much money each trade gets: max risk per trade, max total exposure, when to add or trim. Veterans say how much you buy matters more than what you buy." },
  },
  diversification: {
    zh: { term: "分散配置", def: "不把鸡蛋放进一个篮子：持有多只相关性低的资产，任何一只暴雷都伤不到根本。注意：买 10 只同板块的股票不叫分散。" },
    en: { term: "Diversification", def: "Not putting all eggs in one basket: holding several low-correlation assets so no single blowup can sink you. Note: ten stocks in the same sector is not diversification." },
  },
  correlation: {
    zh: { term: "相关性", def: "两个资产同涨同跌的程度，从 -1 到 +1。分散配置的效果全看相关性：两只走势几乎一样的股票，买两只等于只买了一只。" },
    en: { term: "Correlation", def: "How much two assets move together, from -1 to +1. Diversification only works when correlation is low — two stocks that move identically are effectively one holding." },
  },
  rotation: {
    zh: { term: "热点轮动", def: "市场资金在不同板块之间快速切换炒作：今天新能源、明天 AI。追着热点跑常常两头挨打——买在热度顶点，卖在下一个热点启动之前。" },
    en: { term: "Sector rotation", def: "Hot money hopping between themes — new energy today, AI tomorrow. Chasers often get hit both ways: buying at peak hype, selling just before the next theme ignites." },
  },
  mrmarket: {
    zh: { term: "市场先生", def: "格雷厄姆的经典比喻：市场像个情绪化的合伙人，每天报出忽高忽低的价格。你可以利用他的报价占便宜，但绝不该被他的情绪牵着走。" },
    en: { term: "Mr. Market", def: "Ben Graham's classic metaphor: the market is a moody business partner quoting wild prices every day. Use his quotes when they favor you — never let his mood dictate yours." },
  },
  fee: {
    zh: { term: "手续费", def: "每次买卖都要付给券商和交易所的费用。单笔看着很小，交易越频繁磨损越大——频繁换手的人，往往是在给券商打工。" },
    en: { term: "Trading fees", def: "What brokers and exchanges charge on every trade. Tiny per trade, but frequent trading grinds profit away like sandpaper — hyperactive traders often work for their broker." },
  },
  review: {
    zh: { term: "复盘", def: "交易结束后回看全过程：为什么买、为什么卖、哪里做对哪里做错。赚钱的单子也要复盘——靠运气赚的钱，迟早会凭实力亏回去。" },
    en: { term: "Trade review", def: "Replaying a finished trade: why you entered, why you exited, what went right or wrong. Review winners too — money won by luck is eventually lost by skill." },
  },
  halve: {
    zh: { term: "腰斩", def: "股价跌去一半的俗称。腰斩之后想回本，需要再涨 100%——跌 50% 和涨 50% 从来不是对称的。" },
    en: { term: "Halved", def: "Slang for a price cut in half. Breaking even after a halving takes a +100% rally — a 50% fall and a 50% rise are never symmetric." },
  },
  fundamentals: {
    zh: { term: "基本面", def: "一家公司真实的经营状况：盈利、增长、竞争力、行业空间。基本面决定长期价格，情绪决定短期价格——没有基本面支撑的暴涨，跌回去只是时间问题。" },
    en: { term: "Fundamentals", def: "The real business behind the ticker: earnings, growth, competitiveness, market size. Fundamentals set long-term prices; emotion sets short-term ones. A spike with no fundamentals behind it is a countdown." },
  },
  unload: {
    zh: { term: "出货", def: "大资金把手里的筹码悄悄卖给追涨的散户。拉升常常是为出货服务的——当一波反弹「专门给你上车机会」时，多半是别人在下车。" },
    en: { term: "Unloading (distribution)", def: "Big money quietly selling its shares to late chasers. Ramps often exist to serve the exit — when a bounce seems designed to let you in, someone is usually getting out." },
  },
  deadcat: {
    zh: { term: "死猫跳", def: "暴跌后短暂而无力的反弹——死猫从足够高的楼坠下也会弹一下。特征：幅度小、缩量、很快创新低。把死猫跳当反转去抄底，是熊市里最贵的错觉。" },
    en: { term: "Dead-cat bounce", def: "A brief, feeble rally after a crash — even a dead cat bounces if dropped from high enough. Small, low-volume, quickly undercut. Mistaking it for the reversal is the most expensive illusion in a bear market." },
  },
  bulltrap: {
    zh: { term: "诱多", def: "走势做出向上突破的假象，引诱看涨的人进场，随后反手向下。识别要点：突破没有成交量配合、涨上去守不住。反过来骗空头的叫诱空。" },
    en: { term: "Bull trap", def: "A fake upside breakout that lures buyers in before reversing down. Tells: no volume behind the breakout, gains that can't hold. The mirror image, trapping shorts, is a bear trap." },
  },
  valueinvesting: {
    zh: { term: "价值投资", def: "以低于内在价值的价格买入好公司并长期持有，赚企业成长的钱而不是博弈的钱。注意：价值投资不等于死拿不放——买贵了的好公司，也可能让你等上十年。" },
    en: { term: "Value investing", def: "Buying good companies below intrinsic value and holding long term — earning the business's growth, not the crowd's mood. Note: it is not 'never sell'. Overpaying for a great company can still cost you a decade." },
  },
  stablecoin: {
    zh: { term: "稳定币", def: "宣称与美元等资产 1:1 锚定的加密货币。有真实美元储备支撑的相对可靠；靠算法「左脚踩右脚」维持锚定的，挤兑一来就会归零——LUNA 就是教材。" },
    en: { term: "Stablecoin", def: "A cryptocurrency claiming a 1:1 peg to the dollar. Ones backed by real reserves are relatively sound; algorithmic ones that bootstrap their own peg collapse to zero under a run — LUNA is the textbook case." },
  },
  peg: {
    zh: { term: "联系汇率", def: "把本币汇率固定在某个外币上的制度（如港币锚定美元）。守住它需要用真金白银的外汇储备接下所有卖盘——1997 年的香港就打过这样一仗。" },
    en: { term: "Currency peg", def: "Fixing your currency's rate to another (like the HK dollar to the US dollar). Defending it means absorbing every wave of selling with hard reserves — Hong Kong fought exactly that battle in 1997." },
  },
  ratehike: {
    zh: { term: "加息", def: "央行提高基准利率，钱变贵了：贷款成本上升、存款更有吸引力，股市里的资金被抽走——加息周期往往压制股市估值。" },
    en: { term: "Rate hike", def: "The central bank raising its policy rate — money gets more expensive: loans cost more, deposits pay more, cash drains out of stocks. Hiking cycles tend to compress valuations." },
  },
  chips: {
    zh: { term: "筹码", def: "交易者对「手里持有的股票」的俗称，借自赌桌。「带血的筹码」= 恐慌者亏本抛出的股票；「筹码集中」= 股票集中到了少数人手里。" },
    en: { term: "Chips", def: "Trader slang for the shares you hold, borrowed from the casino table. 'Bloody chips' are shares dumped at a loss by the panicked; concentrated chips mean few hands hold the float." },
  },
  cutloss: {
    zh: { term: "割肉", def: "亏损状态下忍痛卖出的俗称——像从自己身上割肉一样疼。按计划割肉是止损，恐慌中乱割肉是送钱：区别只在有没有事先的计划。" },
    en: { term: "Cutting losses", def: "Slang for selling at a loss — it hurts like cutting your own flesh. Done per plan it's a stop loss; done in panic it's a donation. The plan is the whole difference." },
  },
  bankrun: {
    zh: { term: "挤兑", def: "所有人同时要求取回资金。任何「短借长投」的机构都扛不住挤兑——银行如此，交易所和稳定币更是如此，而且链上挤兑是光速的。" },
    en: { term: "Bank run", def: "Everyone demanding their money back at once. No institution that borrows short and invests long survives one — banks, exchanges and stablecoins alike. On-chain runs move at light speed." },
  },
  retail: {
    zh: { term: "散户", def: "用自有小额资金交易的个人投资者，与机构（基金、保险、外资）相对。散户的劣势是信息和纪律，优势是船小好调头——本游戏里的你，就是一位散户。" },
    en: { term: "Retail investor", def: "An individual trading their own modest capital, as opposed to institutions (funds, insurers). Retail's weakness is information and discipline; its edge is agility. In this game, that's you." },
  },
  goldenpit: {
    zh: { term: "黄金坑", def: "恐慌性抛售砸出的深坑，事后回看是绝佳买点。注意「事后」二字——身在坑里的人，永远分不清这是黄金坑，还是无底洞的上半段。" },
    en: { term: "Golden pit", def: "A deep hole dug by panic selling that, in hindsight, was a great entry. Mind the word 'hindsight' — from inside the hole you can never tell a golden pit from the top half of an abyss." },
  },
  propup: {
    zh: { term: "护盘", def: "大资金（国家队、银行家、大股东）主动买入以托住下跌的价格。护盘能延缓恐慌，但护不住趋势——1929 年银行家护盘只换来一次死猫跳。" },
    en: { term: "Propping up", def: "Big money (state funds, bankers, major owners) buying to hold up a falling price. It can slow panic but cannot hold back a trend — the 1929 bankers' pool bought only a dead-cat bounce." },
  },
  delist: {
    zh: { term: "退市", def: "股票被终止上市、从交易所摘牌，可能因为造假、持续亏损或私有化。对普通持有人来说退市几乎等于归零——「跌到退市」是持股最坏的结局之一。" },
    en: { term: "Delisting", def: "A stock removed from the exchange — for fraud, chronic losses or privatization. For an ordinary holder it's close to a total loss; 'falling until delisted' is one of the worst endings a position can have." },
  },
};

// ---------- 术语自动标注 ----------
// 文本中出现的已知术语自动包成可点击的 .term span; 长词优先, 避免"千股跌停"只匹配到"跌停"
const TERM_WORDS = [
  ["场外配资", "otcfinancing"], ["配资", "otcfinancing"],
  ["买入持有", "buyhold"], ["buy & hold", "buyhold"], ["buy and hold", "buyhold"],
  ["均值回归", "meanreversion"], ["mean-reversion", "meanreversion"], ["mean reversion", "meanreversion"],
  ["最大回撤", "drawdown"], ["回撤", "drawdown"], ["max drawdown", "drawdown"], ["drawdown", "drawdown"],
  ["内幕交易", "insidertrading"], ["insider trading", "insidertrading"],
  ["强制平仓", "forceclose"], ["强平", "forceclose"], ["平仓线", "forceclose"], ["forced liquidation", "forceclose"], ["force-sold", "forceclose"], ["liquidation line", "forceclose"],
  ["股权质押", "pledge"], ["质押", "pledge"], ["pledged", "pledge"], ["pledge", "pledge"],
  ["千股跌停", "limitband"], ["涨跌停", "limitband"], ["跌停", "limitband"], ["涨停", "limitband"], ["limit-down", "limitband"], ["limit-up", "limitband"], ["limit bands", "limitband"],
  ["主升浪", "mainwave"], ["main wave", "mainwave"],
  ["资金曲线", "equitycurve"], ["equity curve", "equitycurve"],
  ["夏普比率", "sharpe"], ["sharpe", "sharpe"],
  ["涨跌幅", "pctchange"], ["pct change", "pctchange"],
  ["年化收益", "annual"], ["annualized", "annual"],
  ["过拟合", "overfit"], ["overfitting", "overfit"], ["overfit", "overfit"],
  ["十字星", "doji"], ["doji", "doji"],
  ["成交量", "volume"], ["放量", "volume"],
  ["收益率", "returnrate"],
  ["金叉", "goldencross"], ["golden cross", "goldencross"],
  ["死叉", "deathcross"], ["death cross", "deathcross"],
  ["均线", "ma"], ["MA5", "ma"], ["MA20", "ma"], ["moving average", "ma"],
  ["牛市", "bull"], ["bull market", "bull"], ["bull", "bull"],
  ["熊市", "bear"], ["bear market", "bear"],
  ["逃顶", "escapetop"], ["escape the top", "escapetop"],
  ["抄底", "dipbuy"], ["catch the knife", "dipbuy"], ["bottom fishing", "dipbuy"],
  ["追高", "chase"], ["chasing", "chase"],
  ["轧空", "squeeze"], ["short squeeze", "squeeze"], ["squeeze", "squeeze"],
  ["爆仓", "blowup"],
  ["回调", "pullback"], ["pullback", "pullback"],
  ["止损", "stoploss"], ["stop-loss", "stoploss"], ["stop loss", "stoploss"], ["stopping out", "stoploss"],
  ["做空", "short"], ["short sellers", "short"], ["short selling", "short"],
  ["杠杆", "leverage"], ["leveraged", "leverage"], ["leverage", "leverage"],
  ["全仓", "fullposition"], ["满仓", "fullposition"], ["all-in", "fullposition"],
  ["清仓", "clearposition"],
  ["浮盈", "floatingpnl"], ["浮动盈亏", "floatingpnl"], ["unrealized", "floatingpnl"],
  ["持仓成本", "holdingcost"],
  ["动量", "momentum"], ["momentum", "momentum"],
  ["回测", "backtest"], ["backtest", "backtest"],
  ["胜率", "winrate"], ["win rate", "winrate"],
  ["置信度", "confidence"],
  ["K 线", "kline"], ["K线", "kline"], ["candlestick", "kline"],
  ["熔断", "circuitbreaker"], ["circuit breaker", "circuitbreaker"], ["circuit breakers", "circuitbreaker"],
  ["市梦率", "bubble"], ["泡沫", "bubble"], ["price-to-dream", "bubble"], ["bubble", "bubble"],
  ["次贷危机", "subprime"], ["次贷", "subprime"], ["subprime", "subprime"],
  ["老鼠仓", "rattrading"], ["rat trading", "rattrading"],
  ["坐庄", "manipulation"], ["操纵股价", "manipulation"], ["price manipulation", "manipulation"],
  ["对倒", "washtrade"], ["wash trading", "washtrade"], ["wash-trading", "washtrade"], ["wash-traded", "washtrade"],
  ["龙虎榜", "lhb"], ["top-trader list", "lhb"],
  ["量化宽松", "qe"], ["quantitative easing", "qe"],
  ["V 型反转", "vshape"], ["V型反转", "vshape"], ["V-shaped recovery", "vshape"],
  ["程序化交易", "programtrading"], ["program trading", "programtrading"], ["program-trading", "programtrading"],
  ["磁吸效应", "magnet"], ["magnet effect", "magnet"],
  ["财务造假", "fraud"], ["financial fraud", "fraud"],
  ["存贷双高", "highdepositloan"], ["high cash, high debt", "highdepositloan"], ["cash-rich-yet-borrowing", "highdepositloan"],
  ["资产减值", "impairment"], ["减值", "impairment"], ["write-down", "impairment"], ["write-downs", "impairment"], ["impairment", "impairment"],
  ["掏空上市公司", "tunneling"], ["掏空", "tunneling"], ["资金占用", "tunneling"], ["违规担保", "tunneling"], ["tunneling", "tunneling"],
  ["杀猪盘", "pigbutchering"], ["pig butchering", "pigbutchering"], ["pig-butchering", "pigbutchering"],
  ["虚假交易平台", "fakeplatform"], ["假盘", "fakeplatform"], ["fake trading platform", "fakeplatform"],
  ["乌龙指", "fatfinger"], ["fat finger", "fatfinger"], ["fat-finger", "fatfinger"],
  ["对冲", "hedge"], ["hedge", "hedge"], ["hedging", "hedge"], ["hedged", "hedge"],
  ["庞氏骗局", "ponzi"], ["ponzi scheme", "ponzi"], ["ponzi", "ponzi"],
  ["资金池", "fundpool"], ["cash pool", "fundpool"],
  ["自融", "selffinance"], ["self-dealing", "selffinance"], ["借新还旧", "ponzi"], ["new-for-old", "ponzi"],
  ["重仓", "heavyposition"], ["heavy position", "heavyposition"],
  ["补仓", "addposition"], ["averaging down", "addposition"],
  ["止损线", "stoploss"], ["stop losses", "stoploss"],
  ["妖股", "memestock"], ["meme stock", "memestock"],
  ["财报附注", "financialreport"], ["财报", "financialreport"], ["financial statements", "financialreport"], ["financials", "financialreport"], ["footnotes", "financialreport"],
  ["估值", "valuation"], ["valuation", "valuation"],
  ["盘感", "gutfeel"], ["gut feel", "gutfeel"],
  ["止盈", "takeprofit"], ["take profits", "takeprofit"], ["take profit", "takeprofit"],
  ["复利", "compounding"], ["compounding", "compounding"],
  ["观察仓", "watchposition"], ["tracker position", "watchposition"],
  ["资产配置", "assetallocation"], ["asset allocation", "assetallocation"],
  ["指数基金", "indexfund"], ["index funds", "indexfund"], ["index fund", "indexfund"],
  ["定投", "dca"], ["DCA", "dca"], ["dollar-cost averaging", "dca"],
  ["仓位管理", "positionsizing"], ["position sizing", "positionsizing"],
  ["分散配置", "diversification"], ["diversification", "diversification"],
  ["相关性", "correlation"], ["correlation", "correlation"],
  ["热点轮动", "rotation"], ["sector rotation", "rotation"],
  ["市场先生", "mrmarket"], ["Mr. Market", "mrmarket"],
  ["手续费", "fee"], ["fees", "fee"],
  ["复盘", "review"],
  ["追涨", "chase"],
  ["梭哈", "fullposition"], ["YOLO", "fullposition"],
  ["均线交叉", "goldencross"], ["MA crossover", "goldencross"],
  ["长期持有", "buyhold"], ["long-term holding", "buyhold"],
  ["动量策略", "momentum"],
  ["catching knives", "dipbuy"], ["bottom-fishing", "dipbuy"], ["buy the dip", "dipbuy"],
  ["腰斩", "halve"], ["halved", "halve"], ["halving", "halve"], ["cut in half", "halve"],
  ["基本面", "fundamentals"], ["fundamentals", "fundamentals"],
  ["出货", "unload"], ["unloading", "unload"],
  ["死猫跳", "deadcat"], ["dead-cat bounce", "deadcat"], ["dead cat bounce", "deadcat"],
  ["诱多", "bulltrap"], ["bull trap", "bulltrap"],
  ["价值投资", "valueinvesting"], ["value investing", "valueinvesting"], ["value investors", "valueinvesting"],
  ["稳定币", "stablecoin"], ["stablecoins", "stablecoin"], ["stablecoin", "stablecoin"],
  ["联系汇率", "peg"], ["固定汇率", "peg"], ["currency peg", "peg"], ["peg", "peg"],
  ["加息", "ratehike"], ["rate hike", "ratehike"],
  ["筹码", "chips"], ["chips", "chips"],
  ["割肉", "cutloss"],
  ["挤兑", "bankrun"], ["bank run", "bankrun"],
  ["散户", "retail"], ["retail traders", "retail"], ["retail investors", "retail"], ["retail", "retail"],
  ["黄金坑", "goldenpit"], ["golden pit", "goldenpit"],
  ["护盘", "propup"],
  ["退市", "delist"], ["delisted", "delist"], ["delisting", "delist"],
  ["市盈率", "valuation"], ["P/E", "valuation"],
  ["接飞刀", "dipbuy"], ["falling knife", "dipbuy"], ["dip-buy", "dipbuy"],
  ["放水", "qe"], ["QE", "qe"],
  ["止损单", "stoploss"], ["stop orders", "stoploss"], ["stop order", "stoploss"],
  ["空头", "short"], ["shorting", "short"], ["shorts", "short"],
  ["清算", "forceclose"], ["liquidated", "forceclose"], ["liquidations", "forceclose"],
  ["moving averages", "ma"], ["60 日线", "ma"], ["60-day MA", "ma"],
  ["带量", "volume"],
];

const TERM_LOOKUP = {};
TERM_WORDS.forEach(([word, key]) => { TERM_LOOKUP[word.toLowerCase()] = key; });

const TERM_REGEX = new RegExp(
  TERM_WORDS
    .map(([word]) => word)
    .sort((a, b) => b.length - a.length)
    .map((word) => {
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 英文词加边界, 避免匹配到单词内部; 中文无词边界概念
      return /^[\x00-\x7f]/.test(word) ? "\\b" + esc + "\\b" : esc;
    })
    .join("|"),
  "gi"
);

function linkifyTerms(text) {
  const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe.replace(TERM_REGEX, (m) => {
    const key = TERM_LOOKUP[m.toLowerCase()];
    return key ? `<span class="term" data-term="${key}">${m}</span>` : m;
  });
}

// 生成可点击的名词 span (用于动态 innerHTML)
function termSpan(key, text) {
  const entry = GLOSSARY[key];
  const label = text ?? (entry ? pick(entry).term : key);
  return `<span class="term" data-term="${key}">${label}</span>`;
}

const termPop = document.createElement("div");
termPop.id = "term-pop";
termPop.hidden = true;
document.body.appendChild(termPop);

function showTermPop(el) {
  const entry = GLOSSARY[el.dataset.term];
  if (!entry) return;
  const item = pick(entry);
  termPop.innerHTML = "";
  const h = document.createElement("h4");
  h.textContent = item.term;
  const p = document.createElement("p");
  p.textContent = item.def;
  termPop.append(h, p);
  termPop.hidden = false;
  // 先渲染取尺寸, 再定位并防止溢出视口
  const rect = el.getBoundingClientRect();
  const pw = termPop.offsetWidth;
  const ph = termPop.offsetHeight;
  let left = rect.left;
  if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
  let top = rect.bottom + 8;
  if (top + ph > window.innerHeight - 12) top = rect.top - ph - 8;
  termPop.style.left = Math.max(12, left) + "px";
  termPop.style.top = Math.max(12, top) + "px";
}

function hideTermPop() {
  termPop.hidden = true;
}

document.addEventListener("click", (e) => {
  const term = e.target.closest(".term");
  if (term && term.dataset.term && GLOSSARY[term.dataset.term]) {
    showTermPop(term);
  } else if (!e.target.closest("#term-pop")) {
    hideTermPop();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideTermPop();
});
window.addEventListener("resize", hideTermPop);
