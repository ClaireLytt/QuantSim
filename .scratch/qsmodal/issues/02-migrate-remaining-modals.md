# 02: Migrate — 其余 8 文件 14 处弹窗迁入 qsModal

**What to build:** pet.js(3)、academy.js(3)、reborn.js(2)、lab.js(2)、replay.js(1)、relics.js(1)、points.js(1)、auth.js(1) 的背板三件套迁入 qsModal；特殊关逻辑走 onClose；流程语义冲突的登记例外。行为逐字不变。

**Blocked by:** 01

**Status:** done

- [x] `grep -rn "e.target === \$(" frontend/*.js` 仅剩登记例外（逐条列明）
- [x] 全部改动文件 `node --check` 过；`ui_check.py` 0/0；`?v=` bump
- [x] `npm run buttons` → 0 error
- [x] 英文 `refactor:` 提交，无 AI 署名
