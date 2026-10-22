# Spec: SettledColumns 收尾打磨（review 残留项）

Labels: `ready-for-agent`

## Problem Statement

作为维护者，arch-settled-columns 分支的两轮双轴评审（Standards/Spec）各自独立指出了同一处时序耦合：`SettledColumns.of(...)` 已经消费过 BiasReport，但调用方取"响应侧应展示的报告"时必须把**同一个** report 再传回 `responseReport(report)`——没有任何构造层面的约束保证传回的就是被序列化的那份。今天唯一调用点是对的，且有单测钉住，但"响应与落库口径一致"这条不变量仍是约定式的，不是构造式的——而本分支的立意恰恰是把约定式不变量升级为构造式。

## Solution

让工厂一次性产出"落库列 + 响应侧报告"的配套结果：调用方从同一个产物里分别取 `applyTo` 的列和响应用的 report，物理上无法传错。对外行为零变化。

## User Stories

1. 作为维护者，我想让"响应侧 biasReport 与落库 JSON 同生共死（序列化失败两边都为 null）"由构造保证，这样不再依赖调用方自觉传回同一对象。
2. 作为维护者，我想让未来新增的第二个结算调用方无法构造出"响应有报告、库里是 null"的分叉，这样这类口径漂移在编译期就不可能发生。
3. 作为测试作者，我想保留既有的 applyTo 反射完整性测试与序列化降级测试并让它们适配新工厂形态，这样防线不缩水。
4. 作为玩家，我想结算响应的 JSON 与现在完全一致，这样此次打磨对我不可见。
5. 作为代码评审者，我想顺手消除评审点名的琐碎重复（同一测试里重复构造相同的 BiasReport 字面量），这样下轮评审零噪音。

## Implementation Decisions

- SettledColumns 的工厂改为返回一个配套结果（如嵌套 record `Prepared(SettledColumns columns, BiasReport responseReport)`，命名实现时定）：序列化成功时 responseReport 为原对象，失败/为 null 时为 null。现有 `responseReport(BiasReport)` 实例方法删除。
- SettledColumns 本体保持纯"落库列"record 不变——不往组件里塞 transient 报告，否则破坏"组件 = game_session 列"的反射对齐语义。
- doSettle 从 Prepared 中取 columns 与 responseReport；SettleResult 与对外 SettleResponse JSON 不变。
- `status` 组件维持现状（上轮评审已裁决保留），序列化失败的 log.warn 维持现状。
- 测试中重复的 BiasReport 字面量提为局部变量。

## Testing Decisions

- 只测外部行为：Prepared 两侧的一致性（成功→两侧都有；失败→两侧都 null），不断言内部调用顺序。
- 继续沿用 SettledColumnsTest 的纯单元形态（无 Spring）；反射完整性测试与 COMPONENT_GETTERS 登记机制原样保留，仅适配工厂签名。
- 回归：`cd backend && mvn -B test` 全绿；既有集成测试不改。

## Out of Scope

- `status` 常量化（已裁决保留为组件）。
- 强结回归测试的再调整（上轮已强化并通过评审）。
- 候选 2/3（仿真内核、PublicBoards）等其余架构深化项。

## Further Notes

- 约 15–20 行的小改动；完成后照例 mvn 全绿 → 立即 commit（英文、无署名）。
- 另一遗留是工作区未提交的 CLAUDE.md 改动——它先于本分支存在、非本次产物，是否提交由用户决定，不进本 spec。
