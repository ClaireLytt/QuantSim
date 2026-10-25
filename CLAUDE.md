# CLAUDE.md

QuantSim 虚拟炒股游戏：AKShare/mock 数据采集 → PySpark 指标 → Spring Boot 3 API → 原生 JS + ECharts 前端。

## 快速入口

- 跑起来：仓库根 `.\start.ps1`（自动起 3308 开发库并指向它）。本地 MySQL 分工：3306=其他项目占用、3307=集成测试库、3308=开发库——测试已被 classpath 强制进专名库 `quantsim_test`，物理隔离。
- 后端测试：`cd backend && mvn -B test`；细节与环境坑见 `TESTING.md`。
- 数据管道：`data-pipeline/` 下按 `fetch_data → compute_indicators → train_predictor → load_to_db` 顺序跑（本机默认灌 3308，容器内走 compose 网络）。
- **写代码前先读根目录 `CONSTRAINTS.md`（质量门槛单一事实源），不得为放行改动而削弱它**；任务收尾跑 `node tools/floor_guard.mjs`（阻断级，含资源指纹闸门）。
- 数据库 schema 全部走 Flyway（`backend/src/main/resources/db/migration/`，只加新 `V{n}__*.sql` 不改旧文件；`ddl-auto: validate`，迁移里禁 CHAR 列——JPA 映射 VARCHAR 会拒启）。

## 架构速览

