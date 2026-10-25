# CLAUDE.md

QuantSim 虚拟炒股游戏：AKShare/mock 数据采集 → PySpark 指标 → Spring Boot 3 API → 原生 JS + ECharts 前端。

## 常用命令

```bash
# 后端测试 (集成测试需要 MySQL root/root; 默认 3306, CI 同配置)
cd backend && mvn -B test
# 本机 3306 常被其他项目占用 (已踩 2 次, 见 issue_recode/1.md): 用自带测试库
#   docker start quantsim-mysql-test && QUANTSIM_DB_PORT=3307 mvn -B test

# 后端运行 (静态资源直接指向 ../frontend, 改前端刷新即生效)
#   本地三套库严格分工 (2026-10-25 测试清库吞过真实账号, 勿再混用):
#   3306=其他项目占用 · 3307=集成测试库 (mvn test 会清库, 禁止日常开发连它) · 3308=开发库 (quantsim-mysql-dev, named volume 持久化)
cd backend && QUANTSIM_DB_PORT=3308 mvn spring-boot:run   # 或仓库根目录 .\start.ps1 一键启动 (自动起 dev 库并指向 3308)

# Docker 全家桶
docker compose up -d                              # MySQL + 后端
docker compose --profile pipeline run --rm pipeline  # 一次性灌数据

# 数据管道 (在 data-pipeline/ 下, 顺序执行)
python fetch_data.py        # 采集/mock 行情 -> data/raw/*.csv
python compute_indicators.py  # PySpark 算 MA/波动率 -> data/indicators/
python train_predictor.py   # 滚动窗口训练涨跌预测 -> data/predictions/
python load_to_db.py        # 全部入库 (幂等 upsert)
```

**写代码前先读根目录 `CONSTRAINTS.md`（质量门槛单一事实源），不得为放行改动而削弱它**；任务收尾跑 `node tools/floor_guard.mjs`（阻断级）。

测试说明见 `TESTING.md`。数据库 schema 全部走 Flyway（`backend/src/main/resources/db/migration/`，新表/新列只加新 `V{n}__*.sql`，不改旧文件；`ddl-auto: validate`）。**迁移里不要用 CHAR 列**：JPA `@Column(length=n)` 映射 VARCHAR，validate 模式下 CHAR 列直接拒启（V12/V13 就是在还这个债）。

## 架构速览

