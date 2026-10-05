# QuantSim 设计规范

本文档从 `frontend/style.css`（现行实现）提炼，是全站视觉的唯一事实来源。
**做任何新页面/新组件前先通读本文档；所有色值必须引用 CSS 变量，禁止硬编码。**
双主题：暗色为默认，亮色通过 `<html data-theme="light">` 切换（偏好存 `localStorage.qs_theme`，
`app.js` 启动时先应用主题再初始化图表）。新增颜色必须同时在 `:root` 与
`:root[data-theme="light"]` 两处定义。JS 里取色统一用 `cssVar("--xxx")`。

---

## 1. 配色

### 1.1 中性色（背景 / 面板 / 边框 / 文字）

| 变量 | 用途 | 暗色（默认） | 亮色 |
|---|---|---|---|
| `--surface` | 页面底色 | `#000000`（iOS 深色基底） | `#f2f2f7`（systemGroupedBackground） |
| `--surface-2` | 输入框底、表头底、嵌入块底 | `#161618` | `#e9e9ee` |
| `--panel` | 卡片 / 表格 / 图表容器底 | `#1c1c1e` | `#ffffff` |
| `--panel-raised` | 普通按钮底、toast 底 | `#2c2c2e` | `#eaeaef` |
| `--border` | 常规边框、分隔线 | `#38383a` | `#d9d9de` |
| `--border-strong` | 强调边框、hover 边框 | `#48484a` | `#aeaeb5` |
| `--text` | 正文 | `#f5f5f7` | `#1d1d1f` |
| `--text-muted` | 次要文字 / 标签 / 提示 | `#a1a1aa` | `#6e6e73` |
| `--header-bg` | 吸顶头部（半透明 + 材质 blur） | `rgba(10,10,12,.65)` | `rgba(249,249,251,.72)` |
| `--mask` | 弹窗遮罩 | `rgba(0,0,0,.55)` | `rgba(0,0,0,.32)` |
| `--sheen` | 卡片顶部受光白纱 | `rgba(255,255,255,.045)` | `rgba(255,255,255,.6)` |

> 中性色对齐 Apple (iOS/macOS) 系统分层灰。注意 ui_check 的 WCAG 校验紧边距：
> 亮色 `text-muted/surface` 4.55、暗色 `accent/surface` 4.15、亮色 `down/panel` 4.40——
> 微调这些色值前必须重新验算。

页面底色不是纯色：`body` 在 `--surface` 上叠两个极淡的 radial-gradient 光晕
（`--glow-1` 紫、`--glow-2` 青，透明度 4%~7%），`background-attachment: fixed`。

### 1.2 主色与辅助色

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--accent` | 主色：激活态、链接、选中、聚焦 | `#5e5ce6`（systemIndigo 暗） | `#5856d6`（systemIndigo 亮） |
| `--accent-strong` | 主色深阶：primary 按钮渐变末端 | `#4a48d4` | `#4a48c4` |
| `--accent-2` | 辅助青色：渐变收尾、装饰条 | `#64d2ff`（systemCyan） | `#008577` |
| `--accent-soft` | 柔紫：次级点缀 | `#7d7aff` | `#6a63e0` |
| `--on-accent` | 主色上的文字 | `#ffffff` | 同 |
| `--warn` | 警示黄 | `#ffd60a`（systemYellow） | `#9a6a00` |
| `--h1-grad-a` / `--h1-grad-b` | h1 渐变首尾色 | `#9d9bff` / `#64d2ff` | `#4a48c4` / `#008577` |
| `--glow-accent` | primary 按钮光晕 | `rgba(94,92,230,.35)` | `rgba(88,86,214,.25)` |

主色取 Apple systemIndigo：正宗 iOS 系统色，同时延续 QuantSim 紫色品牌。
品牌感渐变（标题 h1、区块装饰条、置信度条）统一方向 120°~180°，
从 `--h1-grad-a`/`--accent` 过渡到 `--accent-2`/`--h1-grad-b`。

