# 01: 评审整改四连修

**What to build:** code review（8d2d962...HEAD）的 4 条可修项一次修净，页面行为不变：① buildCalibOption 残渣裸花括号删除回缩进；② qsChart 头注释补 "H=handle" 命名约定说明；③ qsChart 的 window resize 监听加 ~150ms 尾沿节流（timeout 覆盖式，不引库）；④ qsChart 头注释登记 landing.html 为全站唯一独立 echarts.init 例外（落地页不加载 app.js）。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] lab.js 残渣花括号删除，`node --check` 过
- [x] qsChart 头注释含 H 约定与 landing.html 例外（diff 为证）
- [x] resize 监听经节流包装（diff 为证）
- [x] `python tools/ui_check.py` 0/0；`npm run buttons` → 0 error；改动 js 的 `?v=` bump
- [x] 单次英文提交，无 AI 署名
