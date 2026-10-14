# QuantSim API 变更文档 · 2026-10

> 本仓库未集成 OpenAPI/springdoc，本文件为**受本轮修复影响的接口片段 + 变更日志**，
> 可作为接口契约的权威描述并入团队 API 文档。涉及 4 处契约变更，详见末尾变更日志。

## 通用错误响应约定

所有业务错误统一由 `GlobalExceptionHandler` 转为下述信封，**调用方应按 HTTP status 分支，不要解析
`message` 文案**（文案可能随版本/语言调整）：

```json
{ "success": false, "message": "人类可读的提示（仅用于展示，不用于逻辑判断）" }
```

| HTTP Status | 触发 | 对应异常 |
|---|---|---|
| `400 Bad Request` | 业务规则拒绝 / 参数校验失败 / 请求体格式错误 | `BusinessException` / 校验失败 |
| `401 Unauthorized` | 未登录访问受保护接口（`/api/me`、`/api/rooms`、`/api/daily`、`/api/event`） | AuthFilter |
| `404 Not Found` | 资源不存在 / 无权访问（不泄露存在性） | `NotFoundException` |
| `500 Internal Server Error` | 未预期的服务端异常（**不应在正常业务流中出现**） | 兜底 |

---

## 1. `GET /api/leaderboard` — 收益 / 夏普榜

**Query**：`season`（可选，`YYYY-MM`，缺省当季）、`sort`（可选，`sharpe` 走夏普榜，缺省收益榜）

**200 响应**：`LeaderboardEntry[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `sessionId` | integer | 对局 ID |
| `username` | string | 玩家名，**邮箱形态已脱敏**（`cl***@163.com`）；测试账号已在服务端排除 |
| `stockName` / `stockCode` | string | 标的名 / 代码 |
| `startDate` | string(date) | 对局起始日 |
| `returnRate` | number | 收益率（4 位小数） |
| `sharpe` | number \| **null** | 夏普比率，波动为 0 或旧记录时为 `null`（展示需兜底 `--`） |
| **`isSelf`** | **boolean** | **🆕 当前登录用户本人的记录为 `true`**。用户名脱敏后前端无法按名字识别自己，身份判断一律用此字段。游客请求恒 `false`。 |

```json
[
  { "sessionId": 42, "username": "cl***@163.com", "stockName": "美的集团",
    "stockCode": "000333", "startDate": "2025-02-25", "returnRate": 0.0256,
    "sharpe": 0.1653, "isSelf": true },
  { "sessionId": 41, "username": "量化小王", "stockName": "贵州茅台",
    "stockCode": "600519", "startDate": "2025-01-10", "returnRate": 0.0102,
    "sharpe": null, "isSelf": false }
]
```

> 积分榜 `GET /api/leaderboard/points`、竞技场榜 `GET /api/backtest/leaderboard`、擂台终榜
> `GET /api/backtest/duel-final` 同样做了用户名脱敏与测试账号排除，但**不含 `isSelf`**（这些榜前端
> 不做自我高亮）。

---

## 2. `GET /api/daily/leaderboard` — 每日挑战榜

**Query**：`date`（可选，`YYYY-MM-DD`，缺省今天）
**鉴权**：需登录（受 `/api/daily` 前缀保护，游客 `401`）

**200 响应**：`DailyBoardEntry[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `username` | string | 脱敏同上 |
| `stockName` / `stockCode` | string | 当天榜单标的**匿名**（`神秘标的` / `???`），历史日期揭晓真实标的 |
| `returnRate` | number | 收益率 |
| **`isSelf`** | **boolean** | **🆕 本人记录标记**，用于"我的百分位"展示 |

---

## 3. `POST /api/game/{sessionId}/settle` — 对局结算

**事务行为说明（本轮调整）**：
- 结算为**单原子事务** + 行锁，**天然幂等**：对**已结算**的对局重复调用返回 **`400`「对局已结算」**（非 `500`）。客户端结算请求因弱网/中断重发时安全，不会双重结算。
- **房间到期强制结算**内部改用独立事务（`REQUIRES_NEW`）：单成员结算失败只回滚该成员，**不再污染房间视图事务**——此前会导致 `GET /api/rooms/{code}` 永久 `500`，现已修复。

**响应**：
| Status | 场景 |
|---|---|
| `200` | 结算成功，返回 `SettleResponse`（含最终收益、揭晓的真实标的等） |
| `400` | 对局已结算 / 对局不存在业务校验失败 |
| `404` | 对局不属于当前用户（注册用户的对局仅本人可操作） |

---

## 4. `POST /api/auth/register` — 注册

**Body**：`{ "username": string(2-50), "password": string(6-72) }`

**响应（本轮调整）**：
| Status | 场景 | message 示例 |
|---|---|---|
| `200` | 注册成功，返回用户信息 + 建立会话 | — |
| `400` | 用户名已被注册（**含并发同名注册**）/ 参数校验失败 | `用户名已被注册` |

> **变更**：并发同名注册此前会因唯一键冲突返回 `500`，现统一转 `400` 业务提示。调用方应按
> `status === 400` 展示 `message`，不要依赖具体文案。

---

## 5. `POST /api/daily/start` — 开始每日挑战

**鉴权**：需登录（游客 `401`）

**响应（本轮调整）**：
| Status | 场景 | message 示例 |
|---|---|---|
| `200` | 开局成功，返回对局信息 | — |
| `400` | 今天已玩过（**含并发 / 两标签页双开**） | `你今天已经玩过每日挑战, 明天再来` |

> **变更**：并发双开此前会因唯一键冲突 / 内部死锁返回 `500`，现统一转 `400`；服务端并发路径的
> 死锁已消除（见变更日志）。

---

## 变更日志（Changelog）

### 2026-10 · Bug 修复轮

**接口契约变更**

| # | 接口 | 变更类型 | 变更内容 | 兼容性 |
|---|---|---|---|---|
| CL-1 | `GET /api/leaderboard`、`GET /api/daily/leaderboard` | **新增字段** | 响应 DTO 新增 `isSelf: boolean`，标记当前用户本人记录 | **向后兼容**（追加字段，按字段名访问的客户端无感） |
| CL-2 | 全部公开榜（收益/夏普/积分/竞技场/擂台/每日） | **语义变更** | `username` 对邮箱形态脱敏（`cl***@…`）；自动化测试账号在查询层排除 | 展示值变化，**不得再用 `username` 做身份比对**，改用 `isSelf`（仅前两者提供） |
| CL-3 | `POST /api/game/{id}/settle` | **行为说明** | 明确幂等：重复结算返 `400`（非 `500`）；房间强结改独立事务，不再使整个房间视图 `500` | 无结构变化 |
| CL-4 | `POST /api/auth/register`、`POST /api/daily/start` | **错误码调整** | 并发冲突由 `500` 改为 `400` + 业务 `message` | 调用方改按 status 判断更稳 |
| CL-5 | 全局 | **约定强化** | 错误响应统一 `{success,message}`，**调用方按 HTTP status 分支，不解析 `message` 文案** | 前端已改状态码判断 |

**不涉及**：无端点新增/删除，无 Query/Body 结构变更，无数据库 schema 变更。

**升级注意**：
- 前端若有按 `username === 自己` 判断本人的逻辑，必须改用 `isSelf`（CL-2）。
- 前端若有按错误 `message` 子串分支的逻辑，改用 `status`（CL-5）。