### 1.3 语义色（金融语境，**涨红跌绿** 中式惯例）

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--up` | 上涨 / 正收益 / 买入按钮 | `#ff453a`（systemRed 暗） | `#d70015` |
| `--down` | 下跌 / 负收益 / 卖出按钮 | `#30d158`（systemGreen 暗） | `#248a3d`（调深版） |
| `--good` | 成功 / 通关 / 正向状态 | `#4cd964` | `#1e7a3c` |
| `--bad` | 错误 / 危险操作 | `#ff6961` | `#d4403a` |
| `--ma5` | MA5 均线（图表） | `#ff9f0a`（systemOrange） | `#b25a00` |
| `--ma20` | MA20 均线（图表） | `#7d7aff`（紫） | `#5856d6` |

亮色 `--down` 不用 iOS 原版 `#34c759`：它在白色面板上只有 2.2:1，过不了 3:1 对比度校验，
所以调深为 `#248a3d`（4.40:1）。

涨跌数字用 class `.pos`（→ `--up`）/`.neg`（→ `--down`）。
注意 `--up/--down` 只表达涨跌方向，状态性的对/错用 `--good/--bad`，别混用。
半透明的语义底色用 `color-mix(in srgb, var(--good) 10%, transparent)` 这种写法，不要另造 rgba 常量。

---

## 2. 字体

字体栈（全局唯一，系统字体优先——macOS/iOS 下自动命中 SF Pro）：
```css
font: 14px/1.6 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
      "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
-webkit-font-smoothing: antialiased;
```
等宽场景（房间码等）用 `monospace`。**所有数字列 / 金额 / 百分比必须加
`font-variant-numeric: tabular-nums`**，避免跳动。

| 层级 | 字号 | 字重 | 行高 | 用法 |
|---|---|---|---|---|
| 页面主标题 h1 | 21px | 默认 | 默认 | 仅站名，渐变文字 + `-.3px` 负字距（大字收紧） |
| 区块标题 h2 | 15px | 默认(600 视觉) | 默认 | `-.1px` 字距；前置 4×16px 渐变装饰条（竖条圆角 2px） |
| 卡片内小标题 h3 | 13–15px | 600 | 默认 | 弹窗内 h3 为 14px 且用 `--accent` 色 |
| 正文 | 14px | 400 | 1.6 | body 默认 |
| 次要说明 `.sub` | 13px | 400 | 1.6 | `--text-muted` |
| 提示 `.hint` / 脚注 | 12px | 400 | 1.5 | `--text-muted` |
| 表头 th | 13px | 500 | — | `--text-muted` |
| 参数/代码细节 `.param-cell` | 12px | 400 | — | `--text-muted` |
| 强调数值（结算收益率） | 18px | 700 | — | 配 `.pos/.neg` 色 |
| 徽章 `.level-badge` | 11px | 400 | — | 胶囊形 |
| 大按钮 `.big` / 导航一级 | 15px | 600–700(激活) | — | |

规则：字号只从 {11, 12, 13, 14, 15, 18, 20, 21} 里选；加粗只用 500 / 600 / 700 三档。
长文本块（AI 顾问回复）行高放宽到 1.75。

---

## 3. 间距

间距基于 2px 网格，常用刻度：**4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24**。

| 场景 | 值 |
|---|---|
| 页面左右留白 | `body padding: 0 20px`（≤720px 时 12px） |
| 头部 | `padding: 14px 20px`，吸顶 `position: sticky` |
| 主内容区 | `main` flex 布局，`gap: 16px; padding: 18px 0` |
| 卡片内边距 | `16px`（大引导卡 `32px 28px`，首页卡 `18px 16px`） |
| 卡片网格间距 | `gap: 14px` |
| 面板区块上下 | `padding: 20px 0` |
| 输入框 | `padding: 7px 12px` |
| 按钮 | `padding: 7px 16px`（小按钮 `4px 12px`，大按钮 `11px`） |
| 表格单元格 | `padding: 9px 14px`（紧凑对比表 `6px 10px`） |
| 弹窗头 / 体 | `15px 20px` / `16px 20px` |
| 表单标签与控件的行间距 | `margin-bottom: 10px` |
| 卡片内 dl 键值对 | `gap: 6px 12px`，值右对齐 |

布局模式：外层 flex + `flex-wrap`，主图表区 `flex: 1 1 600px`，侧栏
`flex: 0 1 290px; min-width: 260px`；卡片集合用
`grid-template-columns: repeat(auto-fit|auto-fill, minmax(220~230px, 1fr))`。
唯一断点 **720px**：侧栏转全宽、图表降高、页边距收窄。新页面必须在 720px 下可用。

