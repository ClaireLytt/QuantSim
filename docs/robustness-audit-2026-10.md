# QuantSim 隐性Bug挖掘与鲁棒性加固报告（2026-10）

> 只读审计，未修改任何代码。方法：5 路并行代码审计（撮合资金 / 生命周期定时任务 / 权限脱敏 / 缓存并发异常 / 前端），每条结论要求 `文件:行号` 证据，区分**已验证真缺陷**与**理论风险**。本轮延续上一轮已修复项（属主校验、resolve、BlindDates、限流、悲观锁、INSERT IGNORE），下列为**残留与新发现**。

**结论速览**：P0 ×3、P1 ×8、P2 ×13、理论风险/设计取舍 ×10+。历史高危模式均未回退；新缺陷集中在三个交界处：**挂单×其他子系统**、**竞技脱敏的"揭晓时机"**、**游客入口的限流覆盖面**。

---

## 1. 行情与撮合交易逻辑潜在缺陷

### 1.1 [P1] 进阶模式"保护性卖出挂单"可意外开空/翻空（真缺陷）
- 触发：advanced（US/CRYPTO）局，多头挂 STOP_LOSS/TAKE_PROFIT/TRAIL_STOP/LIMIT_SELL 后手动清仓（或两张同量止损单同日双触发），次日撮合时持仓已空。
- 证据：`OrderService.java:163-170` 撮合只调 `tradeEngine.validate` 即 execute；`TradeEngine.java:166-202` 普通模式 SELL 有"持仓股数不足"检查，**进阶分支只做净值/杠杆约束不查持仓**，SELL 经 `PositionMath.apply` 穿越零点开空。
- 影响：平仓保护单变开空单，多头被打成净空头；语义错误承担反向风险。
- 修复：PendingOrder 增加 reduce-only 意图；卖类保护单撮合时 clamp 到当前多头持仓（为 0 自动撤单），与普通模式对齐。
- 回归：advanced 买 100 股→挂 STOP_LOSS 100→手动全卖→tick 触发→断言持仓 0 且挂单 CANCELLED（当前得 -100）。

### 1.2 [P1] 「后悔药」撤销挂单成交流水：账实分叉 + 笔数预算泄漏（真缺陷）
- 触发：当日挂单成交后调 `/undo-trade`。
- 证据：`GameService.java:586-597` undo 取当日 max(txId) 删流水重放，不区分来源；挂单 `status=FILLED/filledPrice`（`OrderService.java:172-174`）不回滚。`budgetUsed = countBySessionId(tx) + countOpen`（`GameService.java:325-327`），FILLED 单两侧都不计。
- 影响：①挂单显示已成交但资金持仓里没有这笔；②限笔模式可反复"挂单成交→undo"绕过 maxTrades。
- 修复：TradeTransaction 加 orderId 外键；undo 命中挂单流水时把挂单改回 OPEN（或 CANCELLED）；或 undo 仅允许撤手动交易（流水打来源标）。
- 回归：maxTrades=2，挂单成交 1 笔→undo→断言 budgetUsed 仍为 1（当前为 0）。

### 1.3 [P2] 结算/强平后 OPEN 挂单永久残留
- 证据：`GameService.doSettle`（413-487）与 `forceLiquidate`（246-261）均不触碰 PendingOrder。无资损但 `/orders` 永远显示 OPEN，复盘误导 + 脏数据累积。
- 修复：doSettle 批量置该 session OPEN 单为 CANCELLED。回归：挂不触发的 LIMIT_BUY 推到结算，断言 CANCELLED。

