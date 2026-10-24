# 01: 挂单撮合（OrderMatching）策略抽纯

**What to build:** 「这张挂单今天怎么处理」成为纯决策模块：输入单张挂单视图 + 当日 bar + 持仓 + 会话开关 + 预算，输出封闭决策集 KEEP / RATCHET(新触发价) / CANCEL(原因) / FILL(价, 量)。fillPrice 与 trailTrigger 随策略移入；validate/realRules 两道既有闸留在适配器按现有顺序跑；预算走 TradeBudget.FillConsumer。OrderService.fillOrders 退为"取数→问决策→落库执行"的适配器。玩家可见行为逐字不变。模块头注释写明"为什么按单张出决策而非整批"（顺序耦合是业务语义）。GLOSSARY.md 增补「挂单撮合」。

**Blocked by:** None (can start immediately)

**Status:** done (commit dac602f)

- [x] OrderMatching 表驱动单测 ≥10 条（含"ratchet 只升不降""保护单清仓作废""多头缩水只平剩余""预算耗尽作废而非跳过"），零 Spring/DB
- [x] `QUANTSIM_DB_PORT=3307 mvn -B test` → `BUILD SUCCESS`、Failures/Errors 0、总数 ≥124+新增
- [x] fillOrders 内无触发/ratchet/钳制内联逻辑（grep 证据）
- [x] 模块头注释含单张决策形状的"为什么"
- [x] GLOSSARY.md 新增「挂单撮合」行
- [x] 英文 `refactor:` 提交，无 AI 署名