---

## 4. 组件样式

### 4.1 圆角体系

| 半径 | 用途 |
|---|---|
| `--radius-lg`（20px） | 弹窗（比卡片略大） |
| `--radius`（16px） | 卡片、表格、图表容器、tour 弹泡等大容器 |
| `--radius-sm`（10px） | 输入框、按钮、下拉、toast、嵌入文本块 |
| 4–5px | 细小条状元素（进度条、置信度条） |
| 999px | 徽章 / 胶囊标签 / 右上角工具簇按钮 |
| 50% | 圆点（预测命中点阵等） |

圆角一律引用这三枚 token，别写裸像素值；大容器若视觉过圆可降级用 `--radius-sm`。

### 4.2 阴影体系（暗色值；亮色主题下 `--shadow` 自动换成暖灰弱阴影）

| 层级 | 值 |
|---|---|
| 常规卡片 `--shadow` | 双层软阴影 `0 1px 3px .3 + 0 4px 14px .22`（亮色更弱） |
| 大抬升 `--shadow-lg` | `0 8px 20px + 0 24px 60px`，用于卡片 hover、toast、弹窗、tour 弹泡 |
| primary 按钮光晕 | `0 2px 10px var(--glow-accent)`，hover `0 4px 16px` |

**材质（毛玻璃）**：`--blur-material: blur(20px) saturate(1.8)`。
吸顶头部、toast、弹窗遮罩统一用它做 `backdrop-filter`（带 `-webkit-` 前缀）；
半透明底色配方：header 用 `--header-bg`，toast 用
`color-mix(in srgb, var(--panel-raised) 86%, transparent)`。
卡片顶部受光：背景叠 `linear-gradient(180deg, var(--sheen), transparent 45%)` +
`inset 0 1px 0 var(--sheen)` 顶边高光。浅色半透明面不要叠浅色半透明面。

### 4.3 按钮

基础态：`background: var(--panel-raised)`，1px `--border` 边框，圆角 `--radius-sm`。
- hover：`border-color: var(--border-strong)` + `filter: brightness(1.12)`
- active：`transform: scale(.97)`（按压缩放，transition 驱动、可中断，reduced-motion 下取消）
- focus-visible：**无 outline**，用 `box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)`
- disabled：`opacity: .4; cursor: not-allowed`
- 过渡统一：`transition: ... .18s ease`（transform `.18s var(--ease-out)`）

变体：
| class | 样式 |
|---|---|
| `.primary` | `linear-gradient(135deg, var(--accent), var(--accent-strong))`，文字 `--on-accent`，600 字重，带光晕 |
| `.ghost` | 透明底、muted 文字；hover 转 `--accent` 边框 |
| `.replay` | `--surface-2` 底 + 强边框，介于 ghost 和 primary 之间 |
| `.buy` / `.sell` | iOS tinted：`color-mix` 16% 语义色浅底 + 35% 边框 + 语义色文字 600；hover 底加深到 26% |
| `.big` | 全宽 + 11px 垂直内边距 + 15px 字号 |
| `.small` | `4px 12px`、12px 字号 |

### 4.4 卡片 `.card`

```css
background: linear-gradient(180deg, var(--sheen), transparent 45%), var(--panel);
border: 1px solid var(--border);
border-radius: var(--radius);   /* 16px */
padding: 16px;
box-shadow: var(--shadow), inset 0 1px 0 var(--sheen);
```
顶部 `--sheen` 渐变 + 顶边 inset 高光是统一「受光材质」质感，别省。可交互卡片 hover：上浮 3px + 强边框 + 深阴影，
transition .15–.18s。状态卡片用语义色的 `color-mix` 半透明边框（如通关卡 `--good` 45%）。

### 4.5 导航（两级 tab，下划线式，无底色）

- 一级 `.nav-group`：透明底、无边框，`padding: 6px 16px 8px`，15px，muted 色；
  激活态：文字与 2px 底边框同用 `--accent`，字重 700。
- 二级 `.nav-tab`：同构，14px，`padding: 6px 14px 10px`，激活字重 600，整排左缩进 10px。
- hover 只变文字色为 `--text`，不加背景。
- 头部容器：半透明 `--header-bg` + `backdrop-filter: var(--blur-material)` + 70% 透明度发丝底边框，sticky 吸顶。

