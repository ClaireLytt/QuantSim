# QuantSim 技术债务深度审计 · 2026-10

> 方法：以本轮 13 bug 的**根因模式**为探针，对全库做同类模式普查（grep + 代码核读 + 已有 FTA/
> 性能/混沌分析），**只收录有代码证据的债**，区分"真实残留 / 已防护(非债) / 设计取舍"。
> 评估维度：修复成本（小/中/大）、爆发概率、故障危害。末尾给 P0/P1/P2 偿还路线图与长期防护体系。

---

## 一、技术债分布与分类（证据驱动）

### 普查结论先行（避免误伤"看着像债其实安全"的点）
- ✅ **非债**：`UserService.findOrCreate` 已用 `INSERT IGNORE + findWithLock` 防并发；前端榜单
  `r.username` 等**按字段名访问**（DTO 契约向后兼容）；XSS 纪律到位——用户可控数据（username/reason）
  全走 `textContent`，`innerHTML` 只插本地静态/枚举（academy mentor、journal outcome 均非用户输入）。
- 以下是**真实残留债**。

### D1 事务 / 事务传播

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D1.1 | **房间强结在 `view()` 读路径同步持锁执行** | `RoomService.view → evaluateTransitions → settleIsolated` | SPOF-2 / X1 根因（见 FTA）。读写耦合单点 |
| D1.2 | **undo / settle 锁序反转** | undo `session→user_points→account`；settle `session→account→user_points` | TB1：当前不成环仅靠"同 session 串行 + account 按 session 隔离"两个巧合 |
| D1.3 | **`computeAndStoreBias` 在 settle 事务内 catch(Exception) 后继续提交** | `GameService.java:510` | **安全仅因 `analyze` 只读**；若未来 analyze 产生 DB 写且失败 → settle 提交 rollback-only 事务 500（与已修的房间 bug 同类） |
| D1.4 | **AuthService 认领游客行 check-then-act 无锁** | `AuthService.java:32` `findByUsername().orElse(null)` → 设密码 save | 游客行被并发使用时有丢更新窗口（register 并发冲突已修，此"认领"路径未加锁重读） |

### D2 查询 / 分页

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D2.1 | **测试前缀过滤双源** | `PublicNames.TEST_PREFIXES`(Java) + 5 段 JPQL `not like` | 改一漏五；`pr_guard` 不校验 JPQL 侧 |
| D2.2 | **LabController calibration 全表扫无缓存** | `LabController.java:52` 聚合 O(stocks×days×models) | 数据量大后慢 SQL；控制器里直接算（分层泄漏） |
| D2.3 | **榜单无缓存层，每次查询直击 DB** | `LeaderboardService`/`BacktestService` 均实时查 | 高频只读直打库，大流量下 DB 压力（性能审计 O-3） |

### D3 并发 / 竞态

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D3.1 | **限流进程内 + 清理竞态** | `RateLimiter` ConcurrentHashMap + removeIf | 多实例部署失效（须 Redis）；清理竞态已 putIfAbsent 兜底但极端仍漏 1 跳 |
| D3.2 | **单实例 / 单库 SPOF** | compose 单 backend + 单 mysql | 无水平扩展；限流/缓存/部分状态进程内 |

### D4 状态管理

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D4.1 | **`qs_progress` 双写者** | `auth.js` 云端恢复直接 setItem 原始串，绕过 academy 内存 `prog` | 恢复后到刷新间内存/存储不一致（前端） |
| D4.2 | **每日一猜纯客户端时钟防刷** | `academy.js` todayStr 用客户端时钟 | 改钟可绕本地限制（无服务端奖励，危害有限，设计取舍） |

### D5 异常处理

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D5.1 | **宽 catch(Exception) 吞异常** | AdvisorService/DataRefresh/computeAndStoreBias 等多处 | 多数是有意兜底(日志齐全/外部进程)，但 D1.3 的那处有事务隐患 |
| D5.2 | **500 兜底文案泛化** | `GlobalExceptionHandler` 未处理异常统一"服务器内部错误" | 排障靠日志，前端无业务 code 可分 |

