# 01: DESIGN.md 重写为茶室皮肤

**What to build:** 根目录 DESIGN.md 当前描述的还是旧 indigo/iOS 主题，与 theme.css（雨声茶室，2026-10-25 单属主化）脱节；照它做新页面会用错色。把它重写为与 theme.css 一致的规范：两主题变量表（暖褐夜茶室/暖纸亮茶室）、--tr-* 材质与三字体支柱、涨跌茶红/苔绿语义、禁紫等机械化禁令指引，使 impeccable/评审加载到的视觉权威与实现一致。

**Blocked by:** None (can start immediately)

**Status:** done (1bdd0d0 + 49e6e13 + 23125d0; check_design.py MISS: none)

- [ ] DESIGN.md 色值表与 theme.css `:root` / `:root[data-theme="light"]` 当前值逐项一致（抽查对拍）
- [ ] 字体/圆角/阴影/动效 token 与 theme.css 实际定义一致，不再出现 systemIndigo/紫色主色叙述
- [ ] 保留"新页面 checklist"结构；文中规则与 ui_check E10–E14 机械化禁令互相指认
