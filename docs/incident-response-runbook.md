# QuantSim 线上故障应急响应手册

> 适用架构（2026-10）：**单实例** Spring Boot 3（Docker compose `backend`）+ MySQL 8（compose `mysql`，不对外映射端口）+ Caddy 反代（`--profile prod`）+ 进程内 Caffeine 缓存 + 进程内 RateLimiter。
> 唯一健康端点 `/actuator/health`；唯一定时任务为数据刷新（`DataRefreshService`，cron 可配）。房间/对局结算为**惰性触发**（访问时迁移），无赛季定时结算任务——"赛季"只是按月落在 session 行上的标签。
> 已知坑先查 `docs/bug-knowledge-base.md`（代码反面模式）、`docs/robustness-audit-2026-10.md`（审计清单）、`issue_recode/`（环境坑）。

---

## 1. 故障分级标准

| 级别 | 定义与典型现象 | 响应时限 | 处理人 → 升级 |
|---|---|---|---|
| **P0** | 全站不可用或资金/榜单公平性被实时破坏：首页打不开、全接口 5xx、数据库宕机、积分/榜单可被刷（经济系统失守）、越权读写他人对局、竞技答案泄露 | **15 分钟内响应**，1 小时内止血 | 值班开发 → 项目负责人（立即电话/IM），需要时全员 |
| **P1** | 核心玩法损坏但站点可用：开局/推进/结算某条链路全量失败、行情数据断更超过 1 个交易日、某类对局全部结算错误、资产对账批量不平 | **30 分钟内响应**，当日修复 | 值班开发 → 项目负责人（2 小时未定位时） |
| **P2** | 局部功能异常有绕行方案：单个视图报错、某个基准/图表算错、AI 顾问不可用（LLM 配额/超时）、个别对局数据异常 | **4 小时内响应**，3 日内修复 | 值班开发自行处理，复盘时同步 |
| **P3** | 体验瑕疵：文案/样式/翻译错误、非关键告警噪声、已知可接受的设计取舍 | 下个迭代处理 | 记 issue 即可 |

**判级口诀**：影响"钱"（积分/榜单/资产）和"公平"（越权/剧透）一律 P0；影响"能不能玩"是 P1；影响"玩得爽不爽"是 P2/P3。拿不准往高判。

---

## 2. 通用应急动作（所有 SOP 的第 0 步）

```bash
# 1. 活性与基本面
curl -s http://localhost:8080/actuator/health          # {"status":"UP"} ?
docker compose ps                                       # backend / mysql 都 Up ?
docker compose logs backend --tail=200 | grep -E "ERROR|WARN"   # 最近错误
docker compose logs mysql --tail=50

# 2. 数据库可连 & 压力
docker compose exec mysql mysql -uroot -p$QUANTSIM_DB_PASSWORD quantsim \
  -e "SHOW PROCESSLIST;"                                # 慢查询/锁等待堆积?
  -e "SHOW ENGINE INNODB STATUS\G" | grep -A20 "LATEST DETECTED DEADLOCK"

# 3. 万能止血: 重启后端 (登录态在 SPRING_SESSION 表, 重启不掉线; Caffeine 缓存清空, 10 分钟内回暖)
docker compose restart backend
```

**重启的代价清单**（评估后再按）：进程内 RateLimiter 计数清零（限流窗口重置，短时可被多打几发）；Caffeine 全清（首批请求打库变慢）；进行中的 SSE 顾问流断开（前端会报错，无数据损失）。**事务性数据零丢失**——所有状态在 MySQL。

---

## 3. 高频故障处理 SOP

### SOP-1 行情引擎中断 / 价格异常

**现象**：开局报"行情数据已到尽头"；K 线断更；出现负价/零价/异常跳变；`[refresh]` 日志报错。

1. 判断断更范围：
   ```sql
   SELECT s.code, MAX(p.trade_date) last_day FROM stocks s
   JOIN daily_price p ON p.stock_id=s.stock_id GROUP BY s.code ORDER BY last_day;
   ```
