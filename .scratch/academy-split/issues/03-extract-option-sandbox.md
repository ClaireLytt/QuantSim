# 03: 拆出期权沙盒

**What to build:** 期权入门沙盒（BS 定价 + 到期损益曲线）从 academy.js 搬进独立文件并挂载（?v= bump）；调参、曲线渲染体验不变。形态与 02 相同。

**Blocked by:** 02（同文件串行避免冲突）

**Status:** done

- [x] `node --check` 新文件与 academy.js 均通过
- [x] `python tools/ui_check.py` → `0 error(s), 0 warning(s)`
- [x] browse.mjs 进期权沙盒完成一次调参并断言曲线区域更新，`--assert-no-console-error` 通过
- [x] 单独英文 `refactor:` 提交，无 AI 署名；glue 逐条列明