- **backend/**：Spring Boot 3 + JPA + Flyway + Caffeine。controller → service → repository；DTO 全是 record（`dto/*Dtos.java`）；业务错误抛 `BusinessException`(400)/`NotFoundException`(404)，`GlobalExceptionHandler` 统一转 `{success:false, message}`。
- 大 service 按域拆分（单文件 >800 行即拆）：回测 = `BacktestService` 门面 + `BacktestEngine` + `BacktestStrategy`；对局 = `GameService` + `GameStartService` + `GameAiService` + `GameBenchmarks`。新逻辑放对应域，别堆回门面；`@Transactional` 只放公共入口。
- 登录态 = `HttpSession`（`CurrentUser`），`AuthFilter` 只保护 `/api/me/`、`/api/rooms`、`/api/daily`、`/api/event`，其余游客可用（设计如此）。
- 行情只读，整只股票打包缓存（`MarketDataService.StockData`，Caffeine 10 分钟）。
- **frontend/**：无构建、无框架。每视图一个 IIFE 文件，依赖 `app.js` 全局 `$ / api / toast / switchView / state` 与 `i18n.js` 的 `t()`。`?v=` 指纹由 `tools/bump_assets.py` 自动维护（hook + floor_guard 闸门），人不要手改。
- 样式分层：`theme.css` 皮肤单属主（两主题变量/--tr-* 材质/字体，**必须第一个加载**）；`style.css` 布局框架；`game/academy/lab-games/widgets` 四域各管各的视图。域文件只许 `var()` 引用皮肤、不许定义皮肤选择器；同一选择器别跨文件重复定义。
- 金额一律 `BigDecimal` 显式 scale+RoundingMode；费用统一 `FeeCalculator`；Python 管道 SQL 全参数化（pymysql `%s`）。

## UI 自动体检

| 工具 | 何时 | 命令 |
|---|---|---|
| ① 静态体检 `tools/ui_check.py` | 每次 Write/Edit 前端文件后 hook 自动跑；**报 ERROR 立即修到 0** | `python tools/ui_check.py` |
| ② 运行时冒烟（8 步全流程） | 跨层改动收尾 | 起后端后 `cd tools/ui_smoke && npm run smoke` |
| ③ 按钮体检（**每次改码后必跑**） | 任何代码写入/修改后，过了才算完成 | `npm run buttons`（同目录） |
| ④ 点击爬虫（真点会不会炸） | 手动巡检；**改完后端必须重启再爬** | `npm run crawl`（可 `--view=lab`） |
| ⑤ 历史踩坑扫描 | PR 评审 | `python tools/pr_guard.py`（新坑登记进 `RULES`） |
| ⑥ 浏览器 CLI `browse.mjs` | 针对性验证/截图证据 | `node browse.mjs --view lab --click "#x" --screenshot out.png --json` |

- ⑥ 的 `--json` 带 `theme` 字段——截图当证据时核对它，别拍错主题。
- 手搓 Playwright 探针一律 `import { openApp } from "./probe.mjs"` 开场（封掉首访跳转/门禁遮罩/动画糊图三坑）。
- 冒烟会自动 accept 原生 `confirm()`；动态拼接 i18n 键的特殊形态登记 `DYNAMIC_KEY_PREFIXES`，别靠忽略报错绕过。

## 任务闭环（强制）

**分析 → 修改 → 自动验证 → 未通过回到分析 → 通过后给前后差异证据，然后立即 commit。** 禁止没跑验证就宣布完成，不允许积攒未提交变更。

- 验证按范围选：前端 → ①+③（针对交互用 ⑥）；后端 → `mvn -B test`；管道 → `python -m pytest`；跨层 → ②；tools/依赖/CI 类 → `bash tools/ci_local.sh`（推送前必过）。
- 差异证据三选一：测试输出 修前失败 vs 修后通过、⑥ 的前后两张截图路径、关键日志行对比。只说"改好了"不算完成。
- 验证失败 = Evidence-First 归因，不是盲改重试：先查 `docs/bug-knowledge-base.md`（代码类反面模式）和 `issue_recode/`（环境/CLI 坑）；结论必须指向具体证据（日志行/测试输出/截图/diff 行）；没有既有证据就设计最小实验缩小到可二分。
- CLI 脚本出问题必须记录到 `issue_recode/<issue号>.md`（日期 + 现象 + 根因 + 处理）。
- 用户给明确需求让 AI 独立完成时：先复述需求+验收标准+计划（文件+验证方式）再动手；失败最多自修 2 轮、每轮换有新证据的假设；收尾按 `docs/TASK_REPORT_TEMPLATE.md` 报告，2 轮未过停手并把案例记入知识库。

## Git 提交规范（强制）

- 提交信息清晰，**用英文书写**，带 `feat: ...`、`fix: ...`、`refactor: ...`、`docs: ...` 前缀。
- **不添加 AI 的署名或 Co-authored-by 信息**（commit message 与 PR 描述都不加）。
- 不允许泄露带有电子邮件和 api key 的文件。

## 工作方式（强制）

- **先思考，再编码**：不要擅自假设需求；遇到歧义先说明假设、分析方案，必要时向用户确认。
- **保持简单**：只实现用户要求的功能，不添加多余功能、抽象或复杂设计。
- **精准修改**：只修改与需求直接相关的代码，不顺手重构其他模块；只清理自己此次修改产生的无用代码。
- **以结果为导向**：先明确成功标准和执行计划，再通过测试、构建等方式验证结果，发现问题就继续修复。
- **优先复用现有代码**；确实需要重复使用的逻辑抽象为可复用函数（本仓已为此清过一轮债，见 `app.js` 共享工具区与 `service/Enums`/`FeeCalculator` 注释）。
- 禁止直接在 main 分支改码：先确认 main 为最新再 checkout 新分支；当前已在非 main 分支时直接开发，不允许切换到其他分支。

## 设计规范（强制）

**每次新建或修改前端页面/组件/样式之前，必须先读根目录 `design.md`，严格按其色值/字号/间距/圆角/阴影实现。** 颜色永远引用 CSS 变量（图表色用 `cssVar()`），新增颜色在 `:root` 和 `:root[data-theme="light"]` 两主题都定义。

机械化禁令（E10–E13 lint 自动拦，违规直接报错）：紫/蓝紫色、`ease-in-out` 时序、按钮 emoji 图标、`.header-tools` 桌面端换行。其余靠判断：

- 保持整体视觉风格一致；界面自解释优先于说明文案（能用图形/按钮就不加解释文字）。
- 背景不许纯平（必须有噪点或渐变）；不做 Hero+三卡片营销布局；文案不用高深名词与空话。
- 布局冻结区：右上角工具簇桌面端单行横排是用户钦定，除非用户明确要求不要动该区布局（窄屏适配只写进 `@media (max-width: 720px)`）。

## 安全与正确性守则

全文在 `docs/security-lessons.md`（2026-10 审计的 10 条教训 + 上线设施 + 好实践）。
**动以下任一处前必读它**：新增 `/{id}/...` 接口（属主校验）、读请求体 username（走 resolve）、
新增 LLM/重计算接口（限流+日顶）、竞技对局相关字段（防剧透脱敏）、交易成交价逻辑（只按收盘价）、
CORS/认证/会话、游客可写库入口（IP 限频）、唯一约束冲突处理与并发写锁。

## 规则 ↔ 机制对照表

每条强规则配一个"谁来拦"。被纠正同类错误第二次时：先修错，再把规则在更高层级机械化，然后更新本表。错误类已不可能发生时删行。

| 规则 | 机制 | 层级 |
|---|---|---|
| 图表不手搓 init/theme/resize | `ui_check.py` E8 → 指路 qsChart | lint |
| 弹窗不手搓背板三件套 | `ui_check.py` E9 → 指路 qsModal | lint |
| 死按钮 / 重复 id / i18n 缺键漏键 / 对比度 | `ui_check.py` E1–E7 + PostToolUse hook | lint+hook |
| 改资源必须失效缓存 (?v=) | `bump_assets.py` 自动盖 + W3 指纹对比 + `floor_guard` 跑 `--check` 阻断 | 机制 |
| 按钮禁 emoji 功能图标 | `ui_check.py` E10 | lint+hook |
| 禁 ease-in-out / 禁紫色 / 工具簇单行冻结 | `ui_check.py` E11 / E12 / E13（2026-10-25 禁止清单机械化） | lint+hook |
| 源码行尾恒 LF（指纹/告警稳定） | `.gitattributes` eol=lf | 机制 |
| 集成测试永不触碰真实数据库 | test classpath 强制专名库 `quantsim_test`（端口指错也免疫） | 机制 |
| dataZoom 滑块主题化口径唯一 | `app.js qsSliderZoom` 共享 helper | 架构 |
| 次级文字链文法唯一 | `style.css button.qs-textlink` | 架构 |
| 笔数预算口径唯一 | `TradeBudget` 深模块 + `TradeBudgetTest` | 架构+测试 |
| 撮合决策矩阵唯一且闸门顺序固定 | `OrderMatching` + `OrderMatchingTest` | 架构+测试 |
| pandas/Spark 指标口径一致 | `tests/test_indicator_parity.py` 对拍 | 测试 |
| 结算落库列完整 | `SettledColumnsTest` 反射对齐 | 测试 |
| 历史反面模式 7 类（分页后过滤等） | `tools/pr_guard.py` RULES | 扫描 |
| Git Bash heredoc 禁非 ASCII / PS 禁文本替换改源文件 | 本机 PreToolUse hook (block_heredoc) | hook |
| 枚举解析走 Enums.parse / 金额 BigDecimal 显式 scale / 竞技字段防剧透 | 无机械兜底——评审判断 | docs |
| 跨脚本全局依赖需在文件头注释声明加载序 | 无机械兜底（无构建架构的设计代价）——评审判断 | docs |

## 代码风格

- 注释用中文，写"为什么"而不是复述代码；类/方法级用 `/** */`——大量口径约定（费用/利息/脱敏）只存在于注释里。
- 枚举参数解析统一走 `service/Enums.parse`——之前各 service 手写 7 份，错误文案漂移过。
- 前端新视图 = 新 IIFE 文件 + `index.html` 挂载 + `i18n.js` 双语键（文案必须中英双份走 `t()`，漏键 ui_check 报错）。

## 犯错：

当我跟你强调修改或者添加某个功能，你已经修改了代码之后还是没有达到我要的效果，应该先仔细思考找出没有起效的原因和真正的解决方法写入到claude.md中，避免下次再次犯错。已机械化的教训从这里删除、进规则表（指纹闸门与测试库隔离两案已于 2026-10-25 机械化）。
