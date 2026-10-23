# 01: 交易预算（TradeBudget）深模块收口

**What to build:** 「交易笔数预算」成为单一模块：纯策略核（(filled, open, max) 值对象 + 可否新增/剩余/撮合消耗器）+ 薄仓库适配器。GameService（下单/手动交易/undo 响应里的剩余笔数）与 OrderService.fillOrders（in-loop 判定与递增、超限撤单）全部换成这条缝。玩家在限笔对局里的全部行为逐字不变；错误文案不变。GLOSSARY.md 增补「交易预算」。

**Blocked by:** None (can start immediately)

**Status:** done (commit 361d706)

- [x] 新增 TradeBudget 纯单测 ≥8 条矩阵用例（含"挂单占预算拒下单""撮合不双计自身名额"），不起 Spring/DB
- [x] `cd backend && mvn -B test` → `BUILD SUCCESS`、0 失败（全量回归即行为不变证据）
- [x] GameService/OrderService 中不再有预算用途的手写计数（fillOrders 无 txCount 手账）
- [x] GLOSSARY.md 新增「交易预算」行
- [x] 英文 `refactor:` 提交，无 AI 署名