### D6 前端渲染

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D6.1 | **榜单按 DOM 位置 `children[1]` 填值** | `app.js`/`daily.js`/`ranking.js`/`rooms.js` | 数据按字段名(安全)，但 `<td>` 顺序耦合——重排列会错位填值 |
| D6.2 | **无类型/构建，契约靠人工** | 无 TS/构建 | null 渲染/字段改名类回归只能靠 `pr_guard`+人工拦（本轮多起即此类） |

### D7 接口契约

| ID | 债 | 证据 | 现状 |
|---|---|---|---|
| D7.1 | **无 OpenAPI / 版本化** | 无 spec 文件 | 契约变更靠 `docs/api-changes` 手记，无机器可校验 |
| D7.2 | **isSelf 仅 2 榜提供** | Leaderboard/Daily 有，arena/duel/points 无 | 当前无缺口(那些榜不自我高亮)，但新增自我高亮需求时易漏 |

---

## 二、风险矩阵（修复成本 × 爆发概率 × 故障危害）

| 债 | 修复成本 | 爆发概率 | 故障危害 | 风险分 | 级别 |
|---|---|---|---|---|---|
| D1.1 房间强结读路径 | 中 | **高**(活动/整点集中到期) | **高**(局部雪崩) | ●●●●● | **P0** |
| D1.2 锁序反转 | 小 | 低(需未来特性激活) | 高(死锁500) | ●●●○○ | **P0**(小成本主动拆) |
| D2.1 前缀双源 | 小 | 中(每次改前缀) | 中(榜单错/隐私) | ●●●○○ | **P1** |
| D1.3 bias catch-in-tx | 小 | 低 | 中(settle 500) | ●●○○○ | **P1**(防御性) |
| D1.4 游客认领无锁 | 小 | 低 | 低(丢更新) | ●●○○○ | P2 |
| D2.3 榜单无缓存 | 中 | 中(大流量) | 中(DB 压力) | ●●●○○ | **P1** |
| D3.1 限流进程内 | 中 | 低(单实例) | 中(多实例失效) | ●●○○○ | P2(扩容前) |
| D3.2 单实例 SPOF | 大 | 低 | 高(全站不可用) | ●●●○○ | P2(架构级) |
| D2.2 calibration 全扫 | 小 | 低 | 低(慢) | ●○○○○ | P2 |
| D4.1 qs_progress 双写 | 小 | 中 | 低(前端短暂不一致) | ●●○○○ | P2 |
| D6.1 children[N] 耦合 | 小 | 低 | 低(重构时错位) | ●○○○○ | P2 |
| D5.2 / D7.1 契约/文案 | 中 | 低 | 低(排障/集成成本) | ●○○○○ | P2 |

**最高风险 = D1.1**（房间强结读路径）——高概率 × 高危害，是偿还首债。D1.2（锁序反转）虽概率低但
**修复成本极小**，应主动拆雷不留给巧合。

---

## 三、技术债偿还路线图

### P0（立即，2 周内）
- **D1.1 房间强结移出读路径**：最小版——强结加 DB 咨询锁 + 限并发，避免多房间同时强结；
  完整版——到期由定时任务/异步触发，`view` 只读状态。直接消除 X1 雪崩与 SPOF-2。
- **D1.2 统一 undo 锁序**为 `session→account→user_points`（与 settle 一致），主动拆 TB1 雷。成本极小。

### P1（1 个月内）
- **D2.1 前缀单源**：前缀定义为唯一常量源，JPQL 用参数绑定/生成片段，消除双源漂移。
- **D1.3 bias 调用移出 settle 事务**或改 `REQUIRES_NEW`，去掉 catch-in-tx 的事务隐患。
- **D2.3 榜单短 TTL 缓存**：Caffeine 10~30s 缓存脱敏后的榜单主体，`isSelf` 应用层二次标记；砍 DB 查询量。

### P2（1~2 个月 / 架构级）
- **D1.4 游客认领**改锁定重读。
- **D3.1 限流 Redis 化**（多实例部署前置）。
- **D3.2 / LP** 水平扩展就绪：状态外置、应用无状态化。
- **D2.2 calibration 下沉 service + 缓存**；**D4.1 qs_progress 单写者统一**；**D6.1 榜单渲染结构化**（模板/组件化消除 children[N] 位置耦合）；**D7.1 引入 OpenAPI**。

---

## 四、架构风险评估

