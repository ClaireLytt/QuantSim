# Spec: GameDay 一局推进编排收口

Triage: `ready-for-agent`

## Problem Statement

「推进一天发生什么」是对局的核心业务规则，但它没有模块身份：GameService.tick 以纯胶水串起 7 个协作者，顺序敏感（AI 按旧收盘价交易 → 推进日期 → 计隔夜利息 → 挂单撮合 → 保证金检查 → 或有结算），而这些顺序约束只活在注释里——没有任何测试断言"利息先于撮合""AI 先于推日"。GameService 是 200 提交里 23 次改动的头号热点，多数落点就是 tick；每次改动都靠人肉重读注释来守序。删除测验：tick 删不掉（顺序即规则）却也说不清自己是谁——典型的宽浅缝。

## Solution

把推进编排收成深模块「一日推进（GameDay）」：接口一句话——`advance(session, account) → DayResult`（当日新 K 线、撮合回执、利息、是否触发结算等现有 tick 响应所需的全部产物）。GameService.tick 退为"访问控制 + 事务入口 + DTO 组装"，编排顺序成为 GameDay 的内部不变量并首次获得时序测试。行为逐字不变。

## User Stories

1. As a backend developer, I want the day-advance choreography in one named module, so that reading one file tells me everything that happens when a day passes.
2. As a backend developer, I want the step ordering pinned by tests, so that reordering interest/fill/AI steps fails in CI instead of corrupting ledgers.
3. As a backend developer changing one day-advance rule, I want to touch GameDay only, so that GameService stops being the churn hot spot for every tick change.
4. As a player, I want tick behavior identical to today (AI trades at old close, interest before fills, margin check after), so that the refactor is invisible.
5. As a maintainer, I want GameDay registered in GLOSSARY.md, so that the next architecture review sees the seam.
6. As a reviewer, I want the move to be verifiably mechanical (sequence lifted verbatim, diff auditable), so that approval doesn't require re-deriving the business rules.

## Implementation Decisions

- GameDay 为 service 域 Spring 组件，`@Transactional` 仍只在公共入口（GameService.tick），GameDay 是事务内被调方——与既有拆分约定（GameStartService/GameAiService 同款）一致。
- 接口 `advance(session, account) → DayResult`；DayResult 聚合现有 tick 返回所需字段，形状以现实现为准，不新增字段。
- 编排体逐行搬移：AI 旧价交易 → 推日 → 利息（资金重放口径）→ 撮合（挂单撮合模块）→ 保证金/生存模式检查 → 或有结算触发。既有注释随行搬走。
- 结算触发仍回调 GameService 现有结算口（不借机动候选③的缝）。
- 顺序测试用协作者时序断言（Mockito InOrder 或等价手段）：此处"实现细节"即业务行为，属于接口不变量的例外情况，测试注释写明这一点。
- GLOSSARY.md 增「一日推进」行。

## Testing Decisions

- 好测试 = 验外部行为；唯一例外是顺序不变量——顺序本身是口径（利息按推日后的持仓日计、AI 不能偷看新 K 线），用时序断言钉住并注释原因。
- 被测：GameDay 的步骤时序（新单测）+ 全量既有集成测试（行为不变回归：GameApiIntegrationTest / TradingDepthIntegrationTest / CompetitiveIntegrationTest 均重度覆盖 tick）。
- Prior art：TradeBudgetTest/OrderMatchingTest（新模块随测试落地）；GameStartService 拆分先例（事务边界留门面）。

## Acceptance Criteria

1. **全量回归（证 Story 4）**：`cd backend && QUANTSIM_DB_PORT=3307 mvn -B test`（quantsim-mysql-test 起着）→ `BUILD SUCCESS`、Failures/Errors 0、总数 ≥137+新增。
2. **时序钉死（证 Story 2）**：新增 GameDay 时序单测 ≥3 条（"AI 先于推日""利息先于撮合""保证金后于撮合"），`mvn -B test -Dtest=GameDay*` 通过；临时交换两步顺序演示测试变红（输出贴报告，红绿演示同 parity test 先例）。
3. **编排收口（证 Stories 1, 3）**：GameService.tick 不再直接调用 GameAiService/LedgerReplay 利息/OrderService.fillOrders（grep 证据），只余访问控制、事务、DTO 组装与对 GameDay 的一次调用。
4. **词汇表（证 Story 5）**：GLOSSARY.md 新增「一日推进」行。
5. **提交规范（证 Story 6）**：英文 `refactor:` 提交，无 AI 署名；完成报告含搬移对照（原行号区间 → GameDay）。

## Out of Scope

- 候选③结算缝（settleIsolated/REQUIRES_NEW 编排）——需 grilling，另立 spec。
- 任何推进口径变化（步骤增删、利息时点调整）。
- tick 的 HTTP 层与前端。

## Further Notes

- 来源：架构评审候选②（architecture-review-20261024.html）。当时定位：GameService.java:158-211 为编排体，顺序注释在 170/179 行附近（行号以实施时为准）。
- 实施时若发现编排与结算触发耦合过深（结算在事务语义上绕不开门面），允许缩小范围为"推日+利息+撮合"三步收口并在报告说明——同 academy-split 的缩小范围先例。
