# QuantSim 可观测性埋点目录 · 2026-10（针对本轮 13 bug 故障场景）

> 现状：无 APM，只有 `/actuator/health` + 文件日志。因此埋点以**结构化日志事件**为主，用统一的
> `evt=<事件名>` 键便于 grep / 日志平台聚合告警；前端点用**轻量 beacon 或 console 结构化日志**。
> 每条标注：埋点名称、触发时机、上报字段、告警阈值、**落点（已存在/待加 + 代码位置）**。

## 约定
- 后端日志统一前缀：`evt=<name> k1=v1 k2=v2`，级别按严重度（WARN/ERROR 触发告警，INFO 供统计）。
- **严禁上报敏感明文**：用户名统一上报**脱敏后**的值或 `userId`（非邮箱明文）。
- 前端 beacon 当前无专用上报端点——**建议轻量化**：要么复用一个 `POST /api/metrics/beacon`（需新增，
  低优先），要么前端 `console.warn("evt=...")` 让运行时冒烟/爬虫与浏览器日志采集捕获。本文件前端点
  默认后者，标 `[FE]`。

---

## 一、榜单查询埋点

### E1 `evt=board_query`
- **触发时机**：每次公开榜查询返回时（收益/夏普 `LeaderboardService.topSessions`、每日
  `DailyChallengeService.leaderboard`、竞技场/擂台 `BacktestService`）。
- **上报字段**：`board`（leaderboard/sharpe/points/arena/duel/daily）、`season`、`returned`（过滤后返回条数）、
  `limit`（请求的 TOP N）、`cost_ms`。
- **告警阈值**：
  - **榜单空窗哨兵（关键）**：`returned=0` 但当季已结算对局数 > 0 → **立即告警**（捕获"过滤误杀全部"，本轮 #1 的回归信号）。
  - `cost_ms > 100`（p95）→ 慢查询预警。
- **落点**：待加（5 处 `.toList()` 前后包一层计数日志）。INFO 级，空窗判定在日志平台做。

---

## 二、房间结算埋点

### E2 `evt=room_settle_member`
- **触发时机**：房间到期强结循环内，每个成员 `settleIsolated` 成功 / 失败各上报一次
  （`RoomService.evaluateTransitions`）。
- **上报字段**：`roomCode`、`sessionId`、`result`（ok/failed）、`reason`（失败时的异常消息）。
- **告警阈值**：`result=failed` 频次 5 分钟内 > 5 → 告警（可能是行情数据缺失批量问题）。
- **落点**：失败分支 **已有 WARN**（`RoomService.java:264`，本轮 M-2 已加）；成功分支待加 INFO 计数。

### E3 `evt=room_settle_rollback`
- **触发时机**：`settleIsolated`（REQUIRES_NEW）独立事务回滚时——即单成员结算失败触发本事务回滚。
- **上报字段**：`sessionId`、`roomCode`、`cause`。
- **告警阈值**：出现即计数；**配合日志关键字 `UnexpectedRollbackException` / `rollback-only` 阈值 >0**
  （若这两个关键字出现，说明 REQUIRES_NEW 隔离有遗漏路径，本轮 #3 的哨兵）。
- **落点**：E2 失败分支即隐含此事件；额外**日志平台直接盯 `UnexpectedRollbackException` 关键字**。

---

## 三、用户脱敏埋点

### E4 `evt=mask_leak` `[FE]`
- **触发时机**：前端渲染任一公开榜时，若某行 `username` 含 `@` 但**不含 `***`**（疑似未脱敏邮箱漏网）。
- **上报字段**：`board`、`rowIndex`（**不上报用户名明文**，只报位置）。
- **告警阈值**：出现即告警——直接捕获"后端脱敏遗漏某个榜"。
- **落点**：待加（榜单渲染函数里加一个廉价校验 beacon；也可做成后端自检：`PublicNames.mask` 输出后断言）。
- **补充 E4b `evt=self_mark_missing` `[FE]`**：已登录且本人有上榜记录，但 `rows.find(r=>r.isSelf)` 为空
  （isSelf 标记缺失，本轮 #2 的回归信号）。字段 `board`；出现即告警。

---

## 四、并发注册埋点

### E5 `evt=register_conflict`
- **触发时机**：注册撞唯一键被转为 400 时（`AuthService.register` 的 catch 分支，`AuthService.java:47`）。
- **上报字段**：`reason`（dup_username）、`sameNameRate`（可选，窗口内同名冲突频次）。
- **告警阈值**：短时间（1 分钟）同名冲突 > 20 → 可能是攻击/刷注册，非正常并发。
- **落点**：待加 INFO（catch 块里加一行）；**同时日志平台盯 `/api/auth/register` 的 5xx——本轮修复后应为 0**，
  出现 500 即回归信号。

