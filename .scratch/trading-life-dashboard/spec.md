# Spec: 首页「我的交易人生」仪表盘

标签: `ready-for-agent`
状态: P0+P1 已实现（commit 4b64d99, PR #24）；本 spec 同时覆盖剩余 P2，供后续接手。

## Problem Statement

QuantSim 首页是一个纯功能导航页：hero 主张 + 23 张功能卡目录。老玩家每天回来看到的页面和第一次完全一样——没有任何地方反映"我"的虚拟资产、战绩和成长。个人数据（对局记录、积分、偏差档案）都埋在二级页，首页无法回答"我玩到哪了、今天该做什么"。签到 streak 只存 localStorage，换设备即丢。

## Solution

把首页升级为「我的交易人生」个人成长仪表盘：有已结算对局的登录用户首屏看到归一化虚拟资产、累计收益率、对局胜率、最大回撤四枚核心数字 + 连续学习天数 + 状态驱动 CTA，第二屏是从 10 万起步逐局滚动结转的资产曲线（标注最大回撤区间）和最近对局；功能目录折叠降权。游客与无战绩新用户保持原导航页，绝不显示伪造的 0.00%。签到 streak 服务端化，跨设备一致。

## User Stories

1. As a 有战绩的回访玩家, I want 首屏直接看到我的虚拟资产和累计收益率, so that 10 秒内知道自己玩到哪了
2. As a 有战绩的回访玩家, I want 看到按时间序滚动结转的资产曲线, so that 我的成长可视化、有继续玩的动力
3. As a 有战绩的回访玩家, I want 曲线上标出最大回撤区间, so that 我能自省风险而不只看收益
4. As a 有战绩的回访玩家, I want 看到对局胜率, so that 评估自己的稳定性而非单局运气
5. As a 有进行中对局的玩家, I want 首屏主按钮直接变成「继续对局」, so that 一次点击回到局中
6. As a 无进行中对局的玩家, I want 主按钮是「开始对局」, so that 立刻开新局
7. As a 回访玩家, I want 首页列出最近 3 局（模式/标的/收益、进行中标注）, so that 快速回顾并进入复盘
8. As a 回访玩家, I want 点「查看全部」直达「我的」战绩页, so that 看完整历史
9. As a 连续学习的玩家, I want 连续学习天数展示在荣誉位且 ≥3 天点亮, so that 保持连续性有正反馈
10. As a 多设备玩家, I want 签到连续天数存在服务端, so that 换浏览器/设备不丢
11. As a 新用户或游客, I want 首页保持原功能导航布局且不出现 0.00% 假数据, so that 不被空仪表盘劝退
12. As a 只结算过 1 局的玩家, I want 曲线位显示"再完成 N 局解锁", so that 有明确的下一步目标
13. As a 回访玩家, I want 23 卡功能总览默认折叠、一键展开, so that 首屏不被目录淹没而功能仍可达
14. As a 新用户, I want 功能总览默认展开, so that 第一次来就能看清全部玩法
15. As a 玩家, I want 四枚数字用等宽字体 tabular-nums 渲染, so that 数字稳定可读
16. As a 中英文用户, I want 仪表盘全部文案走 i18n 双语, so that 切语言无裸键
17. As a 深浅色主题用户, I want 仪表盘与曲线在两主题下都遵循茶室皮肤变量, so that 视觉一致
18. As a 玩家, I want 收益率涨跌沿用全站 .pos/.neg（涨红跌绿）, so that 语义一致
19. As a 事件/竞技局玩家, I want 最近对局沿用后端脱敏（进行中不暴露标的与真实窗口）, so that 不被剧透
20. As a 登录/登出的用户, I want 首页形态随登录态即时切换, so that 不需要刷新页面
21. (P2) As a 重度玩家, I want 逐笔配对的交易胜率, so that 比"局胜率"更精细地评估操作
22. (P2) As a 玩家, I want 每局净值曲线落库后看到逐日资产曲线, so that 曲线粒度从"局"细到"日"
23. (P2) As a 玩家, I want 行为偏差档案摘要上首页, so that 成长仪表盘覆盖行为维度

## Implementation Decisions

