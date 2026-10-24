# 25: 全站残余 emoji 功能图标清剿 + 机械检查

**What to build:** ticket 19 只覆盖首页/开局——全仓扫按钮上的残余 emoji（已知 lab 小游戏群），清为纯文字或单色 SVG；并给 ui_check 加「按钮文案禁 emoji」机械检查（E10），把设计禁令从评审判断升级为 lint。装饰性 emoji（桌宠/向导狐/文案内容）不在禁令内。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 全仓按钮无 emoji 功能图标（E10 扫描 0 error 为证）
- [x] ui_check 新增 E10 且对既有装饰 emoji 零误报
- [x] ci_local + buttons + smoke 全绿
