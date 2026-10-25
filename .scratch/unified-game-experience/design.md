# 统一游戏体验设计（分析稿，未实施）

日期 2026-10-26。先盘点后设计；原则：优先复用、最小改造、不为统一而统一。

## 0. 现状盘点（两套世界）

| 世界 | 模块 | 行情来源 | 事件来源 | 决策记录 | 结算记录 |
|---|---|---|---|---|---|
| **服务端·真实** | 模拟对局 game / 每日挑战 daily / 好友房间 rooms / 事件回放 event / 回测 lab | `MarketDataService.StockData`（daily_prices，Caffeine 整股缓存） | `news_events` 表（对局内弹新闻）、`event_scenarios`+`event_timeline`（回放揭晓） | `trade_transactions`（价格/数量/费/理由） | `game_sessions` 结算列（SettledColumns 收口：收益/夏普/bias/逐日曲线）→ 积分 → /me/summary 人生净值 |
| **客户端·合成** | K线猜涨跌 guess（均衡引擎逐根生成）/ 盘口闪电战 tape（tick 噪声）/ 策略盲盒 stratbox（四种 regime 生成器）/ 买还是等 buydip（qsGauss） | 本地随机生成 | 无 | 无 | localStorage best + academy XP/badge；唯一服务端触点 = `qsTask("guessWin")` 计今日任务、宝箱积分 |
| **客户端·题库** | 新闻多空 newsjudge / 量化侦探 qdetect | 无 | 各自内置静态题库（与 news_events 完全不通） | 无 | localStorage best |

孤立点：① 三套互不相认的"事件"语料（newsjudge 题库 / news_events / event_scenarios）；② 小游戏成绩不进服务端，人生仪表盘看不见它们；③ 猜涨跌的 K 线是合成的，与对局里的真实行情无血缘。

## 1. 统一行情与事件模型（目标形态）

```
                    ┌──────────────────────────┐
                    │  行情窗口 Provider（已有）  │
                    │  MarketDataService        │
                    │  + BlindDates 脱敏         │
                    └───┬───────┬───────┬──────┘
                        │       │       │
          ┌─────────────┘       │       └────────────┐
          ▼                     ▼                    ▼
   guess 真实模式        game/daily/rooms        event 回放
   (盲抽 30 日窗口)      (20 日连续决策)        (极端场景窗口)
          │                     │                    │
          │             ┌───────┴───────┐            │
          │             ▼               ▼            │
          │        news_events    trade_transactions │
          │        (对局内新闻)         │            │
          ▼             │               ▼            ▼
   newsjudge 真实题  ◄──┘        SettledColumns → /me/summary
   (新闻 + 后N日涨跌)                 (人生净值/胜率/偏差)
```

- **行情**：唯一事实源保持 `MarketDataService.StockData`；小游戏接入时走"盲抽窗口"（随机股票+随机起点+N 日切片，日期经 BlindDates 平移），不另建行情副本。
- **事件**：以 `news_events` 为统一语料主干。newsjudge 新增"实战题"= 真实新闻 + 标的后 N 日实际涨跌为答案；event_scenarios 保持独立（它是"场景"不是"单条新闻"，粒度不同，强并会过度设计）。
- **合成引擎不废除**：tape/stratbox/buydip 的生成器是教学设计（可控的市场脾气），保留；只有 guess 增加"真实历史"可选模式。

## 2. 完整用户旅程

```
预测直觉            事件判断             连续决策                极端压力            复盘成长
guess 猜涨跌  ──►  newsjudge 多空  ──►  game/daily 对局   ──►  event 回放    ──►  bias 档案 + 人生曲线
(30日窗口,          (同一语料的           (同一行情源,            (同一行情源,        (结算记录聚合,
 单根方向)           真实新闻)             新闻事件内嵌)           场景揭晓)           已有 /me/summary)
   │                   │                    │                    │
   └── qsTask ─────────┴──── 今日任务/积分 ──┴──── 结算+积分 ─────┘
```

旅程粘合剂（已存在，复用）：今日任务（guessWin/结算）、积分（signin/settle/chest）、首页仪表盘（最近对局/人生曲线）。缺口 = 小游戏成绩不落服务端（见 §5 二期）。

## 3. 各模块输入/输出/状态/反馈