2. 看刷新任务日志：`docker compose logs backend | grep "\[refresh\]"`。常见根因：AKShare 接口变更/限流、管道机器无网、`END_DATE` 口径（`config.py` 动态取今天，正常不会断）。
3. 手动补数：`docker compose --profile pipeline run --rm pipeline`（幂等 upsert，可重复跑）。
4. **灌完数必须让缓存失效**：等 10 分钟（Caffeine 过期）或重启 backend——管道手动跑**不会**清后端缓存（只有 `DataRefreshService` 成功路径会清）。
5. 价格异常（负价/高低矛盾）：fetch/load 已有质量门（`fetch_data.sanitize`），若脏数据已入库：
   ```sql
   SELECT * FROM daily_price WHERE close<=0 OR high<low;   -- 先看影响面
   DELETE FROM daily_price WHERE close<=0;                  -- 走审批后执行 (见 §6 红线)
   ```
   然后重跑管道回填正确行。
6. 止血手段：`QUANTSIM_REFRESH_ENABLED=false` 可临时关掉定时刷新（刷新本身坏数据时用）。

### SOP-2 交易撮合卡住 / 订单无法成交

**现象**：点"下一天"无响应或 500；挂单一直 OPEN 不撮合。

1. 先分清"卡"还是"拒"：业务 400（封板/T+1/现金不足/笔数耗尽）是**规则拒绝**，前端有文案，不是故障。
2. 真 500：查日志定位异常栈。已知模式：
   - `NoClassDefFoundError` → 旧 JVM 配了新 class（改码后没重启），重启即愈（issue_recode 有案）。
   - 死锁 → `SHOW ENGINE INNODB STATUS` 看 LATEST DEADLOCK；session/account/room 锁顺序恒为 room→session→account，若新代码破坏了顺序按 kb #6 处理。
3. 挂单不撮合的合法原因（先排除再怀疑 bug）：当日该标的无 bar（停牌缺日，`continue` 继续挂）、realRules 封板日、触发价未到、笔数预算耗尽（会自动 CANCELLED 而非静默）。
4. 单笔卡死对局的定位：
   ```sql
   SELECT * FROM game_sessions WHERE session_id=?;
   SELECT * FROM pending_order WHERE session_id=? ORDER BY order_id;
   SELECT * FROM transactions WHERE session_id=? ORDER BY tx_id;
   ```
5. 修复原则：**不手改 account 行**。资产由流水重放可得（见 SOP-3），改流水/挂单状态后让系统自洽，而不是直接 UPDATE 现金。

### SOP-3 玩家资产不一致（总账与明细对不上）

**现象**：玩家报"钱不对"；结算收益率与流水肉眼核对不上。

1. **对账原理**：`Account` 行是冗余快照，真相 = `initialCash` + 按日重放 `transactions`（先利息后交易，口径在 `GameService.replayAccount` / `GameBenchmarks.equityCurve`）。两者必须相等。
2. 单局核对（只读，随时可做）：
   ```sql
   SELECT initial_cash, current_trade_date FROM game_sessions WHERE session_id=?;
   SELECT tx_id, trade_date, direction, price, shares, fee, order_id FROM transactions
     WHERE session_id=? ORDER BY tx_id;
   SELECT cash_balance, holding_shares, holding_cost, interest_total FROM accounts WHERE session_id=?;
   ```
   手工或用脚本按口径重放比对。
3. 已知分叉源（修复前的历史数据可能残留）：undo 删了挂单成交流水但挂单仍 FILLED（审计 P1-5，V25 后新数据不会）；利息口径变更前后的旧局。
4. **修复路径**：优先"触发系统重算"而非手改——对进行中的对局，可用一次 undo+重放语义修复（有 orderId 关联后 undo 是全量重放）；对已结算对局，若确认算错，走 §6 审批后以重放结果 UPDATE，并在工单里留重放脚本与前后值。
5. 批量巡检（发版后/每日）：抽样 N 个 SETTLED 会话跑重放对账，漂移 >0.01 告警（审计 §11 巡检规则 1，建议落成脚本）。

### SOP-4 榜单计算错误 / 数据错乱

**现象**：榜上收益率离谱、出现测试账号、同人多条、竞技榜提前泄标的。

