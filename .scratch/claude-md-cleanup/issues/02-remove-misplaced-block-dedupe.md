# 02: 删除错植的 seatunnel_agent 规则块并与前文去重合并

**What to build:** CLAUDE.md 从头到尾只描述本仓真实存在的文件、命令与规则：末尾从 seatunnel_agent 仓错植来的第 1–8 节消失；与前文重复的 Git/UI/工作原则规则只保留 QuantSim 版本一份；唯一的增量规则「在可以用图形和按钮说明操作的情况下，不要添加多余的解释性文字」并入前文「设计规范（强制）」章节。AI agent 照文档执行不再碰到不存在的 `ruff`/`mypy`/`scripts/check_workflow.py`/`docs/pitfalls.md`。

**Blocked by:** 01（同一文件串行，且留存文本以 01 定稿为基线）

**Status:** done (commit 6be61fc)

- [x] 引用存在性检查无输出：`grep -oE '(docs|tools|scripts|backend|frontend|data-pipeline)/[A-Za-z0-9_./-]+' CLAUDE.md | sort -u | while read f; do [ -e "$f" ] || echo "MISSING $f"; done`
- [x] `grep -ciE "ruff|mypy|seatunnel" CLAUDE.md` 输出 `0`
- [x] `grep -c "^## 1. Git" CLAUDE.md` 输出 `0`（重复章节已删）
- [x] `grep -c "解释性文字" CLAUDE.md` 输出 `1`，且 diff 显示其位于「设计规范（强制）」内
- [x] 单独英文 `docs:` 提交，无 AI 署名；全部验收命令输出附在完成报告