### 1.4 [P2] 数据管道零质量校验：qfq 负价/high<low/重复行直通入库
- 证据：`fetch_data.py:28-56` 无 close>0、high≥low、去重校验（AKShare qfq 长历史高分红股确实会产出负价）；`load_to_db.py:31-44` 原样 upsert。后端零价防御完整（maxWholeShares/AI/limitBand 均有守卫），但**负价穿透 `TradeEngine.equity`（117-124）**把多头估成负贡献→进阶模式误强平。
- 修复：fetch/load 加断言（OHLC>0、high≥max(open,close,low)、(code,date) 去重），异常行丢弃并告警。
- 回归：构造 close=-1 的 CSV 跑 load_to_db 断言被拒；后端单测含负价 bar 的 equity 行为。

### 1.5 [P2] `compute_indicators.py:168` pct_change 除零无保护（命中 pr_guard 第 6 类反面模式）
- `(close-prev_close)/prev_close` 无 `prev_close != 0` 守卫，Spark 产出 Infinity 入库变垃圾值。修复：`F.when(F.col("prev_close") != 0, ...)` 否则 NULL。

### 1.6 已核安全（证据）
费用口径全站统一（grep `commissionRate|stampTax` 仅 FeeCalculator 命中，玩家/AI/挂单/基准/回测全走同口径）；BigDecimal divide 全量显式 scale+RoundingMode 且除零输入面均有守卫；停牌缺日按索引跳过 + `lastCloseOnOrBefore` 回退；跳空撮合 min/max(open,trigger) 方向正确；重放（undo/equityCurve）与 tick 的"先利息后交易"口径一致；AI 无超卖透支路径。理论风险：挂单不冻结资金（文档化设计，普通模式有逐笔 validate 兜底）、回测 double 口径微漂移、均价两位舍入（显示用）——可接受。

---

## 2. 资金&资产核算漏洞

本模块真缺陷即 1.2/1.4（undo 账实分叉、负价穿透估值）。另：

### 2.1 [P2] `TradeEngine.validate:191` `closes.getOrDefault(key, price)` 口径隐患
缺失标的用本笔成交价估值其他标的。当前 closes 覆盖全部 session 标的、实际不可达，但属埋雷写法，建议改 `lastCloseOnOrBefore`。

### 2.2 已核安全
金额列宽（DECIMAL(12,2) 百亿上限）无溢出面；积分并发全部经 `getOrCreate`→悲观锁串行化 + `insertIgnore` 首插，12 个发放/消费点无旁路；结算与积分同事务，异常整体回滚可重试，无"半结算"状态。

---

## 3. 房间/赛季生命周期状态漏洞

### 3.1 [P0] 登录用户"秒开秒结"无限刷积分（真缺陷，脚本即可利用）
- 触发：注册用户循环 `POST /api/game/start`（登录用户**无任何限流**，`GameController.java:67-76` 只限游客）→ 立即 settle（`GameService.settle` 不要求 daysElapsed 达标，day-0 可结算）→ `PointsService.awardSettle` 无条件 +50。
- 影响：积分经济（商城/积分榜）可刷爆 + 垃圾 SETTLED 会话刷库。
- 修复：基础分改为"达到 totalTicks 或强平才给"；叠加登录用户开局限频 + 结算奖励日封顶。
- 回归：连开 3 局秒结断言积分不涨；打满结算断言 +50。

### 3.2 [P1] RoomService 到期强结只 catch BusinessException，NotFoundException 复刻"房间永久 500"（真缺陷）
- 证据：`RoomService.java:260-268` `catch (BusinessException e)`；`GameService.doSettle:~415` 会抛 `NotFoundException`（继承 RuntimeException 非 BusinessException）。异常逃出 evaluateTransitions → view 事务回滚，房间永远迁不到 SETTLED，每次访问 500——bug-knowledge-base #3 症状以另一异常类型复活（REQUIRES_NEW 隔离只对被 catch 的异常生效）。
- 修复：catch 收宽为 RuntimeException + error 级带栈日志。回归：mock settleIsolated 抛 NotFoundException，访问过期房间断言 200 且迁 SETTLED。

