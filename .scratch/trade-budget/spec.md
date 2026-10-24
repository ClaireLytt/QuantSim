# Spec: 交易预算（TradeBudget）深模块收口

Triage: `ready-for-agent`

## Problem Statement

「交易笔数预算」这条业务规则目前拆在两个服务里，各算一套：GameService 的 budgetUsed（已成交+在挂单，下单/手动交易侧）与 OrderService.fillOrders 循环内的 txCount 计数（仅已成交，撮合侧）。两侧语义其实连贯（挂单占预算防绕过上限；撮合时该单自己的名额即预算），但这份连贯性只活在两处注释里——改口径必须协同改两个文件，undoLastTradeToday 的长注释记录的就是这个拆分曾经造成的账实分叉 bug。预算状态矩阵（成交/挂单/撤单/撤销组合）目前只能靠 MySQL 集成测试覆盖。

## Solution

把预算规则收成一个深模块「交易预算（TradeBudget）」：纯策略核（值对象携带 filled/open/max 三个计数 + 全部判定）+ 薄适配器（从仓库取数）。GameService 与 OrderService 的预算代码换成对同一个缝的调用。**行为逐字保持**——两侧现有判定语义（含撮合循环内边成交边计数、超限撤单而非静默跳过）一个不变。

## User Stories

1. As a backend developer, I want the budget rule defined in one module, so that a口径 change (e.g. cancelled orders refund budget) is a one-file edit.
2. As a backend developer, I want the "placement counts open orders, fill does not double-count itself" semantics written as named methods, so that the invariant stops living in two comments.
3. As a backend developer, I want pure table-driven unit tests over the budget state matrix, so that budget regressions fail in milliseconds without MySQL.
4. As a player in a limited-trades game, I want placement, manual trade, fill, cancel and undo to consume/release budget exactly as today, so that the refactor is invisible.
5. As a maintainer, I want the fill loop's incremental consumption internalized in the module, so that fillOrders stops hand-rolling txCount.
6. As a future reader, I want 交易预算 added to GLOSSARY.md pointing at the module, so that the next architecture review doesn't re-discover this seam.

## Implementation Decisions

- 新模块放 service 域，形态对齐仓内先例（FeeCalculator/SettledColumns：纯核可直构、Spring 注入薄适配）。
- 纯策略核：值对象持 (filledCount, openCount, maxTrades-or-null)，提供「可否新增一笔（下单/手动交易口径：filled+open）」「剩余笔数」「撮合消耗器（fill口径：filled 递增，不计 open）」。
- 适配器只负责从 transactionRepository.countBySessionId 与 orderService.countOpen 取数构核，不含判定逻辑。
- GameService.requireBudgetAndReason 保留（理由校验不属于预算），其预算半边改调新模块；budgetUsed/tradesRemaining 的实现收进模块，公开口径（返回 null 表示无上限、错误文案）不变。
- OrderService.fillOrders 的 txCount 初始化与 in-loop 判定/递增换成消耗器；超限 → CANCELLED 的现行为不变。
- 现有"返回 used 省第二次 COUNT"的效率特性保持（核是值对象，天然一次取数多次判定）。
- 错误文案逐字保留（集成测试与前端可能匹配文案）。
- GLOSSARY.md 增补「交易预算」行。

## Testing Decisions

- 好测试 = 只验模块接口：给定 (filled, open, max) 与动作序列，断言允许/拒绝/剩余——不 mock 仓库、不起 Spring。
- 新增纯单测覆盖矩阵：无上限/恰满/下单占用/撮合自名额转换/消耗器递增/undo 回退后的余额。
- 既有 TradingDepthIntegrationTest / GameApiIntegrationTest / CompetitiveIntegrationTest 是行为不变的回归防线，必须全绿。
- Prior art：SettledColumnsTest（纯核直构）、LedgerReplayTest。

## Acceptance Criteria

1. **全量后端测试（证 Story 4）**：`cd backend && mvn -B test` 尾部 `BUILD SUCCESS`，失败数 0（输出贴报告）。
2. **新单测（证 Stories 2, 3, 5）**：新增 TradeBudget 单测类，矩阵用例 ≥ 8 条，包含"挂单占预算拒下单"与"撮合不双计自身名额"两个语义命名用例；`mvn -B test -Dtest=TradeBudget*` 通过。
3. **收口完成（证 Story 1）**：`grep -rn "countBySessionId" backend/src/main/java --include="*.java"` 在 GameService/OrderService 中不再出现预算用途的直接调用（允许模块适配器内出现）；fillOrders 内无手写 txCount。
4. **词汇表（证 Story 6）**：GLOSSARY.md 新增「交易预算」行，格式对齐现有表格。
5. **提交规范**：英文 `refactor:` 提交，无 AI 署名，diff 范围仅 backend + GLOSSARY.md（+ scratch）。

## Out of Scope

- 候选⑥挂单撮合策略抽纯（本 spec 是它的前置，另开 spec）。
- 候选②GameDay 编排收口、候选③结算缝。
- 任何预算口径的行为变化（撤单退还笔数等新政策）。
- 前端对剩余笔数的展示逻辑。

## Further Notes

- 来源：架构评审候选①（报告 architecture-review-20261024.html），grilling 结论见对话：两侧口径差异是连贯语义而非 bug，收口目标是命名这份连贯性，不是改判定。
- ADR 目录不存在；若实施中发现与懒结算等既有决策冲突，先停手上报。
