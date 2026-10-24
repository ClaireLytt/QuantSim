# 01: 修正架构速览的回测描述（移除 BacktestTuner 失效引用）

**What to build:** 开发者或 AI agent 读 CLAUDE.md 架构速览时，看到的回测组成与仓内真实代码一致——「`BacktestService` 门面（含 tune 调参网格）+ `BacktestEngine`（模拟内核）+ `BacktestStrategy`（策略深模块）」，不再被引向已删除的 `BacktestTuner`。

**Blocked by:** None (can start immediately)

**Status:** done (commit 1283fc6)

- [x] `grep -c "BacktestTuner" CLAUDE.md` 输出 `0`
- [x] 回测一行命名与 `ls backend/src/main/java/com/quantsim/service/ | grep Backtest` 的三个文件逐词一致
- [x] 单独英文 `docs:` 提交，无 AI 署名；`git diff --stat` 仅含 CLAUDE.md
