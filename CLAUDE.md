# CLAUDE.md

QuantSim 虚拟炒股游戏：AKShare/mock 数据采集 → PySpark 指标 → Spring Boot 3 API → 原生 JS + ECharts 前端。

## 常用命令

```bash
# 后端测试 (集成测试需要本机 3306 有 MySQL, root/root, CI 同配置)
cd backend && mvn -B test

# 后端运行 (静态资源直接指向 ../frontend, 改前端刷新即生效)
cd backend && mvn spring-boot:run     # 或仓库根目录 .\start.ps1 一键启动

# Docker 全家桶
docker compose up -d                              # MySQL + 后端
docker compose --profile pipeline run --rm pipeline  # 一次性灌数据

# 数据管道 (在 data-pipeline/ 下, 顺序执行)
python fetch_data.py        # 采集/mock 行情 -> data/raw/*.csv
python compute_indicators.py  # PySpark 算 MA/波动率 -> data/indicators/
python train_predictor.py   # 滚动窗口训练涨跌预测 -> data/predictions/
python load_to_db.py        # 全部入库 (幂等 upsert)
```

测试说明见 `TESTING.md`。数据库 schema 全部走 Flyway（`backend/src/main/resources/db/migration/`，新表/新列只加新 `V{n}__*.sql`，不改旧文件；`ddl-auto: validate`）。**迁移里不要用 CHAR 列**：JPA `@Column(length=n)` 映射 VARCHAR，validate 模式下 CHAR 列直接拒启（V12/V13 就是在还这个债）。

## 架构速览

