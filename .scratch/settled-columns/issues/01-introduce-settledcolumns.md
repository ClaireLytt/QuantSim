# 01: Introduce SettledColumns and route GameService settlement through it

**What to build:** 结算结果四列 (status / finalReturnRate / finalSharpe / biasReportJson) 收口为一个 `SettledColumns` record, 自带 `applyTo(GameSession)` 与 "bias 报告序列化失败降级 null、不拖垮主流程" 的工厂政策。GameService 的正常结算改为构造该 record 并 applyTo 自己的 session (取代 computeAndStoreBias 对实体的直接写)。玩家可见行为零变化: SettleResponse JSON、积分、挂单清理、揭晓逻辑全部不变。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 新纯单元测试 (无 Spring 上下文): applyTo 写入 record 的每一个组件 (反射对齐, 防"加列忘回填"); 序列化失败降级 null; report 为 null 时 biasReportJson 为 null
- [x] GameService.doSettle 经由 SettledColumns 写 session, SettleResponse 对外 JSON 不变
- [x] `cd backend && mvn -B test` 全绿
- [x] 注释中文、写"为什么"; commit 英文、无 AI 署名
