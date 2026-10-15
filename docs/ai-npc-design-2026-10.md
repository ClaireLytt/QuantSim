# QuantSim 多风格 AI 交易 NPC 设计方案（2026-10）

> 设计文档，不含实现。基于现状：`GameAiService`（单对手、按 `probUp` 调仓）、`AiLevel`（EASY/NORMAL/HARD/HELL ↔ 预测模型）、`BlindDates` 双重脱敏、房间单 `aiLevel` 字段。目标是把"难度档 = 换个预测模型"升级为"性格 × 难度"的二维 NPC 体系。

---

## 0. 总体结构

```
AiPersona (性格: 交易规则 + 风控规则 + 情绪参数)   ← 新增维度
    ×
AiLevel (难度: 信息质量 + 纪律性 + 噪声水平)        ← 复用现有枚举
    ↓
AiTrader = persona.decide(可见信息) → AiDecision { 方向, 数量, 理由键, 理由参数 }
    ↓
GameAiService 门面: 撮合(沿用 aiBuy/aiSell 同费同价) + 落库理由
```

关键原则：
- **AI 与玩家同一信息面、同一交易规则**（收盘价成交、整手、扣费、封板限制）——现有代码已做到，新 persona 不得突破（见 §5 防作弊）。
- persona 是**无状态纯函数 + session 上少量持久字段**（情绪值、持仓成本、冷却计数），与 `GameAiService` 现有"只改 session 字段、调用方事务落库"的约定一致。
- 每个决策产出**理由键 + 参数**而非中文文案，走 `i18n.js` 双语渲染（站点承诺中英切换）。

---

## 1. 五类 AI 性格（交易规则 / 风控 / 情绪参数）

每个 persona 的决策输入统一为 `AiContext`：当日已揭示 K 线（OHLC/量）、截至当日的指标（MA5/MA20/波动率，来自 `DailyIndicator`）、当日预测 `probUp`（按难度档对应模型）、自身持仓与成本、情绪状态。**无未来数据**。

通用记号：`pos` = 持仓市值/净值（仓位比例），`cost` = 持仓加权成本，`ret` = (close-cost)/cost。

### 1.1 稳健价值型 VALUE（"稳健王"，由现 NORMAL 行为演化）

| 项 | 规则 |
|---|---|
| 入场 | `probUp ≥ 0.55` 且 `close < MA20 × (1 - discountPct)`（只买"打折"），分 3 批建仓，每批 ≤ 净值 25% |
| 加仓 | 已持仓且 `ret ≤ -addOnDropPct`（越跌越买），最多加 2 次 |
| 出场 | `ret ≥ takeProfitPct` 减半仓；`probUp ≤ 0.40` 清仓 |
| 风控 | 最大仓位 75%；换手抑制：调仓额 < 净值 15% 按兵不动（沿用现有 NORMAL 规则）；单日最多 1 笔 |
| 情绪 | `patience`（耐心）高：连续 N 天不满足条件也不动。恐慌阈值高：回撤 >20% 才触发减仓 |

参数基线：`discountPct=0.03, addOnDropPct=0.08, takeProfitPct=0.25, maxPos=0.75`。

### 1.2 追涨短线型 CHASER（"追板侠"）

| 项 | 规则 |
|---|---|
| 入场 | 当日涨幅 ≥ `chaseTriggerPct`（如 3%）且放量（量 > 5 日均量 × 1.5）→ 次日以挂单市价追入（一次打满 `maxPos`） |
| 出场 | 持有 ≤ `holdDays`（2~3 天）必走；`ret ≥ quickProfitPct`（5%）止盈；`ret ≤ -stopLossPct`（3%）止损——止损铁律，优先级最高 |
| 风控 | 单票仓位可到 90%（激进），但止损极严；被打止损后冷却 `cooldownDays` 天不进场 |
| 情绪 | `fomo` 参数：连续踏空 2 天后 `chaseTriggerPct` 自动下调（更冲动）；连续止损 2 次后 `cooldownDays` 翻倍（被打怕了） |

