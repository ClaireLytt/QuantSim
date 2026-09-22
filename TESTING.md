# QuantSim 测试文档

本文档包含：环境准备、数据层测试、后端 API 测试用例、前端 UI 测试步骤。
所有用例已于 2026-09-12 在本地（Windows 11 / JDK 21 / Python 3.13 / MySQL 8.0.26）完整执行一遍，实测结果见各表「实测」列。

## 1. 测试环境准备

```bash
# 1) 启动 MySQL（无需手动建表，后端启动时 Flyway 自动建库建表）

# 2) 启动后端（同时托管前端页面）
cd backend
mvn spring-boot:run

# 3) 准备数据（无网络时用 mock 数据）
cd ../data-pipeline
pip install -r requirements.txt
python mock_data.py            # 或 python fetch_data.py（真实数据）
python compute_indicators.py   # Spark 计算指标
python load_to_db.py           # 入库

# 4) 浏览器打开 http://localhost:8080
```

也可以用 Docker Compose 一键启动：`docker compose up -d --build`，再 `docker compose --profile pipeline run --rm pipeline` 灌数据。

### 自动化集成测试（第四轮新增）

```bash
cd backend
mvn test   # 9 个集成测试，自动创建独立的 quantsim_test 库，不污染开发数据
```

## 2. 数据层测试

| # | 用例 | 步骤 | 期望 | 实测 |
|---|---|---|---|---|
| D1 | 模拟数据生成 | `python mock_data.py` | data/raw/ 下 8 个 CSV，各 480 行，含 OHLCV | ✅ 通过 |
| D2 | Spark 指标计算 | `python compute_indicators.py` | 输出 3840 行；首日 pct_change 为空；MA5/MA20/volatility 数值合理 | ✅ 通过 |
| D3 | 数据入库 | `python load_to_db.py` | stocks=8, daily_price=3840, daily_indicator=3840 | ✅ 通过 |
| D4 | 入库幂等 | 再次运行 load_to_db.py | 行数不变（ON DUPLICATE KEY 更新） | ✅ 通过 |

验证 SQL：
```sql
USE quantsim;
SELECT COUNT(*) FROM daily_price;      -- 3840
SELECT COUNT(*) FROM daily_indicator;  -- 3840
SELECT COUNT(*) FROM stocks;           -- 8
```

## 3. 后端 API 测试

以下命令均可直接复制执行（Windows 下建议用 Git Bash）。

### 3.1 开局 `/api/game/start`

| # | 用例 | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| A1 | 正常开局 | `curl -s -X POST localhost:8080/api/game/start -H "Content-Type: application/json" -d '{"username":"tester1"}'` | 返回 sessionId、股票、startDate、initialCash=100000、totalTicks=20 | ✅ 通过 |
| A2 | 空用户名 | 同上，`{"username":""}` | 400，`username 不能为空` | ✅ 通过 |

### 3.2 历史行情 `/api/game/{id}/history`

| # | 用例 | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| B1 | 可见窗口 | `curl -s localhost:8080/api/game/1/history` | 恰好 60 根 K 线，最后一根 = startDate，**无未来数据泄漏**；每根含 OHLCV + ma5/ma20/volatility/pctChange | ✅ 通过 |

### 3.3 交易 `/api/game/{id}/trade`

| # | 用例 | 请求体 | 期望 | 实测 |
|---|---|---|---|---|
| C1 | 正常买入 | `{"direction":"BUY","price":147.00,"shares":500}` | success=true；现金 100000−73500=26500；持仓 500；成本 147.00 | ✅ 通过（数值精确一致） |
| C2 | 现金不足 | 买入 100000 股 | 400，`现金余额不足` | ✅ 通过 |
| C3 | 价格越界 | price=200（当日区间 144.81~149.92） | 400，`委托价 200.00 超出当日价格区间` | ✅ 通过 |
| C4 | 超卖 | 卖出 9999 股（仅持有 500） | 400，`持仓股数不足` | ✅ 通过 |
| C5 | 正常卖出 | `{"direction":"SELL","price":147.60,"shares":200}` | 现金 26500+29520=56020；持仓 300；成本不变 147.00 | ✅ 通过（数值精确一致） |
| C6 | 非法方向 | `{"direction":"HOLD",...}` | 400，`direction 必须是 BUY 或 SELL` | ✅ 通过 |
| C7 | 交易落库 | 查 transactions 表 | 每笔交易一条记录，方向/价格/数量/游戏内日期正确 | ✅ 通过 |

