# Spec: 结算落库收口 SettledColumns（Settlement write-back）

Labels: `ready-for-agent`

## Problem Statement

作为维护者，当我在任何地方触发对局结算（玩家主动结算，或房间到期强制结算），我必须知道结算内层事务到底写了 `game_session` 的哪些列，并在调用方把这些列逐一手工回填到父事务里的旧托管实体上。漏掉任何一列，Hibernate 整行回写就会用旧快照把该列静默抹掉——这不是假设：`bias_report` 曾被这样清成 NULL（已修复，c8b37a2），现在的防线只是 RoomService 里一段 25 行的警告注释和一个 MySQL 集成测试。同时 bias-JSON 的"序列化失败回填 null"口径在 GameService 和 RoomService 各有一份实现。

## Solution

把"一局结算后 `game_session` 携带哪些列"收口成一个深模块：`doSettle` 产出一个 `SettledColumns`（status / finalReturnRate / finalSharpe / biasReportJson），自带 `applyTo(GameSession)`；GameService 的正常结算和 RoomService 的强结都只调 `applyTo`，bias-JSON 的序列化-或-null 政策收进该模块内部。新增一个结算列时只改一处，`applyTo` 的完整性由纯单元测试按构造保证。对外接口（`settle(id)` / `settleIsolated(id)` / `SettleResponse`）行为不变。

## User Stories

1. 作为维护者，我想让结算写回的列集合只定义在一个地方，这样新增结算列（如 finalMaxDrawdown）时不会漏掉某个调用方。
2. 作为维护者，我想让"每个结算列都被 applyTo 写入"成为一个纯单元测试，这样这条不变量不再只靠注释和 MySQL 集成测试守护。
3. 作为维护者，我想删掉 RoomService 里的手工回填块和 toJsonOrNull 副本，这样 bias-JSON 口径只有一份实现。
4. 作为维护者，我想让 REQUIRES_NEW 的事务缝保持原位不动，这样"单成员强结失败不拖垮房间迁移"的既有语义不受影响。
5. 作为房间玩家，我想在房间到期强结后仍能看到完整的诊断报告（bias report），这样复盘不会因为落库遗漏而缺数据。
6. 作为房间玩家，我想强结后的 finalReturnRate / finalSharpe 与我主动结算得到的数值完全同口径，这样榜单与复盘一致。
7. 作为玩家，我想正常结算的所有行为（返回的 SettleResponse、积分入账、挂单清理、标的揭晓）保持不变，这样这次重构对我不可见。
8. 作为后续开发者，我想在 GLOSSARY.md 里查到"结算落库"概念对应的模块，这样改口径时知道只改一处。
9. 作为代码评审者，我想看到 RoomService 不再出现 game_session 列名的 set 调用，这样一眼能确认回填知识没有再泄漏到缝外。
10. 作为测试作者，我想用反射把 SettledColumns 的组件与 applyTo 实际写入的字段对齐校验，这样未来加列而忘记 applyTo 会直接红。
11. 作为运维者，我想单成员强结失败时的日志与降级行为保持现状，这样线上告警口径不变。
12. 作为维护者，我想序列化失败（bias 报告转 JSON 抛异常）仍然降级为 null 而不拖垮结算/强结主流程，这一政策位于 SettledColumns 内部。

## Implementation Decisions

- 新模块：`SettledColumns`（record）：组件为 status、finalReturnRate、finalSharpe、biasReportJson；唯一行为方法 `applyTo(GameSession)`，把全部组件写到实体上。
- bias 报告的"序列化为 JSON、失败降级 null、不拖垮主流程"政策收进 SettledColumns 的构造/工厂（例如 `SettledColumns.of(status, returnRate, sharpe, BiasReport, ObjectMapper)`），GameService 的 computeAndStoreBias 和 RoomService 的 toJsonOrNull 两份实现被它取代。
- `doSettle` 构造 SettledColumns 并对自己的 session 调 `applyTo`；`SettleResponse` 需要让强结调用方能拿到同一份 SettledColumns（直接携带该 record，或由 settleIsolated 返回包含它的结果）——选择以不改变现有 API JSON 输出为准（SettledColumns 不新增到对外 JSON；若随 SettleResponse 传递则标记为不序列化或改为内部返回类型）。
- RoomService.evaluateTransitions 的强结分支改为 `result 携带的 SettledColumns.applyTo(s)`，删除逐列 set 和 toJsonOrNull；原 25 行警告注释压缩为一句"回填收口于 SettledColumns"的指引。
- 事务结构不变：settleIsolated 保持 REQUIRES_NEW，catch 语义（BusinessException 预期、RuntimeException 不拖垮迁移）不变；@Transactional 仍只在公共入口。
- 不属于 game_session 列的内层写（积分入账、挂单取消、account）不进入 SettledColumns——它们写别的表，不受父事务整行回写影响。
- GLOSSARY.md 增加"结算落库 (Settled Columns)"词条，对应模块与含义。
- 注释遵循仓库规范：中文、写"为什么"。

## Testing Decisions

- 好的测试只断言外部行为：对局结算后 game_session 四列的值、强结后房间页/复盘可见的数据——不断言 doSettle 内部调用顺序。
- 新增纯单元测试（无 Spring 上下文）：
  - `applyTo` 写入每一个 record 组件（反射对齐组件名与实体 setter，防"加列忘回填"）。
  - 序列化失败降级 null、report 为 null 时 biasReportJson 为 null。
  - 先行范例：BacktestEngine 纯单元不变量测试（b5da69c 引入的那批）。
- 既有回归不动：房间到期强结后 bias_report 非空的集成测试（c8b37a2 配套）继续作为最高缝上的防线；CompetitiveIntegrationTest 泄露扫描不受影响。
- 验证命令：`cd backend && mvn -B test`（前端无改动，无需按钮体检；若最终零前端文件变更，跳过 npm run buttons 与 ui_check）。

## Out of Scope

- 候选 2（GameBenchmarks 并入 BacktestEngine 内核）与候选 3（PublicBoards）——另立 spec。
- 新增任何结算列（如 finalMaxDrawdown）——本 spec 只收口既有四列。
- Hibernate dynamic-update 或实体映射层面的方案——不改 ORM 行为，只收口知识。
- 对外 API（SettleResponse JSON 字段、错误码）任何变化。
- 房间状态机（allDone / expired 判定）本身的逻辑。

## Further Notes

- 命名在 GLOSSARY.md 落词条时再最终确认（SettledColumns vs SettlementWriter；本 spec 按用户确认采用 record 形态 SettledColumns，非 Spring bean）。
- 风险极低：行为保持不变的收口型重构，改动集中在 GameService.doSettle 周边与 RoomService 强结分支两处。
- 完成后按仓库纪律：mvn 测试通过 → 立即 commit（英文信息、无 AI 署名）。
