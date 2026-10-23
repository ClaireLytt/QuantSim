# 01: pandas/Spark 指标对拍单测

**What to build:** 管道开发者跑 `cd data-pipeline && python -m pytest` 时，有一个对拍用例把常规管道（Spark）与场景采集（pandas）的指标口径锁死：同一份 ≥25 天的确定性合成行情（含一行 prev_close=0），两侧的 pct_change/ma5/ma20/volatility 逐行相等——窗口不满的 NULL 位置、round 位数（MA 2 位 / pct·波动率 4 位）、除零保护全部在断言面里。任何一侧口径被单独改动，测试立即红。两份实现本体零改动。

**Blocked by:** None (can start immediately)

**Status:** done (commit b167e8f)

- [x] `cd data-pipeline && python -m pytest -q` 尾部 `N passed`，无 failed；Spark 不可用时新用例 skipped 且 reason 可读
- [x] 红绿演示：临时改坏 pandas 侧一个 round 位数 → 对拍用例 FAILED（贴输出）；还原 → passed（贴输出）
- [x] 断言覆盖 NULL 边界（ma5 前 4 行 / ma20 前 19 行为 None）与 prev_close=0 行 pct_change 两侧均 None（源码行号为证）
- [x] `git diff --stat` 仅含新增测试文件；两份实现文件零改动
- [x] 英文 `test:` 提交，无 AI 署名；测试 docstring 用中文写明"为什么两份实现并存且必须一致"