参数基线：`chaseTriggerPct=0.03, holdDays=3, quickProfitPct=0.05, stopLossPct=0.03, cooldownDays=2`。

### 1.3 动量趋势型 MOMENTUM（"量化狂魔"，由现 HARD 行为演化）

| 项 | 规则 |
|---|---|
| 入场/持有 | MA5 上穿 MA20 金叉 → 建仓；`close > MA5` 持有并随 `probUp` 置信度加码（沿用现有 `(probUp-0.5)/0.15` 目标仓位 + MA5 ±0.04 修正） |
| 出场 | MA5 下穿 MA20 死叉 → 清仓；`close < MA5` 连续 2 日 → 减半 |
| 风控 | 波动率目标：当日波动率（指标表）> `volCap` 时目标仓位 × 0.5；移动止损 = 持仓期最高价 × (1 - trailPct) |
| 情绪 | 几乎无情绪（纪律型）：`discipline=1.0`，是教学里"系统化交易"的对照组 |

参数基线：`volCap=0.04, trailPct=0.10`。

### 1.4 逆势抄底型 CONTRARIAN（"逆行者"）

| 项 | 规则 |
|---|---|
| 入场 | 从近 20 日高点回撤 ≥ `dipPct`（10%）且当日止跌（close ≥ open）→ 建 1/3 仓；每再跌 `stepPct`（5%）补 1/3 |
| 出场 | 反弹至回撤一半（斐波那契 0.5 位近似）→ 清仓；不贪顶 |
| 风控 | 总共最多 3 批（金字塔封顶）；`probUp < 0.35` 时视为"接飞刀"禁止补仓；满仓后回撤再扩 10% 强制砍半（认错线） |
| 情绪 | `conviction`（执念）：补仓后亏损越深越不想卖——用它做**反面教材**，HELL 难度把执念调低（会认错），EASY 调高（死扛给玩家看后果） |

参数基线：`dipPct=0.10, stepPct=0.05, maxBatches=3`。

### 1.5 高频短线型 SCALPER（"抢帽子"）

> 注意：本项目是日线粒度，没有盘中 tick，"高频"落地为**日内挂单策略**——它是唯一主要靠挂单（`OrderService` 次日 OHLC 撮合）而非收盘价直接成交的 persona，顺带给玩家演示挂单系统玩法。

| 项 | 规则 |
|---|---|
| 入场 | 每日同时挂低买单（昨收 × (1 - gridPct)）与高卖单（昨收 × (1 + gridPct)），网格来回吃波动 |
| 出场 | 持仓天数无上限但单笔目标利润就是 `gridPct`；日终撤销未成交单重挂 |
| 风控 | 单笔 ≤ 净值 20%；总仓位 ≤ 60%；波动率 < `minVol` 时停摆（没波动没肉吃）；连续 3 日单边下跌暂停低买（防趋势碾压网格） |
| 情绪 | `greed`：连续成交获利后 `gridPct` 收窄（更贪更频繁）；被单边行情套住后 `gridPct` 放宽 |

参数基线：`gridPct=0.02, minVol=0.015`。

### 情绪参数统一模型

每个 persona 持有情绪向量 `{confidence, fear, greed}` ∈ [0,1]，初值由性格决定，按日更新：

```
confidence += 盈利日 ? +0.05 : -0.08   （亏损打击大于盈利提振——行为金融损失厌恶）
fear       = f(当前回撤)               （回撤线性映射）
greed      = f(连胜天数)
```

情绪只**调制参数**（阈值、仓位上限、冷却天数），不直接产生交易——保证行为仍可解释："因连续亏损信心下降，本次只建半仓"。所有情绪状态存 session 的 AI 状态 JSON 列（见 §7 落地），不引入内存态（多实例安全）。

---

## 2. 难度分级（与性格正交）

复用 `AiLevel` 四档，难度只控制三件事，对所有 persona 一致：

