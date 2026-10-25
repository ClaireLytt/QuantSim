# 安全与正确性守则（2026-10 enhance 分支审计全文，CLAUDE.md 持指针）


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