- 口径（用户拍板）：各已结算局收益率按时间序**几何连乘**；虚拟资产**归一化为 10 万起步净值**；胜率 = `finalReturnRate > 0` 的局数占比；最大回撤 = 含 10 万起点的净值序列峰谷最大跌幅。
- 聚合是**只读**的：新增 summary 服务按需计算，不落库、不加缓存（50 局上限的线性扫描足够便宜）。
- 签到 streak 作为 user_points 的新列（Flyway 新增迁移，只加不改），签到入口内联更新：昨日签过 +1、断签/首签归 1、当日幂等；PointsState 记录**尾部追加**字段保持兼容。
- 曲线数据：后端返回每局一个点（日期+净值），前端自行补"起点 10 万"；回撤区间由前端在点列上算峰→谷并用 markArea 标注（色取 `--bad` 低透明度）。
- 首页三状态由前端判定：游客或 `settledCount == 0` → 导航态；`settledCount > 0` → 仪表盘态（hero 与三核心区隐藏、总览折叠）；`signInStreak >= 3` → streak 荣誉位点亮。登录态变化走 Auth.onChange 即时重渲。
- CTA 状态：我的对局列表里存在 IN_PROGRESS → 「继续对局」，否则「开始对局」；点击统一进对局视图。
- 最近对局为展示性列表（非逐行按钮），模式名走 `me.mode.*` 动态键前缀（已在 lint 白名单），标的名沿用后端脱敏结果。
- 设计：全部色值走茶室皮肤变量（图表经 cssVar），数字 `--tr-mono` + tabular-nums，标题 `--tr-serif`；不新增皮肤选择器；右上角工具簇布局不动（冻结区）。

## Testing Decisions

- 好测试只测外部行为：给定一组已结算局收益率，断言净值/累计收益/胜率/回撤/曲线点——不测内部遍历方式。
- 口径单测（纯 Mock、零 Spring 零库）钉死几何连乘、峰谷回撤、空账户零态、streak 规则（隔日 +1 / 断签归 1 / 当日幂等）；先例：`TradeBudgetTest`、`OrderMatchingTest` 的表驱动中文方法名风格。
- UI 走既有机械闸门而非新增测试框架：ui_check（含 i18n 漏键/死按钮/对比度）、buttons 体检、browse.mjs 截图（核对 `--json theme` 字段）。
- 集成验证用真实数据手算对拍：造 N 局已结算账号，核对 summary 数字可由各局收益率手工连乘复现。

## Acceptance Criteria

每条都以真实产物验证（principle-prove-it-works），不接受"能编译"：

1. `cd backend && QUANTSIM_DB_PORT=3307 mvn -B test`（测试库容器需在跑）→ 尾部 `Tests run: 150+, Failures: 0, Errors: 0` 且 `BUILD SUCCESS`。覆盖 stories 1–4、10。【已过：150/150】
2. `python tools/ui_check.py` → `0 error(s)`；`node tools/floor_guard.mjs` → `clean`。覆盖 15–18。【已过】
3. 重启后端后 `cd tools/ui_smoke && npm run buttons` → `0 error(s), 0 warning(s)`（修前基线：旧后端 3×404）。覆盖 13、20。【已过】
4. 真实数据对拍：注册新账号结算 2 局后 `GET /api/me/summary` 的 `virtualAssets` 等于 100000×∏(1+r_i)（HALF_UP 2 位），`winRate`/`maxDrawdown` 与手算一致。覆盖 1–4。【已过：100240.14 = 100000×1.0012²】
5. 浏览器证据（两主题截图为必交产物）：游客/新账号首页无生活条且总览展开（`issue_recode/home_guest_after.png`）；有 2 局结算的账号显示四数字+曲线+最近对局、hero 隐藏、总览折叠（`home_dashboard_after.png`、`home_dashboard_dark.png`）。覆盖 5–9、11–14、17。【已过】
6. (P2 接手时) 逐笔胜率/逐日曲线/偏差摘要各自补：口径单测 + 同上 1–3 闸门 + 截图证据。

## Out of Scope

- 逐笔配对盈亏胜率、每局净值曲线落库（新迁移）与逐日资产曲线、偏差档案上首页——列为 P2，仅在 stories 21–23 占位。
- 回测（BacktestResult）数据并入人生净值——口径不同（研究 ≠ 实战），不混。
- 排行榜、情绪温度计、今日任务、新手推荐的逻辑改动——本次只调位置/保留。
- 任何真实货币/充值概念——虚拟资产纯游戏内。

## Further Notes

- 根目录 `DESIGN.md` 仍描述旧 indigo/iOS 主题，与 theme.css（雨声茶室）脱节，建议单独刷新，勿在本特性里顺手改。
- 本机跑后端测试的环境前置（3307 容器 + 显式端口）已记 `issue_recode/1.md`（2026-10-25 晚条目）。
- "连续学习天数"（服务端签到 streak）与任务卡的"连续上线"（localStorage）是两个口径，暂并存；若要合并是独立决策。