1. 榜单是**查询时实时算的**（无榜单缓存表），错乱 = 源数据错或查询口径错。先确认是哪张榜：主榜（CLASSIC/PORTFOLIO）、日榜、回测擂台。
2. 离谱收益率 → 按 SOP-3 对那条 session 对账；确认作弊面（上帝视角/秒结刷分已修，防回退）。
3. 测试账号漏进榜：查询里排除 `smoke_/btncheck_/shot_` 前缀（`GameSessionRepository`），新测试账号前缀必须登记到这三处 SQL。
4. 竞技榜泄密（P0）：日榜"当日 + 请求者未结算"都应显示 `???`；journal/流水/LLM 上下文永久 mask。若新接口泄了日期/代码，立即下线该字段（热修）再补测试。
5. 脏数据摘除：
   ```sql
   -- 单条移出榜单: 把会话标记为无效 (不删数据)
   UPDATE game_sessions SET final_return_rate=NULL WHERE session_id=?;  -- 走审批
   ```

### SOP-5 房间结算卡死 / 重复结算

**现象**：房间页一直 500；房间永远 OPEN；成员被结算两次。

1. 房间 500 的经典根因（kb #3 / 审计 P1-6）：强结 catch 范围不够，异常回滚 view 事务。已修为 catch RuntimeException——若复发，查日志里 `[room] 成员对局 X 强制结算异常` 的栈。
2. 永远 OPEN 的房间：无人访问就不迁移（惰性设计）。任何成员 GET 一次房间页即触发；批量清理可写一次性脚本循环调 view 或直接：
   ```sql
   SELECT code FROM rooms WHERE status='OPEN' AND expires_at < NOW();  -- 影响面
   ```
   然后逐个经 API 触发（别手改 status——强结逻辑会发积分/算收益，绕过它状态会半截）。
3. 重复结算：三条结算路径都有悲观锁 + `requireInProgress` 幂等拦截，第二次并发得 400。若真出现双发积分，按时间线查 `transactions`/`user_points` 变更，走 §6 修数。
4. 成员结算失败只影响该成员（REQUIRES_NEW 隔离），房间照常迁 SETTLED；该成员补救 = 修复其数据后由本人再 settle（榜单条件是 SETTLED，不补也只是不进榜）。

### SOP-6 定时任务重复执行 / 卡死

**现象**：数据刷新重复跑、一直不结束、从不触发。

1. 全仓只有一个 `@Scheduled`（数据刷新）。重复执行只会发生在**误起多实例**时——`docker compose ps` 确认只有一个 backend。管道幂等 upsert，重复跑不坏数据，但浪费配额。
2. 卡死：刷新有 `timeoutMinutes`（默认 30）超时 `destroyForcibly`；若进程树残留，容器内 `ps` 找 python 进程 kill。
3. 从不触发：确认 `QUANTSIM_REFRESH_ENABLED`（yml 缺省 true）与 cron 表达式；日志应有 `[refresh]` 行。
4. 任务失败不会杀调度（异常全 catch 返回 false），连续失败看 `log.error("[refresh] 管道执行失败", e)` 的栈。

### SOP-7 数据库慢查询 / 压力飙升

1. `SHOW PROCESSLIST` 找长跑查询；`SHOW ENGINE INNODB STATUS` 看锁等待。
2. 已知热点：榜单查询（有 PageRequest 封顶）、`MarketDataService.load` 全量加载（缓存失效瞬间，已加 `sync=true` 防击穿）；调参 `tune` 是 CPU 大户（有 6/min 限流）。
3. Hikari 池 20，REQUIRES_NEW 场景占双连接——连接耗尽的栈是 `Connection is not available`；临时解法重启，根治查谁持长事务。
4. 杀单条慢查询：`KILL <processlist_id>;`（只杀 SELECT；写事务让它跑完或回滚，别 kill 一半）。
5. 压力持续：确认不是被刷接口（看访问日志 IP 分布）；限流退化排查见 SOP-9 第 4 条。

### SOP-8 缓存异常引发脏数据

**现象**：K 线显示旧价/新价混用、指标 `--`、改了数据前端没变化。

