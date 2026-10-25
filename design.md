# QuantSim 设计规范

本文档从 `frontend/theme.css`（皮肤单属主，2026-10-25 起）提炼，是全站视觉的唯一事实来源；布局框架在 style.css。
**做任何新页面/新组件前先通读本文档；所有色值必须引用 CSS 变量，禁止硬编码。**
全站主题 = **「雨声茶室」**：亮色 = 茶室（暖纸/墨/茶），暗色 = 深夜雨屋（暖深褐底 + 茶色灯晕点睛）。
暗色为默认，亮色通过 `<html data-theme="light">` 切换（偏好存 `localStorage.qs_theme`，
`app.js` 启动时先应用主题再初始化图表）。新增颜色必须同时在 `:root` 与
`:root[data-theme="light"]` 两处定义。JS 里取色统一用 `cssVar("--xxx")`。

---

## 1. 配色

### 1.1 中性色（背景 / 面板 / 边框 / 文字）

全部为低饱和暖色相（hue 30~40 的褐/纸色系），**没有纯灰、没有纯黑白**。

| 变量 | 用途 | 暗色（默认） | 亮色 |
|---|---|---|---|
| `--surface` | 页面底色 | `hsl(30,12%,9%)` 暖深褐 | `hsl(38,14%,91%)` 米白纸 |
| `--surface-2` | 输入框底、表头底、嵌入块底 | `hsl(30,12%,11%)` | `hsl(40,20%,94%)` |
| `--panel` | 卡片 / 表格 / 图表容器底 | `hsl(30,12%,11%)`（与 surface-2 并层，嵌入块靠边框区分） | `hsl(40,20%,94%)` |
| `--panel-raised` | 普通按钮底、toast 底 | `hsl(30,10%,16%)`（暗房里按钮需一级抬升可供性） | `hsl(38,14%,91%)`（并入纸底） |
| `--border` | 常规边框、分隔线 | `hsl(30,8%,26%)` | `hsl(36,10%,78%)` |
| `--border-strong` | 强调边框、hover 边框 | `hsl(30,8%,36%)` | `hsl(35,10%,62%)` |
| `--text` | 正文 | `hsl(35,12%,86%)` | `hsl(30,10%,26%)` 墨 |
| `--text-muted` | 次要文字 / 标签 / 提示 | `hsl(33,8%,63%)` | `hsl(33,9%,42%)` |
| `--header-bg` | 吸顶头部（半透明 + 材质 blur） | `rgba(18,15,12,.65)` | `rgba(246,243,236,.72)` |
| `--mask` | 弹窗遮罩 | `rgba(0,0,0,.55)` | `rgba(0,0,0,.32)` |
| `--sheen` | 卡片顶部受光白纱 | `rgba(255,255,255,.03)` | `rgba(255,255,255,.6)` |

> 底色两级原则（ticket 20）：每个主题只保留"底 + 卡面"两个可辨层级，
> 其余层级差异交给 1px 边框——别再造第三级灰阶。
> 微调色值前必须重新验算 ui_check 的 WCAG 对比度紧边距。

### 1.2 主色与辅助色（茶色系；**紫色全面禁用**，E12 机械拦截）

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--accent` | 主色：激活态、链接、选中、聚焦 | `hsl(28,45%,66%)` 茶色灯晕 | `hsl(22,38%,40%)` 茶褐 |
| `--accent-strong` | 主色深阶：primary 按钮底（亮色） | `hsl(28,40%,55%)` | `hsl(22,42%,32%)` |
| `--accent-2` | 渐变收尾、装饰条（茶室下与主色同值） | `hsl(28,45%,66%)` | `hsl(22,38%,40%)` |
| `--accent-soft` | 次级点缀 | `hsl(28,35%,58%)` | `hsl(22,32%,48%)` |
| `--on-accent` | 主色上的文字（暗色 = 墨字） | `hsl(30,15%,10%)` | `hsl(40,20%,95%)` |
| `--warn` | 警示黄 | `#ffd60a` | `#9a6a00` |
| `--h1-grad-a` / `--h1-grad-b` | h1 渐变首尾 | 茶 `hsl(28,45%,66%)` / 金 `hsl(45,35%,60%)` | 茶褐 / 苔绿 |
| `--glow-accent` | primary 按钮光晕 | `hsla(28,45%,60%,.24)` | `hsla(22,38%,44%,.2)` |
| `--pet-warm` / `--pet-warm-deep` | 宠物专属暖色（用户钦定独立于主题，E14 拦截灰/冷化） | `#d98a52` / `#b5602f` | `#c06a35` / `#9c4f1f` |
| `--lab-blue` | 研究所/小游戏页点缀（禁紫后并入茶色系，名字是历史遗留） | `hsl(28,45%,66%)` | `hsl(22,38%,40%)` |
| `--lab-card` / `--lab-line` / `--lab-glow` | 实验卡底/描边/hover 光 | 跟随 panel/border/茶色 | 同 |

