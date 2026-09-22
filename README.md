# QuantSim 虚拟炒股游戏

用真实历史股票行情"穿越回过去"进行虚拟交易的小游戏。端到端链路：**AKShare 数据采集 → Spark 批处理指标 → Spring Boot API → ECharts 前端**。

> 仅供娱乐 / 学习，不构成投资建议。

## 玩法

开局随机分配一个标的和一段历史区间，你只能看到起点之前的 K 线和指标。用 10 万虚拟资金买入/卖出，点击"下一天"逐日揭晓行情，20 个交易日后自动结算收益率，上排行榜。

**三市场**：开局可选 **A股**（一手 100 股，交易日 K 线）、**美股**（AAPL/MSFT/NVDA/TSLA，1 股起买）或**币圈**（BTC/ETH/SOL/DOGE，1 枚起买，7×24 自然日 K 线，波动率远高于 A 股），也可全部市场随机。

**面向大众的新手友好设计**：
- **中英文双语界面**：右上角一键切换（EN / 中文），全站文案、图表、题库、AI 顾问回复全部跟随语言，偏好保存在浏览器本地。
- **点击式名词解释**：页面中所有带虚线下划线的专业名词（K 线、金叉、夏普比率、最大回撤等近 30 个）点击即弹出大白话双语释义，无需查任何外部教程。
- **零基础玩法说明**：首次访问自动弹出「三步上手」指南（买 → 等 → 卖），配合量化学堂闯关，从零补齐概念。

**AI 操盘手（三档难度）**：开局可选 AI 对手难度，对应三个滚动窗口训练的机器学习模型（绝无未来信息）——**简单**（逻辑回归）、**普通**（随机森林）、**困难**（梯度提升树）。AI 每天给出明日涨跌预测和置信度，并用同样的 10 万资金自动交易（置信度 ≥ 55% 全仓买入、≤ 45% 清仓）。结算时对比四种策略的收益率：**你 vs AI vs 买入持有 vs 均线金叉**。

**结算复盘面板**：结算卡除四方收益对比外，还展示 **AI 本局预测命中率**（逐日命中点阵，绿点命中 / 红点未中，悬停看详情）和你的**操作风格画像**（观望者 / 追涨杀跌型 / 高频交易型 / 佛系持有型 / 波段操作型，按交易频率与追涨行为自动判定）。

**LLM 交易顾问 & AI 复盘教练**：对局中点「问问 Agent」，Claude 会基于当前可见行情、账户状态和 ML 预测给出分析与操作建议（只喂当前交易日及之前的数据，无未来信息泄漏）；结算后点「AI 复盘本局」，Claude 逐笔点评你的买卖时机并给出改进建议。两者均跟随界面语言输出中文或英文，需要配置 `ANTHROPIC_API_KEY` 环境变量，未配置时自动禁用、其余玩法不受影响。

**策略回测竞技场**：独立于对局的第二玩法。选一只股票和一个经典量化策略（均线交叉 / 动量 / 均值回归 / 买入持有 / **自定义策略**），系统在该股整段历史行情上模拟交易（收盘价成交、按市场整手规则、全仓进出），输出总收益率、年化收益、夏普比率、最大回撤、胜率等专业指标，并绘制"策略 vs 买入持有"资金曲线。自定义策略支持用「收盘价 / MA5 / MA20 / 涨跌幅」+「大于 / 小于 / 上穿 / 下穿」搭积木组合买卖条件（各最多 5 条）。回测结果进入竞技场排行榜，调参跑赢基准冲榜。点「**自动调参**」可让 Agent 对当前策略（均线交叉 / 动量 / 均值回归）做网格搜索，自动找出历史最优参数、填回表单并直接入榜。

**量化学堂**：不做选择题，全部动手玩——**实战教学关卡**（4 关，在生成的真实感走势上亲手买卖：第一笔交易 → 等金叉 → 别追高 → 崩盘止损，关键节点弹出教学提示，达成目标过关）、**K 线猜涨跌**（看 30 根 K 线猜次日方向，连击加分、命中率统计）、**名场面挑战**（穿越 2015 A股杠杆疯牛、2021 比特币疯牛、世纪轧空三大名场面，通关赢取「逃顶大师」等专属称号）。全程积累经验值，段位从「韭菜」→「散户」→「操盘手」→「股神」，配 10 枚成就徽章（连击、毕业、跑赢 AI 等），进度保存在浏览器本地。

