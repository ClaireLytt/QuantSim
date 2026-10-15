# QuantSim 项目开发 & 运维手册

> 团队内部 wiki。合并本项目全部编码规范、CR 清单、测试/契约/可观测性规范、运维 SOP、安全规范与
> 历史踩坑库。标记 **【强制】**（必须遵守，PR 评审卡点）与 **【推荐】**（最佳实践）。
> 配套源文档：`CLAUDE.md`（根目录，权威约定）、`docs/*`（各专项分析）。工具：`tools/ui_check.py`、
> `tools/pr_guard.py`、`tools/ui_smoke/`、`tools/sim/`。

## 目录
- [一、项目总览 & 业务领域模型](#一项目总览--业务领域模型)
- [二、编码规范](#二编码规范)
  - [2.1 事务使用规范](#21-事务使用规范强制)
  - [2.2 JPQL / 数据库查询规范](#22-jpql--数据库查询规范)
  - [2.3 身份 / 脱敏规范](#23-身份--脱敏规范)
  - [2.4 异常处理与错误码规范](#24-异常处理与错误码规范)
  - [2.5 空值 / 除零 / 边界计算保护](#25-空值--除零--边界计算保护)
  - [2.6 幂等性 / 状态机约束](#26-幂等性--状态机约束)
  - [2.7 前端规范](#27-前端规范)
  - [2.8 通用代码风格](#28-通用代码风格)
- [三、CR 强制检查清单](#三代码评审-cr-强制检查清单)
- [四、测试规范](#四测试规范)
- [五、接口契约与 API 维护](#五接口契约与-api-维护)
- [六、可观测性规范](#六可观测性规范)
- [七、运维手册](#七运维手册)
- [八、安全规范](#八安全规范)
- [九、Bug 台账 & 历史踩坑库](#九bug-台账--历史踩坑库)

---

## 一、项目总览 & 业务领域模型

**技术栈**：后端 Spring Boot 3.3.4 / Java 17 + MySQL 8（默认 REPEATABLE READ）+ Flyway + Caffeine + Hikari(池 20)
+ JDBC Session；前端无构建原生 JS（每视图一 IIFE，依赖 `app.js` 全局 + `i18n.js`）；数据层 Python 管道
（AKShare/mock → PySpark 指标 → 入库）。单实例 compose 部署，Caddy 反代（prod profile）。

**领域模型**：
- **对局（game_session）**：状态机 `IN_PROGRESS → SETTLED`（单向终态）。玩家 vs AI，结算出收益/风险指标。
- **房间（room）**：`OPEN → SETTLED`。多人同题对局，到期强制结算。
- **每日挑战（daily_challenge）**：全服同题，`uk_user_daily` 每人每天一局。
- **榜单**：收益/夏普（game_session）、竞技场/擂台（backtest_result）、积分（user_points）、每日。公开展示脱敏。
- **积分经济（user_points）**：签到/结算/成就发分，商店兑换。**服务端权威**。
- **客户端状态**：藏品/声望/段位/每日一猜（localStorage，非权威，不进公开榜）。

---

## 二、编码规范

### 2.1 事务使用规范【强制】

- **【强制】循环内调用可能失败的事务方法、且要"失败一个不影响整体"时，被调方必须 `REQUIRES_NEW`**。
  否则内层异常把父物理事务标记 rollback-only，catch 也救不回，提交时 `UnexpectedRollbackException` 500。
  （踩坑：房间强结污染父事务 → 永久 500。范例：`GameService.settleIsolated`）
- **【强制】`catch DataIntegrityViolationException` 后不得在同一事务继续读写**。flush 已失败，提交时 500。
  改用 `INSERT IGNORE` native 语句，或 catch 后直接抛业务异常收场。（范例：`UserService.findOrCreate`、
  `AuthService.register`）
- **【强制】`REQUIRES_NEW` 方法内的 `SELECT ... FOR UPDATE` 必须确认不与父事务持有的行锁冲突**（同 JVM 两连接
  互等 = 自死锁）。
- **【强制】多锁获取顺序必须与既有路径一致**。正常序 `session → account → position`；发分 `session → account →
  user_points`。**禁止反转**（历史雷点：undo 曾 `session → user_points → account`，靠巧合未成环）。
- **【强制】确定性内容禁止用 `SELECT ... FOR UPDATE` 回读**。直接返回计算值，避免插入意向锁与行锁交错死锁。
  （踩坑：每日挑战 getOrCreate 死锁）
- **【强制】`@Transactional(readOnly=true)` 内禁止写操作**。
- **【推荐】事务方法内 catch(Exception) 继续提交前，确认被 catch 的调用是只读的**（否则同 rollback-only 风险）。
  （隐患点：`computeAndStoreBias` 安全仅因 analyze 只读）

### 2.2 JPQL / 数据库查询规范

- **【强制】"取 TOP N + 过滤"的过滤必须在 SQL/JPQL `WHERE`、分页之前**。禁止对分页结果再 `.stream().filter()`
  ——会把真实数据挤出 TOP N。（踩坑：榜单测试账号挤位）
- **【强制】"查-then-写"对唯一键必须做并发保护**（INSERT IGNORE / catch DIV 转业务异常）。RR 隔离下 find 快照
  读看不到并发已提交行，护栏全靠唯一键。
- **【强制】文本块 JPQL 的转义用双反斜杠**（`not like 'x\\_%' escape '\\'`）。
- **【推荐】榜单排序列必须有对应索引**（避免 filesort）：收益榜 `idx_sessions_return`✓；夏普榜/积分榜当前缺，
  需补 `idx(status, final_sharpe DESC)` / `idx_points_balance(balance DESC)`。
- **【推荐】同一过滤口径（如测试前缀）避免散落多处**（Java 常量 + 多段 SQL = 漂移）。
- **【推荐】高频只读榜单加短 TTL 缓存**（10-30s），`isSelf` 等因人而异字段在应用层二次标记。

### 2.3 身份 / 脱敏规范

- **【强制】展示值脱敏后，禁止再用展示值做业务判断**（尤其身份比对）。身份一律用服务端稳定标记
  （`userId` / `isSelf`），不用 username。（踩坑：脱敏后 `username===self` 永不相等）
- **【强制】公开展示用户名必经 `PublicNames`**（邮箱脱敏 `cl***@x` + 测试账号过滤）。好友房间**有意豁免**
  （互相认识）。
- **【强制】新增脱敏字段时，全局搜该字段的 `===`/`equals` 比对点逐一确认是否受影响**。
- **【强制】脱敏/截断函数必须覆盖"输入短于保留长度"边界**（`ab@x.com` 要全遮，不能留前 2 等于没脱）。

### 2.4 异常处理与错误码规范

- **【强制】禁止用错误文案子串做分支判断**（`e.message.includes("登录")`）。用 HTTP status / 异常类型。
  （踩坑：event.js 依赖中文文案）。注意前端网络层失败（`TypeError`）无 `status`，分支对 `undefined` 要安全。
- **【强制】错误响应统一 `{success:false, message}`**：BusinessException→400、NotFoundException→404、
  未处理→500。message 仅用于展示，调用方按 status 分支。
- **【强制】并发唯一键冲突转 400 业务提示**，不暴露 500。
- **【推荐】宽 `catch(Exception)` 吞异常必须留日志**（已有范例：bias 诊断失败 warn 后不拖垮结算）。

### 2.5 空值 / 除零 / 边界计算保护

- **【强制】`BigDecimal.divide` 必带 scale + RoundingMode**；除数来自数据的先判 `signum() > 0`。
  （踩坑：零价行情除零 500）。工具类（如 `TradeMath`）零价由**调用方**处理，不塞 logger。
- **【强制】前端渲染后端数值字段 `v == null ? "--" : fmt(v)`**；`Number()` 前判空。（踩坑：null 回撤显示 +0.0%）
- **【强制】前端用后端行情做除法同样防零价**（踩坑：自动策略 `cash/price` → NaN shares）。
- **【强制】空列表 `get(0)`/`get(size-1)`、日期 `indexOf` 为 null、Integer 拆箱前必判空**。

### 2.6 幂等性 / 状态机约束

- **【强制】按 ID 操作的写接口先校验状态 + 行锁**（`getSessionWithLock` + `requireInProgress`）。重复/弱网重发
  安全（重复 settle → 400，非双重结算）。
- **【强制】"每日/每局一次"标记在动作开始时落库**（占位），非完成时。（踩坑：每日一猜跨零点/刷新绕过）。
  服务端日界用 `GAME_ZONE`（不信客户端时钟）。
- **【强制】一次性奖励必须有唯一键/状态位兜底**（范例：`uk_user_daily`、`taskFlags`）。
- **【强制】"动作得分"必须被动作成本自然限制**；"消耗得收益"必须负 EV（见安全规范，踩坑：SEC-1/SEC-2）。
- **【推荐】高频对局路径评估乐观锁 `@Version` + 重试**，降悲观锁等待。

### 2.7 前端规范

- **【强制】新视图 = 新 IIFE 文件 + `index.html` 挂载 + `i18n.js` 双语键**（所有文案中英双份走 `t()`）。
- **【强制】改 JS/CSS 同步 bump `index.html` 的 `?v=` 版本号**（同日二次改加字母后缀）。无构建器失效缓存，忘 bump = 白改。
- **【强制】渲染用户可控数据（username/reason/params）一律 `textContent`**；`innerHTML` 模板串只插数字/本地枚举/
  i18n 文案（防 XSS，全站已无 XSS，延续纪律）。
- **【强制】颜色引用 `style.css` CSS 变量**（图表用 `cssVar()`），不硬编码；新色在 `:root` 和
  `:root[data-theme="light"]` 双主题都定义。**禁用紫色/蓝紫渐变**（约束新增 UI；存量主题换色需先确认）。
- **【强制】视图 IIFE 依赖 `qs:view` 加载的，必须有"刷新直达"启动兜底**（踩坑：event 视图空白）。
- **【强制】依赖 `localStorage` 的稳定标识有内存兜底 + try/catch**（踩坑：隐私模式游客名碎片化）。
- **【强制】CSS 按视图域分文件**（style 基础层必须首位加载），同一选择器勿跨文件重复（层叠随加载顺序）。
- **【冻结区】右上角工具簇 `.header-tools` 桌面端保持单行横排**，窄屏适配只写 `@media(max-width:720px)`，勿擅改。

### 2.8 通用代码风格

- **【强制】注释用中文，写"为什么"不复述代码**；类/方法级用 `/** */`。口径约定（费用/利息/脱敏）只存在于注释，复述式救不了人。
- **【强制】枚举参数解析统一 `service/Enums.parse`**（trim+大写+带可选值列表的 BusinessException），勿各自手写。
- **【强制】金额一律 `BigDecimal` 显式 scale + RoundingMode**；费用统一 `FeeCalculator`。
- **【强制】DB schema 全走 Flyway**（新表/列只加 `V{n}__*.sql`，不改旧文件，`ddl-auto: validate`）；**迁移禁用 CHAR 列**
  （JPA length 映射 VARCHAR，validate 拒启）。
- **【强制】大 service 单文件 >800 行即按域拆分**（范例：Backtest 门面+引擎+调参；Game 核心+开局+AI+复盘），
  `@Transactional` 只放公共入口。
- **【推荐】优先复用现有共享工具**（`app.js` 共享区 / `Enums` / `FeeCalculator` / `PublicNames`），避免重复造轮子。

---

## 三、代码评审 CR 强制检查清单

> PR 提交逐项勾选。前五条是本轮自引入回归的教训，最该先过。

**改动影响面**
- [ ] 改"展示数据/脱敏/口径/状态机"：全局搜受影响判断点（身份比对/过滤/数值），逐一确认。
- [ ] 高风险改动**先补回归测试再声称完成**，不靠"看着对了"。

**事务**
- [ ] 事务内 catch 另一事务方法：内层是否已标记 rollback-only？隔离失败用 REQUIRES_NEW。
- [ ] catch DIV 后是否在同事务继续写？
- [ ] 多锁获取顺序与既有路径一致（防锁序反转）？REQUIRES_NEW 内 FOR UPDATE 不与父锁冲突？

**查询 / 并发**
- [ ] "取 TOP N + 过滤"的过滤在 SQL 层、分页前？
- [ ] "查-then-写"对唯一键有并发保护？确定性内容未误用 FOR UPDATE 回读？

**空值 / 边界**
- [ ] `divide` 带 scale + 除数判 signum？前端数值字段判 null？脱敏函数覆盖短输入？

**状态 / 异常**
- [ ] 分支用 status/异常类型，不用错误文案子串？
- [ ] "每日/每局一次"标记在动作开始落？服务端日界用 GAME_ZONE？
- [ ] 一次性奖励有唯一键/状态位？"动作得分"被成本限制、"消耗得收益"负 EV？

**前端**
- [ ] 用户数据走 textContent（非 innerHTML）？`?v=` 版本号 bump？颜色用 CSS 变量无紫色？视图有刷新兜底？

**门禁**
- [ ] 后端过 `mvn test`(84)；前端过 `ui_check` + 按钮体检（+ 必要时 crawl/smoke）；PR 过 `pr_guard` 逐条确认。
- [ ] commit 无 AI 署名；无未提交改动；CLI 问题记 `issue_recode/`。

---

## 四、测试规范

**测试金字塔**
- **单元**【强制】：纯计算（IndicatorMath/PositionMath/RiskMath/PublicNames/发分口径/状态机）。
- **集成**【强制】：走真 MySQL（CI 同配），`@BeforeEach` 全清子表。覆盖关键 API + **并发路径**
  （查-then-写/唯一键/状态迁移/锁序）。
- **契约**【推荐】：DTO 字段快照测试，字段增删即 fail（替代人工 api-changes 手记）。
- **E2E**【强制】：`ui_check` 静态 + 按钮体检 + 点击爬虫（`npm run crawl`）+ 冒烟（`npm run smoke`）。
- **混沌 / 故障注入**【推荐】：FI-1~8（连接池饱和/锁等待/断链/弱网/时钟注入，见 `fault-tree-analysis`）自动化。
- **仿真**【推荐】：`tools/sim/montecarlo_sim.py` 长时负载推演（可复现）。

**规范**
- **【强制】每个 bug 对应一条回归用例 + 必要时一条 `pr_guard` 规则**（bug→回归→规则三件套）。
- **【强制】并发用例用 CyclicBarrier + 线程池**，断言"1 成 N 败(400)、无 500、无死锁"。
- **【强制】测试账号用 `smoke_/btncheck_/shot_` 前缀**（榜单自动过滤隔离）；冒烟回测走 `preview:true` 不入榜。
- **【推荐】改后端必重启再跑爬虫**（旧 JVM 配新 classes 会假 500）。

---

## 五、接口契约与 API 维护

- **【强制】错误响应统一 `{success,message}` + status 语义**（见 2.4）。调用方按 status 分支。
- **【强制】DTO 字段只追加不改名/不改序**（追加向后兼容；消费方按字段名访问，禁止按位解构）。
- **【强制】契约变更记入 `docs/api-changes-*`**（变更类型 + 兼容性 + 升级注意）。
- **【推荐】引入 OpenAPI/springdoc + 契约快照测试**，让契约机器可校验（当前靠手记）。
- 受本轮影响接口：leaderboard/daily-leaderboard（新增 `isSelf`）、settle（幂等/REQUIRES_NEW）、
  register/daily-start（500→400）。

---

## 六、可观测性规范

**分层指标**【推荐】
- 业务：发分速率、榜单查询量、房间强结成败、兑换/盲盒、**SEC 可疑高频 start→settle**。
- 系统：5xx by path、RT p50/95/99、JVM/GC。数据库：慢查询 digest、Com_commit/rollback、死锁、连接数。
  事务：Hikari active/idle/pending、rollback-only。

**结构化日志**【强制】
- 统一 `evt=<name> userId=.. sessionId=.. k=v`；**用户名只落脱敏值/userId**。
- 错误分类 `biz/auth/notfound/sys`。关键链路贯穿 MDC `traceId`（结算链/榜单链/房间强结链）。

**告警分级（防风暴）**【强制】
- **P0**：health 非 UP / 5xx>2% / `UnexpectedRollbackException`>0 / 连接池耗尽 → 立即呼叫 + 考虑回滚。
- **P1**：`/rooms`·`/register`·`/daily` 500>0 / 榜单空窗 / Deadlock → 1h 内。
- **P2**：慢 SQL 超阈 / 零价守卫命中 / 强结失败升高 → 工作时间。
- **P3**：SEC 刷分速率异常 / cross-midnight → 趋势观察。
- 同类事件 5min 聚合去重；P2/P3 进日报不即时呼叫。

**埋点清单**：E1 榜单空窗 / E2-E3 房间强结成败+回滚 / E4 脱敏漏网+isSelf 缺失 / E5 注册冲突 / E6 零价守卫 /
E7 每日一猜状态（详见 `docs/observability`）。**落地优先级**：先配零改代码的日志关键字告警
（`UnexpectedRollbackException`/`Deadlock`/连接耗尽），再加 E1/E6。

---

## 七、运维手册

### 7.1 上线灰度流程【强制】
1. 预发跑全套：`mvn -B test`(84) + ui_check + 按钮体检 + 点击爬虫 + 冒烟。
2. 低峰 `docker compose --profile prod up -d --build`；healthcheck（start_period 60s）保证 UP 前不接流量。
3. 观察：前 10min 盯 health + 5xx + 关键字（冒烟每 2min）；前 2h 盯 Hikari 连接 + `/rooms`·`/daily` 500 + LLM 配额；
   24h 观察跨零点与房间首次真实强结。

### 7.2 5 分钟冒烟（上线后）
health UP + 四榜可取 + **脱敏生效（无 smoke_/无未脱敏邮箱）** + 游客开局结算全链路 + 受保护接口 401。
脚本见 `docs/release-acceptance` 第二节（已对本地实测通过）。

### 7.3 自动回滚触发阈值
health 连 3 次失败 / 5xx>2%(5min) / `/rooms` 出现 `UnexpectedRollbackException` / register·daily-start 500>0.5% /
Hikari 持续触顶 + timeout / 冒烟任一核心链路失败。

### 7.4 故障分级 SOP（回滚靠 git 重建，非切镜像 tag；预置 `ROLLBACK_TO`）
- **SOP-1 快速回滚**：`git checkout <stable>` 或 `git revert` → `docker compose --profile prod up -d --build backend`
  → 等 health UP → 跑冒烟。
- **SOP-2 房间 500 止血**：`UPDATE rooms SET status='SETTLED' WHERE status='OPEN' AND expires_at<NOW()` → 再回滚。
- **SOP-3 连接耗尽**：`SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=20`（已配，可再提）→ 重启。
- **SOP-4 误伤真人前缀**：改名 / 临时移前缀；根治=注册保留字。
- **SOP-5 数据污染**：先 `mysqldump` 备份 → 参数化 DELETE by 前缀。

### 7.5 数据恢复 / RTO-RPO
当前单库无备份（RPO 不达标）。短期目标：定时 mysqldump + binlog（RPO<15min）；中期主从 + 自动转移（RTO<5min）。
恢复后跑模块2 对账 + 幂等重放补偿。

---

## 八、安全规范

### 8.1 账号隔离 / 越权【强制】
- 按 ID 操作 `/{sessionId}/**` 必过 `requireAccess(id, CurrentUser.idOrNull)`：注册用户仅本人，他人 404
  （不泄露存在性）；游客开放（设计）。
- 记战绩走 `UserService.resolve`（已登录以会话为准，游客撞注册名拒），**禁止直接 `findOrCreate`**。
- 竞技对局防剧透到 API 层（`BlindDates` 日期平移 + 标的匿名，结算才揭晓）。
- 受保护前缀 `/api/me`·`/rooms`·`/daily`·`/event` 进 `AuthFilter`。

### 8.2 业务防绕过 / 防刷【强制】
- 服务端日界用 `GAME_ZONE`，客户端改钟无法跨零点重复领奖。
- 一次性奖励唯一键/状态位兜底；发分全服务端（前端只触发不自算）。
- **【待修 P0】发分成本约束**：结算发分须绑定有效对局（≥1 交易/推进）+ 每日上限 + winStreak 封顶
  （踩坑 SEC-1 无限结算刷分）。
- **【待修 P0】兑换负 EV**：盲盒等"消耗得收益"成本必须 ≥ 期望收益（踩坑 SEC-2 盲盒 +EV money pump）。
- **【待修 P1】榜单按用户去重**（踩坑 SEC-3 单用户灌水）。
- 烧钱/烧 CPU 接口（LLM advisor / backtest tune）经 `RateLimiter` 限频 + LLM 日配额硬顶；游客开局 IP 限频。
- 限流进程内，多实例部署前换 Redis。

### 8.3 秘密管理【强制】
秘密不入库（`.gitignore` 排除 `.localdb/`、`start-local.bat`、`data-pipeline/data/`）；生产用强口令
（`QUANTSIM_DB_PASSWORD`）；CORS 缺省不开，跨域走 `QUANTSIM_CORS_ORIGINS` 白名单；仅暴露 `/actuator/health`。

---

## 九、Bug 台账 & 历史踩坑库

> 开发自查参考。完整版见 `docs/bug-knowledge-base`（14 条含现象/根因/修复/预防）。根因分类：
> 编码疏漏 57% / 架构隐患 36% / 测试覆盖不足 7%。

| 类 | 历史坑（一句话） | 规则 |
|---|---|---|
| 分页 | 分页后内存过滤挤占 TOP N | 2.2 / pr_guard R1 |
| 身份 | 脱敏后 username 比对失效 | 2.3 / pr_guard R2 |
| 事务 | 循环共用父事务被 rollback-only 污染 → 永久 500 | 2.1 / pr_guard R3 |
| 并发 | 唯一键 check-then-act / getOrCreate FOR UPDATE 死锁 | 2.1/2.2 |
| 异常 | 错误码依赖中文文案 | 2.4 / pr_guard R4 |
| 状态 | 状态结束才落库被跨夜/刷新绕过 | 2.6 / pr_guard R5 |
| 边界 | 除零 / null 渲染 / 短邮箱脱敏 / 游客名碎片化 | 2.5 / pr_guard R6,R7 |
| 契约 | DTO 新增字段 / 500→400 | 五 / 2.4 |
| 安全 | 无限结算刷分 / 盲盒 +EV / 榜单灌水 | 8.2（待修 P0/P1） |

**自动防复发工具**：`tools/pr_guard.py`（扫 7 类历史模式，建议扩 R8 tx 内 catch / R9 check-then-act 无唯一键保护 /
R10 前缀多源）；`tools/ui_check.py`（前端静态）；`tools/ui_smoke/`（按钮体检/点击爬虫/冒烟）。

---

*本手册是活文档：新踩坑 → 更新第九节 + 对应规则 + `pr_guard` 规则 + 回归用例。权威约定以根目录 `CLAUDE.md`
为准，本手册是其展开与运维扩展。*