### 3.4 时间推进 `/api/game/{id}/tick`

| # | 用例 | 步骤 | 期望 | 实测 |
|---|---|---|---|---|
| E1 | 推进一天 | `curl -s -X POST localhost:8080/api/game/1/tick` | currentTradeDate 变为下一交易日；daysElapsed=1；返回 newBar（当日 OHLCV+指标） | ✅ 通过 |
| E2 | 满 20 天自动结算 | 连续 tick 至第 20 次 | settled=true，附 settleResult；结算金额 = 现金 + 持仓×当日收盘（56020+300×138.41=97543，收益率 −2.46%） | ✅ 通过（手工验算一致） |

### 3.5 状态 `/api/game/{id}/status`

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| F1 | 开局初始状态 | 现金 100000、持仓 0、收益率 0、daysElapsed=0 | ✅ 通过 |
| F2 | 持仓中状态 | marketValue=持仓×最新收盘；floatingPnl=市值−成本×股数；totalAssets=现金+市值 | ✅ 通过 |

### 3.6 结算与状态保护

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| G1 | 手动提前结算 `/settle` | 返回最终资产与收益率，status→SETTLED | ✅ 通过 |
| G2 | 已结算后交易 | 400，`对局已结算` | ✅ 通过 |
| G3 | 已结算后 tick | 400，`对局已结算` | ✅ 通过 |
| G4 | 重复结算 | 400，`对局已结算` | ✅ 通过 |
| G5 | 不存在的对局 | 400，`对局不存在: 999` | ✅ 通过 |

### 3.7 排行榜 `/api/leaderboard`

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| H1 | 排序正确 | 仅含已结算对局，按收益率降序，含用户名/股票/起始日 | ✅ 通过 |

## 4. 前端 UI 测试

**有 UI 界面**：浏览器打开 http://localhost:8080，深色主题单页应用，包含 K 线图（MA5/MA20 叠加 + 成交量副图 + 开局分割线）、账户状态面板、交易面板、排行榜。

以下 14 项已用 Playwright 无头浏览器自动化执行，全部通过；也可按「手动步骤」逐项复测。

| # | 用例 | 手动步骤 | 期望 | 实测 |
|---|---|---|---|---|
| U1 | 页面加载 | 打开 http://localhost:8080 | 标题「QuantSim 虚拟炒股」，无报错 | ✅ 通过 |
| U2 | 排行榜初始加载 | 打开页面即看底部 | 显示已结算对局排名 | ✅ 通过 |
| U3 | 空用户名校验 | 不输入直接点「开始新对局」 | toast 提示「请先输入用户名」 | ✅ 通过 |
| U4 | 开始对局 | 输入用户名，点「开始新对局」 | 显示股票名称/代码，现金 100,000.00 | ✅ 通过 |
| U5 | K 线渲染 | 观察图表 | 60 根历史 K 线 + MA5/MA20 + 成交量；上涨空心红、下跌实心绿；「开局」虚线标记 | ✅ 通过（截图确认） |
| U6 | 初始天数 | 看顶部 | 「第 0 / 20 天」 | ✅ 通过 |
| U7 | 价格自动填充 | 看交易面板 | 价格默认为最新收盘价，下方显示当日价格区间 | ✅ 通过 |
| U8 | 买入 | 数量 100，点「买入」 | toast 成功；现金减少、持仓 100 | ✅ 通过 |
| U9 | 下一天 | 点「下一天 ➜」 | 图表新增一根 K 线，天数+1，日期更新 | ✅ 通过 |
| U10 | 卖出 | 数量 100，点「卖出」 | 持仓归 0，现金增加 | ✅ 通过 |
| U11 | 提前结算 | 点「提前结算」并确认 | 显示结算卡片：初始资金/最终资产/收益率 | ✅ 通过 |
| U12 | 结算后禁用 | 观察按钮 | 买入/卖出/下一天/结算全部禁用 | ✅ 通过 |
| U13 | 排行榜更新 | 结算后看底部 | 本局出现在排行榜中 | ✅ 通过 |
| U14 | 无控制台错误 | F12 Console | 无 JS 报错 | ✅ 通过 |

