# Spec: academy.js 拆分（学院文件瘦身，行为不变）

Triage: `ready-for-agent`

## Problem Statement

`academy.js` 已长到 2229 行，是前端第二大逻辑文件（仅次于刚拆完的 app.js）。它名义上是"学院"视图，实际还搭载了三个边界清晰的独立玩法：富豪场（交易所·短线预判）、期权入门沙盒、K线猜涨跌引擎。改任何一个玩法都要在两千多行里找位置，PostToolUse 体检跑整文件，心智负担与误伤面都大。前端架构约定是"一视图/一玩法一个 IIFE 文件"（richman.js、option.js 等先例），这三个玩法违反了该约定。

## Solution

把三个搭车玩法按既有先例各自拆成独立文件，学院本体（成长进度、剧情过场、实战关卡引擎、段位成就、大事记、图表识读教程）留守 `academy.js`。逐行搬移、行为不变；玩家在学院页与三个玩法里的体验零变化。预计 academy.js 回落约 700 行。

## User Stories

1. As a frontend developer, I want 富豪场 in its own file, so that changes to its betting logic don't require navigating the academy monolith.
2. As a frontend developer, I want the options sandbox in its own file, so that BS-pricing tweaks are isolated from academy progress code.
3. As a frontend developer, I want the K-line guess engine in its own file, so that its market engine can be found where the "one game, one file" convention predicts.
4. As a player, I want the academy page, 富豪场, options sandbox and guess game to behave exactly as before, so that the refactor is invisible to me.
5. As a repo maintainer, I want the split to follow the richman.js/option.js precedent (IIFE file + index.html mount + ?v= bump), so that the frontend stays architecturally uniform.
6. As a repo maintainer, I want load-order dependencies stated in each new file's header comment, so that a future script-tag reshuffle doesn't silently break cross-file calls.
7. As an AI agent editing these games later, I want the PostToolUse ui_check to scan a small file instead of 2229 lines, so that feedback stays fast and precise.
8. As a reviewer, I want the diff to be verifiably move-only (plus the minimal glue), so that I can approve it without re-reading every moved line.

## Implementation Decisions

- 拆分范围以文件内既有节注释为界：富豪场、期权入门沙盒、猜涨跌（含其行情引擎）三块各成一个新文件；其余节全部留守。
- 新文件遵循前端既有约定：IIFE 或与原代码相同的顶层形态（以搬移后行为不变为准）、index.html 挂载、`?v=` 日期版本、文件头中文注释写明"从 academy.js 拆出 + 依赖 + 加载顺序要求"。
- 搬移前先做跨文件/跨节引用普查（上轮 app.js 拆分的同款功课）：学院本体调用玩法符号、玩法调用学院的成长进度/XP 奖励函数、加载期执行的绑定语句，全部列清后决定哪些绑定随模块走、哪里需要 typeof 兜底。此普查结果决定最终切割线，普查发现耦合过深的块（如猜涨跌与学院 XP 结算强耦合）允许缩小拆分范围并在报告里说明。
- 事件联动节（qs:view / qs:lang 监听）按符号归属拆给各自模块。
- 不借机做任何逻辑改动、重命名或样式迁移；academy.css 本轮不动（样式按域文件约定仍归学院域）。
- i18n 键不动（键名与文件位置无关）。

## Testing Decisions

- 好测试 = 只验外部行为：视图能进、按钮活着、无 console error——不断言内部函数位置。
- 验证工具链沿用仓内既有三层：`python tools/ui_check.py`（死按钮/i18n/版本号）、`cd tools/ui_smoke && npm run buttons`（真浏览器全视图按钮体检）、`node browse.mjs` 定向走一遍三个玩法的核心交互（开一局富豪场下注、期权沙盒调参、猜涨跌答一题）。
- Prior art：上一轮 app.js 拆分（commit 4269ad1）的验证流程与证据形态。
- 所有新文件过 `node --check` 语法门。

## Acceptance Criteria

1. **静态体检（证 Stories 5, 7）**：`python tools/ui_check.py` → 尾部 `0 error(s), 0 warning(s)`。
2. **按钮体检（证 Stories 1–4）**：后端起着时 `cd tools/ui_smoke && npm run buttons` → `0 error(s)`，`learn/academy`、`learn/games` 等相关视图 ok。
3. **定向交互（证 Story 4）**：browse.mjs 分别进入富豪场、期权沙盒、猜涨跌各完成一次核心操作，`--assert-no-console-error` 通过，`--json` 输出 `ok: true`（输出贴报告）。
4. **语法门**：所有新建/修改的 js 文件 `node --check` 通过。
5. **move-only 可审（证 Story 8）**：完成报告列出"搬移块 → 新文件"对照表 + 非搬移的 glue 改动逐条列明（如 typeof 兜底），glue 之外 `git diff` 无逻辑改动。
6. **行数回落（证 Story 7）**：`wc -l frontend/academy.js` ≤ 1600（报告贴前后对比：2229 → 实际值）。
7. **提交规范**：英文 `refactor:` 提交，无 AI 署名；`?v=` 已 bump。

## Out of Scope

- academy.css 的联动拆分（样式域文件约定另议）。
- lab.js、i18n.js、index.html、pet.js 及其余超 800 行文件（slim-down 轮已裁决不动/缓拆）。
- 三个玩法的任何功能、文案、样式改动。
- 原型页 prototype-redesign.html 的归档（等设计方向裁决）。

## Further Notes

- 来源：/slim-down frontend 调查轮的拆分建议（app.js 为主推荐已完成于 4269ad1，academy.js 为次优先项）。
- 上轮 app.js 拆分的两个可复用教训：①随模块搬走它在「绑定」区的监听语句，避免加载序引用未定义；②启动路径上对后加载文件的符号用 `typeof` 兜底并注释原因。
