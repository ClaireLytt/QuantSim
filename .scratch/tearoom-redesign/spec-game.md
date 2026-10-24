# Spec: 对局视图「雨声茶室」换装（Tearoom Game View）

> Triage: `done`（2026-10-24 已实现并提交 `31c2b04`，本文是 /grill 共识的固化记录）
> 来源：首页样板 spec（`spec.md`）的预留第二步 + /grill 一轮六问全数同意（2026-10-24）
> 约束：在当前 `refactor` 分支开发，不切新分支（用户钦定）。

## Problem Statement

首页已换装茶室风格（样板，commit 207fd73…9545204），对局视图仍是旧 Apple 紫风格，
两个核心页面风格断层。用户确认样板效果后，决定把换装推进到对局/模拟对局界面。

## Scope（Q1）

- **范围**：`#view-game` 全链路——开局表单 → K 线/交易面板/挂单/持仓 → 结算复盘卡
  （`#settle-card` 在容器内，自然覆盖）。该视图同时承载自由模拟、每日挑战、房间竞技的
  对局过程，换装一并作用于竞技模式。
- **不在范围**：房间列表（rooms.js）、每日挑战入口（daily.js）入口页，留待下一步；
  K 线底部 dataZoom 滑块的 ECharts 默认蓝（改前即默认色）。

## Implementation Decisions

- **机制（Q2）**：沿用作用域扩展——widgets.css 皮肤块选择器从 `#view-home` 扩为
  `#view-home + #view-game`，共用同一套变量重定义；全局 `:root` 主题零改动，可整体回摘。
  全站提升为全局主题是下一个独立决策，等对局样板看过再谈。
- **图表取色（Q3）**：对局内涨跌统一茶红(涨)/苔绿(跌)。app.js 新增 `gameColors()`：
  对局图表（K 线/量柱/结算曲线/组合饼图/置信度条）读 `#view-game` 上的作用域变量、
  全局兜底；其他视图图表不受影响。均线补作用域色（茶褐 MA5 / 青灰 MA20），顶掉全局紫蓝。
- **氛围分级（Q4）**：对局是高密度盯盘场景，只带 纸面材质（.card）+ 暗角；
  胶片颗粒与雨丝留在首页，K 线区保持干净底色。
- **字体（Q5）**：卡片标题衬线（--tr-serif）；全部局内数字等宽（--tr-mono：账户/持仓/
  成交/挂单/结算值/number 输入框）——顺带消除数值跳动的宽度抖动。正文不动。
  字体规则写在 game.css（域文件），色板/材质在 widgets.css（共享皮肤块）。
- **结构不动**：DOM、游戏逻辑、i18n 均无新增；纯视觉换装。

## Acceptance（Q6，已全部通过）

- `ui_check.py` 0 error（双主题 WCAG / 版本 bump）✅
- `npm run buttons` 0 error ✅
- `npm run smoke` 9 步全过（开局→买入→推进→结算全流程、1280/390 无横向溢出、
  无 console error）✅
- 截图证据（tools/ui_smoke/）：`tearoom-game-light.png` / `tearoom-game-dark.png`（开局双主题）、
  `tearoom-game-play.png` / `tearoom-game-play-dark.png`（局内双主题）✅
- 独立 commit（英文、无署名）：`31c2b04` ✅

## Next Steps（未决，需用户发起）

1. rooms / daily / 竞技场入口页换装（同机制第三步）。
2. 全站提升：茶室色板升为全局 `:root` 主题、删作用域块——大改动，动之前必须和用户确认方案。
3. dataZoom 滑块配色跟随茶室色（顺手项，可并入下一步）。
