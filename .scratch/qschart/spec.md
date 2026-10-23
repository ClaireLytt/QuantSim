# Spec: qsChart 前端图表深模块（expand–contract 全站收口）

Triage: `ready-for-agent`

## Problem Statement

前端每个带图的视图都手搓同一套 echarts 生命周期接线：`echarts.init`（19 个文件 25 处）、`qs:theme` 监听重建配色（17 个文件）、`qs:view`/window resize 重算尺寸（隐藏容器初始化尺寸为 0 的老问题）、`cssVar()` 逐项取色的 axisLine/splitLine 样板。图表生命周期没有属主：app.js 拆分时被迫写下的 `typeof btChart !== "undefined"` 加载序补丁就是铁证；改一个主题变量要碰每个视图的 option 字面量；新视图加一张图 ≈ 30 行样板，漏掉任何一个监听就得等真浏览器巡检兜底。

## Solution

一个深模块 `qsChart(elId, buildOption)`：内化 init（含懒初始化避开隐藏容器零尺寸）、主题重绘（qs:theme 时自动重调 buildOption）、尺寸重算（qs:view + window resize）、实例登记。视图只写"怎么构造 option"，生命周期全部交给模块；数据变化时调返回句柄的 `refresh()`。按 expand–contract 分四步落地：先 expand（模块 + app.js 自家三张图迁移并删 typeof 补丁），再两批 migrate（按文件分组），最后 contract（清掉残留的手工监听 + 全站冒烟）。每批独立绿（旧接线与新模块共存不冲突）。

## User Stories

1. As a frontend developer, I want chart lifecycle owned by one module, so that adding a chart is one call instead of ~30 lines of wiring.
2. As a frontend developer, I want theme redraw centralized, so that a palette change doesn't require touching every view's option literal.
3. As a frontend developer, I want resize-on-view-switch internalized, so that the hidden-container zero-size bug class disappears.
4. As a frontend developer, I want the `typeof btChart` load-order hack deleted, so that cross-file chart references stop existing at all.
5. As a player, I want every chart to render, re-theme and resize exactly as today, so that the refactor is invisible.
6. As a maintainer, I want migration in independent green batches, so that any batch can ship (and be bisected) alone.
7. As a future reader, I want qsChart documented in app.js 共享工具区 and GLOSSARY.md, so that the seam is discoverable and nobody hand-wires the next chart.

## Implementation Decisions

- 模块放 app.js 共享工具区（与 $ / api / toast / cssVar 同层），全局函数 `qsChart(elId, buildOption)`，返回句柄 `{ refresh(), chart }`（暴露 chart 实例给确需直接 setOption/dispatchAction 的特殊视图，作为逃生口而非常规路径）。
- 懒初始化：首次 `refresh()` 且容器可见时 init；此前只登记。qs:view 切换时对已 init 实例 resize、对未 init 且容器已可见的实例补 init+render。
- buildOption 返回 null 表示"数据未就绪"，模块跳过渲染——视图不必自己做就绪判断分支。
- qs:theme：模块对全部已 init 实例重调 buildOption + setOption(notMerge)；视图删除自己的 theme 监听。
- window resize：模块统一节流处理。
- 迁移批次（每批独立绿，旧新共存）：expand = 模块 + app.js/arena.js/replay.js 三张图 + 删 typeof 补丁；batch A = 对局域与竞技域视图；batch B = 学院/实验室/杂项视图；contract = 删残留手工监听、grep 清零、全站冒烟。
- 特殊形态兜底：确有无法归一的图（如依赖 dispose/重建的）允许经句柄 chart 直操，登记在模块注释里，不强行归一。
- 版本号：每批 bump 所改文件的 `?v=`。

## Testing Decisions

- 好测试 = 真浏览器外部行为：图渲染出来、切主题重绘不报错、切视图/改窗宽不横向溢出；不断言内部实例管理。
- 每批验证：`python tools/ui_check.py` + `node --check` + `npm run buttons`；expand 批加 browse.mjs 定向（对局图 + 竞技场图 + 复盘图各一截图）；contract 批跑全量 `npm run smoke`（8 步含双宽度与主题切换）。
- Prior art：academy-split（f2d1816 前的 4269ad1）的验证流程；smoke 是全站回归防线。

## Acceptance Criteria

1. **Expand（证 Stories 1, 4）**：qsChart 落地且 app.js 主图/arena 回测图/replay 复盘图走模块；`grep -n "typeof btChart" frontend/app.js` → 0；buttons 0 error；browse.mjs 三图截图无 console error。
2. **Migrate 两批（证 Stories 5, 6）**：每批提交后 `grep -c "echarts.init" frontend/*.js` 递减且 buttons 0 error。
3. **Contract（证 Stories 2, 3）**：全站 `echarts.init` 仅存 qsChart 模块内 1 处（+登记在案的逃生口）；视图文件中 `qs:theme` 图表监听清零（grep 证据）；`npm run smoke` 8 步全过（输出贴报告）。
4. **词汇表/工具区注释（证 Story 7）**：GLOSSARY.md 增「图表生命周期」行；app.js 共享工具区注释更新。
5. **提交规范**：每批单独英文 `refactor:` 提交，无 AI 署名，`?v=` 同步 bump。

## Out of Scope

- 候选⑤弹窗三件套（独立 spec）。
- 任何图表视觉/交互变化；ECharts 版本升级。
- walker.js 等非 echarts 的 canvas 动画。

## Further Notes

- 来源：架构评审候选④。现状计量：19 文件 25 处 init、17 个 theme 监听（2026-10-24 grep）。
- 风险点：各视图 buildOption 对"数据未就绪"的处理不一，迁移时逐文件核对首渲染时机；竞技域（duel/rooms）有脱敏相关渲染，行为不变由 buttons+smoke 兜底。
