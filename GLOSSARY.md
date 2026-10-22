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
