# 06: 全局提升（contract）：茶室升为 :root 主题，删作用域块

**What to build:** 茶室色板写入全局 `:root` 与 `:root[data-theme="light"]`（存量紫 accent 全面换茶褐/苔绿），顶栏/弹窗/桌宠/toast 等公共件跟随换色；删除 widgets.css 作用域皮肤块与各域重复覆盖；图表取色回归全局 COLORS。冻结区（.header-tools）只换颜色不动布局。方案已于 2026-10-24 经用户确认。

**Blocked by:** 02, 03, 04, 05

**Status:** done

- [x] 全站无紫色残留（含图表/渐变/聚焦环）
- [x] 作用域皮肤块删除，单一主题源
- [x] 冻结区桌面端仍单行横排
- [x] 全量 smoke 9 步过 + ui_check WCAG 双主题 + buttons 双 0