- **backend/**：Spring Boot 3 + JPA + Flyway + Caffeine。分层 controller → service → repository；DTO 全部是 record（`dto/*Dtos.java` 聚合类）；业务错误抛 `BusinessException`（400）/`NotFoundException`（404），由 `GlobalExceptionHandler` 统一转 `{success:false, message}`。
- 大 service 已按域拆分（2026-10，单文件 >800 行即拆）：回测 = `BacktestService` 门面（含 tune 调参网格入口）+ `BacktestEngine`（模拟内核）+ `BacktestStrategy`（策略深模块，2026-10 已把原调参网格类的定义收拢进来）；对局 = `GameService` 核心 + `GameStartService`（开局）+ `GameAiService`（AI 操盘）+ `GameBenchmarks`（结算复盘纯计算）。新逻辑放对应域，别往门面里堆回去；`@Transactional` 只放公共入口，拆出的组件是事务内被调方。
- 登录态 = 容器 `HttpSession`（`CurrentUser` 存取 userId），`AuthFilter` 只保护 `/api/me/`、`/api/rooms`、`/api/daily`、`/api/event` 四组前缀，其余接口游客可用（设计如此：降低上手门槛，竞技入口才需要身份）。
- 行情数据只读，整只股票打包缓存（`MarketDataService.StockData`，Caffeine 10 分钟过期）。
- **frontend/**：无构建、无框架。每个视图一个 IIFE 文件，依赖 `app.js` 的全局 `$ / api / toast / switchView / state` 与 `i18n.js` 的 `t()`。`index.html` 引 script 带 `?v=日期+内容指纹` cache-busting，由 `tools/bump_assets.py` **自动**维护（PostToolUse hook 在前端写入后跑它，人不要手改 `?v=`）；ui_check 的 W3 保留为兜底。
- 样式分层（2026-10-25 架构评审①）：`theme.css` 是**皮肤单属主**（两主题变量/--tr-* 材质/.tearoom 结构层/字体支柱，**必须第一个加载**，换色调氛围只开它）；`style.css` 是布局框架层；`game / academy / lab-games / widgets` 四个域各管各的视图。新样式写进对应域文件，域文件只许 var() 引用皮肤、不许定义皮肤选择器；同一选择器别跨文件重复定义——层叠顺序随加载顺序走，拆分时翻过一次车。
- 金额一律 `BigDecimal` 且显式 scale + RoundingMode；费用统一走 `FeeCalculator`，玩家/AI/基准/回测同口径。
- Python 管道 SQL 全部参数化（pymysql `%s`），保持这个习惯。

## UI 自动体检（强制）

前端有两层自动化：

**① 静态体检 `tools/ui_check.py`**（重复 id / 引用缺失 id / 死按钮 / i18n 缺键与重复与死键 / 硬编码中文 / 双主题 WCAG 对比度 / 版本号未 bump），
`.claude/settings.json` 的 PostToolUse hook 会在每次 Write/Edit 前端文件后自动跑它，发现 ERROR
直接把报告喂回来——**收到报告立即修复，不要等人工测试**，直到 `0 error(s)` 为止。手动全量巡检
或修复用 `ui-bug-fixer` agent（`.claude/agents/ui-bug-fixer.md`）。动态拼接的 i18n 键前缀
（`t("xxx." + var)` 与模板字符串形式）脚本会自动采集，其余特殊形态登记 `DYNAMIC_KEY_PREFIXES`，
别用忽略报错的方式绕过。

**② 运行时冒烟 `tools/ui_smoke/`**（Playwright，8 步：首访引导、全导航遍历、语言/主题/音效、
弹窗、开局→买入→推进→结算全流程、回测跑通、1280/390 双宽度无横向溢出；全程监听 console
error / pageerror / requestfailed）。跑法：起后端（库里要有数据）后
`cd tools/ui_smoke && npm run smoke`；首次先 `npm install && npx playwright install chromium`。
注意无头浏览器会 dismiss 原生 `confirm()`——脚本已统一 accept；新增 confirm 流程时记得冒烟会自动确认。

**③ 按钮体检 `tools/ui_smoke/button_check.mjs`（强制）**：真浏览器遍历全部视图，专查死按钮
（无 click 监听，含事件委托识别）/ 无可访问名称 / 重复 id / 零尺寸按钮，并监听 console error /
pageerror / 5xx。**每次写入/修改代码之后都必须运行**：起后端后
`cd tools/ui_smoke && npm run buttons`，有 error 立即修复到退出码 0 为止。

**④ 点击爬虫 `tools/ui_smoke/click_crawler.mjs`（手动巡检）**：真浏览器遍历全部视图、逐个点击可见按钮，
观察 console error / pageerror / 5xx（=error）与"点了没反应"（=noop 警告）；与 ③ 互补——③ 查"有没有监听"，
这里查"真点下去会不会炸"。跑法：起后端后 `cd tools/ui_smoke && npm run crawl`（可 `--view=lab` 单视图）。
业务 400 视为预期拒绝放行；回测请求自动改 preview 不入榜；桌宠悬浮层/登出按钮不点。
注意：**改完后端必须重启再爬**，旧 JVM 配新 target/classes 会报 NoClassDefFoundError 之类的假 500。

**⑤ 历史踩坑扫描 `tools/pr_guard.py`（PR 评审）**：扫变更代码里 `docs/bug-knowledge-base.md` 的 7 类反面模式
（分页后过滤 / username 身份比对 / 循环共用父事务结算 / 错误码依赖中文文案 / 状态结束才落库 /
除零缺保护 / 空值无兜底渲染），命中给风险解释 + 修改示例。跑法：`python tools/pr_guard.py`
（扫 git 变更，对比 origin/main）或 `--all` 全仓、`--strict` 让高置信规则卡 CI。启发式有误报，
**默认只告警不阻断**，确认后按示例改或在扫描器里收窄。新增历史坑在 `pr_guard.py` 的 `RULES` 里登记。

**⑥ 浏览器 CLI `tools/ui_smoke/browse.mjs`（任意验证）**：参数化真浏览器操作，动作按命令行顺序执行——
`node browse.mjs --view lab --login auto --click "#btn-x" --fill "#inp=5" --assert-text "#out=成交" --assert-no-console-error --screenshot out.png --json`。
走真实后端（`QUANTSIM_URL` 可改地址），`--json` 输出结构化步骤结果（`{ok, steps, consoleErrors, http5xx}`），退出码 0/1。
用途：验证某个具体改动的交互效果、产出修改前后的截图对比证据——固定流程用 ②③④，**针对性验证用它**。
`--json` 结果带 `theme` 字段（生效主题）——截图当证据时核对它，别拍错主题。
browse.mjs 覆盖不了、要手搓 Playwright 探针时，**一律 `import { openApp } from "./probe.mjs"` 开场**
（它封掉首访跳 landing / 登录门禁遮罩 / 常驻动画糊截图三个坑），别重写开场三件套。

## 工作流纪律（强制）

1. **CLI 脚本出问题必须记录**：每次运行 CLI 脚本发生问题后，在根目录 `issue_recode/` 下找到当前
   任务对应 issue 号命名的 md 文件（如 QuantSim#1 → `1.md`）追加记录；文件不存在则创建。每条记录
   开头必须写清日期（年月日，如 `## 2026-10-14`），写明问题现象、根因、处理结果。
   ——为什么：同类环境坑（编码/缺依赖/库没起）反复出现，有记录下次秒查，不用重新踩一遍。
2. **写代码后必须跑按钮体检**：任何代码写入/修改完成后，运行 `cd tools/ui_smoke && npm run buttons`
   （见上「UI 自动体检 ③」），通过后才算完成。
   ——为什么：无框架站没有类型/构建兜底，死按钮和运行时报错只有真浏览器点一遍才能暴露。
3. **检查通过后必须 commit**：按钮体检（及相关检查）通过后，立即 `git commit` 本次改动，不要积攒
   未提交的变更。
   ——为什么：小步提交才有干净回退点；本仓库曾因批量脚本中途失败截坏过文件，靠最近提交才恢复。

## 强制闭环工作流（每个任务必须走完）

**分析 → 修改 → 自动验证 → 未通过回到分析 → 通过后输出前后差异证据。** 禁止没跑验证就宣布完成。

- 验证手段按改动范围选：前端 → `ui_check.py` + `npm run buttons`（针对性交互用 browse.mjs，见体检⑥）；
  后端 → `cd backend && mvn -B test`；数据管道 → `cd data-pipeline && python -m pytest`；跨层 → `npm run smoke`；
  **tools/*.py、依赖/vendor、CI 配置类改动 → `bash tools/ci_local.sh`**（镜像 CI 的 ruff/eslint/ui_check/指纹
  四项秒级子集——PR #11 首跑三连红全是本地没跑 CI 同款检查，推送前必过）。
- 验证未通过 = 回到分析（按下节 Evidence-First 归因），不是盲改重试。
- **通过后必须给出前后差异证据**，三选一：测试结果 diff（修前失败输出 vs 修后通过输出）、
  browse.mjs/shot 修改前后两张截图路径、关键日志行对比。只说"改好了"不算完成。

## Evidence-First 失败归因（验证失败后的固定三步）

1. **先查既有证据**：按错误形态查 `docs/bug-knowledge-base.md`（代码类反面模式）和
   `issue_recode/`（环境/CLI 踩坑）——同类坑大概率踩过，秒查比重新定位快。
2. **结论必须带证据**：每个归因判断都要指向具体证据（日志行、测试输出、截图路径、git diff 行），
   禁止"大概是/应该是"这类无证据断言。
3. **没有既有证据就自己设计最小实验**：写最小单测、curl 单个接口、browse.mjs 单动作复现，
   把问题缩到能二分定位的范围，确认根因后再动手改。

## 自主任务协议（阶段二：AI 自主完成单个任务）

适用：用户给出明确需求让 AI 独立完成时，按此流程执行：

1. **对齐**：复述需求 + 验收标准（不明确就先问），输出计划（涉及文件 + 验证方式）。
2. **实施**：按计划修改，遵守本文件全部守则。
3. **自动验证**：按「强制闭环工作流」跑对应验证。
4. **有限自修**：验证失败最多自修 **2 轮**；每轮必须按 Evidence-First 换一个有新证据支撑的归因假设，
   禁止同一假设反复试。
5. **收尾**：按 `docs/TASK_REPORT_TEMPLATE.md` 提交结果报告——通过给差异证据；2 轮未过停手，
   报告已排除假设 / 剩余疑点 / 建议，并把案例记入 bug-knowledge-base（代码类）或 issue_recode（环境类）。

## Git 提交规范（强制）

- 每次代码修改完成后，必须先跑 CLI 工具验证（见「UI 自动体检」与后端 `mvn test`），发现问题修到通过，
  然后**立即** `git commit`。
- 提交信息清晰，**用英文书写**，带 `feat: ...`、`fix: ...`、`refactor: ...`、`docs: ...` 前缀。
- 不允许留下未提交的修改。
- **不添加 AI 的署名或 Co-authored-by 信息**（commit message 与 PR 描述都不加）。
- 不允许泄露带有电子邮件和 api key 的文件。

## 工作方式（强制）

- **先思考，再编码**：不要擅自假设需求；遇到歧义先说明假设、分析方案，必要时向用户确认。
- **保持简单**：只实现用户要求的功能，不添加多余功能、抽象或复杂设计。
- **精准修改**：只修改与需求直接相关的代码，不顺手重构其他模块；只清理自己此次修改产生的无用代码。
- **以结果为导向**：先明确成功标准和执行计划，再通过测试、构建等方式验证结果，发现问题就继续修复。
- **优先复用现有代码**；确实需要重复使用的逻辑抽象为可复用函数，避免重复造轮子（本仓库已为此清过
  一轮债，见 `app.js` 共享工具区与 `service/Enums`/`FeeCalculator` 的注释）。
- 禁止直接在 main 分支改码：先确认 main 为最新再 checkout 新分支；当前已在非 main 分支时直接开发，不允许切换到其他分支。

## 设计规范（强制）

**每次新建或修改前端页面/组件/样式之前，必须先读根目录的 `design.md`，并严格按其中的色值、字号、间距、圆角、阴影规范实现，保证全站风格统一。** 颜色永远引用 `style.css` 的 CSS 变量（图表色用 `cssVar()` 取），不得硬编码色值；新增颜色先在 `:root` 和 `:root[data-theme="light"]` 两个主题里都定义。

- **禁止使用紫色、蓝紫色及相关渐变**（2026-10-15 用户钦定）。注意：现存主题的 `--accent` 系恰是紫色——
  这条规矩约束**新增** UI；存量主题是否整体换色是单独的大改动，动之前必须和用户确认方案。
- 保持整体视觉风格一致。
- 在可以用图形和按钮说明操作的情况下，不要添加多余的解释性文字——界面自解释优先于说明文案。

## 安全与正确性守则

全文在 `docs/security-lessons.md`（2026-10 审计的 10 条教训 + 上线设施 + 好实践）。
**动以下任一处前必读它**：新增 `/{id}/...` 接口（属主校验）、读请求体 username（走 resolve）、
新增 LLM/重计算接口（限流+日顶）、竞技对局相关字段（防剧透脱敏）、交易成交价逻辑（只按收盘价）、
CORS/认证/会话、游客可写库入口（IP 限频）、唯一约束冲突处理与并发写锁。

## 布局冻结区（用户钦定，勿擅改）

- **右上角工具簇 `.header-tools`（🎁积分 / 登录 / EN / 主题 / 音效）在桌面端必须保持单行横排**。
  2026-10 曾为修 390px 溢出给它加 `flex-wrap: wrap` 导致桌面端变竖排，被用户退回。
  窄屏适配只允许写在 `@media (max-width: 720px)` 里；除非用户明确要求，不要改这个区域的布局。

## 规则 ↔ 机制对照表

每条强规则配一个"谁来拦"。被纠正同类错误第二次时: 先修错, 再把规则在更高层级机械化, 然后更新本表。错误类已不可能发生时删行。

| 规则 | 机制 | 层级 |
|---|---|---|
| 图表不手搓 init/theme/resize | `ui_check.py` E8 → 指路 qsChart | lint |
| 弹窗不手搓背板三件套 | `ui_check.py` E9 → 指路 qsModal | lint |
| 死按钮 / 重复 id / i18n 缺键漏键 / 对比度 | `ui_check.py` E1–E7 + PostToolUse hook | lint+hook |
| 改资源必须失效缓存 (?v=) | `bump_assets.py` 自动盖 + W3 指纹对比 + `floor_guard` 跑 `--check` 阻断 (2026-10-25 两次漏网后三层加固) | 机制 |
| 按钮禁 emoji 功能图标 (设计禁令) | `ui_check.py` E10 (扫 button 文本 + 挂 button 的 i18n 键) | lint+hook |
| 源码行尾恒 LF (指纹/告警稳定) | `.gitattributes` eol=lf | 机制 |
| 集成测试永不触碰真实数据库 | `backend/src/test/resources/application.properties` 强制专名库 quantsim_test (端口指错也免疫) | 机制 |
| dataZoom 滑块主题化口径唯一 | `app.js qsSliderZoom` 共享 helper, 新图表 spread 复用 | 架构 |
| 次级文字链文法唯一 | `style.css button.qs-textlink`, 降级按钮挂类不另写规则 | 架构 |
| 笔数预算口径唯一 | `TradeBudget` 深模块 + `TradeBudgetTest` | 架构+测试 |
| 撮合决策矩阵唯一且闸门顺序固定 | `OrderMatching` + `OrderMatchingTest` | 架构+测试 |
| pandas/Spark 指标口径一致 | `tests/test_indicator_parity.py` 对拍 | 测试 |
| 结算落库列完整 | `SettledColumnsTest` 反射对齐 | 测试 |
| 历史反面模式 7 类 (分页后过滤等) | `tools/pr_guard.py` RULES | 扫描 |
| Git Bash heredoc 禁非 ASCII / PS 禁文本替换改源文件 | 本机 PreToolUse hook (block_heredoc) | hook |
| 枚举解析走 Enums.parse / 金额 BigDecimal 显式 scale / 竞技字段防剧透 | 无机械兜底——评审判断 | docs |
| 跨脚本全局依赖需在文件头注释声明加载序 | 无机械兜底 (无构建架构的设计代价)——评审判断 | docs |

## 代码风格

- 注释用中文，写"为什么"而不是复述代码（现有代码是范例）；类/方法级用 `/** */`——这个项目大量口径约定（费用/利息/脱敏）只存在于注释里，复述式注释救不了下一个改口径的人。
- 枚举参数解析统一走 `service/Enums.parse`（trim + 大写 + 带可选值列表的 `BusinessException`）——之前各 service 手写 7 份，错误文案互相漂移过，别再散开。
- 前端新视图 = 新 IIFE 文件 + `index.html` 挂载 + `i18n.js` 双语键（所有文案必须中英双份，走 `t()`）——站点承诺中英切换，漏一个键 `ui_check.py` 会报错，硬编码中文则直接漏给英文用户。


## UI 设计规范禁止清单
- 禁止使用紫色、蓝紫色及相关渐变。
- 保持整体视觉风格一致。
- 不允许使用emoji
- 纯平背景色(必须有噪点或渐变)
- Hero+三卡片布局
- 高深的专业名词和无意义的空话
- Emoji作为功能图标
- 线性动画 ease-in-out

## 犯错：
当我跟你强调修改或者添加某个功能，你已经修改了代码之后还是没有达到我要的效果，应该先仔细思考找出没有起效的原因和真正的解决方法写入到claude.md中，避免下次再次犯错

- 2026-10-25 宠物手写体"没生效"：改了 widgets.css 但提交里没带 index.html 的 `?v=` 指纹（bump hook 这次没落盘），用户浏览器命中旧缓存。教训：**commit 前核对本次改过的每个前端资源在 index.html 里的指纹都变了**；"样式改了没效果"先查指纹/缓存，再查样式本身。
- 2026-10-25 **数据库被清事故**：`QUANTSIM_DB_PORT=3307 mvn -B test` 清掉了真实账号——测试与开发共用库名 `quantsim` 只靠端口区分，旧文档还建议"3306 被占用 3307"，一库两用迟早全灭。教训：**会清数据的命令（mvn test / 任何 migrate-fresh 类）跑之前必须核实连接串指向的库里没有真实数据；约定防不住的用配置物理隔离**——现已由 test classpath 强制专名库 `quantsim_test` 机械兜底（见规则表），日常开发一律 3308（`start.ps1`）。