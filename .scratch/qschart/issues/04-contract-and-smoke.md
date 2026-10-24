# 04: Contract — 清残留 + 全站冒烟收尾

**What to build:** 全站 `echarts.init` 仅剩 qsChart 模块内 1 处（+登记的逃生口）；视图文件图表类 `qs:theme`/resize 手工监听清零；GLOSSARY.md 增「图表生命周期」行；app.js 共享工具区注释更新；完成报告（前后计量对比 25→1、监听 17→0）。

**Blocked by:** 03

**Status:** done

- [x] `grep -c "echarts.init" frontend/*.js` 仅 app.js:1（或 +登记逃生口，逐条列明）
- [x] `npm run smoke` 8 步全过（输出贴报告，含主题切换与双宽度）
- [x] GLOSSARY.md + 工具区注释更新
- [x] 英文提交，无 AI 署名
