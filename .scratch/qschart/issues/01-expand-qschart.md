# 01: Expand — qsChart 模块落地 + app/arena/replay 三图迁移

**What to build:** app.js 共享工具区新增 `qsChart(elId, buildOption)` 深模块（懒初始化/主题重绘/qs:view+window resize/实例登记，buildOption 返 null 跳过），返回 `{ refresh(), chart }`。app.js 主 K 线图、arena.js 回测图、replay.js 复盘图迁入；删除 switchView 里的 `typeof btChart` 加载序补丁与三图各自的 theme/resize 监听。旧接线视图不动（共存）。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `grep -n "typeof btChart" frontend/app.js` → 无输出
- [x] `python tools/ui_check.py` 0/0；涉及文件 `node --check` 过；`?v=` bump
- [x] `npm run buttons` → 0 error
- [x] browse.mjs：对局开局看主图、竞技场跑一次回测、结算开复盘，三张截图 + 无 console error
- [x] 英文 `refactor:` 提交，无 AI 署名