### 3.3 [P2] RoomService.play 不校验 expiresAt：过期房间仍可开局随即被 day-0 强结（对比 join 有校验；`RoomService.java` play 只查 SETTLED）。修复：补与 join 相同的过期拒绝。
### 3.4 [P2] view 强结后一级缓存脏读：REQUIRES_NEW 已提交，但父事务持久化上下文返回旧托管实例，本次响应该成员仍显示未完成（`evaluateTransitions` 内 `findById` 命中一级缓存）。修复：强结后 refresh/detach，或直接用 SettleResponse 回填。
### 3.5 [P2] `GET /api/rooms/{code}` 是写操作（惰性强结+setStatus），违反自家守则（CLAUDE.md 教训 6"不要做 GET 写操作"）；same-site:lax 下顶级导航 GET 带 cookie，第三方页可替受害者触发过期房间提前结算。修复：迁移逻辑挪出 GET 或由 POST 动作触发。
### 3.6 [P2] 僵死数据无清理：全仓仅 1 个 @Scheduled（数据刷新），无人访问的过期房间永远 OPEN、弃局永远 IN_PROGRESS，表只增不减。属产品取舍，建议加每日清理任务或文档声明。

### 3.7 已核安全
并发/重复 settle 由悲观锁+requireInProgress 拦截（三条结算路径同口径）；每日挑战双开由唯一键+saveAndFlush+catch 后直接抛异常收场（符合 kb #5/#6）；getOrCreate(daily) 无 FOR UPDATE 回读（kb #6 修复在位）；房间建码/join/play 全锁串行、锁顺序恒 room→session 无交叉；"已玩"标记开局即落（kb #9 在位）。

---

## 4. 异步定时任务风险

- 唯一定时任务 `DataRefreshService.scheduledRefresh`：异常全 catch 不杀调度、输出泵独立线程、超时 destroyForcibly——健壮。多实例重复执行为已知理论风险（管道幂等 upsert 兜底）。
- [P2] 失败路径丢堆栈：`DataRefreshService.java:85-87` `log.error(..., e.getMessage())` 不传 e，NPE 时只剩"失败: null"。改 `log.error("...", e)`。
- [P2] `props.getCommand().split("\\s+")`：命令路径含空格即碎裂（Windows 常见），当前默认值不触发，理论风险。
- 文档漂移：`RefreshProperties.enabled` 注释称默认关，`application.yml:86` 实际默认开，同步注释。
- 重复发放奖励：结算与 awardSettle 同事务 + 锁，重试无重复发放路径（已核）。任务锁：无分布式锁（单实例前提已文档化）。

---

## 5. 权限脱敏与越权漏洞

### 5.1 [P0] 每日挑战跨零点剧透：昨日榜对"昨日局仍在进行中"的玩家揭晓标的（真缺陷）
- 证据：`DailyChallengeService.leaderboard()` `maskStock = day.equals(today)`——只有今天的榜脱敏，昨日榜直发真实股名/代码；而跨零点未结算的昨日对局 `BlindDates.blind()` 仍判盲。拿 code 查无鉴权 `/api/lab/history/{code}` 用价格形态对齐窗口即可看"未来"，回去推进自己的昨日对局稳赚上榜（日榜只按 challengeDate 过滤不限结算时间）。
- 修复：请求者在该日仍有未结算 DAILY 会话时整榜脱敏；或昨日榜过宽限期（date+1 收盘后）才揭晓。
- 回归：mock clock 造"昨日开局未结算"，查昨日榜断言 `???`；结算后断言揭晓。

