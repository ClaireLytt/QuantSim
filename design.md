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
| `--surface` | 页面底色 | `#111116` | `#e2ded3` |
| `--surface-2` | 输入框底、表头底、嵌入块底 | `#16161d` | `#d8d3c5` |
| `--panel` | 卡片 / 表格 / 图表容器底 | `#1c1d26` | `#ebe7db` |
| `--panel-raised` | 普通按钮底、toast 底 | `#262734` | `#e1dccd` |
| `--border` | 常规边框、分隔线 | `#2d2e3d` | `#ccc5b3` |
| `--border-strong` | 强调边框、hover 边框 | `#3d3f54` | `#a69e88` |
| `--text` | 正文 | `#ecebf3` | `#2b2c38` |
| `--text-muted` | 次要文字 / 标签 / 提示 | `#9d9db2` | `#5e5d6b` |
| `--header-bg` | 吸顶头部（半透明 + blur） | `rgba(17,17,22,.82)` | `rgba(230,226,215,.85)` |
| `--mask` | 弹窗遮罩 | `rgba(10,12,18,.7)` | 同暗色 |

页面底色不是纯色：`body` 在 `--surface` 上叠两个极淡的 radial-gradient 光晕
（`--glow-1` 紫、`--glow-2` 青，透明度 4%~7%），`background-attachment: fixed`。

### 1.2 主色与辅助色

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--accent` | 主色：激活态、链接、选中、聚焦 | `#8a8df2`（蓝紫） | `#585ce0` |
| `--accent-strong` | 主色深阶：primary 按钮渐变末端 | `#6d71ee` | `#4347ce` |
| `--accent-2` | 辅助青色：渐变收尾、装饰条 | `#5dd6c8` | `#2fa89a` |
| `--accent-soft` | 柔紫：次级点缀 | `#9a7ff0` | `#7e63e8` |
| `--on-accent` | 主色上的文字 | `#14141c` | 同 |
| `--warn` | 警示黄 | `#e6b450` | `#a97a12` |

品牌感渐变（标题 h1、区块装饰条、置信度条）统一方向 120°~180°，
从 `--accent` 过渡到 `--accent-2`。

### 1.3 语义色（金融语境，**涨红跌绿** 中式惯例）

| 变量 | 用途 | 暗色 | 亮色 |
|---|---|---|---|
| `--up` | 上涨 / 正收益 / 买入按钮 | `#e0524f`（红） | `#d24541` |
| `--down` | 下跌 / 负收益 / 卖出按钮 | `#26a69a`（绿） | `#1a8d82` |
| `--good` | 成功 / 通关 / 正向状态 | `#4fce8d` | `#127347` |
| `--bad` | 错误 / 危险操作 | `#ef6f6b` | `#cf5650` |
| `--ma5` | MA5 均线（图表） | `#d29a2c`（金） | `#a97a12` |
| `--ma20` | MA20 均线（图表） | `#8a8df2`（紫） | `#585ce0` |

涨跌数字用 class `.pos`（→ `--up`）/`.neg`（→ `--down`）。
注意 `--up/--down` 只表达涨跌方向，状态性的对/错用 `--good/--bad`，别混用。
半透明的语义底色用 `color-mix(in srgb, var(--good) 10%, transparent)` 这种写法，不要另造 rgba 常量。

---

## 2. 字体

字体栈（全局唯一）：
```css
font: 14px/1.6 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
```
等宽场景（房间码等）用 `monospace`。**所有数字列 / 金额 / 百分比必须加
`font-variant-numeric: tabular-nums`**，避免跳动。

| 层级 | 字号 | 字重 | 行高 | 用法 |
|---|---|---|---|---|
| 页面主标题 h1 | 21px | 默认 | 默认 | 仅站名，渐变文字 + `.5px` 字距 |
| 区块标题 h2 | 15px | 默认(600 视觉) | 默认 | 前置 4×16px 渐变装饰条（竖条圆角 2px） |
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
| `--radius`（12px） | 卡片、表格、图表容器等大容器 |
| 14px | 弹窗（比卡片略大） |
| 10px | toast、虚线编辑器等中容器 |
| 8px | 输入框、按钮、下拉、嵌入文本块 |
| 4–5px | 细小条状元素（进度条、置信度条） |
| 999px | 徽章 / 胶囊标签 |
| 50% | 圆点（预测命中点阵等） |