primary 按钮不是全局渐变：茶室内（`.tearoom button.primary`）亮色 = 茶褐实心 + 纸字，
暗色 = 茶色灯晕底 + 墨字（ticket 10/11）。

### 1.3 语义色（金融语境，**涨红跌绿** 中式惯例；茶室版 = 茶红/苔绿）

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--up` | 上涨 / 正收益 / 买入 | `hsl(18,62%,64%)` 茶红 | `hsl(14,55%,40%)` |
| `--down` | 下跌 / 负收益 / 卖出 | `hsl(150,26%,60%)` 苔绿 | `hsl(150,20%,31%)` |
| `--good` | 成功 / 通关 / 正向状态 | 同 `--down` 苔绿 | 同 |
| `--bad` | 错误 / 危险操作 | `hsl(14,60%,62%)` | 同 `--up` 茶红 |
| `--ma5` / `--ma20` | 均线（图表） | 茶橙 `hsl(28,50%,62%)` / 灰青 `hsl(190,15%,58%)` | `hsl(24,48%,42%)` / `hsl(195,22%,38%)` |

涨跌数字用 class `.pos`（→ `--up`）/`.neg`（→ `--down`）。
`--up/--down` 只表达涨跌方向，状态性的对/错用 `--good/--bad`，别混用。
半透明语义底色用 `color-mix(in srgb, var(--good) 10%, transparent)` 写法，不要另造 rgba 常量。

### 1.4 茶室材质 token（`--tr-*`）

| 变量 | 用途 |
|---|---|
| `--tr-paper-grad` | 纸面渐变底（卡片 background 栈的下层） |
| `--tr-fiber` | 纸纤维噪点 SVG（上层，`background-blend-mode: var(--tr-blend)`） |
| `--tr-blend` | 噪点混合模式：暗 `soft-light` / 亮 `multiply` |
| `--tr-paper-shadow` | 纸面内衬阴影三件套（内润影 + 顶边高光 + 外投影） |
| `--tr-rain` | 首页雨丝条纹色（`#view-home::after`，reduced-motion 下关闭） |
| `--glow-1` / `--glow-2` | body 两团极淡光晕（背景不许纯平的机制实现） |

纸面卡配方（`.tearoom .card` 等）：
```css
background: var(--tr-fiber), var(--tr-paper-grad);
background-blend-mode: var(--tr-blend), normal;
box-shadow: var(--tr-paper-shadow);
```

---

## 2. 字体（茶室三字体支柱）

基础栈仍是系统 sans（`-apple-system, "PingFang SC", …`，14px/1.6），其上立三根支柱：

| 变量 | 字体 | 用在哪 |
|---|---|---|
| `--tr-serif` | Noto Serif SC 600（自托管 woff2 子集，见 `fonts/`，不走 CDN） | 卡片标题、区块 h2、hero 标题、生活条标题——`.tearoom .card h2/h3` 已全局指定 |
| `--tr-mono` | IBM Plex Mono 400/500 | 数字支柱：榜单数值、streak、打字机体标签（`.lab-tier`）、核心指标数字 |
| `--tr-hand` | 楷体系（Kaiti SC/STKaiti/仿宋兜底） | 手写点睛，**只给** footer 雨注一类的装饰句 |