### 5.2 [P0] 结算复盘 journal 下发真实 tradeDate，泄露竞技窗口（脱敏不一致，真缺陷）
- 证据：`BiasAnalysisService.java:154-156` `new JournalEntry(tx.getTradeDate(), ...)` 原样下发；同仓相反口径——`GameService.java:541-543` listTransactions 对盲局**结算后仍** mask、`AdvisorService.java:319/332` 同样永久 mask。设计意图"结算只揭晓标的不揭晓窗口"被 journal 单点打破。
- 影响：先打完的人 = revealCode + journal 真实日期 = 当日挑战完整答案，可喂小号/房间同伙屠榜（CLAUDE.md 教训 #4 担心的反向泄露链，journal 是链上唯一真实日期字段）。
- 修复：一行——journal 日期走 `BlindDates.mask`。回归：DAILY 局带 reason 下单→结算→断言 journal 日期在虚拟纪元。

### 5.3 [P1] 游客 `/api/backtest/run` 无限刷 users 行与公开擂台榜（教训 #10 残留）
- 证据：`BacktestController.java:38-42` run 无限流（仅 tune 有 6/min）→ `resolve`→`findOrCreate` 无条件 insertIgnore。对照 game start 游客已按 IP 限频，修 #10 时漏了回测入口。任意昵称可灌进 `/api/backtest/leaderboard` 霸榜。
- 修复：同款游客按 IP 限频。回归：匿名连打 N 次 run，第 limit+1 次 429/400，users 行数不再线性涨。

### 5.4 [P1·设计缺口] 竞技盲测可被"价格指纹"离线破解
- 盲局 K 线下发精确 OHLC/量（仅日期平移），`/api/lab/history/{code}` 无鉴权全库开放——脚本滑窗比对收盘序列即可唯一定位标的+真实窗口；mask 平移还保留节假日间隔指纹。`BlindDates.java:37-39` 注释声称"已堵死"与事实不符。
- 修复需产品决策：竞技局行情乘随机系数归一化展示，或只发收益率曲线；短期先改正注释、列为已知风险。
- 验证思路：10 行脚本用某 DAILY 局前 5 根收盘在 lab 数据中检索，断言唯一命中。

### 5.5 [P1·运维] 反代下 `getRemoteAddr` 全变代理 IP，按 IP 限流退化为全站共享单桶
- 证据：`deploy/Caddyfile:6` reverse_proxy；yml 无 `server.forward-headers-strategy`；限流点（AuthController/GameController/PetController/BacktestController）全用 getRemoteAddr。一个滥用者触发限流即 DoS 全站同类请求。
- 修复：`server.forward-headers-strategy: framework`（仅信任 Caddy 一跳）。

### 5.6 [P2] 公开总榜下发 sessionId + 游客局全网开放 = 可枚举操纵游客局
- `LeaderboardService.java:36-40` 榜单含 sessionId；`GameService.requireAccess:91-100` 游客局一律放行——任意人可对榜上游客局 trade/settle/烧道具（peek/undo 会 `consumeItem`）。修复：榜单不下发 sessionId；或游客局绑开局随机 token。
### 5.7 [P2] advisor `q` 参数无长度上限（对照 pet-chat 有 @Size(200)），单次可塞超长问题放大 LLM token 成本。service 入口截断。
### 5.8 [P2] 用户名无字符白名单：同形异义字（Cyrillic а）可视觉冒充榜上他人（大小写绕过已被 MySQL ci 唯一键挡住，已核）。收紧为 `[\p{L}\p{N}_@.\-]` 禁零宽/控制字符。

### 5.9 已核安全
GameController 16 个 /{sessionId}/ 端点逐一 requireAccess 无遗漏；撤单二次校验归属；K线/状态/开局/挂单回执/流水/LLM 上下文/me 接口全走 BlindDates（journal 为唯一破口）；主榜仅 CLASSIC/PORTFOLIO 无盲局窗口泄露；身份统一 resolve、mode 白名单挡自造竞技局；三处公开榜 PublicNames 脱敏 + 测试号排除。

---

## 6. DB&缓存并发读写隐患