## 5. 测试中发现并已修复的问题

| 问题 | 原因 | 修复 |
|---|---|---|
| 指标入库报错 `nan can not be used with MySQL` | pandas 的 NaN 未转为 None | `load_to_db.py` 改用 `df.astype(object).where(pd.notnull(df), None)` |
| 前端页面空白（ECharts 未加载） | cdnjs 上不存在 echarts 5.5.1 路径（404） | `index.html` 改为 5.6.0（已验证 200） |

### 第二轮代码审查修复（已全部回归验证）

| 问题 | 修复 |
|---|---|
| 窗口不足时 MA5/MA20/波动率给出假值 | `compute_indicators.py` 加 `F.count(...).over(w) >= N` 守卫，不足时置 NULL（DB 验证：ma5 空 32、ma20 空 152、volatility 空 160，与 8 只股票 × 4/19/20 完全一致） |
| tick/trade/settle 无会话锁，并发可错位 | `GameSessionRepository` 增加 `PESSIMISTIC_WRITE` 锁查询，三个写操作统一走锁 |
| 前端双击「下一天」重复提交 | `app.js` 增加 `busy` 标志 + `guarded()` 包装（UI 用例 U10 验证：JS 同步双击只推进 1 天） |
| 委托价小数位不受控，DECIMAL 截断漂移 | 交易前校验 `scale > 2` 报「委托价最多两位小数」 |
| startGame 用户创建竞态返回裸 500 | `findOrCreateUser` 捕获唯一键冲突后重查 |
| 未处理异常无日志 | `GlobalExceptionHandler.handleOther` 加 `log.error` |
| 畸形 JSON 请求体返回 500 | 新增 `HttpMessageNotReadableException` → 400「请求体格式错误」 |
| 未知路径返回 500 | 新增 `NoResourceFoundException` → 404「接口不存在」 |
| 前端 `api()` 先 `resp.json()` 后判 `resp.ok`，非 JSON 错误响应炸提示 | 先安全解析再按状态码兜底 |
| `schema.sql` 尾部 `CREATE INDEX` 不可重复执行 | 索引移入 `CREATE TABLE ... IF NOT EXISTS` 内 |
| 静态资源路径 `file:../frontend/` 依赖启动目录 | 改为 `${QUANTSIM_FRONTEND_DIR:../frontend}` 可用环境变量覆盖 |
| startGame/getHistory 全表加载价格数据 | 改用 `Pageable` 精确取起始行/历史窗口 |
| 排行榜 N+1 查询（41 条 SQL） | 改为单条 JPQL 三表 join（回归验证用户名/股票名正确） |

### 第三轮代码审查修复（已全部回归验证）

| 问题 | 修复 |
|---|---|
| 「开始新对局」未防重，双击建重复会话且与在途请求交错 | `btn-start`/回车均改走 `guarded()` |
| 用户名无长度校验，超 50 字符报误导性错误；首尾空格建重复用户 | DTO 加 `@Size(max=50)`；服务端 trim 后复用（验证 `"  regress1  "` 未建新用户） |
| 手数规则前后端不一致（后端曾允许 50 股） | 前后端均强制 100 股整数倍（50/150 拒绝、200 成交） |
| 「对局不存在」返回 400 | 新增 `NotFoundException` → 404 |
| `.claude/` 不在 .gitignore，易误提交 | 已加入 .gitignore |
| HTML 硬编码「第 0 / 20 天」 | 初始占位 `--`，开局后按 `totalTicks` 动态填充 |
| AKShare 成交量单位「手」与 mock「股」不一致 | `fetch_data.py` 统一 ×100 转为股 |

