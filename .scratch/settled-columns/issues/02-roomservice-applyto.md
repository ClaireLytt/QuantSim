# 02: Forced room settlement applies SettledColumns; delete the hand backfill

**What to build:** 房间到期强结分支改为对父事务旧托管实体调用结算结果携带的 `SettledColumns.applyTo(s)`: settleIsolated 的调用方能拿到同一份 SettledColumns (不改变 SettleResponse 对外 JSON——若随响应对象携带须不参与序列化, 或改内部返回类型)。删除 RoomService 的 4 个手工 set 与 toJsonOrNull 副本; 25 行警告注释压缩为指向 SettledColumns 的一句指引。GLOSSARY.md 增加"结算落库 (Settled Columns)"词条。REQUIRES_NEW 与 catch 语义 (BusinessException 预期 / RuntimeException 不拖垮迁移) 不变。

**Blocked by:** 01 (SettledColumns record)

**Status:** ready-for-agent

- [ ] RoomService 不再出现 game_session 列名的 set 调用与 toJsonOrNull
- [ ] 既有房间到期强结回归 (bias_report 非空, c8b37a2 配套) 保持绿
- [ ] GLOSSARY.md 新词条
- [ ] `cd backend && mvn -B test` 全绿; commit 英文、无 AI 署名