衬线标题统一 `font-weight: 600; letter-spacing: .06em`（hero 标题 `.12em`）。
**所有数字列 / 金额 / 百分比必须 `font-variant-numeric: tabular-nums`**，避免跳动。

| 层级 | 字号 | 字重 |
|---|---|---|
| hero 主标题 | 32px（≤720px 26px） | 700 |
| 区块标题 h2 | 20px（`#view-home .academy-panel h2`） | 600 衬线 |
| 卡片小标题 h3 | 13–15px | 600 |
| 正文 | 14px | 400 |
| 次要说明 `.sub` | 13px | 400 |
| 提示 `.hint` / 脚注 | 12px | 400 |
| 强调数值 | 18–20px mono | 600–700 |
| 徽章 | 11px | 400 |

规则：字号只从 {11, 12, 13, 14, 15, 18, 20, 21, 26, 32} 里选；加粗只用 500/600/700。
长文本块（AI 顾问回复）行高放宽到 1.75。

---

## 3. 间距

间距基于 2px 网格，常用刻度：**4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24**。

| 场景 | 值 |
|---|---|
| 页面左右留白 | `body padding: 0 20px`（≤720px 时 12px） |
| 头部 | `padding: 14px 20px`，吸顶 `position: sticky` |
| 主内容区 | `main` flex，`gap: 16px; padding: 18px 0` |
| 卡片内边距 | `16px`（大引导卡 `32px 28px`） |
| 卡片网格间距 | `gap: 14px` |
| 输入框 | `padding: 7px 12px` |
| 按钮 | `padding: 7px 16px`（小 `4px 12px`，大 `11px`） |
| 表格单元格 | `padding: 9px 14px` |
| 弹窗头 / 体 | `15px 20px` / `16px 20px` |

布局模式：外层 flex + `flex-wrap`，主图表区 `flex: 1 1 600px`，侧栏
`flex: 0 1 290px; min-width: 260px`；卡片集合用
`grid-template-columns: repeat(auto-fit|auto-fill, minmax(220~230px, 1fr))`。
唯一断点 **720px**。新页面必须在 720px 下可用。

---

## 4. 组件样式

### 4.1 圆角体系

| 半径 | 用途 |
|---|---|
| `--radius-lg`（20px） | 弹窗 |
| `--radius`（16px） | 卡片、表格、图表容器等大容器 |
| `--radius-sm`（10px） | 输入框、按钮、下拉、toast |
| 4–5px | 细小条状元素（进度条） |
| 999px | 徽章 / 胶囊 / 右上角工具簇按钮 |

圆角一律引用这三枚 token，别写裸像素值。

### 4.2 阴影与材质

| 层级 | 值 |
|---|---|
| 常规卡片 | 首选 `--tr-paper-shadow`（纸面内衬三件套）；非茶室容器用 `--shadow` |
| 大抬升 `--shadow-lg` | toast、弹窗、卡片 hover |
| 暗角 | `.tearoom` 自带 inset 大半径暗角（亮色压茶褐、暗色压黑），别再手画 |
| 毛玻璃 `--blur-material` | `blur(20px) saturate(1.8)`：吸顶头部、toast、弹窗遮罩的 `backdrop-filter` |

背景不许纯平：body 有 `--glow-1/--glow-2` 光晕，卡面有纸纹噪点——新容器直接用纸面卡配方（§1.4）。

### 4.3 按钮

基础态：`--panel-raised` 底 + 1px `--border` + 圆角 `--radius-sm`。
- hover：`border-color: var(--border-strong)` + `filter: brightness(1.12)`
- active：`transform: scale(.97)`（transition 驱动、可中断，reduced-motion 取消）
- focus-visible：**无 outline**，`box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)`
- disabled：`opacity: .4`