### 第四轮性能与工程化优化（已全部回归验证）

| # | 优化项 | 说明 |
|---|---|---|
| 1 | `days_elapsed` 列 | game_sessions 增加计数列，tick 时自增，替代每次 `COUNT(*)` 交易日查询 |
| 2 | tick 响应内嵌账户快照 | `TickResponse` 携带完整 `StatusResponse`，前端每天少发一次 `/status` 请求 |
| 3 | 开局选股改 GROUP BY | 逐股 COUNT 改为单条 `GROUP BY` 统计各股数据量 |
| 4 | Caffeine 行情缓存 | 新增 `MarketDataService`，整股价格/指标一次性加载缓存（10 分钟过期），tick/trade/history/status 全部走内存索引 |
| 5 | history 单次内存切片 | 历史窗口从缓存 List 直接 `subList`，不再查库 |
| 6 | JUnit 集成测试套件 | `GameApiIntegrationTest` 9 个用例：开局/校验/交易/tick/结算/排行榜/错误处理，`mvn test` 一键回归 |
| 7 | Flyway 数据库迁移 | `V1__init.sql` 取代手工 `sql/schema.sql`，后端启动自动建库建表，`ddl-auto: validate` 校验 |
| 8 | GameService 拆分 | 行情加载逻辑抽到 `MarketDataService`，职责单一 |
| 9 | Docker Compose | 一键启动 MySQL + 后端 + 可选数据管道（`backend/Dockerfile`、`data-pipeline/Dockerfile`） |
| 10 | GitHub Actions CI | push/PR 自动跑后端集成测试（MySQL service 容器） |
| 11 | ECharts 增量更新 | tick 后只以 merge 模式更新数据数组，不再整图重建 |

**回归结果（2026-09-19）**：
- `mvn test`：9/9 通过（Tests run: 9, Failures: 0, Errors: 0）
- 后端 API 手工回归：开局/历史窗口 60 根/手数校验/买入现金精确/tick 内嵌状态数值验算一致/404/400 错误链/结算与排行榜 —— 全部通过
- Playwright UI 回归：16/16 通过
- `docker compose config` 校验通过

### 第五轮新功能：AI 操盘手 + 策略基准对比 + 内嵌玩法说明

| # | 变更 | 说明 |
|---|---|---|
| 1 | `train_predictor.py` | 逻辑回归按扩展窗口分块训练（60 天起、每块 20 天，块内只用块前数据，无未来泄漏），特征：涨跌幅/波动率/收盘价与 MA5 偏离/MA5 与 MA20 偏离/量比，输出每股每日上涨概率 |
| 2 | `V2__ai_opponent.sql` | 新表 `daily_prediction`（8 张表）；`game_sessions` 增加 `ai_cash`/`ai_shares` |
| 3 | AI 自动交易 | 每次 tick 时 AI 用**当日预测 + 当日收盘价**决策成交（先交易后推进日期，信息与玩家对等）：置信度 ≥ 55% 全仓买入、≤ 45% 清仓、其余持有，同样受 100 股整数手约束 |
| 4 | 策略基准 | 结算时计算「买入持有」（开局收盘全仓拿到底）和「均线金叉」（MA5 上穿 MA20 买入、下穿清仓）收益率，与你/AI 四方对比 |
| 5 | 前端 AI 卡片 | 每日显示 AI 预测方向 + 置信度进度条 + AI 总资产/持仓/收益率 |
| 6 | 结算对比面板 | 四方收益率表格 + 胜负判定文案（战胜 AI 显示 🏆） |
| 7 | 内嵌玩法说明 | 「玩法说明」弹窗（游戏目标/流程/交易规则/AI 说明/图表阅读/结算对比），首次访问自动弹出，localStorage 记忆 |