| 难度 | 预测模型（信息质量） | 纪律性 discipline | 决策噪声 |
|---|---|---|---|
| EASY | LOGISTIC（弱） | 0.6：30% 概率忽略自己的风控规则（会犯错） | 阈值 ±0.05 随机抖动 |
| NORMAL | FOREST | 0.8：15% 概率违纪 | ±0.03 |
| HARD | BOOST | 0.95 | ±0.01 |
| HELL | MLP（最强） | 1.0：铁律执行 | 0 |

- **弱 AI 的"弱"= 信息差 + 不守纪律 + 手抖**，不是随机买卖——新手局里 EASY 的 CHASER 仍然在追涨，只是经常忘了止损，这本身是教学素材（结算复盘可指出"AI 因未止损回吐利润"）。
- 噪声用**按 session + 交易日种子化的确定性伪随机**（如 `hash(sessionId, tradeDate)`），保证同一对局回放/复盘结果可复现，也便于集成测试锁定行为（现有测试锁定 EASY/HELL 的约定延续）。
- 现有 EASY 全进全出、NORMAL 低换手、HARD 动量修正、HELL 置信调仓的行为分别收编为 `VALUE×EASY 的违纪表现`、`VALUE 基线`、`MOMENTUM 基线`、`MOMENTUM×HELL`——集成测试按此映射迁移，不破坏既有对局口径。

---

## 3. 行为可解释：交易理由

每笔 AI 成交（含挂单成交）落一条理由，结构化存储：

```json
{ "reasonKey": "ai.reason.momentum.golden_cross",
  "params": { "ma5": 12.34, "ma20": 12.01, "targetPos": "60%" },
  "emotionNote": "ai.emotion.confident" }
```

- **理由键全集预定义**（每 persona 约 6~10 个：入场/加仓/减仓/止盈/止损/违纪/观望），在 `i18n.js` 登记双语文案，模板插值只插数字/枚举（符合现有 XSS 纪律：`textContent` + 只插数字）。
- 复用现有玩家交易的 `reason` 管道：`TradeEngine.execute` 已接受 reason 参数，AI 成交同样写入 `TradeTransaction.reason`（存 reasonKey+params 的 JSON，前端翻译渲染）。
- **展示时机防剧透**：进行中对局只显示"AI 今日有操作"与方向（现状已通过 `aiTradeShares` 下发）；**理由全文在结算复盘时统一揭晓**（与 `SettleResponse` 揭晓标的同步）——否则 HELL AI 的理由（"MLP 置信 0.78"）等于免费外挂信号。EASY 局可选即时显示（教学模式，开局参数控制）。
- 结算复盘页新增"AI 操盘日志"时间线：每笔交易 + 理由 + 当时情绪，与现有 `GameBenchmarks` 复盘并列，作为学习参考。

---

## 4. 参数设计汇总

新增 `AiPersona` 枚举 + 每 persona 一组默认参数（代码常量起步，不急于进库/配置化——保持简单，调参需求出现再提升为 `GameProperties`）：

```
persona 维度: 入场阈值 / 出场阈值 / 仓位上限 / 分批数 / 止损线 / 冷却天数 / 情绪初值
难度维度:    预测模型 / discipline / 噪声幅度        （GameProperties 已有 aiBuy/SellThreshold 收编进 EASY）
```

命名建议沿用现有"性格绰号"文案体系（稳健王/量化狂魔已有），新增：追板侠（CHASER）、逆行者（CONTRARIAN）、抢帽子（SCALPER），由 `PublicNames` 风格生成展示名。

---

## 5. 防作弊机制（AI 不得获取未公开信息）

现有架构的护城河 + 新增约束：

