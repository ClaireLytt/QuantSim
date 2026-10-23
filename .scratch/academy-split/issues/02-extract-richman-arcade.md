# 02: 拆出富豪场

**What to build:** 富豪场（交易所·短线预判）从 academy.js 搬进独立文件并在 index.html 挂载（含 ?v= bump）；玩家进入富豪场、下注、结算的体验与拆分前完全一致。逐行搬移 + 最小 glue（绑定随模块走、启动路径 typeof 兜底），文件头中文注明来源与依赖。

**Blocked by:** 01（切割线以普查定稿为准）

**Status:** done

- [x] `node --check` 新文件与 academy.js 均通过
- [x] `python tools/ui_check.py` → `0 error(s), 0 warning(s)`
- [x] browse.mjs 进富豪场完成一次下注，`--assert-no-console-error` 通过（--json 输出贴报告）
- [x] 单独英文 `refactor:` 提交，无 AI 署名；glue 改动在提交信息或报告中逐条列明