### 状态模型缺陷
- **对局状态机单点真相在 DB 行 + 行锁**：正确但所有并发都压在 `session`/`account` 行锁上，热对局操作串行化
  （trade/tick/settle/undo 全走 session 锁）——单对局无并发瓶颈（本就该串行），但**结算在读路径触发**让
  状态迁移污染了读热路径（D1.1）。
- **前端状态双真相**（内存 `prog` + localStorage + 云端）无统一同步协议（D4.1）。

### 事务模型局限
- **无显式隔离级别**（默认 RR）：check-then-act 的 find 是快照读看不到并发提交，**护栏全靠唯一键**——
  已覆盖的点(register/daily)安全，但这是"隐式依赖唯一键"，新增并发写路径易漏。
- **REQUIRES_NEW 占 2 连接**在读路径放大连接压力（D1.1/TB2）。
- **锁序一致性靠约定非强制**（D1.2 已出现反转）。

### 缓存一致性
- **行情缓存**（Caffeine 10min expireAfterWrite）：只读数据、重灌自动过期，一致性风险低。
- **榜单无缓存**（D2.3）：无陈旧问题但 DB 压力大。
- **会话走 JDBC（SPRING_SESSION）**：多实例共享、重启不掉线，**无进程内会话一致性问题**（这点做得好）。
- **限流进程内**（D3.1）：多实例下各算各的，是唯一的进程内状态一致性缺口。

---

## 五、长期质量防护体系

### 自动化测试策略
- **分层矩阵（现状已建）**：单测（84）+ ui_check 静态 + 按钮体检 + 点击爬虫 + 冒烟 + pr_guard。
- **补强方向**：
  - **并发测试基类** `@Concurrent`（CyclicBarrier+线程池）：强制覆盖"查-then-写/唯一键/状态迁移/锁序"接口。
  - **故障注入套件**（见 `docs/fault-tree-analysis` FI-1..FI-8）自动化：连接池饱和、锁等待、断链、弱网。
  - **契约测试**：DTO 快照测试，字段增删即告警（替代人工核对）。

### 静态代码规则（`pr_guard.py` 已覆盖 7 类，建议扩展）
- 现有 R1~R7：分页后过滤 / username 身份比对 / 循环共用父事务结算 / 错误码依赖中文 / 状态结束才落库 /
  除零缺保护 / 空值无兜底渲染。
- **新增规则建议**：R8 catch(Exception) 在 `@Transactional` 方法内（D1.3 类）；R9 check-then-act 对唯一键
  无 INSERT IGNORE/catch（D1.4 类）；R10 多处常量定义同一业务前缀（D2.1 类）。

### CR 检查清单（并入 PR 模板，源自本轮全部教训）
- [ ] 改"展示数据/脱敏/口径/状态机"：全局搜受影响判断点 + 先补回归测试再声称完成。
- [ ] 事务内 catch 另一事务方法：内层是否标记 rollback-only？要隔离用 REQUIRES_NEW。
- [ ] 多锁获取：锁序是否与既有路径一致（防 D1.2 类反转）？
- [ ] "取 TOP N + 过滤"：过滤在 SQL 层、分页前？
- [ ] "查-then-写"对唯一键：有并发保护？
- [ ] `divide` 带 scale + 除数判 signum？数值字段渲染判 null？
- [ ] 分支判断用 status/类型, 不用错误文案子串？
- [ ] 每日限次标记在动作开始落？localStorage 有内存兜底？
- [ ] 后端改动过 `mvn test`；前端过 ui_check+按钮体检(+爬虫)；PR 过 `pr_guard`。

---

**审计总结**：QuantSim 工程纪律整体良好（XSS/字段名访问/会话外置/唯一键防并发多处做对），本轮 13 bug 修复
闭合了活跃缺陷。剩余技术债**集中且可控**——**P0 只有两笔**（D1.1 房间强结读路径、D1.2 锁序反转），
前者是高概率高危害的首债、后者是极小成本的拆雷；P1 是双源/缓存/事务隐患三笔中等债。架构层面最大的
结构性债是"**结算在读路径同步执行 + 单实例**"，长期方向是**结算异步化 + 状态外置 + 水平扩展就绪**。
防护体系（测试矩阵 + pr_guard + CR 清单）已基本成形，补并发测试基类与 R8~R10 规则即可覆盖本轮全部根因。