---

## 五、行情除零埋点

### E6 `evt=zero_price_guard`
- **触发时机**：零价防护命中时——`TradeMath.maxWholeShares`（`price.signum()<=0`，第 18 行）、
  `GameAiService`（`close.signum()<=0`，第 46 行）。
- **上报字段**：`where`（trademath/ai）、`stockId`（若可得）、`tradeDate`。
- **告警阈值**：出现即告警——**零价防护命中 = 上游有脏行情数据**（防护只是止血，根因在数据管道）。
- **落点**：待加。注意 `TradeMath` 是**静态工具类无 logger**——建议让**调用方**（FeeCalculator/
  BacktestEngine/GameAiService）在拿到 0 股返回或命中守卫时上报，避免给工具类塞日志依赖。
- **配套数据质量指标**：管道入库后 `SELECT COUNT(*) FROM daily_price WHERE close<=0` > 0 告警（源头）。

---

## 六、每日一猜状态埋点 `[FE]`

### E7 `evt=daily_guess_state`
- **触发时机**：每日一猜状态变更——`start`（开局落当天标记）、`finish`（完成更新得分）、
  `blocked`（点击时已玩被拒）（`academy.js` 的 startDaily/finishDaily）。
- **上报字段**：`action`（start/finish/blocked）、`localDate`（客户端 todayStr）、`score`（finish 时）。
- **告警阈值**：
  - 同一会话短时间内多次 `start` 成功（绕过"已玩"）→ 可能是本地防刷被绕（客户端改钟，见混沌 C8）。
  - `blocked` 占比异常高 → 可能有 UX 问题（用户以为能重开）。
- **落点**：待加 `[FE]` beacon/console。**注意**：每日一猜是纯前端 localStorage 防刷，埋点只能观测
  客户端行为，不具服务端强约束——仅作趋势参考。

---

## 埋点汇总表

| 埋点 | 层 | 触发 | 关键字段 | 告警阈值 | 状态 |
|---|---|---|---|---|---|
| E1 board_query | BE | 榜单返回 | board/returned/limit/cost_ms | returned=0 且有数据 / cost_ms>100 | 待加 |
| E2 room_settle_member | BE | 单成员强结 | result/reason | failed 频次 >5/5min | 失败已有WARN，成功待加 |
| E3 room_settle_rollback | BE | 独立事务回滚 | sessionId/cause | `UnexpectedRollbackException`>0 | 关键字已可盯 |
| E4 mask_leak | FE | 疑似未脱敏行 | board/rowIndex | 出现即告警 | 待加 |
| E4b self_mark_missing | FE | isSelf 缺失 | board | 出现即告警 | 待加 |
| E5 register_conflict | BE | 注册撞唯一键 | reason/rate | 同名>20/min；5xx>0 | 待加 |
| E6 zero_price_guard | BE | 零价守卫命中 | where/stockId | 出现即告警 | 待加 |
| E7 daily_guess_state | FE | 每日一猜状态变更 | action/localDate | 多次 start 成功 | 待加 |

## 日志关键字告警（无需改代码，立即可配）

> 以下直接对现有日志配，是最快的哨兵（与 `docs/release-acceptance.md` 第四节一致）：

- `UnexpectedRollbackException` / `rollback-only` —— **>0 即告警**（E3，房间事务隔离哨兵）
- `Deadlock found when trying to get lock` —— 并发死锁（本轮修的 daily，及潜在路径）
- `Connection is not available` / `HikariPool.*timeout` —— 连接池耗尽（REQUIRES_NEW 占用放大）
- `[room] 成员对局 .* 强制结算失败` —— E2 失败（已埋）
- `服务器内部错误` + path —— 兜底 500，重点盯 `/api/rooms/*`、`/api/auth/register`、`/api/daily/start`

---

**落地优先级**：① 先配"日志关键字告警"（零改代码，立即生效）；② 加 E1 榜单空窗哨兵 + E6 零价守卫
（后端小改，直接对准本轮最该防的两类事故）；③ 其余 E2 成功计数 / E4/E5/E7 随迭代补齐。
**实现约束**：所有埋点**不落用户名明文**（只报脱敏值或 userId）；前端 beacon 无端点前先用 console
结构化日志过渡，别为埋点先造一套上报基础设施。