界面按玩法拆分为三个独立标签页：**模拟对局**（含排行榜）、**策略竞技场**（含竞技场排行榜）、**量化学堂**，顶部导航一键切换，切换不丢失对局状态。右上角「玩法说明」内嵌完整游玩指南（首次访问自动弹出）。

## 项目结构

```
QuantSim/
├── data-pipeline/            # Python 数据层
│   ├── fetch_data.py         # AKShare 采集日线数据，落地 CSV 快照
│   ├── mock_data.py          # 无网络时生成模拟数据（同格式）
│   ├── compute_indicators.py # PySpark 计算 MA5/MA20/波动率/涨跌幅
│   ├── train_predictor.py    # 滚动窗口训练"次日涨跌"预测模型（AI 操盘手的大脑）
│   ├── load_to_db.py         # 原始行情 + 指标 + 预测入库
│   └── config.py             # 股票池 / 日期区间 / 数据库配置
├── backend/                  # Spring Boot 3 后端（建表由 Flyway 迁移管理）
│   └── src/main/resources/db/migration/  # 数据库 schema（9 张表）
├── frontend/                 # 静态页面：ECharts K线 + 交易面板
├── docker-compose.yml        # 一键启动 MySQL + 后端（+ 可选数据管道）
└── .github/workflows/ci.yml  # CI：后端集成测试
```

## 一键启动（Windows 本地）

数据已入库后，双击项目根目录的 **`start.bat`**（或执行 `.\start.ps1`）：自动启动后端，就绪后自动打开浏览器；后端已在运行时直接打开页面。前提：本机 MySQL 已启动、装有 JDK 17+ 和 Maven。

## 快速启动（Docker Compose）

```bash
docker compose up -d --build                       # MySQL + 后端，Flyway 自动建库建表
docker compose --profile pipeline run --rm pipeline # 灌入 mock 行情数据
```

然后浏览器访问 http://localhost:8080 。

## 本地启动（不用 Docker）

环境要求：MySQL 8.x、JDK 17+、Maven 3.8+、Python 3.9+（PySpark 需要 JVM）。

### 1. 启动后端（自动建库建表）

```bash
cd backend
mvn spring-boot:run
```

首次启动时 Flyway 自动创建 `quantsim` 库和全部表（无需手动执行 SQL）。
数据库连接默认 `root/root@127.0.0.1:3306`，可用环境变量覆盖：
`QUANTSIM_DB_HOST` / `QUANTSIM_DB_PORT` / `QUANTSIM_DB_USER` / `QUANTSIM_DB_PASSWORD` / `QUANTSIM_DB_NAME`

### 2. 跑数据管道

```bash
cd data-pipeline
pip install -r requirements.txt

python fetch_data.py          # AKShare 采集 A 股与美股（美股接口不可达时自动退回 mock）；币圈无公开源, 自动 mock（无网络时用 python mock_data.py 全部 mock）
python compute_indicators.py  # Spark 计算指标
python train_predictor.py     # 训练 AI 预测模型（滚动窗口，无未来泄漏）
python load_to_db.py          # 入库（读取相同的 QUANTSIM_DB_* 环境变量）
```

### 3. 打开游戏

浏览器访问 http://localhost:8080 ，输入用户名开始对局。

## 测试

```bash
cd backend
mvn test    # 集成测试（需本地 MySQL，自动创建独立的 quantsim_test 库）
```

CI（GitHub Actions）在每次 push / PR 时自动运行同一套测试。

