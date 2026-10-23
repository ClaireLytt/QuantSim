# 01: Expand — qsModal 模块落地 + app.js 5 处迁移

**What to build:** app.js 共享工具区新增 `qsModal(modalId, opts)`（open 含音效/close/背板点击内化；closeBtnId 代绑、onOpen/onClose 回调、escape 默认关）。app.js 自家 5 处背板三件套迁入；tour-mask 等"点击≠关闭"的特殊形态不迁并在模块注释登记。行为逐字不变。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] app.js 内 `e.target === $(` 背板 handler 清零或登记例外
- [x] `node --check` 过；`ui_check.py` 0/0；`?v=` bump
- [x] `npm run buttons` → 0 error
- [x] 英文 `refactor:` 提交，无 AI 署名