### 4.2 阴影体系（暗色值；亮色主题下 `--shadow` 自动换成暖灰弱阴影）

| 层级 | 值 |
|---|---|
| 常规卡片 `--shadow` | `0 2px 10px rgba(0,0,0,.35)` |
| 卡片 hover 抬升 | `0 8px 22px rgba(0,0,0,.45)` + `translateY(-3px)` |
| toast | `0 8px 28px rgba(0,0,0,.55)` |
| 弹窗 | `0 16px 48px rgba(0,0,0,.6)` |
| primary 按钮光晕 | `0 2px 10px rgba(109,113,238,.3)`，hover 加深 |

### 4.3 按钮

基础态：`background: var(--panel-raised)`，1px `--border` 边框，圆角 8px。
- hover：`border-color: var(--border-strong)` + `filter: brightness(1.12)`
- active：`transform: translateY(1px)`
- focus-visible：**无 outline**，用 `box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)`
- disabled：`opacity: .4; cursor: not-allowed`
- 过渡统一：`transition: ... .18s ease`（transform .1s）

变体：
| class | 样式 |
|---|---|
| `.primary` | `linear-gradient(135deg, var(--accent), var(--accent-strong))`，文字 `--on-accent`，600 字重，带光晕 |
| `.ghost` | 透明底、muted 文字；hover 转 `--accent` 边框 |
| `.replay` | `--surface-2` 底 + 强边框，介于 ghost 和 primary 之间 |
| `.buy` / `.sell` | 分别实底 `--up` / `--down`，白字 600，hover 同色光晕 |
| `.big` | 全宽 + 11px 垂直内边距 + 15px 字号 |
| `.small` | `4px 12px`、12px 字号 |

### 4.4 卡片 `.card`

```css
background: linear-gradient(180deg, rgba(255,255,255,.02), transparent 45%), var(--panel);
border: 1px solid var(--border);
border-radius: var(--radius);   /* 12px */
padding: 16px;
box-shadow: var(--shadow);
```
顶部 2% 白色渐变提亮是统一质感，别省。可交互卡片 hover：上浮 3px + 强边框 + 深阴影，
transition .15–.18s。状态卡片用语义色的 `color-mix` 半透明边框（如通关卡 `--good` 45%）。

### 4.5 导航（两级 tab，下划线式，无底色）

- 一级 `.nav-group`：透明底、无边框，`padding: 6px 16px 8px`，15px，muted 色；
  激活态：文字与 2px 底边框同用 `--accent`，字重 700。
- 二级 `.nav-tab`：同构，14px，`padding: 6px 14px 10px`，激活字重 600，整排左缩进 10px。
- hover 只变文字色为 `--text`，不加背景。
- 头部容器：半透明 `--header-bg` + `backdrop-filter: blur(10px)` + 1px 底边框，sticky 吸顶。

### 4.6 表格

容器化表格：`border-collapse: separate`、1px `--border` 外框、圆角 `--radius`、
`overflow: hidden`、`--shadow`。表头 `--surface-2` 底 + muted 13px/500。
行分隔 1px `--border`（末行去掉）。行 hover：`color-mix(in srgb, var(--accent) 5%, transparent)`。
最后一列右对齐 + tabular-nums（通常是数值列）。空态用单行 `.empty-row`（muted），文案走 `t()`。

### 4.7 弹窗与 toast

- 遮罩 `.modal-mask`：`--mask` + `blur(4px)`，flex 居中，24px 安全边距。
- 弹窗 `.modal`：640px 宽（`max-width: 100%`）、`max-height: 85vh`、圆角 14px、强边框，
  进场动画 `modal-in .2s ease`（上移 10px + 缩放 .985 淡入）。头部标题 + 右上无边框 close。
- toast `#toast`：固定底部居中（bottom 40px），`--panel-raised` 底 + 强边框 +
  **3px `--accent` 左边框**（信息条签名式样），进场 `toast-in .22s ease`。
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

- 过渡时长统一 **.15s–.22s ease**；位移幅度小（1–3px、10px 以内），不做花哨动画。
- 所有装饰性动画必须写进 `@media (prefers-reduced-motion: reduce)` 的豁免清单
  （关 animation，纯装饰元素直接 `display: none`）。
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
