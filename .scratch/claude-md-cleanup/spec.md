# Spec: CLAUDE.md 陈旧规则清理（slim-down backend 后续）

Triage: `ready-for-agent`

## Problem Statement

作为在本仓工作的开发者（人类或 AI agent），我打开 CLAUDE.md 时会读到两类误导性内容：

1. 架构速览声称回测由 `BacktestTuner`（调参网格）参与组成，但该类已在 2026-10 的收拢重构中删除——照着文档找类会扑空。
2. 文件末尾第 1–8 节是从 seatunnel_agent 仓库错植过来的整块规则，引用的 `scripts/check_workflow.py`、`docs/pitfalls.md`、`docs/reports/TEMPLATE.md`、根目录 `pyproject.toml`/`src`/`tests`、ruff/mypy、`seatunnel-agent uitest` 在本仓全部不存在；其中 1–3 节还与前文 QuantSim 自己的同名章节内容重复。agent 照此执行会反复跑不存在的命令、找不存在的文件，浪费轮次并产生错误报告。

（slim-down 同轮的另一发现——`BacktestStrategy.java` 810 行超 800 行红线——用户已裁决**不拆**：该文件是刚完成的刻意深模块收拢，拆回等于撤销上一轮重构。本 spec 不包含任何代码改动。）

## Solution

把 CLAUDE.md 修正为只描述本仓真实存在的事物：

- 架构速览的回测一行改为「`BacktestService` 门面（含 tune 调参网格）+ `BacktestEngine`（模拟内核）+ `BacktestStrategy`（策略深模块）」。
- 删除末尾错植的第 4–8 节（Evidence-First 英文版 / 验证闭环 / 重复犯错记录 / 批次工作流 / 本地验证命令——本仓前文已有等价且正确的 QuantSim 版本）。
- 第 1–3 节与前文同名章节合并去重；唯一的增量内容「在可以用图形和按钮说明操作的情况下，不要添加多余的解释性文字」并入前文「设计规范（强制）」。
- 为留存规则补一行「为什么」——核对结果：留存规则均已自带，无需新增。

## User Stories

1. As an AI agent working in this repo, I want CLAUDE.md to reference only classes that exist, so that I don't waste turns searching for `BacktestTuner`.
2. As an AI agent, I want the architecture overview to name the real backtest components, so that I put new backtest logic in the right file.
3. As an AI agent, I want the verification-commands section to list only commands runnable in this repo, so that I don't fail on `ruff check src tests` or `scripts/check_workflow.py`.
4. As an AI agent, I want pitfall-lookup instructions to point at the files that exist here (`docs/bug-knowledge-base.md`, `issue_recode/`), so that evidence-first attribution actually finds evidence.
5. As a human developer, I want each rule to appear exactly once, so that I don't have to reconcile two slightly different versions of the Git commit rules.
6. As a human developer, I want the "graphics over explanatory text" UI rule preserved during dedup, so that an intentional design constraint isn't silently lost.
7. As a repo maintainer, I want the cleanup to be a docs-only commit, so that reverting it is trivial and it can't break the build.
8. As a repo maintainer, I want a re-runnable reference-existence check, so that future doc rot is caught mechanically instead of by a reader tripping over it.
9. As a reviewer, I want the commit message in English with a `docs:` prefix and no AI attribution, so that it matches repo conventions.
10. As an AI agent reading the backtest docs, I want the "split facade services" rule kept accurate about which split survived, so that I don't re-create `BacktestTuner` to match the doc.

## Implementation Decisions

- 仅修改 CLAUDE.md，一次提交完成；不触碰任何 Java/JS/Python 源码（`BacktestStrategy.java` 不拆是已记录的用户裁决）。
- 架构速览回测行的新表述以代码现状为准：tune 网格入口在 `BacktestService.tune`，策略与网格定义收拢在 `BacktestStrategy`（其文件头注释明言三文件已收拢，作为表述依据）。
- 删除范围 = 末尾自 `## 1. Git 提交规范` 起至文件结束的 8 节；合并策略 = 前文章节为准，增量条目逐条并入对应前文章节，不新开章节。
- 不引入新的 lint/CI 工具；引用存在性检查用一次性 shell/python 脚本表达（grep 文件路径 + 类名存在性），脚本本身不入库（避免给仓库加只跑一次的工具债——如维护者想常态化，另开 issue）。
- 词汇遵循仓内现有叫法：「门面」「深模块」「收拢」沿用既有注释与 CLAUDE.md 用语。

## Testing Decisions

- 好测试 = 只验外部行为：检查"CLAUDE.md 引用的每个路径/类在仓内存在"与"规则不重复"，不检查措辞风格。
- 被测对象：修订后的 CLAUDE.md 全文。
- Prior art：slim-down 调查轮已有的核对方法——对文档中出现的文件路径跑存在性检查、对类名跑 `grep -rl "class X" backend/src`，本 spec 的验收沿用同一手法。
- 文档类改动不要求跑 `mvn test`/前端体检（无代码变更面）；以 git diff 范围核对代替。

## Acceptance Criteria

1. **引用存在性（证 Stories 1–4, 8）**：对修订后 CLAUDE.md 提取的所有仓内路径与类名跑存在性检查，期望输出尾部 `MISSING: 0`。具体可复跑命令（评审者可直接执行）：
   `grep -oE '(docs|tools|scripts|backend|frontend|data-pipeline)/[A-Za-z0-9_./-]+' CLAUDE.md | sort -u | while read f; do [ -e "$f" ] || echo "MISSING $f"; done` → 期望无输出；
   `grep -c "BacktestTuner" CLAUDE.md` → 期望 `0`。
2. **去重完成（证 Story 5）**：`grep -c "^## 1. Git" CLAUDE.md` → `0`；`grep -c "本地验证命令" CLAUDE.md` → `0`；全文不再出现 `ruff`、`mypy`、`seatunnel`（`grep -ciE "ruff|mypy|seatunnel" CLAUDE.md` → `0`）。
3. **增量规则保留（证 Story 6）**：`grep -c "解释性文字" CLAUDE.md` → `1`，且位于「设计规范（强制）」章节内（人工读 diff 确认位置，diff 行号为证据）。
4. **改动面（证 Story 7）**：`git diff --stat HEAD~1` 仅含 `CLAUDE.md`（及本 spec 文件）。
5. **提交规范（证 Story 9）**：`git log -1 --format=%B` 显示英文 `docs:` 开头、无 Co-authored-by/AI 署名。
6. **架构行准确（证 Stories 2, 10）**：修订后的回测一行逐词与代码核对——`ls backend/src/main/java/com/quantsim/service/ | grep Backtest` 列出且仅列出 `BacktestEngine/BacktestService/BacktestStrategy` 三文件，与文档命名一致。

全部标准以命令输出原文为证据附在完成报告里；任何一条未跑 = 任务未完成。

## Out of Scope

- `BacktestStrategy.java` 的任何拆分或代码改动（用户裁决：不拆）。
- 把引用存在性检查常态化为 CI/hook。
- CLAUDE.md 前文（QuantSim 本体规则）的措辞润色或规则增删——本次只修"失效引用 + 错植重复"。
- seatunnel_agent 仓自己的 CLAUDE.md。

## Further Notes

- 错植块的来源推测是跨仓复制粘贴（内容与 seatunnel_agent 的工作流完全吻合），删除前若维护者想留档，可整块移回该仓而非留在本仓。
- 本 spec 由 slim-down 只读调查轮的证据直接生成；调查命令与输出见该轮对话记录（未用 repository 方法 0、未用 import 0、孤儿类 0，均为 Spring 装配误报）。
