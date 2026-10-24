# 02: Migrate A — 对局/竞技域视图迁入 qsChart

**What to build:** daily.js、duel.js、rooms.js、home.js、tape.js、heatmap.js 的图表迁入 qsChart，删各自 init/theme/resize 接线；行为不变。

**Blocked by:** 01

**Status:** done

- [x] 本批文件内 `echarts.init` 清零（grep 证据），`qs:theme` 图表监听清零
- [x] `python tools/ui_check.py` 0/0；`node --check` 过；`?v=` bump
- [x] `npm run buttons` → 0 error
- [x] 英文 `refactor:` 提交，无 AI 署名