1. **信息面白名单**：`AiContext` 构造器是唯一入口，只接受 `sd.bar(≤currentTradeDate)`、`sd.indicators(≤currentTradeDate)`、`pred(currentTradeDate)`——**按日期上界切片**，persona 代码拿不到 `StockData` 原始对象。代码评审红线：persona 实现 import `MarketDataService.StockData` 即 reject（可在 `pr_guard.py` RULES 登记为新反面模式）。
2. **当日 OHLC 使用限制**：AI 与玩家同权——手动价=收盘价、其他价位走次日撮合挂单（高危教训 #5 已封死 `[low,high]` 套利，AI 侧同样只允许 close 成交或挂单，SCALPER 的网格单走 `OrderService` 次日 OHLC 撮合，无上帝视角）。
3. **预测 ≠ 未来**：`DailyPrediction` 是用历史训练的模型输出，本身不含未来泄漏（`train_predictor.py` 滚动窗口保证）；AI 只能读当日预测，禁止读 `tradeDate > currentTradeDate` 的预测行。
4. **竞技局脱敏对 AI 同样生效**：AI 决策输入走与玩家相同的 `BlindDates` 平移后窗口即可（AI 只看相对序列，不需要真实日期）；AI 理由文案不得含真实 `tradeDate`/股票名（reasonKey 参数里只放价格/比例/均线值——新增字段时按高危教训 #4 过一遍"能否反推窗口或标的"）。
5. **封板/T+1 同规则**：沿用现有 `limitBandError` 检查；CHASER 的"次日追入"天然满足 T+1。
6. **可审计性**：种子化噪声 + 全量理由落库 = 任何一局 AI 行为可离线复放验证，榜单争议可查。

---

## 6. AI 调度机制（匹配不足自动填充）

现状：房间（`RoomService`）本质是"各玩家 vs 同一配置 AI"的平行对局，没有真正的等人匹配，所以调度聚焦**开局即配齐陪练阵容**：

1. **开局填充**：房间创建时除难度外新增可选 `aiPersonas`（默认按难度自动配队）：
   - 新手局（EASY/NORMAL）：VALUE + MOMENTUM 各一（风格差异大、行为稳、教学性强）；
   - 高阶局（HARD/HELL）：MOMENTUM + CHASER + CONTRARIAN（互相对抗，行情不同阶段轮流领跑，榜单更有看头）。
2. **数据结构**：单 AI 的 `aiCash/aiShares/aiModel` 三字段扩展为一张 `game_ai_trader` 子表（session_id, persona, level, cash, shares, state_json, 每行一个 NPC），`GameSession` 旧三字段保留给存量单 AI 对局读路径，新局全走子表（Flyway 新增 `V{n}__game_ai_trader.sql`，不改旧文件，金额列 DECIMAL 不用 CHAR）。
3. **tick 内调度**：`GameService.tick` 事务里顺序遍历该局全部 AiTrader 调 `applyAiTrade`（AI 间互不影响对方成交——无订单簿，都按收盘价/挂单撮合，天然无串谋问题）；单局 AI 数量上限 4，防 tick 事务变慢。
4. **快速开局**：填充是同步的（AI 开局零成本：插几行子表），无等待队列；若未来做真人匹配，超时 `N` 秒未凑满 → 空位按上表补 AI，已是本方案的自然扩展。
5. **退场/接管**：玩家中途退房不影响 AI（各自平行对局）；AI 不退场、不接管真人仓位（保持简单）。
6. **榜单身份**：AI 成绩进房间内排名（展示绰号 + 🤖 标识），**不进全站排行榜**（防止 HELL AI 霸榜挤掉真人）。

---

## 7. 落地切分建议（供排期，未经批准不动手）

| 批次 | 内容 | 验证 |
|---|---|---|
| 1 | `AiPersona` 枚举 + `AiContext` 信息切片 + 现有 4 档行为收编映射（纯重构，行为不变） | `mvn -B test`（现有 EASY/HELL 锁定测试不改） |
| 2 | VALUE/MOMENTUM 完整实现 + 难度三参数（discipline/噪声/模型） + 种子化随机 | 新增 persona 单测（给定行情序列断言决策） |
| 3 | 理由落库 + 结算复盘"AI 操盘日志" + i18n 键 | `ui_check.py` + `npm run buttons` |
| 4 | CHASER/CONTRARIAN/SCALPER + 情绪模型 | persona 单测 + `npm run smoke` |
| 5 | `game_ai_trader` 子表 + 多 AI 调度 + 房间配队 | 集成测试 + 迁移 validate |

依赖顺序：1 → 2 → {3,4} → 5。批次 1~2 不动前端，风险最低。