**第五轮测试用例与结果（2026-09-21）**：

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| I1 | `mvn test` 全量集成测试 | 含新增 AI 用例共 10 个全过 | ✅ 10/10（Flyway V2 自动迁移验证） |
| I2 | AI 确定性交易（种子 prob=0.80、均匀价 10 元） | 首 tick 全仓买 10000 股、现金归 0、总资产 100000 | ✅ 数值精确一致 |
| I3 | 结算四方对比（无指标数据） | ai/hold 收益率 0，均线策略空仓收益率 0 | ✅ 通过 |
| I4 | API 冒烟（真实管道数据） | status/tick 携带 prediction+ai；AI 按置信度 52.8% 正确持有；settle 返回四方收益率 | ✅ 通过 |
| P1 | 模型训练 | 3360 条预测入库；滚动外推准确率 51.43%（mock 随机游走的合理值） | ✅ 通过 |
| H1-H5 | 玩法说明弹窗 | 首次自动弹出/内容完整/可关闭/二次访问不弹/按钮重开 | ✅ 通过 |
| A1-A5 | AI 卡片与结算对比 UI | 预测方向+置信度条渲染、AI 资产、tick 后刷新、四方表格、胜负文案 | ✅ 通过 |
| U1-U14 | 原有 UI 回归 | 全部保持通过 | ✅ 通过 |

Playwright UI 回归合计 **26/26 通过**。

测试中发现并修复：`.modal-mask` 的 `display:flex` 覆盖了 `hidden` 属性的 UA 样式导致弹窗关不掉，补 `.modal-mask[hidden]{display:none}`。

### 第六轮代码审查修复（已全部回归验证）

| 问题 | 修复 |
|---|---|
| V2 迁移前创建的旧对局 `ai_cash=0`，status/settle 会显示 AI 收益率 **-100%** 并给出错误胜负判定 | `GameService` 新增 `aiInitialized()` 守卫（ai_cash 与 ai_shares 均为 0 视为无 AI 对手），status 返回 `ai: null`，settle 返回 `aiFinalAssets/aiReturnRate: null`，前端已有 null 兜底显示 `--` |
| 前端 `renderAi` 收到 `ai == null` 时残留上一局旧数值 | 增加 else 分支，AI 总资产/持仓/收益率重置为 `--` |
| `MarketDataService` 缓存的 indicators/predictions 为可变 HashMap | 统一 `Map.copyOf` 包装为不可变（与 indexByDate 一致），防止共享缓存被意外修改 |

**第六轮回归结果（2026-09-21）**：

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| R1 | `mvn test` 全量集成测试 | 10 个全过 | ✅ 10/10 |
| R2 | 旧对局守卫（手动将某局 ai 字段清零） | status 的 `ai` 为 null；settle 的 `aiFinalAssets`/`aiReturnRate` 为 null，玩家收益率正常 | ✅ 通过 |
| R3 | 正常新对局 API 冒烟 | prediction/ai 字段齐全；prob 0.4902 时 AI 正确持币观望；settle 四方收益率齐全 | ✅ 通过 |
| R4 | Playwright UI 全量回归 | 26 项全过 | ✅ 26/26 |

本轮同时通读复查了 GameController / LeaderboardService / MarketDataService / app.js / style.css / train_predictor.py / load_to_db.py，未发现其他缺陷（标签按股票分组 shift 无跨股泄漏、入库幂等、排行榜 XSS 防护均确认无误）。

### 第七轮新增功能：策略回测竞技场（待人工验证）

本轮新增独立玩法模块（后端 + 前端 + 文档），**尚未运行自动化测试**，以下为功能说明与人工测试步骤。

**新增内容**：

