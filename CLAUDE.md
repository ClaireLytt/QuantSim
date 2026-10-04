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
- 登录态 = 容器 `HttpSession`（`CurrentUser` 存取 userId），`AuthFilter` 只保护 `/api/me/`、`/api/rooms`、`/api/daily` 三组前缀，其余接口游客可用（设计如此）。
- 行情数据只读，整只股票打包缓存（`MarketDataService.StockData`，Caffeine 10 分钟过期）。
- **frontend/**：无构建、无框架。每个视图一个 IIFE 文件，依赖 `app.js` 的全局 `$ / api / toast / switchView / state` 与 `i18n.js` 的 `t()`。`index.html` 引 script 带 `?v=日期` 手动 cache-busting，改了 JS/CSS 记得同步改版本号。
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

## 设计规范（强制）

**每次新建或修改前端页面/组件/样式之前，必须先读根目录的 `design.md`，并严格按其中的色值、字号、间距、圆角、阴影规范实现，保证全站风格统一。** 颜色永远引用 `style.css` 的 CSS 变量（图表色用 `cssVar()` 取），不得硬编码色值；新增颜色先在 `:root` 和 `:root[data-theme="light"]` 两个主题里都定义。

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
10. `findOrCreate` 让匿名请求无限制创建 users 行（DB 垃圾数据）——**仍未修**，要修的话给游客开局加 IP 限频即可。

### 上线设施（2026-10 加入，改动时别破坏）

- **LLM 成本硬顶**：`quantsim.advisor.daily-limit`（默认 300/天，24h 滑动窗口，`RateLimiter.checkDaily`）+ 每调用方 10 次/分钟。新增 LLM 接口必须两个都接。
- **数据保鲜**：`config.py` 的 `END_DATE` 动态取今天；`quantsim.refresh.enabled` 默认开（可用 `QUANTSIM_REFRESH_ENABLED=false` 关）。
- **健康检查**：只暴露 `/actuator/health`，别开其他 actuator 端点。
- **生产入口**：`docker compose --profile prod up -d` 启 Caddy（`deploy/Caddyfile`），配 `QUANTSIM_DOMAIN` 自动 HTTPS。
- **限流是进程内的**（`config/RateLimiter`）：多实例部署前必须换集中式（Redis）。

### 已验证的好实践（保持）

- 前端渲染用户可控数据（用户名、params 等）一律 `textContent`，模板字符串 `innerHTML` 里只插数字/本地枚举/i18n 文案——目前全站无 XSS，新代码延续这个纪律（见 `app.js renderLeaderboard`、`rooms.js`、`history.js` 的写法）。
- 秘密不入库：`.gitignore` 已排除 `.localdb/`、`start-local.bat`、`data-pipeline/data/`；提交前若新增含密钥/本机口令的文件，先加 ignore。
- 并发写用 `findWithLockBy...` 悲观锁（session/account/room），唯一约束冲突用 catch `DataIntegrityViolationException` 重读，别用先查后插。
- 回测/自定义策略全部经 enum 白名单解析（`BacktestService.parseField/parseOp`），没有任何 eval/拼接——扩展策略字段时沿用。

## 代码风格

- 注释用中文，写"为什么"而不是复述代码（现有代码是范例）；类/方法级用 `/** */`。
- 枚举参数解析统一 `valueOf(trim().toUpperCase())` + 抛带可选值列表的 `BusinessException`。
- 前端新视图 = 新 IIFE 文件 + `index.html` 挂载 + `i18n.js` 双语键（所有文案必须中英双份，走 `t()`）。
