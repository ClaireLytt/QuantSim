# Spec: 好友房间入口 呼吸式重构（对局 tab 收官）

> Triage: `ready-for-agent`
> 来源：2026-10-25 对局 tab 版式统一系列（开局页 `a079458`、polish `3679baa`、每日挑战同批、
> 事件回放 `cc94760`）。好友房间是对局 tab 四个子页里最后一个平铺老版式的入口。
> 约束：在当前 `refactor` 分支开发，不切分支（用户钦定）。

## Problem Statement

对局 tab 的其余三个子页已统一为「衬线 hero + 主 CTA 前置 + 次级区下沉」的呼吸式版式，
好友房间仍是旧的双卡平铺（创建房间卡 + 加入房间卡并列，表单项与按钮同等视觉重量），
切到这个子页像回到换装前的站点，层级与密度都与同 tab 的兄弟页面脱节。

## Solution

好友房间入口按同一套 hero 语法重排：衬线标题下先给两条主路径（创建 / 加入）以清晰的
主次呈现——创建是纸面 hero 卡（市场/难度/真实规则配置下沉为分隔线后的安静次级区，
「创建并生成房间码」为前置大 CTA），加入保持既有的卡内切换（已有 link-room-join/
link-room-create 往返链）。进行中的房间面板（房间码/战况表/收益图）只做茶室细节
（衬线小标题、等宽房间码与数字列、daily-actions 风格 CTA），不动交互与轮询逻辑。

## User Stories

1. 作为玩家，我想好友房间入口与模拟对局/每日挑战/事件回放同一套版式语言，这样对局 tab 四个子页浑然一体。
2. 作为建房者，我想「创建并生成房间码」是前置大 CTA（默认配置即可建房），这样最快路径最显眼。
3. 作为建房者，我想市场/AI 难度/真实规则下沉为分隔线后的安静次级区，这样配置不与 CTA 抢层级。
4. 作为受邀玩家，我想从「拿到朋友的房间码了？」一键切到加入卡（既有行为），这样两条路径互不干扰。
5. 作为房间成员，我想房间码以等宽字体醒目展示、复制按钮在旁，这样发码给朋友不出错。
6. 作为房间成员，我想战况表的进度/收益率列等宽对齐，这样刷新时数字不跳动。
7. 作为移动端用户，我想 390px 下无横向溢出、双卡纵排，这样手机上照常可用。
8. 作为英文用户，我想新增点睛文案（若有，≤1 键）中英双份。
9. 作为维护者，我想所有既有 id（btn-room-create/join/copy/play/refresh、link-room-* 等）与轮询/复制逻辑零改动，这样功能零回退。
10. 作为评审者，我想拿到双主题截图与全套体检证据。

## Implementation Decisions

- 复用已沉淀的版式原语：`start-custom-label`（分隔线 + 打字机体小标签）、`daily-actions`
  大 CTA 形制、衬线标题规则（.tearoom .card h2/h3 已全局生效）。
- 创建卡内部重排为：标题 →（可选一句说明）→ 大 CTA → 分隔线标签 → 配置区（select 并排、
  真实规则复选随行）→ 切换到加入的链接行。DOM 只重排与包裹，id 不增不删。
- 房间面板：房间码 span 与战况表数字列走 `--tr-mono`；按钮行沿用 daily-actions。
- 样式写进对局域文件（rooms 属 game.css 既有域），版式原语若需共享保持在既有位置引用，
  不跨文件重复定义选择器。
- 新 i18n 键至多 1 个（配置区标签，如「想换个配置？」形制）。

## Testing Decisions

- 只测外部行为：真浏览器可点性、建房→出房间码真实链路、截图观感；不断言 CSS 组织。
- 体检四层复用：ui_check（WCAG/版本 bump/i18n 键）、buttons（room 域按钮监听完整）、
  smoke（全导航回归）、browse.mjs（定向截图 + 真点「创建并生成房间码」断言房间码出现）。
- prior art：`cc94760`（事件回放同型重构，含真点 CTA 验证）。

## Acceptance Criteria

1. `python tools/ui_check.py` → `0 error(s)`（story 8 及对比度）
2. `cd tools/ui_smoke && npm run buttons` → `0 error(s)`（story 9 可点性）
3. `cd tools/ui_smoke && npm run smoke` → `9 step(s) passed`（story 7 双宽度 + 全站回归）
4. browse.mjs：登录后真点 `#btn-room-create`，断言 `#room-code-label` 出现 6 位码，
   无 console error；入口双主题截图入 `tools/ui_smoke/`（story 1-5、10 的证据）
5. `node tools/floor_guard.mjs` → `clean`，独立 commit（英文、无署名）

## Out of Scope

- 房间对局过程与结算（复用对局界面，已换装）
- 房间轮询/撮合等后端逻辑
- 竞技场/学堂等其他 tab 的版式再统一
- 桌宠、冻结区

## Further Notes

完成后对局 tab 四子页版式收官；竞技场 tab（策略竞技场/擂台/排行榜）是否做同型统一，
由用户另行决策。