1. 本项目缓存只有两个：Caffeine `stockData`（整股打包，10 分钟过期）与浏览器静态资源缓存（`?v=` 手动失效）。
2. 后端数据脏：**重启 backend 即全清**（最快）；或等 10 分钟自愈。半灌库窗口（prices 新、indicators 旧）是已知权衡，口径失真 ≤10 分钟，不算故障。
3. 前端行为诡异：十有八九是忘 bump `?v=` 版本号——`ui_check.py` 会查，发版前跑一遍；用户侧让其强刷（Ctrl+F5）。
4. 多实例部署前**必须**解决：进程内缓存/限流不共享（CLAUDE.md 已声明），本手册全部 SOP 以单实例为前提。

### SOP-9 越权 / 脱敏异常 / 数据泄露风险（一律 P0）

1. **先止血再定位**：确认泄露面后，最快手段按序选——下线泄露字段的热修、临时关闭该接口（Caddy 层挡路由）、整站维护页。
2. 核对清单（新代码最易回退的点）：
   - `/{sessionId}/` 新端点有没有 `requireAccess`；
   - 竞技局新字段有没有过 `BlindDates`（日期+标的双脱敏，含 journal/流水/LLM 上下文/挂单回执）；
   - 记战绩入口是不是 `UserService.resolve`（不是裸 `findOrCreate`）；
   - 游客可写接口有没有 IP 限流。
3. 影响评估：按访问日志圈出异常访问的 sessionId/userId 集合，评估被读写的范围，保留日志证据。
4. 限流失效排查：生产经 Caddy 时必须有 `server.forward-headers-strategy: framework`，否则全部按 IP 限流共享代理单桶（审计 P1-10）——表现为"一人超频全站被限"或"针对性限流拦不住"。
5. 事后必做：把攻击面写进 `CLAUDE.md` 安全守则 + `pr_guard.py` RULES，补回归测试。

### SOP-10 大面积前端报错 / 接口 5xx 雪崩

1. 分层定位：Caddy 起着吗（`docker compose ps`）→ backend health UP？→ 日志里 5xx 栈是什么。
2. 已知假 5xx：改完后端没重启就跑浏览器巡检，旧 JVM + 新 target/classes 报 `NoClassDefFoundError`（CLAUDE.md 体检④注意事项）——重启即愈。
3. 真雪崩常见根因：数据库连接耗尽（SOP-7）、某依赖（LLM API）超时未降级导致线程占满（advisor 有超时+限流，确认没被绕过）、磁盘满（`df -h`，日志/MySQL binlog）。
4. 前端大面积报错但后端 200：看浏览器 console——多半是某次发版 JS 语法错误或 `?v=` 没 bump 的新旧混用。回滚 = `git revert` 前端提交 + bump 版本号，无需动后端。
5. 验证恢复：`cd tools/ui_smoke && npm run smoke`（8 步全流程）+ `npm run buttons`。

---

## 4. 故障上报与复盘模板

### 4.1 上报模板（发现即发，不等定位）

```markdown
【故障上报】P{0-3} | {一句话现象}
- 发现时间: 2026-xx-xx HH:MM   发现途径: 用户反馈/巡检/告警
- 影响面: 哪些接口/视图/玩家群体; 是否涉及 资金/榜单/越权 (是→P0)
- 当前状态: 持续中 / 已止血(手段) / 已恢复
- 已做动作: (含时间点)
- 需要支援: 无 / @某人
```

### 4.2 复盘模板（恢复后 48h 内，存 `docs/postmortem/<日期>-<slug>.md`）

```markdown
# 故障复盘: {标题}
- 级别/时长: P? | 开始~止血~恢复 三个时间点
- 影响: 量化 (多少请求失败/多少对局受影响/是否有资金或公平性损失)
## 时间线
| 时间 | 事件/动作 | 依据(日志行/截图) |
## 根因
直接原因 → 根本原因 (必须到代码/配置/流程层面, 带 文件:行号 或 commit)
## 为什么没有更早发现/拦住
缺哪个测试/巡检/告警/评审规则
## 行动项 (每条有负责人和期限)
- [ ] 代码修复 + 回归测试
- [ ] 登记 bug-knowledge-base (代码类) / issue_recode (环境类)
- [ ] pr_guard RULES / ui_check / CI 巡检 增补
```

