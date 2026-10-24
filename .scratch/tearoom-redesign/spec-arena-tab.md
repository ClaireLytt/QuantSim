# Spec: 竞技场 tab 茶室细节统一（策略竞技场/策略擂台/排行榜）

> Triage: `ready-for-agent`
> 来源：2026-10-25 用户指示「竞技场同型统一 + design-critic 复评」两项并行。
> 竞技场三页皮肤已换（ticket 02/06），本 spec 做细节收口；复评结论回来后若有新差距另行开票。
> 约束：当前 `refactor` 分支，不切分支。

## Problem Statement

竞技场 tab 三页与对局 tab 已收官的四页相比有三类脱节：① 策略擂台的标题（🥊）与三个操作
按钮（⚔/🎲/📜 等）用 emoji 作功能图标，直接违反设计禁止清单；奖牌 emoji 充当名次指示。
② 排行榜/擂台/竞技场的数字列（收益率/夏普/回撤/综合评分/积分）未走等宽支柱，刷新跳宽。
③ 擂台结算倒计时/评分权重说明卡为平铺，版式未对齐 hero 语法。

## Solution

三页细节统一：擂台按钮与标题去 emoji（纯文字 + 既有茶色层级），名次改茶色序号徽章；
全部数字列等宽；擂台倒计时卡做居中 hero 形制。策略竞技场只补数字等宽与标题衬线细节
（其表单 + 大 CTA 结构已达标）。交互、轮询、提交逻辑零改动。

## User Stories

1. 作为玩家，我想擂台按钮是纯文字茶色按钮而非 emoji 图标，这样与全站禁令和气质一致。
2. 作为玩家，我想擂台名次是茶色序号徽章，这样名次清晰且不依赖 emoji。
3. 作为玩家，我想收益率/夏普/回撤/评分/积分等数字列等宽，这样刷新与对比不跳宽。
4. 作为玩家，我想擂台倒计时与评分规则以居中 hero 卡呈现，这样与对局 tab 入口同构。
5. 作为玩家，我想竞技场回测统计块数字等宽、面板标题衬线，这样三页浑然一体。
6. 作为移动端用户，我想 390px 无横向溢出。
7. 作为英文用户，去 emoji 后文案仍走既有 i18n 键（无新增硬编码）。
8. 作为维护者，我想所有既有 id 与提交/结算/刷新逻辑零改动。
9. 作为评审者，我想拿到三页双主题截图与四层体检证据。

## Implementation Decisions

- emoji 清理只动展示层（按钮文本/标题/名次徽章），不动 i18n 键名与 JS 逻辑；若 emoji 在
  JS 渲染模板里拼接，改模板为序号徽章 span（样式走茶色 accent 系）。
- 数字等宽沿用既有 `--tr-mono` 支柱与"表格数字列"先例（战绩/每日榜/房间战况）。
- 擂台 hero 卡沿用 daily-card 居中形制；按钮行沿用 daily-actions。
- 样式归域：竞技场域样式写进其所属域文件，复用既有原语不重复定义。

## Testing Decisions

- 外部行为：真浏览器渲染、三页按钮全部可点、截图观感。
- 四层体检复用 + browse.mjs 三页双主题截图；prior art：`8f269c0`。

## Acceptance Criteria

1. `python tools/ui_check.py` → `0 error(s)`
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)`（擂台三按钮去 emoji 后仍有可访问名称）
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed`
4. 三页双主题截图入 `tools/ui_smoke/`：擂台无 emoji 功能图标、数字列等宽、hero 卡居中
5. `node tools/floor_guard.mjs` → `clean`，独立 commit

## Out of Scope

- 竞技场/擂台后端与结算逻辑；design-critic 复评新发现（另行开票）；其他 tab。
