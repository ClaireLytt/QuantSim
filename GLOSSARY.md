# QuantSim 领域词汇表

架构评审与代码中使用的领域概念, 每个概念对应一个收口模块 (改口径只改一处)。

| 术语 | 模块 | 含义 |
|------|------|------|
| **资金重放 (Ledger Replay)** | `service/LedgerReplay` | "逐日 → 先计隔夜利息 (首日除外) → 再按流水调整现金/持仓"的唯一实现。tick 计息 / undo 重建账户 / 结算资金曲线是它的三种视图。 |
| **AI 对手账房 (AI Opponent)** | `service/AiOpponent` | session 上 aiCash/aiShares 的唯一读写口: 买/卖 (含费)、计息、估值、启用判定。决策 (预测→目标仓位) 在 GameAiService, 账务在这里。 |
| **回测策略 (Backtest Strategy)** | `service/BacktestStrategy` | 策略 = 枚举常量体, 自带参数解析 / 指标准备 / 信号 / 目标仓位 / 调参网格。新增策略只加一个常量体, 模拟循环 (BacktestEngine) 不动。 |
| **对局归属 (Game Access)** | `config/GameAccessInterceptor` | /api/game/** 带 {sessionId} 的端点统一在拦截器过 requireAccess, 端点内不再手写。 |
| **防剧透 (Blind Dates)** | `service/BlindDates` | 竞技对局进行中: 日期平移虚拟纪元 + 标的匿名; 结算揭晓。回归防线是 CompetitiveIntegrationTest 的全端点泄露扫描。 |
| **费用口径 (Fee)** | `service/FeeCalculator` | 玩家 / AI / 基准 / 回测四方共用的费用计算锚点。 |
| **结算落库 (Settled Columns)** | `service/SettledColumns` | 一局结算后写回 game_session 的全部列 (status / finalReturnRate / finalSharpe / biasReportJson) 的唯一定义, 含 bias JSON 序列化-或-null 政策; 正常结算与房间强结都只调 applyTo, 完整性由 SettledColumnsTest 反射对齐保证。 |
| **弹窗接线 (Modal Wiring)** | `frontend/app.js qsModal` | 弹窗三件套 (开+音效 / 关按钮 / 背板点击) 的唯一定义; 业务副作用走 onOpen/onClose, Esc 关闭 opt-in (流程弹窗不可被 Esc 中断)。登记例外: tour-mask (点击=下一步)。曾散落 9 文件 19 处 (2026-10 收口)。 |
| **图表生命周期 (Chart Lifecycle)** | `frontend/app.js qsChart` | 前端 echarts 的 init(懒)/主题重绘/qs:view+窗口 resize 的唯一属主。视图只写 buildOption (返 null=未就绪), 数据变化调 refresh(); instance() 是增量 merge 更新的逃生口 (app.js updateChartData、tape.js 高频 tick)。新图表禁止手搓 init/theme/resize 三件套 (2026-10 从 19 文件 25 处收口)。 |
| **一日推进 (Game Day)** | `service/GameDay` | 「推进一天发生什么」编排的唯一定义: AI 旧价交易 → 推日 → 隔夜利息 → 挂单撮合 → 保证金强平, 顺序即口径 (GameDayTest 时序断言钉死)。事务留门面, 结算触发不在此 (候选③另一条缝)。 |
| **挂单撮合 (Order Matching)** | `service/OrderMatching` | 「这张挂单今天怎么处理」决策矩阵的唯一定义: 触发/成交价、ratchet 只升不降、reduce-only 钳制、realRules 继续挂、预算作废、validate 作废, 闸门顺序即行为 (OrderMatchingTest 钉死)。外部裁决经 Gates 四问注入, OrderService 退为取数+落库适配器。按单张出决策 (顺序耦合是业务语义, 见模块头注释)。 |
| **交易预算 (Trade Budget)** | `service/TradeBudget` | 「本局还能再交易几笔」的唯一定义, 含两个口径: 新增 (下单/手动交易) 数已成交+在挂单, 撮合只数已成交 (挂单自己的名额即预算)。纯核 Snapshot/FillConsumer 表驱动单测 (TradeBudgetTest), GameService/OrderService 只调不算。 |