| # | 内容 | 说明 |
|---|---|---|
| 1 | Flyway V3 迁移 | 新表 `backtest_results`（用户/股票外键、策略、参数、区间、收益/夏普/回撤/胜率指标） |
| 2 | `BacktestService` | 4 种策略全历史模拟：均线交叉（fast/slow）、动量（lookback）、均值回归（maWindow/threshold）、买入持有；收盘价成交、整手 100 股、全仓进出 |
| 3 | 指标计算 | 总收益率、年化收益（252 交易日）、夏普比率（√252 年化，波动为 0 返回 null）、最大回撤、交易次数、回合胜率（无完整回合返回 null） |
| 4 | 三个新接口 | `POST /api/backtest/run`、`GET /api/backtest/leaderboard`、`GET /api/backtest/stocks` |
| 5 | 前端竞技场面板 | 股票下拉 + 策略选择（参数输入随策略动态切换）+ 指标卡片 + 资金曲线图（策略 vs 买入持有双线）+ 竞技场排行榜 |
| 6 | 玩法说明更新 | 帮助弹窗新增「策略回测竞技场」章节（策略解释 + 指标解读） |

**人工测试步骤**（后端需重启以应用 V3 迁移）：

1. 重启后端：`cd backend && mvn spring-boot:run`，启动日志应出现 Flyway `Migrating schema ... to version "3 - backtest arena"`。
2. 打开 http://localhost:8080 ，页面下方应出现「策略回测竞技场」区块，股票下拉已加载。
3. 顶部输入用户名，选「均线交叉」默认参数（5/20），点「运行回测」→ 应显示回测区间、总收益率、年化、夏普、最大回撤、交易次数、胜率、买入持有基准，以及双线资金曲线；排行榜出现该记录。
4. 切换策略下拉 → 参数输入框应随策略切换（动量只有回看天数、均值回归有窗口+阈值、买入持有无参数）。
5. 参数校验：快线填 30、慢线填 20 → 应 toast「快线窗口必须小于慢线窗口」；回看天数填 999 → 应提示范围错误。
6. 选「买入持有」运行 → 交易次数应为 1，胜率 `--`（无完整回合），策略与基准两条曲线重合。
7. API 直测（可选）：
   ```bash
   curl -X POST http://localhost:8080/api/backtest/run -H "Content-Type: application/json" \
     -d '{"username":"tester","stockCode":"600519","strategy":"MOMENTUM","lookbackDays":10}'
   curl http://localhost:8080/api/backtest/leaderboard
   curl http://localhost:8080/api/backtest/stocks
   ```
8. 「玩法说明」弹窗底部应有「策略回测竞技场」章节。

### 第八轮新增功能：币圈模式 + 自定义策略 + LLM 交易顾问 + 量化学堂（待人工验证）

本轮一次性新增四个功能方向（后端 + 数据管道 + 前端 + 文档），**尚未运行自动化测试**，以下为功能说明与人工测试步骤。

**新增内容**：

| # | 功能 | 说明 |
|---|---|---|
| 1 | 币圈模式 | Flyway V4 迁移给 `stocks` 加 `market` 列（STOCK/CRYPTO）；股票池新增 BTC/ETH/SOL/DOGE 四个加密标的（mock 生成：7×24 自然日 K 线、高波动率）；开局可选市场；交易整手规则按市场区分（A 股 100 股整数倍、币圈 1 枚起买），前端从 `lotSize` 动态读取 |
| 2 | 自定义策略 | 回测竞技场新增 `CUSTOM` 策略：用「收盘价/MA5/MA20/涨跌幅」+「大于/小于/上穿/下穿」组合买卖条件（各 1~5 条，全部满足触发；比较对象可以是字段或常数）；前端条件搭建器默认预置金叉策略；Flyway V5 迁移将 `backtest_results.params` 加宽到 VARCHAR(255) |
| 3 | LLM 交易顾问 | 新接口 `POST /api/game/{id}/advisor`：把当前可见行情（近 20 日 K 线+指标）、账户状态、ML 预测发给 Claude（claude-haiku-4-5），返回中文分析与买/卖/观望建议；只喂当前交易日及之前数据，无未来泄漏；未配置 `ANTHROPIC_API_KEY` 时报错提示、其余功能不受影响；前端 AI 卡片新增「问问 Agent」按钮 |
| 4 | 量化学堂 | 纯前端闯关答题：4 关（K 线基础/均线指标/策略思想/风险控制）× 每关 4 题，答对 3 题通关并解锁下一关，答错附解析；进度存 localStorage |