### 6.1 [P1] RateLimiter 陈旧队列删不掉，伪造来源可无界撑内存（真缺陷）
- 证据：`RateLimiter.java:40-47` 清理 `removeIf(isEmpty())`，而过期戳只在**同 key 下次 check** 才 pollFirst——海量一次性 key（伪造 IP 低速扫描）各留 1 条戳的非空队列永远删不掉，hits map 单调增长；removeIf 还是 O(n) 全表扫。
- 修复：removeIf 判定加"peekLast 距今超 24h"；或整个换 Caffeine `expireAfterAccess(25h)`。
- 回归：单测 20001 个不同 key 各 check 一次（时间源可注入），断言 map 有界。

### 6.2 [P2] MarketDataService 缓存击穿 + 半灌库脏缓存窗口
- `@Cacheable("stockData")` 未加 `sync=true`（`MarketDataService.java:89-90`），失效瞬间并发全量重载（4 表+指标计算）；`maximumSize=64` 可能小于实际 stocks 行数（事件回放 hidden 标的各占一行）形成驱逐抖动。半灌库快照（prices 新、indicators 旧）各下游路径均 null 容忍不崩但口径失真 10 分钟；手动跑管道不清缓存（仅 `DataRefreshService.java:76-79` 成功路径清）。
- 修复：`sync=true` + 调大 maximumSize；运维文档注明"手动灌库后重启或等 10 分钟"。

### 6.3 [P2] AdvisorService.chatHistory 迭代无同步：buildMessages 的 for 未持 history 锁，与 recordTurn 并发可 ConcurrentModificationException → 500。修复：synchronized 下复制快照再迭代。
### 6.4 已核安全
悲观锁覆盖面完整（trade/tick/settle/undo/挂单/房间/积分全链路），无先查后写无锁路径、无丢更新场景；AuthService/DailyChallenge 的唯一约束 catch 模式符合守则；Hikari 池 20 且注释了 REQUIRES_NEW 双连接推算。多实例下进程内缓存/限流不一致为已声明单机前提。

---

## 7. 前端渲染&交互隐性bug

### 7.1 [P1] `Auth.require` 不返回 Promise，guarded() 防重入对登录入口全失效（真缺陷）
- 证据：`auth.js:10` `require(fn){ if(Auth.user){ fn(); return true; } }`——async 回调未 await；`daily.js:142`/`rooms.js:191`/`app.js:2591` 的 start/play 外层同步返回，`app.js:190` busy 旗立即释放。双击 = 并发两发 `/daily/start`、`/rooms/{code}/play`，两次 `qsEnterGame` 交错把 state 写花（串局）。
- 修复：`return Auth.user ? fn() : ...`（返回 Promise），一处改动修 3 个入口。
- 回归：`node tools/ui_smoke/browse.mjs --view daily --login auto --click "#btn-daily-start" --click "#btn-daily-start" --assert-no-console-error --json`。

### 7.2 [P1] AI 顾问 EventSource 无句柄：跨对局泄漏 + advisorBusy 卡死 + 配额空烧
- 证据：`app.js:926-970` es 为局部变量；`app.js:917` resetAdvisorChat 不 close 旧流。旧局 SSE 未完时开新局：服务端继续为旧 session 烧 LLM 配额，`advisorBusy` 不复位 → 新局顾问按钮静默无响应。
- 修复：模块级保存 es，enterGame/reset 时 `es.close(); advisorBusy=false`。

