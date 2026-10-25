# 03: 资产曲线跨局 x 轴呈现优化

**What to build:** 各对局玩的是不同历史窗口，直接把局内历史日期排上 x 轴会非单调且重复（两个 09-17）。改为"第 N 个交易日"序号轴；tooltip 展示该点的局内真实日期；最大回撤 markArea 继续可用。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] x 轴标签为交易日序号（含"起点"），不再出现乱序历史日期
- [ ] tooltip 含局内真实日期；双语文案走 t()
- [ ] 回撤 markArea 仍正确标注；前后截图对比
- [ ] ui_check 0 error、buttons 体检 0 error
