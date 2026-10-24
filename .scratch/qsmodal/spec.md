# Spec: qsModal 弹窗接线深模块（expand–contract 收口）

Triage: `ready-for-agent`

## Problem Statement

每个弹窗都手搓同一套三件套：开（`hidden=false`+音效）、关按钮、背板点击（`e.target === $(...)` 判定）——19 处背板 handler 散在 9 个文件，26 个 modal id。新增弹窗要重打三遍字，漏一个监听就是"点背板关不掉"这类只有真浏览器巡检才兜得住的 bug（ui_check 的死按钮规则存在的一半原因就是这类手工接线）。

## Solution

深模块 `qsModal(modalId, opts)`：内化 open（含音效）/close/背板点击；`opts` 支持 `closeBtnId`（代绑关按钮）、`onOpen`/`onClose` 回调、`escape: true`（可选 Esc 关闭，**默认关**——登录/新手引导类流程弹窗不可被 Esc 中断，行为不变优先）。返回 `{ open, close, el }`。expand（模块 + app.js 自家 5 处迁移）→ migrate（其余 8 文件 14 处）→ contract（grep 清零 + 全站 smoke）。

## User Stories

1. As a frontend developer, I want modal wiring to be one call, so that a new modal costs one line instead of three listeners.
2. As a player, I want every modal to open/close exactly as today (sound, backdrop, close button), so that the refactor is invisible.
3. As a maintainer, I want the backdrop-click idiom defined once, so that "点背板关不掉"这类遗漏 bug 没有出生点。
4. As a developer with a flow modal (login, tour), I want escape-close to be opt-in, so that uniform helpers don't break flow assumptions.
5. As a reviewer, I want migration in green batches with grep evidence, so that完成度可机械核对。
6. As a future reader, I want qsModal registered in GLOSSARY and the shared-tools comment, so that nobody hand-wires modal #27.

## Implementation Decisions

- 模块放 app.js 共享工具区（qsChart 旁），命名同约定（句柄 `xxxM`? 不强制——弹窗多为即用即弃，直接 `const m = qsModal(...)`）。
- open 内化现有音效调用口径（与当前 openX 函数一致的 playSound）；没有音效的弹窗（若有）经 opts 关闭以保持逐字行为。
- 特殊关逻辑（如 advisor 重置、图表 dispose）走 `onClose` 回调；打开时渲染走 `onOpen` 或调用方在 open 后自行渲染（保持现有顺序）。
- 无法归一的特殊形态（tour-mask 点击=下一步而非关闭）不迁，登记在模块注释。
- 每批 bump `?v=`；行为逐字不变（Esc 默认不启用）。

## Testing Decisions

- 真浏览器外部行为：每批 `npm run buttons`；contract 批 `npm run smoke`（其中「玩法说明弹窗开关」步直接覆盖弹窗三件套）。
- 静态：`ui_check.py` + `node --check`。
- Prior art：qschart 四批（19fd64a..0f32764）的流程与证据形态。

## Acceptance Criteria

1. **Expand**：qsModal 落地，app.js 5 处背板 handler 清零（grep），buttons 0 error。
2. **Migrate**：其余文件背板 handler 清零或登记例外；`grep -rn "e.target === \\$(" frontend/*.js` 仅剩登记过的例外（逐条列明）；buttons 0 error。
3. **Contract**：`npm run smoke` 全步通过（输出贴报告）；GLOSSARY 增「弹窗接线」行。
4. **提交规范**：每批英文提交，无 AI 署名，`?v=` bump。

## Out of Scope

- Esc 默认启用、动画、focus-trap 等任何 UX 改动；candidates ②③；原生 confirm() 流程。

## Further Notes

- 来源：架构评审候选⑤。计量（2026-10-25 grep）：26 modal id，19 处背板 handler / 9 文件。
- tour-mask（点击=下一步）与 auth 弹窗的流程语义是已知特殊形态，迁移时先核对再决定登记例外。