| 模块 | 输入 | 输出 | 状态机 | 反馈 |
|---|---|---|---|---|
| guess | 看涨/看跌按钮 | score/streak（本地）+ guessWin 任务 | idle→playing→(waiting 揭晓)→playing→settled(10 把) | 揭晓动画、连对加成、XP |
| newsjudge | bull/bear/flat 三选 | 本轮得分（本地 best） | idle→q(1..10)→answered(讲解)→next→settled | 判后讲解（教育点） |
| stratbox | 参数调整+回测(≤5)+regime 猜测 | 猜中与否+得分 | idle→tuning(runs--)→guessed→revealed | 净值/回撤指纹图 |
| game/daily | start 参数、trade(price,shares,reason)、tick、settle | TickResponse/SettleResponse、结算列、积分 | IN_PROGRESS→SETTLED（服务端枚举，唯二状态；强平 liquidated 标记） | 新闻弹窗、AI 对手、结算复盘+bias |
| event | 偏好(市场/难度)、同 game 交易 | 同 game + EventReveal 揭晓 | 同 game；进行中全程 BlindDates 脱敏 | 结算揭晓场景+大事记时间线 |

## 4. 异常场景（现状核查 + 需补点）

| 场景 | 现状 | 结论 |
|---|---|---|
| 中途退出 | 对局：session 持久化 IN_PROGRESS，首页 CTA"继续对局"直达（P1 已做）。小游戏：纯本地状态，刷新即弃局 | 对局已覆盖；小游戏按设计可弃（单局 ≤10 分钟），不补 |
| 重复提交 | settle 二次调用抛"对局已结算"(400)；signin 当日幂等；trade 受 T+1/预算闸（OrderMatching/TradeBudget 有测试钉死） | 已覆盖 |
| 行情缺失 | 结算日行情缺失抛 BusinessException；曲线不可得落 null、summary 回退单点；组合旧流水缺 stock_id 时曲线放弃 | 已覆盖；newsjudge 实战题需新增"新闻后 N 日无行情则题目不入池"（改造点） |
| 结算失败 | REQUIRES_NEW + SettledColumns 回填（bias 被整行回写抹 NULL 的教训已机械化为反射测试）；bias/曲线序列化失败降级 null 不拖垮主流程 | 已覆盖 |
| 游客 | 小游戏全开放；/api/me 受 AuthFilter；游客开局 IP 限频 | 已覆盖 |

## 5. 共享 vs 独立

**共享（已共享，保持）**：MarketDataService 行情、BlindDates 脱敏、FeeCalculator、TradeBudget/OrderMatching、SettledColumns、积分/今日任务、qsChart/qsModal/theme.css 皮肤、t() 双语。

**应新增共享（本方案的改造面）**：
- S1 盲抽行情窗口接口（服务端一个端点，guess 真实模式与未来小游戏共用）；
- S2 news_events 作为 newsjudge 实战题语料（答案由真实后市生成）。

**保持独立（刻意不统一）**：tape/stratbox/buydip 的合成生成器（教学可控性 > 真实性）；qdetect 题库（它考的是方法论不是行情）；event_scenarios 与 news_events 两张表（场景 ≠ 单条新闻）；小游戏状态机各自为政（生命周期 ≤10 分钟，强行抽象是 Speculative Generality）。

## 6. 最小可行改造方案（MVP，两步，每步独立可验收）

**M1 猜涨跌·真实历史模式**（后端 1 端点 + guess 前端一个模式开关）
- 新端点 `GET /api/game/guess-window`：随机已有股票 → 随机起点 → 返回 30+10 根真实 K 线（BlindDates 平移日期、不下发代码/名称）；复用 MarketDataService 缓存，无新表。
- guess 增加"真实历史"开关：开启时从端点取窗口逐根揭晓，关闭保持现有均衡引擎；结算时揭晓真实标的与区间（与 event 同"盲打→揭晓"叙事）。
- 不改积分/任务口径（guessWin 照常上报）。

**M2 新闻多空·实战题池**（后端 1 端点，前端题源扩展）
- 新端点 `GET /api/event/news-quiz`：从 news_events 随机抽 N 条，配"事件日后 5 个交易日涨跌幅"算出 ans（|涨跌|<2% 为 flat）；无后市数据的新闻不入池。
- newsjudge 每轮混入实战题（带"真实事件"徽标），判后讲解附真实走势 mini 图；静态题库保留做教学兜底。

**明确不做（防过度设计）**：统一小游戏框架/基类；小游戏成绩落库新表（留观察，若 M1/M2 后确有跨游戏榜需求再提）；event_scenarios 与 news_events 合并；tape/stratbox/buydip 接真实行情。

## 7. 验收测试

- M1：`GuessWindowTest`（单测：窗口长度=40、日期已平移、不含 code/name；行情不足 40 根的股票不被抽中）；⑥ browse 截图：真实模式开关 + 结算揭晓卡；ui_check/buttons 0 error；`mvn -B test` 全绿。
- M2：`NewsQuizTest`（单测：ans 由后市涨跌正确推导、±2% 边界、无后市新闻被过滤）；newsjudge 一轮含实战题徽标截图；双语键齐全。
- 回归：现有 guess 合成模式行为不变（关开关对拍截图）；今日任务 guessWin 在两种模式下都计数。