### 7.3 [P1] 研究所实验无先发后至防护：慢响应覆盖新选择（`lab.js:184-194` runCompare 无请求 token；labHistCache await 后才落缓存有踩踏）。面板标题是 C/D、图表结论是 A/B 的静默错数据。修复：响应后比对当前选择不符则丢弃；缓存 Promise 而非结果。
### 7.4 [P2] daily/rooms 图表不监听 `qs:theme`，切主题后轴色/柱色停留旧主题（grep qs:theme 不含 daily.js/rooms.js；`daily.js:90`、`rooms.js:141`）。补监听重绘。
### 7.5 [P2] IME 中文输入 Enter 误提交：advisor-q/auth/rooms 的 keydown 未查 `e.isComposing`——打拼音选字把半截文本发给 LLM（烧配额）/登录框。统一加 `if (e.isComposing) return;`。
### 7.6 [P2] `renderPositions`（`app.js:1174-1189`）把 stockName 插 innerHTML，全站唯一破例点（当前数据受控打不穿，未来数据源扩展即 XSS）。改占位 td + textContent（同文件既有写法）。
### 7.7 [P2] `t()` 用字符串 replaceAll（`i18n.js:3674-3678`），参数含 `$'`/`$&` 会错位。改函数形式 `replaceAll(k, () => String(a))`。
### 7.8 [P2] api() 对 fetch 网络层 reject 无兜底：`TypeError: Failed to fetch` 英文原文直漏给中文用户，且全仓 0 处 AbortController 无超时；tick 404（对局失效）无恢复引导。包一层 i18n 网络错误 + 404 回开局卡。
### 7.9 [P2] 回测/调参可并发互相覆盖结果面板（runBacktest 只禁自己按钮）；多弹窗叠加 Esc 链 overflow 恢复错乱（影响极轻）。

### 7.10 已核安全
榜单/历史均后端分页封顶，成交明细自截断 slice(-30)，无大列表崩溃面；ECharts 空/单点/NaN 全兜底、模块级单例无 resize 泄漏；guarded 覆盖 tick/买卖/挂单严密（除 7.1 破口）；19 处 innerHTML 插值逐一核过仅 7.6 一处破例；K 线与估值同响应原子更新无时序窗口；轮询/倒计时生命周期干净。

---

## 8. 依赖组件与异常处理缺陷

- [P2] GlobalExceptionHandler 漏网：`MethodArgumentTypeMismatchException`（/api/game/abc/status）落 handleOther 变 500 应 400；`AsyncRequestTimeoutException`/`ClientAbortException`（SSE 断开）每次刷 error 级全栈日志 = 告警噪声源，应单独 handler 静默/warn。
- [P2] advisor SSE 错误事件把任意 `e.getMessage()` 推给前端（内部 IO 细节外泄）；仅 BusinessException 透传，其余固定文案。
- 已核安全：错误体格式全站一致 `{success,message}`，无"按中文文案判断错误"的分支（kb 反面模式未复发）；外部依赖（AKShare 刷新、advisor HTTP）超时均显式配置、失败降级不连锁 500。

## 9. 埋点日志告警链路问题

- 本项目无埋点系统，该模块聚焦日志：[P2] DataRefreshService 丢堆栈（见 §4）；SSE 断开刷 error 噪声（见 §8）；grep 全仓无 password/apiKey/会话 id 入日志（唯一边缘：[refresh] 原样转录管道 stdout，Python 侧勿 print 连接串）。

---

## 10. Bug 分级清单 + 修复方案 + 回归用例