### 4.6 表格

容器化表格：`border-collapse: separate`、1px `--border` 外框、圆角 `--radius`、
`overflow: hidden`、`--shadow`。表头 `--surface-2` 底 + muted 13px/500。
行分隔 1px `--border`（末行去掉）。行 hover：`color-mix(in srgb, var(--accent) 5%, transparent)`。
最后一列右对齐 + tabular-nums（通常是数值列）。空态用单行 `.empty-row`（muted），文案走 `t()`。

### 4.7 弹窗与 toast

- 遮罩 `.modal-mask`：`--mask` + `backdrop-filter: var(--blur-material)`，flex 居中，
  24px 安全边距，`mask-in .25s` 淡入。
- 弹窗 `.modal`：640px 宽（`max-width: 100%`）、`max-height: 85vh`、圆角 `--radius-lg`、强边框、
  `--shadow-lg`，进场 `modal-in .4s var(--ease-sheet)`（上移 16px + 缩放 .96 淡入，Apple sheet 曲线）。
  头部标题 + 右上无边框 close。
- toast `#toast`：固定底部居中（bottom 40px），`panel-raised` 86% 半透明 + 材质 blur + 强边框 +
  **3px `--accent` 左边框**（信息条签名式样），进场 `toast-in .4s var(--ease-bounce)`（轻微回弹）。
- AI 文本块（顾问/复盘）同样用 3px `--accent` 左边框 + `--surface-2` 底 + 8px 圆角。

### 4.8 表单控件

输入框/下拉：`--surface-2` 底、1px `--border`、圆角 8px、`padding: 7px 12px(10px)`；
placeholder 用 muted 70% 透明度；focus-visible 同按钮（accent 边框 + 18% 光环）。
表单 label：flex 两端对齐，muted 色，13px。

### 4.9 图表（ECharts）

所有图表颜色**必须**从 CSS 变量读取（`app.js` 的 `cssVar()` → `COLORS`），
主题切换后调用图表重建/重设色。K 线涨跌用 `--up/--down`，均线用 `--ma5/--ma20`，
文字/轴线用 `--text/--text-muted/--border`，浮层底 `--panel-raised`。
图表容器：`--panel` 底 + 1px 边框 + 12px 圆角 + `--shadow`，默认高 480px（≤720px 降为 360px）。

---

## 5. 动效与可访问性

- 过渡时长统一 **.15s–.22s**；进场动画 .25–.4s；位移幅度小（1–3px、16px 以内），不做花哨动画。
- 缓动曲线只用三枚 token：`--ease-out`（交互反馈 `cubic-bezier(.25,1,.5,1)`）、
  `--ease-sheet`（弹窗进场，Apple sheet 曲线 `cubic-bezier(.32,.72,0,1)`）、
  `--ease-bounce`（toast 轻回弹 `cubic-bezier(.34,1.3,.64,1)`）。
- 按压反馈统一 `scale(.97)`（卡片 `.98`），走 transition 而非 keyframes——可随时被新输入中断。
- 所有装饰性动画必须写进 `@media (prefers-reduced-motion: reduce)` 的豁免清单
  （关 animation，纯装饰元素直接 `display: none`）；功能性进场（modal/toast）在该媒体查询下
  折叠为 `.01s` 瞬时，按压缩放取消 transform。
- focus 可见性：全站统一 accent 光环（见 4.3），禁止裸 `outline: none`。
- `[hidden] { display: none !important; }` 已全局兜底——显隐一律用 `hidden` 属性，别手写 display 切换。
- 文案零硬编码：全部经 `i18n.js` 的 `t()`，中英双份同时提交。
- 用户可控内容（用户名、参数串等）只能 `textContent` 赋值，禁止插进 `innerHTML` 模板。

## 6. 新页面 checklist

1. 读完本文档；色值全部用变量，两个主题下各看一遍。
2. 字号/间距/圆角只用本文档刻度表里的值。
3. 720px 宽度下布局不塌。
4. 表格含空态行；数字列 tabular-nums 右对齐。
5. 动画进 reduced-motion 豁免；focus 光环可见。
6. 文案走 `t()` 双语；`index.html` 的 script 版本号 `?v=` 已更新。