**人工测试步骤**（后端需重启以应用 V4/V5 迁移；数据管道需重跑以生成加密标的行情）：

1. 重跑数据管道：`cd data-pipeline && python mock_data.py && python compute_indicators.py && python train_predictor.py && python load_to_db.py`（应看到 12 个标的：8 A股 + 4 加密）。
2. 重启后端：`cd backend && mvn spring-boot:run`，Flyway 日志应出现 V4、V5 迁移。
3. **币圈模式**：
   - 顶部市场下拉选「币圈」开局 → 标的应为 BTC/ETH/SOL/DOGE 之一，股票名旁有「· 币圈」标记；交易数量输入框 step/min 变为 1，买 1 枚应成功；K 线为连续自然日。
   - 选「A股」开局 → 数量 50 应被拒（100 的整数倍），200 成功。
   - 验证 SQL：`SELECT code, market FROM stocks;` 应有 4 行 CRYPTO。
4. **自定义策略**：
   - 竞技场策略下拉选「自定义策略」→ 出现买入/卖出条件搭建器，默认预置「MA5 上穿 MA20 / MA5 下穿 MA20」；直接运行 → 结果应与「均线交叉 5/20」完全一致（同一逻辑）。
   - 右侧选「常数」输入数值（如 涨跌幅 > 0.03）运行 → 正常出结果；条件加到第 6 条应 toast「最多 5 条条件」；清空全部买入条件运行应提示。
   - API 直测（可选）：
     ```bash
     curl -X POST http://localhost:8080/api/backtest/run -H "Content-Type: application/json" \
       -d '{"username":"tester","stockCode":"600519","strategy":"CUSTOM","buyConditions":[{"left":"MA5","op":"CROSS_UP","rightField":"MA20"}],"sellConditions":[{"left":"MA5","op":"CROSS_DOWN","rightField":"MA20"}]}'
     ```
5. **LLM 交易顾问**：
   - 未配置 API Key 时开局点「问问 Agent」→ toast「未配置 ANTHROPIC_API_KEY, AI 顾问功能未启用」。
   - 设置环境变量后重启后端（PowerShell: `$env:ANTHROPIC_API_KEY = "sk-ant-..."`），再点 → 按钮下方出现 Claude 的中文分析与建议（≤150 字，含买入/卖出/观望）。
   - 建议只基于当前可见行情（可对比 K 线最后日期与建议中引用的数据）。
6. **量化学堂**：
   - 页面下方「量化学堂」区块显示 4 张关卡卡片；第 2~4 关初始「未解锁」。
   - 点「开始闯关」→ 弹窗逐题作答：选错高亮红色并显示正确答案与解析；答对 ≥ 3 题结果页显示「通关成功」，卡片变「已通关」且下一关解锁。
   - 刷新页面 → 通关进度保留（localStorage）；答对 < 3 题 → 「未能通关」，可重新挑战。
7. 「玩法说明」弹窗应新增：市场选择说明、按市场的交易规则、问问 Agent、 自定义策略、量化学堂章节。

### 第九轮新增功能：美股市场 + 中英文双语 + 点击式名词解释 + 新手友好化（待人工验证）

本轮面向大众玩家改造（后端 + 数据管道 + 前端 + 文档），**尚未运行自动化测试**，以下为功能说明与人工测试步骤。

**新增内容**：

