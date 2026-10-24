# Spec: 策略擂台 搭建/终榜子流程 hero 化

> Triage: `done`（2026-10-25 已实现并提交 `787ad56`，本文是 /grill 共识的固化记录）
> 来源：用户第六轮「按首页重构竞技场/策略擂台」+ /grill 三问全数确认（Q1 选 ③：
> 主榜在 ticket 14 已达标，差的是搭建与终榜两个子流程）。
> 约束：`refactor` 分支，不切分支；PR #11 已合并，本批提交待开新 PR 入主干。

## Problem Statement

擂台主榜已茶室化，但点「提交我的策略」进入的**策略搭建**页（买卖条件编辑器 + 预回测）
与「本轮结算」的**终榜**页仍是老版式：标题左对齐无衬线、预回测与返回按钮同重量、
终榜表第一列还是奖牌 emoji（ticket 14 的漏网）、曲线 legend 圆点是 echarts 默认蓝绿、
第一名行高亮用金色——与全站已统一的 hero 语法和禁金/禁 emoji 口径脱节。

## Solution

两个子流程对齐 hero 语法：衬线居中标题；搭建页「运行预回测」升为左栏主动作、
「提交策略参加擂台」独大 primary、返回/详情降为小字链（nowrap）；终榜「参加下一轮」
主 CTA 独大、奖牌 emoji → 茶色 `#N` 徽章（与主榜同款）、legend 圆点同步线色、
第一名行高亮金→茶。撮合评分、预回测引擎、提交逻辑与全部 id 零改动。

## User Stories

1. 作为参赛玩家，我想搭建页里「预回测→提交」的主路径层级分明，这样不会迷失在条件编辑器里。
2. 作为参赛玩家，我想预回测统计（年化/回撤/夏普）等宽呈现，这样反复调参对比不跳宽。
3. 作为玩家，我想终榜不再出现奖牌 emoji 与金色高亮，这样与全站禁令和茶室气质一致。
4. 作为玩家，我想终榜曲线的 legend 圆点和线同色，这样能对上第几名是哪条线。
5. 作为玩家，我想返回擂台榜/查看详情以安静文字链存在，这样不与主 CTA 抢层级。
6. 作为玩家，我想双主题下两个子流程观感一致。
7. 作为维护者，我想全部 id 与提交/结算/预回测逻辑零改动，可整体回摘。
8. 作为评审者，我想拿到真点流程（开搭建→预回测出曲线；开结算→终榜渲染）的截图证据。

## Implementation Decisions

- 版式原语复用：次级链沿用开局页 start-links 文法（无边框+茶色细下边线+nowrap）；
  主 CTA 沿用 daily-actions 的独大形制；衬线标题沿用 .tearoom 标题支柱。
- 徽章与配色修正在渲染层就地改（终榜行渲染、曲线 series itemStyle、首名行高亮 token
  从 warn 换 accent），不新增抽象。
- 无新增 i18n 键。

## Testing Decisions

- 外部行为：真点「提交我的策略」→ 搭建页预回测出曲线+统计；真点「本轮结算」→ 终榜
  渲染（徽章/配色肉眼核对截图）；四层体检 + ci_local。
- prior art：`efc82e3`（擂台主榜同口径）、`c141b63`（竞技场真点回测断言）。

## Acceptance Criteria（已全部通过）

1. `bash tools/ci_local.sh` → `全部通过` ✅
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)` ✅（story 5/7 可点性）
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed` ✅
4. browse.mjs 真点流程截图：`t24-duel-build.png`（亮，预回测出曲线+等宽统计）、
   `t24b-duel-final.png`（暗，`#N` 徽章/同色 legend/茶色首名行）✅（story 1-4/6/8）
5. `node tools/floor_guard.mjs` → `clean`；独立 commit `787ad56` 已推送 ✅

## Out of Scope

- 擂台撮合评分公式、预回测引擎、每周标的轮换（后端）
- 主榜（ticket 14 已完成）；排行榜（ticket 15）
- 本批提交的 PR 创建与 CI 验证（PR #11 已合并，待用户发话开新 PR）

## Further Notes

全站 hero 语法至此覆盖：10 个入口页 + 对局内 + 擂台两个子流程。设计侧没有已知欠账；
下一步要么开新 PR 入主干，要么请 design-critic 三评验证收敛分数。
