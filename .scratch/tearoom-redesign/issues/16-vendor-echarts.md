# 16: echarts 本地 vendor（去 CDN 依赖）

**What to build:** echarts.min.js 自托管进前端静态资源，index.html 改引本地路径；CDN 断连不再影响图表与冒烟（今日两次假红的根因）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 页面图表从本地加载正常渲染（无 cdnjs 请求）
- [ ] smoke 9 步全绿
- [ ] ui_check 0 + buttons 0
