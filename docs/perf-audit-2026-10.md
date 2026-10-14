# QuantSim 2026-10 修改点性能审计 & 压测方案

> 审计三处改动：① 榜单 JPQL 前置过滤 ② 房间强结 `REQUIRES_NEW` ③ 限流清理竞态兜底。
> 结论先行：**三处均无显著性能风险**，唯一需上线盯的是 ②（`REQUIRES_NEW`）在房间集中过期时的
> 连接池峰值。下文含**本地真实 EXPLAIN 证据**与可执行压测脚本。

---

## 一、三处改动性能开销评估

### ① 榜单 JPQL 前置过滤（加了 3 条 `username NOT LIKE`）

**真实 EXPLAIN（本地 MySQL，game_sessions 45 行）**：

```
table | type   | key                 | rows | Extra
s     | ref    | idx_sessions_return |  27  | Using where   ← 驱动表走 status+return 排序索引
st    | eq_ref | PRIMARY             |   1  | Using index
u     | eq_ref | PRIMARY             |   1  | Using where   ← NOT LIKE 在此逐行判定
```

**判定**：
- 驱动表 `game_sessions` 仍走 `idx_sessions_return (status, final_return_rate DESC)`——**排序索引没被破坏**，不是全表扫描。
- `users` 按**主键 eq_ref** 关联（每行 1 次 PK 查找），`NOT LIKE` 作为 `Using where` 在**已关联的单行**上判定，**不是对 users 表做前缀扫描**。
- **唯一开销**：过滤发生在索引有序读之后，若测试账号恰好排在榜单最前，MySQL 需多读几行有序索引才能凑够 LIMIT N。测试账号极少时可忽略；即便极端占满前列，也只是多读几十行索引 + 几十次 PK 查找，**毫秒级**。

**结论**：**无慢 SQL 风险**。比"分页后内存过滤"（旧写法）更优——旧写法要把被过滤的行也查出来传到应用层。

### ② 房间强结 `REQUIRES_NEW` 独立事务

**事实**：房间成员上限 `max_players = 8`；强结循环**顺序**结算，非并行。

**开销分析**：
- 每个成员的 `settleIsolated` 挂起父事务、借新连接、提交、归还——**单请求任意时刻峰值 2 连接**（父事务挂起仍持 1，内层 1），不是 8。
- 一次房间到期 view 最多触发 8 次独立事务提交（串行），**事务数量 ×8**，但都是小事务（单对局结算），总耗时 ≈ 8 × 单结算耗时。
- **真实风险在并发**：Hikari **默认池 = 10**（`application.yml` 未配，用 Spring Boot 默认）。多个房间同时过期 + 并发 view，每请求占 2 连接 → **约 5 个并发强结请求即可打满连接池**。

**结论**：功能开销可接受；**连接池是唯一需压测验证的点**（见场景 2）。

### ③ 限流清理竞态兜底（`putIfAbsent` 挂回）

**开销**：每次 `check()` 多一次 `ConcurrentHashMap.putIfAbsent`（O(1)）——**纳秒级，可忽略**。
清理 `removeIf` 仅在 key 数 > 10000 时触发（O(n) 一次性），正常流量极少命中。

**结论**：**无 RT 影响**。唯一提醒：进程内限流多实例部署前须换 Redis（既有前提，非本轮引入）。

---

## 二、压测场景清单（可执行）

> 无专用压测工具时，用 `ab`（Apache Bench）或下面的并发 curl 脚本即可。`$BASE` = 目标地址。

### 场景 1：榜单高频查询（验证改动①）
```bash
# 1000 请求 / 50 并发, 打四个公开榜
for path in "/api/leaderboard" "/api/leaderboard?sort=sharpe" "/api/leaderboard/points" "/api/backtest/leaderboard"; do
  echo "=== $path ==="
  ab -n 1000 -c 50 "$BASE$path"      # 看 Time per request / p95 / 失败数
done
```
**关注**：p95 RT、是否随 game_sessions 数据量增长而劣化（可在不同数据量下重复）。

### 场景 2：多人房间同时结算（验证改动②，最重要）
```bash
# 预置 N 个各 8 人、已到期的房间 (用集成测试或脚本造数据), 然后并发打它们的 view
# codes.txt 每行一个房间码
cat codes.txt | xargs -P 20 -I{} curl -s -o /dev/null -w "%{http_code} %{time_total}\n" "$BASE/api/rooms/{}"
# 同时在另一终端监控连接池 (见第三节)
```
**关注**：连接池 active 峰值是否触顶 10、是否出现 `Connection is not available` / `connection timeout`、强结请求 RT。
**阶梯加压**：并发 `-P` 从 3 → 5 → 8 → 12 逐级，找到连接池饱和的拐点。

