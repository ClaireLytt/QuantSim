# 04: 拆出猜涨跌引擎 + 收尾验证

**What to build:** K线猜涨跌（含其行情引擎）从 academy.js 搬进独立文件并挂载（?v= bump），答题/积分/XP 联动体验不变（XP 回调依普查笔记处理跨界）。随后做整个 spec 的收尾验证与完成报告。

**Blocked by:** 03

**Status:** done

- [x] `node --check` 全部涉及文件通过；`python tools/ui_check.py` → `0 error(s), 0 warning(s)`
- [x] 后端起着时 `cd tools/ui_smoke && npm run buttons` → `0 error(s)`（输出贴报告）
- [x] browse.mjs 猜涨跌答一题，`--assert-no-console-error` 通过
- [ ] **未达标**：`wc -l frontend/academy.js` = 1695（> 1600）。2229 → 1695，拆出 534 行；spec 的 ~700 行是估算偏差（三块实际行数 335+124+61 + glue），三块玩法已全部拆净，学院本体（关卡引擎/剧情/成就）无可再拆的搭车内容。如需继续压行数是新的拆分决策，待裁决。
- [x] 完成报告含 move-only 对照表（搬移块 → 新文件）与全部 glue 清单
- [x] 单独英文 `refactor:` 提交，无 AI 署名
