# 03: Migrate B — 学院/实验室/杂项视图迁入 qsChart

**What to build:** academy.js、guessgame.js、optsandbox.js、lab.js、option.js、bubble.js、buydip.js、qdetect.js、stratbox.js、wiki.js 的图表迁入 qsChart，删各自接线；行为不变。无法归一的特殊形态走句柄逃生口并登记。

**Blocked by:** 02

**Status:** done

- [x] 本批文件内 `echarts.init` 清零（grep 证据），`qs:theme` 图表监听清零
- [x] `python tools/ui_check.py` 0/0；`node --check` 过；`?v=` bump
- [x] `npm run buttons` → 0 error
- [x] 英文 `refactor:` 提交，无 AI 署名
