# Spec: 好友房间面板 hero 化（房间码即主角）

> Triage: `done`（2026-10-25 已实现并提交 `74ff5a9`，本文是 /grill 共识的固化记录）
> 来源：用户第四轮「按首页重构对局/好友房间」+ /grill 三问全数同意（Q1 选 ③：入口已达标
> （ticket 13 `8f269c0`），差的是建房后的房间面板层级）。
> 约束：`refactor` 分支，不切分支（用户钦定）。

## Problem Statement

建好房的那一刻，玩家唯一的任务是把房间码发给朋友，但面板里房间码只是 h3 标题里的
一小段 20px 文字，与倒计时、战况表、按钮平起平坐——主角没有站上舞台。

## Solution

房间面板 hero 化：房间码 40px 等宽茶墨大字居中担纲，复制按钮与「人数/到期」元信息行
居其下，战况表保持左对齐（收益率列右对齐），按钮行沿用 daily-actions 形制。
创建/加入双卡与轮询/复制逻辑零改动。

## User Stories

1. 作为建房者，我想房间码是全场最大的视觉主角，这样抄码/发码不费眼。
2. 作为建房者，我想复制按钮紧贴房间码，这样一步完成分享。
3. 作为房间成员，我想人数与到期时间一眼可见，这样知道还等不等得起。
4. 作为房间成员，我想战况表仍然好读（文字左对齐、数字右对齐等宽），这样 hero 化不牺牲表格可读性。
5. 作为玩家，我想双主题下面板观感一致（暖纸/夜茶室）。
6. 作为维护者，我想纯 CSS 实现、DOM 与逻辑零改动，可整体回摘。
7. 作为评审者，我想拿到真点建房后的双主题截图证据。

## Implementation Decisions

- 纯 CSS：房间码 `--tr-mono` 40px、字距 .22em、`--accent-strong` 墨茶色；面板居中、
  标题列向排布；战况表局部恢复左对齐。无新 DOM、无新 i18n 键。
- 顺手修复 ticket 13 遗留：真实规则 checkbox 吃了全局输入尺寸被撑成胶囊并与文字折行，
  显式 16px 定宽并恢复行向排布。

## Testing Decisions

- 外部行为：真点 `#btn-room-create` 建房 → 房间码 hero 形态截图（双主题）；四层体检复用。
- prior art：`8f269c0`（入口 hero + 真点建房验证）。

## Acceptance Criteria（已全部通过）

1. `python tools/ui_check.py` → `0 error(s)` ✅
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)` ✅
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed` ✅（重试后；首两次因 cdnjs
   拉 echarts 断连而假红，已记 issue_recode/1.md）
4. 截图：`t16-room-panel-light.png`（码 9UYWP3）/ `t16-room-panel-dark.png`（码 SPUUGD）✅
5. `node tools/floor_guard.mjs` → `clean`；独立 commit `74ff5a9` ✅

## Out of Scope

- 房间轮询/撮合后端；加入者视角的额外状态提示（如「房主未开局」文案）；其他 tab。

## Further Notes

cdnjs 抖动两次把冒烟打假红——**把 echarts 本地 vendor 掉**（去 CDN 依赖）值得立一张
独立工单，既消 flake 又利离线部署；属于工程债不属于本 spec。