## API 一览

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/game/start` | POST | 开始新一局（body: `{"username":"...","market":"STOCK|US|CRYPTO","aiLevel":"EASY|NORMAL|HARD"}`，market 省略 = 全市场随机，aiLevel 省略 = NORMAL） |
| `/api/game/{sessionId}/history` | GET | 获取当前可见的历史行情（K线+指标） |
| `/api/game/{sessionId}/tick` | POST | 推进一天，满 20 天自动结算 |
| `/api/game/{sessionId}/trade` | POST | 买卖（body: `{"direction","price","shares"}`，价格须在当日高低区间内） |
| `/api/game/{sessionId}/status` | GET | 当前持仓、资金、浮动盈亏 + AI 预测与 AI 仓位 |
| `/api/game/{sessionId}/settle` | POST | 提前结算（含四方收益对比、AI 逐日预测命中明细、玩家风格画像） |
| `/api/game/{sessionId}/advisor` | POST | LLM 交易顾问分析建议（`?lang=zh|en` 控制回复语言，需配置 `ANTHROPIC_API_KEY`） |
| `/api/game/{sessionId}/review` | POST | LLM 逐笔复盘点评（仅已结算对局，`?lang=zh|en`，需配置 `ANTHROPIC_API_KEY`） |
| `/api/leaderboard` | GET | 收益率排行榜（前 20） |
| `/api/backtest/run` | POST | 运行策略回测（body: `{"username","stockCode","strategy",参数...}`，见下） |
| `/api/backtest/tune` | POST | 自动调参：网格搜索最优参数并入榜（body: `{"username","stockCode","strategy"}`，仅支持 MA_CROSS / MOMENTUM / MEAN_REVERSION） |
| `/api/backtest/leaderboard` | GET | 竞技场排行榜（按总收益率，前 20） |
| `/api/backtest/stocks` | GET | 可回测股票列表（前端下拉数据源） |

回测策略与参数（缺省用默认值）：

| strategy | 参数 | 默认 | 范围 |
|---|---|---|---|
| `MA_CROSS` | `fastWindow` / `slowWindow` | 5 / 20 | 2~60 / 5~120，快线须小于慢线 |
| `MOMENTUM` | `lookbackDays` | 10 | 2~60 |
| `MEAN_REVERSION` | `maWindow` / `threshold` | 20 / 0.05 | 5~60 / 0.01~0.20 |
| `BUY_HOLD` | 无 | - | - |
| `CUSTOM` | `buyConditions` / `sellConditions` | - | 各 1~5 条；每条 `{"left","op","rightField"或"rightValue"}`，字段 `CLOSE/MA5/MA20/PCT_CHANGE`，算子 `GT/LT/CROSS_UP/CROSS_DOWN` |

## 游戏参数

在 `backend/src/main/resources/application.yml` 中调整：

```yaml
quantsim:
  game:
    initial-cash: 100000   # 初始虚拟资金
    total-ticks: 20        # 每局交易日数
    history-days: 60       # 开局可见历史天数
  advisor:
    api-key: ${ANTHROPIC_API_KEY:}     # 未配置时「问问 Agent」自动禁用
    model: claude-haiku-4-5-20251001   # 使用的 Claude 模型
    recent-days: 20                    # 提供给 Agent 的近期 K 线天数
```

启用 LLM 交易顾问：启动后端前设置环境变量 `ANTHROPIC_API_KEY`（PowerShell: `$env:ANTHROPIC_API_KEY = "sk-ant-..."`）。

## 设计说明

- **交易原子性**：trade/settle 对会话与账户行加悲观锁（`SELECT ... FOR UPDATE`）+ 事务，避免并发下资金不一致
- **防未来函数**：接口只返回 `current_trade_date` 之前（含当日）的行情，未来走势对用户不可见
- **AI 无未来泄漏**：预测模型按扩展窗口分块训练（每块只用块前数据），AI 在推进日期前用"当日预测 + 当日收盘价"成交，与玩家信息对等；mock 数据是随机游走，模型准确率约 51%（换成 AKShare 真实行情后更有区分度）
- **行情缓存**：单只股票的全量行情/指标经 Caffeine 整体缓存（10 分钟过期），tick/trade/history 走内存索引，不再逐次查库
- **schema 演进**：建表与后续变更统一走 Flyway 迁移（`backend/src/main/resources/db/migration/`），启动时校验（`ddl-auto: validate`）
- **保留字规避**：PRD 中 `game_sessions.current_date` 是 MySQL 保留字，实际列名为 `current_trade_date`
- **市场规则单一来源**：`Market` 枚举（STOCK 一手 100 股 / US 1 股起买 / CRYPTO 1 枚起买）统一约束交易与回测的整手校验，前端从开局响应的 `lotSize` 读取，不硬编码
- **前端 i18n**：`frontend/i18n.js` 双语字典 + `data-i18n` 属性驱动静态文案，动态区域监听 `qs:lang` 事件按缓存数据重渲染（不刷新页面、不丢失对局）；名词解释集中在 `frontend/glossary.js`
- **可重跑**：数据管道三个脚本均幂等，Spark 指标支持全量重算