变体：`.primary`（茶室墨/茶实心，见 §1.2）、`.ghost`、`.buy/.sell`（语义色 color-mix tinted）、
`.big`、`.small`、次级文字链一律 `button.qs-textlink`（style.css 唯一文法）。
**按钮禁 emoji 功能图标**（E10）——图标用 24×24 currentColor 1.8 描边单色 SVG。

### 4.4 卡片 / 表格 / 弹窗 / 表单 / 图表

- 卡片：纸面卡配方（§1.4）；可交互卡 hover 上浮 3px + 强边框。
- 表格：`border-collapse: separate`、1px 外框、圆角 `--radius`、表头 `--surface-2` 底；
  行 hover `color-mix(in srgb, var(--accent) 5%, transparent)`；空态单行 `.empty-row` 走 `t()`；
  数值列右对齐 + tabular-nums。
- 弹窗：不手搓——走 `qsModal`（E9 拦截）。遮罩 `--mask` + 材质 blur；
  进场 `modal-in .4s var(--ease-sheet)`。
- toast：`--panel-raised` 86% 半透明 + blur + **3px `--accent` 左边框**（信息条签名式样），
  `toast-in .4s var(--ease-bounce)`。
- 表单控件：`--surface-2` 底、1px `--border`、圆角 8px；range/checkbox 在 `.tearoom` 内
  `accent-color: var(--accent)` 已全局跟色。
- 图表（ECharts）：不手搓 init/theme/resize——走 `qsChart`（E8 拦截）；颜色全部 `cssVar()`；
  dataZoom 滑块用 `qsSliderZoom` 共享 helper；容器 `--panel` 底 + 1px 边框 + 12px 圆角，
  默认高 480px（≤720px 降 360px）。

### 4.5 导航（两级 tab，下划线式，无底色）

一级 `.nav-group`：透明底，15px；激活态文字 + 3px 底边框同用 `--accent`，字重 700。
二级 `.nav-tab` 同构 14px。hover 只变文字色。
**右上角工具簇桌面端单行横排是用户钦定布局冻结区**（E13 拦截换行），窄屏适配只写进
`@media (max-width: 720px)`。

---

## 5. 动效与可访问性

- 过渡时长统一 **.15s–.22s**；进场 .25–.4s；位移幅度小（1–3px、16px 以内）。
- 缓动只用三枚 token：`--ease-out`（交互反馈）、`--ease-sheet`（弹窗进场）、
  `--ease-bounce`（toast 轻回弹）。**禁 ease-in-out**（E11 拦截），
  其余一律显式 cubic-bezier。
- 按压反馈统一 `scale(.97)`（卡片 `.98`），走 transition 而非 keyframes。
- 装饰性动画（雨丝、颗粒）必须进 `@media (prefers-reduced-motion: reduce)` 豁免清单；
  功能性进场在该查询下折叠为 `.01s`。
- focus 可见性：全站统一 accent 光环（§4.3），禁止裸 `outline: none`。
- `[hidden] { display: none !important; }` 已全局兜底——显隐一律用 `hidden` 属性。
- 文案零硬编码：全部经 `i18n.js` 的 `t()`，中英双份同时提交。
- 用户可控内容只能 `textContent` 赋值，禁止插进 `innerHTML` 模板。

## 6. 新页面 checklist

1. 读完本文档；色值全部用变量，两个主题下各看一遍。
2. 字号/间距/圆角只用本文档刻度表里的值；标题上衬线、数字上等宽。
3. 720px 宽度下布局不塌。
4. 表格含空态行；数字列 tabular-nums 右对齐。
5. 动画进 reduced-motion 豁免；focus 光环可见；缓动用三枚 token（禁 ease-in-out）。
6. 文案走 `t()` 双语；`index.html` 的 `?v=` 指纹由 `tools/bump_assets.py` 盖（hook 自动）。
7. 机械化禁令对照：E8 图表 / E9 弹窗 / E10 按钮 emoji / E11 ease-in-out / E12 紫色 /
   E13 工具簇换行 / E14 宠物冷灰——`python tools/ui_check.py` 必须 0 ERROR。
