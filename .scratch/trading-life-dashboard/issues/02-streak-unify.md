# 02: 双 streak 口径合并

**What to build:** 首页同时存在两个"连续天数"：今日任务卡的"连续上线"读 localStorage（换设备归 1），生活条的"连续学习"读服务端 signInStreak。登录用户看到两个不同数字。改为：登录态下任务卡也读服务端 signInStreak（/me/points 已带该字段），游客保留 localStorage 降级；两处数字同源一致。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 登录用户任务卡与生活条 streak 数字一致（同一账号截图证据）
- [ ] 游客任务卡仍显示本地 streak，不请求受保护接口
- [ ] ui_check 0 error、buttons 体检 0 error