---

## 5. 故障演练方案（每季度一次，每次 ≤2 小时）

> 原则：**只在本地/预发环境注入**，生产只演"流程"（通讯、判级、上报），不演"破坏"。

| # | 注入方法 | 验证目标 | 通过标准 |
|---|---|---|---|
| 演练 A：数据库中断 | `docker compose stop mysql` 60 秒后恢复 | SOP-7/通用步骤；health 转 DOWN；恢复后无需人工介入自愈 | 10 分钟内完成判级+上报模板填写；恢复后 smoke 全绿 |
| 演练 B：行情断更+脏数据 | 停管道 2 天 + 手插一行 `close=-1` | SOP-1 全流程；质量门与后端负价防御 | 定位到脏行并按红线流程清除；对局不误强平 |
| 演练 C：结算异常 | 预发库删某房间成员 account 行，访问房间 | SOP-5；房间仍迁 SETTLED 不 500（回归测试 expiredRoomSettlesDespiteMemberAccountMissing 的人工版） | 一次 view 收敛；日志有 error 栈可定位 |
| 演练 D：接口被刷 | 脚本对 /api/auth/login、/api/backtest/run 匿名打 100 req/min | SOP-9 第 4 条；限流生效且不误伤 | 429/400 频繁拦截；经反代时 per-IP 独立计数 |
| 演练 E：前端故障回滚 | 预发故意提交一个语法错误 JS + bump 版本 | SOP-10 第 4 条；回滚链路 | revert+bump 后 buttons/smoke 全绿，全程 ≤15 分钟 |

每次演练产出一份简版复盘（用 §4.2 模板），把流程卡点变成行动项。

---

## 6. 应急权限规范与数据修复红线

### 6.1 权限

- 生产数据库口令（`QUANTSIM_DB_PASSWORD`）仅项目负责人与当班值班持有；**禁止**写进代码/提交记录（.gitignore 已覆盖本地口令文件）。
- 生产只暴露 `/actuator/health`——**任何情况下不临时开启其他 actuator 端点**（env/heapdump 会泄配置与内存）。
- 应急操作双人制：P0 期间的任何写库/重启由一人执行、另一人在 IM 留痕确认；只有一人在场时，先把要执行的 SQL/命令原文发到群里再执行。

### 6.2 数据修复红线（禁止直接线上执行）

| 禁止 | 原因 | 正确做法 |
|---|---|---|
| 直接 `UPDATE accounts SET cash_balance=...` | 账户是流水的冗余快照，手改必与重放口径分叉 | 修流水/挂单状态，让重放重建（SOP-3） |
| 手改 `game_sessions.status` / `rooms.status` | 结算路径附带积分发放、收益计算，绕过会留半截状态 | 经 API 触发结算/迁移 |
| 无 WHERE 或按模糊条件的 DELETE/UPDATE | 不可逆 | 先 SELECT 同条件确认行数，留快照（`CREATE TABLE bak_x AS SELECT ...`）再执行 |
| 线上改 Flyway 已执行的旧迁移文件 | checksum 不匹配直接拒启 | 永远新增 `V{n}__*.sql` |
| 直接重跑"部分"管道脚本（只跑 compute 不跑 load 之类的花式组合） | 半灌库窗口拉长 | 按固定顺序全链路跑，或用 compose pipeline profile |
| 生产手动 `TRUNCATE`/`DROP` 任何表 | —— | 没有例外 |
| 用 root 以外需求新建高权限库账号图省事 | 扩大攻击面 | 最小权限，事后回收 |

### 6.3 修数标准流程

1. 工单记录：现象、影响行集合的 SELECT 及行数、拟执行 SQL 原文。
2. 备份：`CREATE TABLE bak_<表>_<日期> AS SELECT ... WHERE <同条件>;`
3. 双人确认后执行；执行结果（affected rows）贴回工单。
4. 验证：对受影响对局跑 SOP-3 对账 / 对应 smoke 步骤。
5. 24h 后无异议删除 bak 表；复盘归档。