| # | 功能 | 说明 |
|---|---|---|
| 1 | 美股市场 | `Market` 枚举新增 `US`（1 股起买）；股票池新增 AAPL/MSFT/NVDA/TSLA；`fetch_data.py` 走 `ak.stock_us_daily`（接口不可达时自动退回 mock）；`mock_data.py` 美股分支（工作日 K 线、波动率介于 A 股与币圈之间）；开局市场下拉新增「美股」；无需数据库迁移（market 列为 VARCHAR） |
| 2 | 中英文双语 | 新增 `frontend/i18n.js`：双语字典 + `data-i18n` 属性驱动静态文案 + `t()/pick()` 供动态渲染；右上角「EN / 中文」按钮切换，偏好存 localStorage；切换不刷新页面、不丢对局（监听 `qs:lang` 事件按缓存重渲染图表/状态/排行榜/题库等全部动态区域）；量化学堂 16 道题全部双语 |
| 3 | 名词解释 | 新增 `frontend/glossary.js`：29 个专业名词双语释义（K 线/金叉/夏普/回撤/过拟合等）；页面所有带虚线下划线的词点击弹出释义气泡（视口内自动定位，Esc/点击空白关闭），帮助弹窗内同样可点 |
| 4 | 新手友好化 | 玩法说明重写为零基础版：置顶「三步上手」（买→等→卖）+ 大白话章节，全文内嵌约 30 个可点击名词；AI 顾问接口支持 `?lang=zh|en`，英文界面下 Claude 用英文回复 |

**人工测试步骤**（后端需重启以应用 US 枚举与 advisor lang 参数；数据管道需重跑以生成美股行情）：

1. 重跑数据管道：`cd data-pipeline && python mock_data.py && python compute_indicators.py && python train_predictor.py && python load_to_db.py`（应看到 16 个标的：8 A股 + 4 美股 + 4 加密）。真实数据改用 `python fetch_data.py --force`。
2. 重启后端：`cd backend && mvn spring-boot:run`。
3. 前端强制刷新（Ctrl+F5）。
4. **美股模式**：
   - 市场下拉选「美股」开局 → 标的应为 AAPL/MSFT/NVDA/TSLA 之一，名称旁有「· 美股」标记；数量输入 step/min 为 1，买 1 股应成功。
   - 竞技场股票下拉中美股标的同样带「· 美股」标记，可正常回测。
   - 验证 SQL：`SELECT code, market FROM stocks;` 应有 4 行 US。
5. **双语切换**：
   - 点右上角「EN」→ 整页变英文（头部/账户/AI 卡片/交易面板/竞技场/学堂/排行榜/页脚），按钮变「中文」；刷新页面后仍是英文（localStorage）。
   - 对局进行中切换语言 → 对局不丢失，K 线图例/tooltip、天数、状态数值、结算卡片、回测结果、题库全部切换；再切回中文同样正常。
   - 英文界面下开局/交易/结算的 toast 均为英文；金额千分位按 en-US 格式。
   - 学堂闯关中切换语言 → 未作答的当前题按新语言重新出题，已答对计数保留。
6. **名词解释**：
   - 账户状态的「持仓成本/持仓市值/浮动盈亏/收益率」、结算表的「买入持有/均线金叉」、回测指标的「年化/夏普/回撤/胜率/资金曲线」等带虚线下划线 → 点击弹出释义气泡；点空白或按 Esc 关闭。
   - 打开「玩法说明」→ 正文内名词同样可点，气泡不被弹窗遮挡（z-index 300）。
   - 切换语言后点击 → 释义为对应语言。
   - AI 预测下方「置信度 xx%」中的「置信度」可点击。
7. **AI 顾问双语**：英文界面下点「Ask the Agent」→ Claude 用英文回复（需配置 `ANTHROPIC_API_KEY`）。
8. **新手引导**：清掉 localStorage 后首次访问 → 自动弹出玩法说明，置顶「三步上手」三步卡片；英文界面下弹窗为英文全文。

## 6. 未覆盖项（后续可补）

- 并发交易压测（悲观锁逻辑已实现，未做多线程压测）
- AKShare 真实数据采集（依赖外网，本轮用 mock 数据验证链路）
- P2 功能「交易记录回看」尚未实现，无对应用例
