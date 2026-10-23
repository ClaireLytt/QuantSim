# Spec: code review（8d2d962...HEAD）整改

Triage: `ready-for-agent`

## Problem Statement

对 12 个提交的两轴评审（Standards/Spec）产出 4 条值得修的小发现：① lab.js 的 buildCalibOption 里留着 try 块抽取后的无意义裸花括号块（重构残渣，读者费解）；② qsChart 的句柄命名约定 `xxxH` 无处解释 H 含义；③ qsChart spec 承诺的 window resize 节流没实现（裸监听，窗口拖动时每帧全量 resize 全部实例）；④ landing.html 的独立 `echarts.init` 是合法例外（落地页不加载 app.js）但没登记进 qsChart 的模块注释，下次 grep 清点会再次误报。另有一条评审疑问已有答案无需动作：CLAUDE.md 删掉的「批次工作流」属 seatunnel_agent 错植内容，删除在已批准 spec 范围内。

## Solution

一次小整改提交修净 4 条：删残渣花括号、qsChart 定义处注释 H=handle 约定、补 resize 节流（echarts 自带 debounce 语义不可用时用简单 timeout 节流）、模块注释登记 landing.html 例外。全部行为不变。

## User Stories

1. As a maintainer reading buildCalibOption, I want no stray brace block, so that the structure reads as it executes.
2. As a frontend developer, I want the `H` suffix convention documented at qsChart's definition, so that handle names are self-explanatory.
3. As a player resizing the window, I want chart resizes throttled, so that drag-resize doesn't thrash every chart instance per frame.
4. As the next reviewer running the echarts.init census, I want landing.html registered as the one standalone-page exception, so that AC greps stop flagging it.
5. As a maintainer, I want all four fixes in one `fix:`/`refactor:` commit with the usual verification, so that the review loop closes cleanly.

## Implementation Decisions

- 残渣花括号：仅删括号并回缩进，不动任何语句。
- H 约定：一句注释并入 qsChart 现有头注释。
- 节流：qsChart 的 window resize 监听包一层 ~150ms 的尾沿节流（timeout 覆盖式），不引库；qs:view/qs:theme 路径不节流（低频）。
- landing.html：不迁移（独立页无 app.js 是设计事实），在 qsChart 头注释的收口说明里登记为唯一例外。
- 评审其余发现（Data Clump 两 boolean、javadoc 重复、contract 无独立提交）判收不修：前两条可辩护，后一条是流程既成事实。

## Testing Decisions

- 好测试 = 外部行为：图表仍渲染、窗口缩放不报错；不为节流写单测（纯 UI 质量项，真浏览器兜底）。
- 验证走既有三道缝：node --check、ui_check.py、npm run buttons。
- Prior art：qschart 各批的验证流程。

## Acceptance Criteria

1. **残渣清除（证 Story 1）**：`grep -n "const rows = labCalibRows" frontend/lab.js` 后随行不再是裸 `{`（读 diff 确认）；`node --check frontend/lab.js` 过。
2. **约定与例外登记（证 Stories 2, 4）**：qsChart 头注释含 "H" 命名说明与 landing.html 例外行（diff 为证）。
3. **节流存在（证 Story 3）**：app.js 的 window resize 监听经由节流包装（diff 为证）；浏览器中 `npm run buttons` → 0 error。
4. **全套回归**：`python tools/ui_check.py` → 0/0；`cd tools/ui_smoke && npm run buttons` → `0 error(s)`（输出贴报告）。
5. **提交规范**：单次英文提交，无 AI 署名；`?v=` bump 改动文件。

## Out of Scope

- landing.html 图表迁入 qsChart；CLAUDE.md 任何改动；评审判收不修的三条；其余架构候选（⑤②③）。

## Further Notes

- 来源：/code-review 8d2d962 两轴报告（本对话）。整改后该轮评审闭环。