- **backend/**：Spring Boot 3 + JPA + Flyway + Caffeine。分层 controller → service → repository；DTO 全部是 record（`dto/*Dtos.java` 聚合类）；业务错误抛 `BusinessException`（400）/`NotFoundException`（404），由 `GlobalExceptionHandler` 统一转 `{success:false, message}`。
- 大 service 已按域拆分（2026-10，单文件 >800 行即拆）：回测 = `BacktestService` 门面（含 tune 调参网格入口）+ `BacktestEngine`（模拟内核）+ `BacktestStrategy`（策略深模块，2026-10 已把原调参网格类的定义收拢进来）；对局 = `GameService` 核心 + `GameStartService`（开局）+ `GameAiService`（AI 操盘）+ `GameBenchmarks`（结算复盘纯计算）。新逻辑放对应域，别往门面里堆回去；`@Transactional` 只放公共入口，拆出的组件是事务内被调方。
- 登录态 = 容器 `HttpSession`（`CurrentUser` 存取 userId），`AuthFilter` 只保护 `/api/me/`、`/api/rooms`、`/api/daily`、`/api/event` 四组前缀，其余接口游客可用（设计如此：降低上手门槛，竞技入口才需要身份）。
- 行情数据只读，整只股票打包缓存（`MarketDataService.StockData`，Caffeine 10 分钟过期）。
- **frontend/**：无构建、无框架。每个视图一个 IIFE 文件，依赖 `app.js` 的全局 `$ / api / toast / switchView / state` 与 `i18n.js` 的 `t()`。`index.html` 引 script 带 `?v=日期` 手动 cache-busting，改了 JS/CSS 记得同步改版本号——没有构建器帮忙失效缓存，忘 bump 等于白改。
- 样式按视图域拆 5 个文件（2026-10）：`style.css` 是基础层（变量/主题/框架，**必须第一个加载**），`game / academy / lab-games / widgets` 四个域各管各的视图。新样式写进对应域文件；同一选择器别跨文件重复定义——层叠顺序随加载顺序走，拆分时翻过一次车。
- 金额一律 `BigDecimal` 且显式 scale + RoundingMode；费用统一走 `FeeCalculator`，玩家/AI/基准/回测同口径。
- Python 管道 SQL 全部参数化（pymysql `%s`），保持这个习惯。

## UI 自动体检（强制）

前端有两层自动化：

**① 静态体检 `tools/ui_check.py`**（重复 id / 引用缺失 id / 死按钮 / i18n 缺键与重复与死键 / 硬编码中文 / 双主题 WCAG 对比度 / 版本号未 bump），
`.claude/settings.json` 的 PostToolUse hook 会在每次 Write/Edit 前端文件后自动跑它，发现 ERROR
直接把报告喂回来——**收到报告立即修复，不要等人工测试**，直到 `0 error(s)` 为止。手动全量巡检
或修复用 `ui-bug-fixer` agent（`.claude/agents/ui-bug-fixer.md`）。动态拼接的 i18n 键前缀
（`t("xxx." + var)` 与模板字符串形式）脚本会自动采集，其余特殊形态登记 `DYNAMIC_KEY_PREFIXES`，
别用忽略报错的方式绕过。

**② 运行时冒烟 `tools/ui_smoke/`**（Playwright，8 步：首访引导、全导航遍历、语言/主题/音效、
弹窗、开局→买入→推进→结算全流程、回测跑通、1280/390 双宽度无横向溢出；全程监听 console
error / pageerror / requestfailed）。跑法：起后端（库里要有数据）后
`cd tools/ui_smoke && npm run smoke`；首次先 `npm install && npx playwright install chromium`。
注意无头浏览器会 dismiss 原生 `confirm()`——脚本已统一 accept；新增 confirm 流程时记得冒烟会自动确认。

**③ 按钮体检 `tools/ui_smoke/button_check.mjs`（强制）**：真浏览器遍历全部视图，专查死按钮
（无 click 监听，含事件委托识别）/ 无可访问名称 / 重复 id / 零尺寸按钮，并监听 console error /
pageerror / 5xx。**每次写入/修改代码之后都必须运行**：起后端后
`cd tools/ui_smoke && npm run buttons`，有 error 立即修复到退出码 0 为止。

**④ 点击爬虫 `tools/ui_smoke/click_crawler.mjs`（手动巡检）**：真浏览器遍历全部视图、逐个点击可见按钮，
观察 console error / pageerror / 5xx（=error）与"点了没反应"（=noop 警告）；与 ③ 互补——③ 查"有没有监听"，
这里查"真点下去会不会炸"。跑法：起后端后 `cd tools/ui_smoke && npm run crawl`（可 `--view=lab` 单视图）。
业务 400 视为预期拒绝放行；回测请求自动改 preview 不入榜；桌宠悬浮层/登出按钮不点。
注意：**改完后端必须重启再爬**，旧 JVM 配新 target/classes 会报 NoClassDefFoundError 之类的假 500。

**⑤ 历史踩坑扫描 `tools/pr_guard.py`（PR 评审）**：扫变更代码里 `docs/bug-knowledge-base.md` 的 7 类反面模式
（分页后过滤 / username 身份比对 / 循环共用父事务结算 / 错误码依赖中文文案 / 状态结束才落库 /
除零缺保护 / 空值无兜底渲染），命中给风险解释 + 修改示例。跑法：`python tools/pr_guard.py`
（扫 git 变更，对比 origin/main）或 `--all` 全仓、`--strict` 让高置信规则卡 CI。启发式有误报，
**默认只告警不阻断**，确认后按示例改或在扫描器里收窄。新增历史坑在 `pr_guard.py` 的 `RULES` 里登记。

**⑥ 浏览器 CLI `tools/ui_smoke/browse.mjs`（任意验证）**：参数化真浏览器操作，动作按命令行顺序执行——
`node browse.mjs --view lab --login auto --click "#btn-x" --fill "#inp=5" --assert-text "#out=成交" --assert-no-console-error --screenshot out.png --json`。
走真实后端（`QUANTSIM_URL` 可改地址），`--json` 输出结构化步骤结果（`{ok, steps, consoleErrors, http5xx}`），退出码 0/1。
用途：验证某个具体改动的交互效果、产出修改前后的截图对比证据——固定流程用 ②③④，**针对性验证用它**。

## 工作流纪律（强制）

1. **CLI 脚本出问题必须记录**：每次运行 CLI 脚本发生问题后，在根目录 `issue_recode/` 下找到当前
   任务对应 issue 号命名的 md 文件（如 QuantSim#1 → `1.md`）追加记录；文件不存在则创建。每条记录
   开头必须写清日期（年月日，如 `## 2026-10-14`），写明问题现象、根因、处理结果。
   ——为什么：同类环境坑（编码/缺依赖/库没起）反复出现，有记录下次秒查，不用重新踩一遍。
2. **写代码后必须跑按钮体检**：任何代码写入/修改完成后，运行 `cd tools/ui_smoke && npm run buttons`
   （见上「UI 自动体检 ③」），通过后才算完成。
   ——为什么：无框架站没有类型/构建兜底，死按钮和运行时报错只有真浏览器点一遍才能暴露。
3. **检查通过后必须 commit**：按钮体检（及相关检查）通过后，立即 `git commit` 本次改动，不要积攒
   未提交的变更。
   ——为什么：小步提交才有干净回退点；本仓库曾因批量脚本中途失败截坏过文件，靠最近提交才恢复。

## 强制闭环工作流（每个任务必须走完）

**分析 → 修改 → 自动验证 → 未通过回到分析 → 通过后输出前后差异证据。** 禁止没跑验证就宣布完成。

- 验证手段按改动范围选：前端 → `ui_check.py` + `npm run buttons`（针对性交互用 browse.mjs，见体检⑥）；
  后端 → `cd backend && mvn -B test`；数据管道 → `cd data-pipeline && python -m pytest`；跨层 → `npm run smoke`。
- 验证未通过 = 回到分析（按下节 Evidence-First 归因），不是盲改重试。
- **通过后必须给出前后差异证据**，三选一：测试结果 diff（修前失败输出 vs 修后通过输出）、
  browse.mjs/shot 修改前后两张截图路径、关键日志行对比。只说"改好了"不算完成。

## Evidence-First 失败归因（验证失败后的固定三步）

1. **先查既有证据**：按错误形态查 `docs/bug-knowledge-base.md`（代码类反面模式）和
   `issue_recode/`（环境/CLI 踩坑）——同类坑大概率踩过，秒查比重新定位快。
2. **结论必须带证据**：每个归因判断都要指向具体证据（日志行、测试输出、截图路径、git diff 行），
   禁止"大概是/应该是"这类无证据断言。
3. **没有既有证据就自己设计最小实验**：写最小单测、curl 单个接口、browse.mjs 单动作复现，
   把问题缩到能二分定位的范围，确认根因后再动手改。

## 自主任务协议（阶段二：AI 自主完成单个任务）

适用：用户给出明确需求让 AI 独立完成时，按此流程执行：

1. **对齐**：复述需求 + 验收标准（不明确就先问），输出计划（涉及文件 + 验证方式）。
2. **实施**：按计划修改，遵守本文件全部守则。
3. **自动验证**：按「强制闭环工作流」跑对应验证。
4. **有限自修**：验证失败最多自修 **2 轮**；每轮必须按 Evidence-First 换一个有新证据支撑的归因假设，
   禁止同一假设反复试。
5. **收尾**：按 `docs/TASK_REPORT_TEMPLATE.md` 提交结果报告——通过给差异证据；2 轮未过停手，
   报告已排除假设 / 剩余疑点 / 建议，并把案例记入 bug-knowledge-base（代码类）或 issue_recode（环境类）。

## Git 提交规范（强制）

- 每次代码修改完成后，必须先跑 CLI 工具验证（见「UI 自动体检」与后端 `mvn test`），发现问题修到通过，
  然后**立即** `git commit`。
- 提交信息清晰，**用英文书写**，带 `feat: ...`、`fix: ...`、`refactor: ...`、`docs: ...` 前缀。
- 不允许留下未提交的修改。
- **不添加 AI 的署名或 Co-authored-by 信息**（commit message 与 PR 描述都不加）。

## 工作方式（强制）

- **先思考，再编码**：不要擅自假设需求；遇到歧义先说明假设、分析方案，必要时向用户确认。
- **保持简单**：只实现用户要求的功能，不添加多余功能、抽象或复杂设计。
- **精准修改**：只修改与需求直接相关的代码，不顺手重构其他模块；只清理自己此次修改产生的无用代码。
- **以结果为导向**：先明确成功标准和执行计划，再通过测试、构建等方式验证结果，发现问题就继续修复。
- **优先复用现有代码**；确实需要重复使用的逻辑抽象为可复用函数，避免重复造轮子（本仓库已为此清过
  一轮债，见 `app.js` 共享工具区与 `service/Enums`/`FeeCalculator` 的注释）。

## 设计规范（强制）

**每次新建或修改前端页面/组件/样式之前，必须先读根目录的 `design.md`，并严格按其中的色值、字号、间距、圆角、阴影规范实现，保证全站风格统一。** 颜色永远引用 `style.css` 的 CSS 变量（图表色用 `cssVar()` 取），不得硬编码色值；新增颜色先在 `:root` 和 `:root[data-theme="light"]` 两个主题里都定义。

- **禁止使用紫色、蓝紫色及相关渐变**（2026-10-15 用户钦定）。注意：现存主题的 `--accent` 系恰是紫色——
  这条规矩约束**新增** UI；存量主题是否整体换色是单独的大改动，动之前必须和用户确认方案。
- 保持整体视觉风格一致。
- 在可以用图形和按钮说明操作的情况下，不要添加多余的解释性文字——界面自解释优先于说明文案。

## 安全与正确性守则（来自 2026-10 对 enhance 分支的审计，勿再犯）

### 高危教训（2026-10 已修复，新代码勿回退）

1. **按 ID 操作的接口必须校验属主。** 曾经 `/api/game/{sessionId}/**` 对任意自增 sessionId 直接操作，任何人可推进/交易/结算别人的对局。现在 `GameController` 每个 `/{sessionId}/` 端点先调 `GameService.requireAccess(sessionId, CurrentUser.idOrNull(http))`：注册用户的对局仅本人可访问，他人得 404（不泄露存在性）；游客对局无法绑身份、保持开放。新写任何 `/{id}/...` 接口照此办理。
2. **不要信任请求体里的 username。** 曾经游客在 `/api/game/start`、`/api/backtest/run|tune` body 里填已注册用户名即可冒名入榜。现在统一走 `UserService.resolve(username, authUserId)`：已登录以会话身份为准（忽略 body），游客昵称命中 `passwordHash != null` 的用户直接拒绝。新的"记战绩"入口一律用 `resolve`，不要直接 `findOrCreate`。
3. **烧钱/烧 CPU 的接口必须限流。** advisor 系列（Claude API 配额）与 `/api/backtest/tune`（全历史网格搜索）现在经 `config/RateLimiter`（进程内滑动窗口，登录用户按 userId、游客按 IP）限频。新增 LLM/重计算接口时同样接入；多实例部署需换集中式限流。
4. **防剧透要防到 API 层，不能只靠前端不显示。** 曾经竞技对局（每日挑战/房间）的 K 线带真实 `tradeDate`，拿日期查无鉴权的 `/api/lab/history/{code}` 即可看"未来"。现在 `service/BlindDates` 双重脱敏：所有日期平移到虚拟纪元（K 线、状态、挂单、结算复盘、LLM 上下文），且**标的身份匿名**（进行中一律 `???`/神秘标的——开局响应、today、房间视图、当日每日榜、挂单回执、LLM 上下文全覆盖），结算时 `SettleResponse.stockCode/stockName` 揭晓。竞技对局不下发新闻事件（文本会暴露真实时间）。新增竞技相关字段时先想"这个字段能不能反推出窗口或标的"。
5. **对局内"上帝视角"套利。** 曾经 `GameService.trade` 允许按当日 `[low, high]` 任意价成交，当日 K 线已揭示 → 每天低买高卖稳赚刷榜。现在手动交易只按当日收盘价成交（前端价格框只读锁定收盘价），其他价位走挂单（次日按 OHLC 撮合）。不要为"手感"放开这个限制。

### 中危教训（6–9 已于 2026-10 修复）

6. ~~CORS 默认 `*`~~ → 现在缺省**不开 CORS**（同源部署），跨域需 `QUANTSIM_CORS_ORIGINS` 显式白名单（`WebConfig`）。仍无 CSRF token，靠 `same-site: lax` 兜底：新增状态变更接口保持 POST + JSON body（不要做 GET 写操作——`advisor/stream` 是 GET 仅因 SSE 限制，勿再扩散）。
7. ~~登录/注册无速率限制~~ → `AuthController` 按 IP 限频（`quantsim.auth.per-minute`，集成测试里放宽到 10000）。"游客记录"提示仍可枚举用户名，新增认证接口注意模糊报错。
8. ~~会话固定~~ → `CurrentUser.login` 已先 `invalidate()` 旧会话再新建；登录态经 Spring Session 落库（`SPRING_SESSION` 表），发版重启不掉线。
9. ~~3306 暴露 + root/root~~ → compose 已去掉 mysql 端口映射，口令走 `QUANTSIM_DB_PASSWORD`（默认 root 仅限本地）。生产必须换强口令。
10. ~~`findOrCreate` 让匿名请求无限制创建 users 行~~ → 已修：游客开局按 IP 限频（`quantsim.game.guest-start-per-minute`，`GameController.start`）；登录用户不受限。新的"游客可写库"入口照此加限频，否则又是刷库口子。

### 上线设施（2026-10 加入，改动时别破坏）

- **LLM 成本硬顶**：`quantsim.advisor.daily-limit`（默认 300/天，24h 滑动窗口，`RateLimiter.checkDaily`）+ 每调用方 10 次/分钟。新增 LLM 接口必须两个都接。
- **数据保鲜**：`config.py` 的 `END_DATE` 动态取今天；`quantsim.refresh.enabled` 默认开（可用 `QUANTSIM_REFRESH_ENABLED=false` 关）。
- **健康检查**：只暴露 `/actuator/health`，别开其他 actuator 端点。
- **生产入口**：`docker compose --profile prod up -d` 启 Caddy（`deploy/Caddyfile`），配 `QUANTSIM_DOMAIN` 自动 HTTPS。
- **限流是进程内的**（`config/RateLimiter`）：多实例部署前必须换集中式（Redis）。

### 已验证的好实践（保持）

- 前端渲染用户可控数据（用户名、params 等）一律 `textContent`，模板字符串 `innerHTML` 里只插数字/本地枚举/i18n 文案——目前全站无 XSS，新代码延续这个纪律（见 `app.js renderLeaderboard`、`rooms.js`、`history.js` 的写法）。
- 秘密不入库：`.gitignore` 已排除 `.localdb/`、`start-local.bat`、`data-pipeline/data/`；提交前若新增含密钥/本机口令的文件，先加 ignore。
- 并发写用 `findWithLockBy...` 悲观锁（session/account/room），别用先查后插。唯一约束冲突：若 catch 后还要在**同一事务**里继续读写，不能用 `saveAndFlush` + catch（flush 失败会把事务标记 rollback-only，提交时 500），改用 `INSERT IGNORE` native 语句（见 `UserPointsRepository.insertIgnore`）；只有 catch 后直接抛业务异常收场的场景才允许 catch `DataIntegrityViolationException`。
- 回测/自定义策略全部经 enum 白名单解析（`BacktestStrategy` 的 `CustomField/CustomOp` + `Enums.parse`），没有任何 eval/拼接——扩展策略字段时沿用，用户输入永远到不了可执行层。

## 布局冻结区（用户钦定，勿擅改）

- **右上角工具簇 `.header-tools`（🎁积分 / 登录 / EN / 主题 / 音效）在桌面端必须保持单行横排**。
  2026-10 曾为修 390px 溢出给它加 `flex-wrap: wrap` 导致桌面端变竖排，被用户退回。
  窄屏适配只允许写在 `@media (max-width: 720px)` 里；除非用户明确要求，不要改这个区域的布局。

## 代码风格

- 注释用中文，写"为什么"而不是复述代码（现有代码是范例）；类/方法级用 `/** */`——这个项目大量口径约定（费用/利息/脱敏）只存在于注释里，复述式注释救不了下一个改口径的人。
- 枚举参数解析统一走 `service/Enums.parse`（trim + 大写 + 带可选值列表的 `BusinessException`）——之前各 service 手写 7 份，错误文案互相漂移过，别再散开。
- 前端新视图 = 新 IIFE 文件 + `index.html` 挂载 + `i18n.js` 双语键（所有文案必须中英双份，走 `t()`）——站点承诺中英切换，漏一个键 `ui_check.py` 会报错，硬编码中文则直接漏给英文用户。