### 场景 3：并发注册 / 每日双开（验证改动③ 及并发修复）
```bash
# 50 并发同名注册 (应 1 成 49 败且全是 400, 无 500)
seq 50 | xargs -P 50 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"username":"loadtest_dup","password":"secret66"}' | sort | uniq -c
# 期望: "1 200" + "49 400", 无 500
```
**关注**：500 计数必须为 0；限流/唯一键冲突全部转 400；DB 无死锁日志。

---

## 三、重点观测指标

| 维度 | 指标 | 怎么取 | 预警阈值 |
|---|---|---|---|
| **SQL 耗时** | 慢查询 | `SET GLOBAL slow_query_log=ON; long_query_time=0.1;` 看 slow log；或 `performance_schema.events_statements_summary_by_digest` 按 `SUM_TIMER_WAIT` 排序 | 单榜查询 p95 > 50ms 需查 |
| **事务数量** | 提交/回滚速率 | `SHOW GLOBAL STATUS LIKE 'Com_commit'` / `Com_rollback`（取差值） | 回滚率突增 = 房间强结失败或并发冲突升高 |
| **DB 连接** | 活跃/等待连接 | Hikari：日志 `HikariPool-1 - Pool stats (total=.., active=.., idle=.., waiting=..)`；或 MySQL `SHOW STATUS LIKE 'Threads_connected'` | active 持续触顶池上限 + waiting > 0 |
| **接口 RT** | p50/p95/p99 | `ab` 输出 / 网关日志 / 压测工具 | 榜单 p95 > 100ms、房间 view p95 > 500ms |
| **死锁** | InnoDB 死锁 | `SHOW ENGINE INNODB STATUS` 的 LATEST DETECTED DEADLOCK；日志 `Deadlock found` | 出现即查（本轮刚修过每日死锁） |
| **错误率** | 5xx by path | 应用/网关日志按 path 聚合 | `/api/rooms/*` 出现 500 即回归信号 |

**连接池实时监控（压测时开另一终端）**：
```sql
-- MySQL 侧看连接
SELECT COUNT(*) AS conns, SUBSTRING_INDEX(host,':',1) host FROM information_schema.processlist GROUP BY host;
-- 或开 Hikari 周期日志: application.yml 加 logging.level: com.zaxxer.hikari=DEBUG
```

---

## 四、性能风险与优化建议

### 识别到的风险

| 风险 | 等级 | 证据 | 说明 |
|---|---|---|---|
| **连接池饱和**（改动②） | **中** | 池默认 10，单强结请求占 2，~5 并发即满 | 多房间集中过期 + 并发访问时可能 `connection timeout` |
| 慢 SQL（改动①） | 低 | EXPLAIN 走 `idx_sessions_return`，users eq_ref PK | 当前无风险；数据量极大 + 测试账号占满前列时略有索引over-read |
| 事务过多（改动②） | 低 | 单房间最多 8 个小事务，串行 | 事务数 ×8 但都是小事务，总耗时线性 |
| 限流 RT（改动③） | 无 | putIfAbsent O(1) | 纳秒级 |

### 优化建议（不改本轮修复逻辑，按性价比排序）

1. **【中】显式配连接池并压测定值**：`application.yml` 加 `spring.datasource.hikari.maximum-pool-size`（建议 20，配合 DB `max_connections`），别用默认 10。先按场景 2 阶梯加压找饱和拐点再定值。
2. **【中】房间强结加并发上限/熔断**：`settleIsolated` 循环里单成员加超时；或房间 view 的强结用**异步/后台任务**触发（而非每次 view 同步强结 8 人），把结算从读路径剥离——根治连接占用放大。
3. **【低】榜单结果加短 TTL 缓存**：公开榜是高频只读、容忍秒级陈旧，Caffeine 缓存 10~30s 可把 DB 查询量砍一个数量级（行情已有此模式）。注意 `isSelf` 因人而异，缓存**脱敏后的榜单主体**、`isSelf` 在应用层按当前 userId 二次标记。
4. **【低】积分榜/竞技场榜按需加索引**：`user_points(balance)`、`backtest_results` 已有 `idx_bt_return`；数据量大后确认积分榜 `ORDER BY balance` 有索引支撑（当前无，小数据无感）。
5. **【低】慢查询日志常开**（`long_query_time=0.1`）：低成本早发现劣化。

---

**一句话结论**：三处改动**本身都不构成性能风险**，改动①的 NOT LIKE 经 EXPLAIN 证实不破坏排序索引；
真正要上线盯的是改动②的**连接池峰值**——建议上线前把池显式配到 20 并按场景 2 压测定值，长期可把
房间强结从读路径异步化以根治连接占用放大。
