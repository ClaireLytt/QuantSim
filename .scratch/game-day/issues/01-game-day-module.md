# 01: GameDay 一日推进编排收口

**What to build:** GameService.tick 的编排体（AI 旧价交易 → 推日 → 隔夜利息 → 挂单撮合 → 保证金/生存检查 → 或有结算触发）逐行搬入深模块 GameDay（`advance(session, account) → DayResult`，事务内被调方，@Transactional 留门面）；tick 退为访问控制 + 事务入口 + DTO 组装。顺序注释随行搬走；结算触发仍回调现有口。玩家推进行为逐字不变。时序单测钉死顺序不变量（含红绿演示）。GLOSSARY 增「一日推进」。耦合过深时允许缩小为"推日+利息+撮合"三步收口并报告。

**Blocked by:** None (can start immediately)

**Status:** done (commit see log)

- [x] 时序单测 ≥3 条（AI 先于推日 / 利息先于撮合 / 保证金后于撮合），临时换序演示 FAILED → 还原 passed（两段输出贴报告）
- [x] `QUANTSIM_DB_PORT=3307 mvn -B test` → `BUILD SUCCESS`、Failures/Errors 0、总数 ≥137+新增
- [x] GameService.tick 内不再直调 AI 交易/利息/撮合（grep 证据），仅一次 GameDay 调用
- [x] GLOSSARY.md 新增「一日推进」行
- [x] 英文 `refactor:` 提交，无 AI 署名；报告含搬移对照（原行号区间 → GameDay）
