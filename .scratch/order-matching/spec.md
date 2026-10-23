# Spec: 挂单撮合（OrderMatching）策略抽纯

Triage: `ready-for-agent`

## Problem Statement

挂单撮合的决策矩阵——5 种挂单类型（限价买/限价卖/止损/止盈/移动止损）× 多种约束（触发判定、移动止损 ratchet、reduce-only 钳制、真实规则跳过、预算作废、validate 作废）——全部内联在 OrderService.fillOrders 的 95 行循环里。接口吃 JPA 托管实体 + 仓库 + 事务上下文，所以这套纯决策逻辑零单测，只能靠起 MySQL 的 TradingDepthIntegrationTest 覆盖；新增一种挂单类型或改一条约束，最快的验证手段是十秒级集成测试而不是毫秒级表驱动用例。fillOrders 里那几段长注释（reduce-only 穿零开空、realRules 用 clamp 后数量判定的埋雷修复）就是矩阵复杂度没有模块身份的证据。

## Solution

把「这张挂单今天怎么处理」收成深模块「挂单撮合（OrderMatching）」：纯决策核，输入一张挂单的视图 + 当日 bar + 当前持仓 + 会话规则开关 + 预算状态，输出一个决策（继续挂 / 上移触发价 / 作废 / 按价与数量成交）。OrderService 退为适配器：取数、逐单调决策、按决策落库与执行。行为逐字保持；决策矩阵获得表驱动单测。

## User Stories

1. As a backend developer, I want the fill decision for one order to be a pure function, so that the 5-type × N-constraint matrix is table-testable in milliseconds without MySQL.
2. As a backend developer, I want the reduce-only clamp ("保护单不得穿越零点开空") expressed as a named decision rule, so that the long inline comment becomes executable specification.
3. As a backend developer, I want the trail-stop ratchet (trigger only moves up) decided by the module, so that its only-rises invariant is pinned by a unit test.
4. As a backend developer, I want the realRules skip ("今天不能成交, 继续挂, 不作废") and budget-exhausted cancel ("作废而不是静默超限") as distinct decision outcomes, so that the difference between KEEP and CANCEL stops being implicit control flow.
5. As a backend developer adding a new order type later, I want to add one decision branch plus table rows, so that the change doesn't touch persistence or transaction code.
6. As a player, I want every order to fill, stay, ratchet or cancel exactly as today, so that the refactor is invisible.
7. As a maintainer, I want OrderService to shrink to an adapter (load, decide, apply), so that persistence concerns and policy concerns stop interleaving.
8. As a future reader, I want 挂单撮合 in GLOSSARY.md pointing at the module, so that the seam is discoverable.
9. As a reviewer, I want the sequential coupling (later orders see positions updated by earlier fills) preserved and documented, so that the per-order (not batch) interface shape is understood as deliberate.

## Implementation Decisions

- 新模块放 service 域，纯核形态对齐 TradeBudget/SettledColumns 先例：可直构、零 Spring。
- 接口按「单张挂单」出决策，不做整批纯化——循环内先成交会改变后续单的持仓（顺序耦合是业务语义），由适配器逐单取最新持仓后再问决策核。此形状在模块注释里写明"为什么不是 batch"。
- 决策输出为封闭集合：KEEP（继续挂）/ RATCHET(新触发价) / CANCEL(原因) / FILL(价, 数量)。CANCEL 原因区分 reduce-only 清仓、预算耗尽、validate 拒绝——与现状落库行为一一对应。
- 依赖外部裁决的两项（tradeEngine.validate、realRulesError）不塞进纯核：适配器先问纯核得到"拟成交(价,量)"，再跑这两道既有闸，闸的结果决定 CANCEL/KEEP/FILL——现有判定顺序（触发→ratchet→reduce-only→realRules→预算→validate）逐字保持。
- fillPrice 与 trailTrigger 两个现有纯函数移入模块（它们本就是策略）。
- 预算用 TradeBudget.FillConsumer（候选①的缝），不引入第二种预算表达。
- 错误行为、落库字段、FillSummary 返回形状全部不变。
- GLOSSARY.md 增补「挂单撮合」行。

## Testing Decisions

- 好测试 = 只验决策接口：给定 (挂单视图, bar, 持仓, 开关, 预算)，断言决策枚举与参数；不 mock 仓库、不起 Spring。
- 表驱动覆盖矩阵主对角线与注释里的历史坑：限价买触发价/未触发、止损触发、移动止损 ratchet 只升不降、advanced 模式保护单清仓作废/多头缩水只平剩余、LIMIT_SELL 不受 reduce-only 约束、预算耗尽作废、bar 缺失跳过。
- 回归防线：TradingDepthIntegrationTest（11 用例，含 undo 回滚挂单）+ 全量 `mvn -B test` 必须零失败。
- Prior art：TradeBudgetTest（纯核直构、中文语义命名用例）、BacktestEngineTest。

## Acceptance Criteria

1. **全量回归（证 Stories 6, 7）**：`cd backend && QUANTSIM_DB_PORT=3307 mvn -B test`（quantsim-mysql-test 起着）尾部 `BUILD SUCCESS`、`Failures: 0, Errors: 0`，总用例数 ≥ 124+新增（输出贴报告）。
2. **决策矩阵单测（证 Stories 1–5）**：新增 OrderMatching 单测 ≥ 10 条表驱动用例，含"ratchet 只升不降""保护单清仓作废""多头缩水只平剩余""预算耗尽作废而非跳过"四个语义命名用例；`mvn -B test -Dtest=OrderMatching*` 通过。
3. **适配器收口（证 Story 7）**：fillOrders 内不再有触发价比较/ratchet 计算/reduce-only 钳制的内联逻辑（`grep -n "trailTrigger\|fillPrice" OrderService.java` 仅剩对模块的调用）。
4. **顺序耦合文档化（证 Story 9）**：模块头注释含"为什么按单张出决策而非整批"的说明（评审读 diff 确认）。
5. **词汇表（证 Story 8）**：GLOSSARY.md 新增「挂单撮合」行。
6. **提交规范**：英文 `refactor:` 提交，无 AI 署名；diff 仅 backend + GLOSSARY.md（+ scratch）。

## Out of Scope

- 候选②GameDay 编排、候选③结算缝、前端候选④⑤。
- 任何撮合口径变化（部分成交、新挂单类型等）。
- advanced 与 realRules 互斥关系的放开（现状注释已标"防未来"，本次不动）。

## Further Notes

- 来源：架构评审候选⑥（architecture-review-20261024.html），前置候选①已落地（TradeBudget，commit 361d706）。
- 集成测试环境：3306 被别项目占用，用 quantsim-mysql-test@3307（见 issue_recode/1.md 2026-10-24 条）。