| # | 级别 | 缺陷 | 位置 | 修复 | 回归用例 |
|---|---|---|---|---|---|
| 1 | **P0** | 秒开秒结无限刷 50 积分 | GameController:67-76 / GameService.settle / PointsService.awardSettle | 打满才计分 + 登录开局限频 | 连开秒结积分不涨 |
| 2 | **P0** | 昨日日榜对进行中玩家揭晓标的 | DailyChallengeService.leaderboard | 请求者有未结算局则整榜脱敏 | mock clock 跨日断言 ??? |
| 3 | **P0** | journal 泄露真实 tradeDate（竞技窗口） | BiasAnalysisService:154-156 | 一行改 BlindDates.mask | 结算后 journal 日期在虚拟纪元 |
| 4 | P1 | 进阶保护卖单开空 | TradeEngine:166-202 / OrderService:163-170 | reduce-only clamp | 清仓后触发止损持仓应为 0 |
| 5 | P1 | undo×挂单账实分叉+预算泄漏 | GameService:586-597 | 流水挂 orderId，undo 回滚挂单态 | undo 后 budgetUsed 不减 |
| 6 | P1 | 房间强结 catch 过窄→永久 500 | RoomService:260-268 | catch RuntimeException | mock 抛 NotFound 断言房间迁 SETTLED |
| 7 | P1 | RateLimiter 内存无界 | RateLimiter:40-47 | 陈旧队列按时限清 / Caffeine | 2 万 key 断言 map 有界 |
| 8 | P1 | 游客 backtest/run 刷库刷榜 | BacktestController:38-42 | 游客按 IP 限频 | 匿名第 N+1 次被拒 |
| 9 | P1 | 盲测价格指纹可离线破解 | BlindDates（设计） | 需产品决策（归一化行情）；先改注释 | 滑窗匹配脚本证明唯一命中 |
| 10 | P1 | 反代下 IP 限流全站共享单桶 | yml 缺 forward-headers | `forward-headers-strategy: framework` | 双客户端经反代独立计数 |
| 11 | P1 | Auth.require 防重入失效 | auth.js:10 | 返回 Promise | browse.mjs 双击断言单发 |
| 12 | P1 | advisor SSE 跨局泄漏+busy 卡死 | app.js:917/926-970 | 句柄化 close | 换局后顾问可用 |
| 13 | P1 | lab 实验响应乱序覆盖 | lab.js:184-194 | 请求 token 校验 | 快速换选断言结论匹配下拉 |
| 14-26 | P2 | §1.3-1.5、§3.3-3.6、§5.6-5.8、§6.2-6.3、§7.4-7.9、§8 | 见各节 | 见各节 | 见各节 |

**修复批次建议**（未经批准不动手）：
- 批次 A（P0，三处小改）：#1 计分条件、#2 昨日榜脱敏、#3 journal mask → `mvn -B test` + 新增 3 个回归测试。
- 批次 B（后端 P1）：#4-#8、#10 → `mvn -B test`。
- 批次 C（前端 P1）：#11-#13 → `ui_check.py` + `npm run buttons` + browse.mjs 证据。
- 批次 D（P2 清扫 + #9 产品决策）。

## 11. 后台自动化持续巡检规则

**pr_guard.py 新增 RULES**（登记为第 8-12 类反面模式）：
1. `catch (BusinessException` 出现在循环/批量迁移上下文 → 警告"批量容错应 catch RuntimeException"（本次 #6 根因）；
2. 新增 `/{id}` 端点未调 `requireAccess|resolve` → 警告（已有教训的机械化）;
3. controller 游客可达的写接口（无 AuthFilter 前缀且含 save/insert 路径）未见 `rateLimiter.check` → 警告（#8 根因）;
4. 竞技相关 DTO 新增 `LocalDate` 字段未经 `BlindDates.mask` → 警告（#3 根因）;
5. 前端 `innerHTML` 模板插入非数字变量（启发式：`${` 内含 name/user/title 字样）→ 警告（7.6 根因）。

**CI/定时巡检**：
1. **对账巡检**（每日 @Scheduled 或 CI 集成测试）：抽样 SETTLED 会话重放流水（复用 replayAccount），断言 `重放现金+持仓估值 == finalReturnRate 推出的净值`，漂移 >0.01 告警——长期资产漂移的哨兵；
2. **挂单一致性**：`SELECT count(*) FROM pending_order WHERE status='OPEN' AND session 已结算` 应为 0（#3 修后生效）；
3. **限流内存哨兵**：/actuator/health 自定义指标暴露 RateLimiter key 数，>5 万告警；
4. **数据质量门**（load_to_db 前置）：OHLC>0、high≥low、(code,date) 唯一，违例即 CI 红；
5. **ui_smoke 增补**：button_check 加"双击场景"（同按钮 100ms 内两击断言仅一次网络请求）；smoke 加"切主题后截图比对 daily/rooms 图表"步骤。
