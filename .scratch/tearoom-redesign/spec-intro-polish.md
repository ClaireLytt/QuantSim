# Spec: 开局/每日挑战 呼吸感收尾（design-critic 在范围内三项）

> Triage: `ready-for-agent`
> 来源：2026-10-25 /grill 共识（结构级重构，`a079458` 已落 hero 化第一轮）+ design-critic 评审
> （4.5/10，六项差距）。本 spec 只收编**在范围内且非口味级**的三项：#1 底色夹层、#2 次级按钮
> 降级、#6 用户名截断。#3 暗色色温重调 / #4 主按钮改茶褐 / #5 桌宠遮挡空态 → Out of Scope。
> 约束：在当前 `refactor` 分支开发，不切分支（用户钦定）。

## Problem Statement

开局页 hero 化后仍有三处破坏「雨声茶室」静气：① 亮色下页面从上到下出现 浅米（页头）→
冷灰（视图容器外）→ 暖纸（卡片）三层底色打架，冷灰夹层直接削弱暖纸气质；② 「玩法说明/
新手引导」两条全宽空心按钮占据整行，视觉重量压过推荐玩法卡；③ 右上角登录态用户名过长时
显示为 "brows…" 生硬截断。

## Solution

① `body` 底色与茶室容器统一为同一暖米系（暗色同理统一墨绿系），消除夹层；② 两个次级
入口降级为一行并排的小号文字链（保留 id 与点击行为）；③ 用户名胶囊按既有省略号方案收敛
最大宽度并带 title 悬浮全名。

## User Stories

1. 作为玩家，我想亮色下整页只有一种暖米底 + 纸面卡的层次，这样茶室气质不被冷灰打断。
2. 作为玩家，我想暗色下页面底色与视图容器同属墨绿暗房系，这样两主题都浑然一体。
3. 作为新手，我想「玩法说明/新手引导」以安静的文字链出现，这样主 CTA 与推荐玩法卡的层级更清晰。
4. 作为新手，我仍要能一眼找到并点开玩法说明与引导（可点性与 tour 定位不回退）。
5. 作为登录用户，我想右上角用户名过长时优雅省略且悬浮可见全名，这样不再看到生硬的 "brows…"。
6. 作为移动端用户，我想以上改动在 390px 下无横向溢出、文字链可点面积足够。
7. 作为英文用户，我想涉及的文案仍走 i18n 双语键，无新增硬编码中文。
8. 作为维护者，我想底色统一通过主题变量完成而非局部 hack，这样后续视图不再各自为政。
9. 作为评审者，我想拿到改前/改后双主题截图对比与全套体检证据，这样可快速核验。

## Implementation Decisions

- **底色统一**：调整全局主题变量层（body 背景引用的 surface/glow 组合），使 body 与
  `.tearoom` 容器背景同系；不给单个视图写特例。暗色同步校准。改动后必须重验 ui_check
  的双主题 WCAG 紧边距（text-muted/surface 等对）。
- **次级按钮降级**：开局卡内「玩法说明」「新手引导」改为一行并排文字链样式（下划线或
  茶色细下边线，hover 加深）；DOM 保留原 id（tour 的 `btn-help`/`btn-tour` 定位依赖）。
- **用户名截断**：登录胶囊内用户名 max-width + text-overflow ellipsis + `title` 属性
  全名；**不改动 `.header-tools` 布局**（冻结区，只动该按钮内部文本样式）。
- 版本号 bump 照常；不新增 i18n 键（全部复用既有文案）。

## Testing Decisions

- 只测外部行为：真浏览器渲染、可点性、对比度数值、截图观感；不断言 CSS 内部组织。
- 复用四层体检：`ui_check.py`（WCAG 硬闸门 + 版本 bump）、`npm run buttons`（btn-help/
  btn-tour 降级后仍必须有监听且可访问名称完整）、`npm run smoke`（新手引导 10 步、
  对局全流程回归）、`browse.mjs` 定向截图。
- prior art：`a079458`（hero 化第一轮）与 ticket 02–06 的同型验证链。

## Acceptance Criteria

1. `python tools/ui_check.py` → `0 error(s)`（证明 story 1/2/7 的对比度与键完整）
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)`（story 3/4：文字链仍可点）
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed`（story 4/6：tour 与 390px 回归）
4. `browse.mjs` 截图：开局页亮/暗 + 右上角长用户名特写，改前改后对比入 `tools/ui_smoke/`
   （story 1/2/5/9 的人眼验收证据；亮色页肉眼无冷灰夹层为准）
5. `node tools/floor_guard.mjs` → `clean`，随后独立 commit（英文、无署名）

## Out of Scope

- 暗色主题整体色温改暖褐（critic #3）——挑战昨日已确认的全局主题，需用户单独决策
- 主按钮改茶褐实心（critic #4）——口味级，待用户表态
- 桌宠气泡遮挡空态文案（critic #5）——涉及漫游避让逻辑，另立工单
- 右上角工具簇布局与图标体系（critic #6 后半）——冻结区
- rooms/事件回放视图的同类 hero 化

## Further Notes

critic 评分 4.5/10 仅作参考，最终以用户看截图拍板（2026-10-25 /grill Q4 约定）。
