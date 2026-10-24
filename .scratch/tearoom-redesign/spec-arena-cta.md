# Spec: 策略竞技场 CTA-first 重构（竞技场 tab 收官）

> Triage: `done`（2026-10-25 已实现并提交 `c141b63`，本文是 /grill 共识的固化记录）
> 来源：用户第五轮「按首页重构竞技场/策略竞技场」+ /grill 三问全数确认。
> 约束：`refactor` 分支，不切分支（用户钦定）。

## Problem Statement

对局 tab 四子页已统一「主 CTA 前置（默认即可跑）→ 分隔线下沉配置区」的语法，
策略竞技场仍是反的：股票/策略/快慢线/仓位一排配置压在上方，「运行回测」在下，
三个次级操作（自动调参/复制策略码/导入策略码）以中等重量按钮与主 CTA 抢层级。

## Solution

「运行回测」升为 hero 大 CTA 紧跟标题（默认参数即可出结果），配置下沉为
「想换个打法？标的 · 策略 · 参数」分隔线次级区；三个次级操作降为带单色线性
图标的小字链。回测引擎、调参、策略码逻辑与全部 id 零改动。
顺手项：回测资金曲线的 dataZoom 滑块跟随主题色（对局主图 ticket 01 同口径）。

## User Stories

1. 作为玩家，我想一进竞技场就能点「运行回测」看到默认策略的结果，这样最快路径最显眼。
2. 作为玩家，我想换策略/调参数时在分隔线下的次级区操作，这样配置不与 CTA 抢注意力。
3. 作为进阶玩家，我想自动调参/复制/导入策略码仍一眼可见但不喧宾，这样高级功能不挡新手路径。
4. 作为玩家，我想资金曲线的缩放滑块与茶室同色系，这样结果区没有突兀的默认蓝。
5. 作为玩家，我想双主题下这页与对局 tab 气质一致。
6. 作为英文用户，我想新点睛文案中英双份（走新 PAIRS 单行形制）。
7. 作为维护者，我想 DOM 只重排不增删 id，回测/调参/导入逻辑零回退。
8. 作为评审者，我想拿到真点「运行回测」出曲线+统计的双主题截图证据。

## Implementation Decisions

- 复用既定版式原语：`start-custom-label`（分隔线小标签）、CTA-first 卡内顺序；
  次级链沿用 start-links 的"无边框 + 茶色细下边线"文法（含 13px 单色线性图标）。
- dataZoom 滑块样式与对局主图同一套 token 组合（fillerColor/handle/dataBackground
  经 hexA 从主题色推导），实现各自就地（arena.js 的 builder 内）。
- i18n 新键 1 个（arena.customize），按双语对单行行形写（工具契约）。

## Testing Decisions

- 只测外部行为：真点 `#btn-backtest` 断言 `#bt-result` 出现；双主题截图；四层体检 +
  `ci_local.sh`（本地 CI 镜像，retro 新增后的首次实战）。
- prior art：`cc94760`（事件回放真点 CTA）、`8f269c0`（建房出码断言）。

## Acceptance Criteria（已全部通过）

1. `bash tools/ci_local.sh` → `全部通过` ✅（story 6 的键完整 + lint）
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)` ✅（story 3/7 可点性）
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed`（含既有「回测工坊跑通出曲线」回归）✅
4. browse.mjs 真点回测：亮色 `t21-arena-cta.png`、暗色 `t21-arena-dark.png`，
   曲线+全套统计渲染、无 console error ✅（story 1/2/4/5/8）
5. `node tools/floor_guard.mjs` → `clean`；独立 commit `c141b63` 已推送 ✅

## Out of Scope

- 回测引擎/调参网格/策略码协议（后端与算法层）
- 擂台（ticket 14）与排行榜（ticket 15）已完成，不重复处理
- 学堂/研究所 tab 的同型统一（未立项）

## Further Notes

至此 对局 tab 四页 + 竞技场 tab 三页 共七个入口页统一为同一套 hero 语法；
剩余候选是 学堂/研究所/我的 三个 tab 的入口页，是否推进由用户另行决策。
