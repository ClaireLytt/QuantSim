# QuantSim 版本迭代质量门禁体系

> 目标：让 `docs/bug-knowledge-base.md`（7 类代码反面模式）、`docs/robustness-audit-2026-10.md`（24 项审计缺陷）、`issue_recode/`（环境坑）里的每一类历史问题，都有至少一道**自动化**门禁拦截；人工评审只兜自动化兜不住的设计类问题。
> 现有工具底座：PostToolUse hook 自动跑 `ui_check.py`；`tools/pr_guard.py`（反面模式扫描）；`tools/ui_smoke/`（buttons / smoke / crawler / browse）；CI（`.github/workflows/ci.yml`：mvn test + JaCoCo、ruff + pytest、eslint + ui_check + smoke）。本文在此之上补齐规则与流程。

---

## 1. 门禁卡点总览（五道闸）

```
① 提交前自查 (开发者本机, 分钟级)
      ↓ git commit
② PR 人工 CR (勾选清单 + 高危域加签, 见 §5)
      ↓ approve
③ CI 自动化门禁 (红灯禁并, 见 §4)
      ↓ merge main
④ 上线前冒烟 (真浏览器全流程)
      ↓ deploy
⑤ 灰度观测 (上线后 24h 哨兵)
```

### ① 提交前自查（强制，CLAUDE.md 已约定）

| 改动范围 | 必跑 | 通过标准 |
|---|---|---|
| 前端 | `python tools/ui_check.py` + `cd tools/ui_smoke && npm run buttons` | 双 0 error；`?v=` 已 bump |
| 后端 | `cd backend && mvn -B test`（注意：**别接 `\| tail`**，管道会吞退出码——issue_recode/1.md 2026-10-16 教训；判定以 `BUILD SUCCESS` 行为准） | 0 failures / 0 errors |
| 数据管道 | `cd data-pipeline && python -m pytest` + `ruff check` | 全绿 |
| 任意 | `python tools/pr_guard.py`（扫 git 变更） | 无新增高置信命中 |

### ② PR 人工 CR → 见 §3 勾选清单、§5 加签规则

### ③ CI 自动化门禁 → 见 §4

### ④ 上线前冒烟（发版机执行）

```bash
docker compose up -d && (等 health UP)
cd tools/ui_smoke && npm run smoke && npm run buttons
python tools/pr_guard.py --all          # 全仓扫一次, 防多 PR 叠加出新组合
```
8 步 smoke（首访引导→全导航→语言/主题/音效→弹窗→开局买入推进结算→回测→双宽度无溢出）任一步失败即不发版。**改过后端必须用新镜像/重启后再冒烟**（旧 JVM + 新 classes 的假 500 见体检④注意）。

### ⑤ 灰度观测门禁（上线后 24h，不达标即回滚）

单实例无灰度流量切分，"灰度"= 上线后观察窗口 + 哨兵脚本：

| 哨兵 | 口径 | 红线 |
|---|---|---|
| 5xx 率 | `docker compose logs backend` 按小时 grep ERROR | 新增未知异常栈 > 0 即查；同栈 ≥3 次/小时回滚 |
| 资产对账 | 抽样当日 SETTLED 会话重放流水（runbook SOP-3） | 任一漂移 > 0.01 |
| 挂单一致性 | `pending_order OPEN 且 session 已结算` 计数 | 必须为 0 |
| 积分异常 | 单账号当日 earned 总额 TopN | 超过"打满全部任务"理论上限即查 |
| 榜单体检 | 榜上出现 `smoke_/btncheck_/shot_` 前缀或 NULL 收益率 | > 0 即查 |

---

## 2. 历史坑点强制检查清单（CR 与自动化的共同依据）

每条给【历史出处】与【谁来拦】。CR 时逐条对照变更，自动化已覆盖的仍要抽查写法。

**C1 事务使用**【kb #3/#5/#6；审计 P1-6】
- `@Transactional` 只放公共入口；拆出的组件是事务内被调方，禁止 this 自调用绕过代理。
- 循环批量处理互相隔离的单元 → 单元内 `REQUIRES_NEW` + **catch RuntimeException**（只 catch BusinessException 会让 NotFoundException 复刻"永久 500"）。
- 唯一约束冲突：catch 后同事务继续读写 → 必须 `INSERT IGNORE` + 锁定重读；只有"catch 后直接抛业务异常收场"才允许 saveAndFlush+catch。
- 拦截：pr_guard R3 + 新增 R8（循环内 catch BusinessException）；集成测试 expiredRoomSettles* 两例。

**C2 JPQL / 查询**【kb #1 分页后过滤】
- 过滤条件必须进 SQL（分页前），禁止取回内存再 filter 后分页。
- 公开榜查询必须排除测试前缀（smoke_/btncheck_/shot_）——新增测试账号前缀要同步三处榜单 SQL。
- 锁定读场景（并发写前的读）用 `findWithLockBy...`；INSERT IGNORE 后的回读必须锁定读（RR 快照看不到并发已提交行）。
- 拦截：pr_guard R1；CR 抽查新 @Query。

**C3 资产/资金计算**【kb #6；审计 1.2/1.4/2.x】
- 金额一律 `BigDecimal`，每处 `divide` 显式 scale + RoundingMode；除数先证非零（close/cost/shares）。
- 费用只走 `FeeCalculator`（grep `commissionRate|stampTax` 在业务代码必须零命中）。
- Account 是流水的冗余快照：任何改"资金口径"的变更（利息/费用/撮合价）必须同步改 `replayAccount` 与 `equityCurve` 两处重放，三者口径恒等。
- 拦截：pr_guard R6（除零）+ 新增 R12（业务代码出现费率常量）；对账哨兵（§1⑤）。

**C4 订单状态流转**【审计 P1-4/P1-5/P2-1.3】
- 挂单状态机：OPEN → FILLED / CANCELLED，结算时 OPEN 必须收敛（`cancelOpenOnSettle`）。
- 成交流水必须带 `order_id`（挂单来源），undo 据此回滚挂单——新增"删流水"路径时必须处理关联挂单。
- 保护性卖单（止损/止盈/移动止损）是 reduce-only：进阶模式撮合前 clamp 到现有多头，禁穿越零点开空。
- 拦截：回归测试 protectiveSellOrderIsReduceOnly / undoOrderFillReverts / 结算撤单用例。

**C5 幂等性**【kb #5；审计 3.x】
- 所有结算/发放入口：悲观锁 + 状态前置检查（`requireInProgress`），重复调用得 400 而非双写。
- 积分发放只经 `PointsService.getOrCreate`（锁内判定"当日一次"任务位），禁止旁路新建发放点。
- 奖励与状态变更同事务：要么都成，要么都回滚可重试，不存在"发了分没结算"。
- 拦截：CR 对照；并发回归（dailyStart 并发撞唯一键用例）。

**C6 跨时间边界**【kb #9；审计 P0-2】
- "当日"的判定统一 `GameService.GAME_ZONE`（Asia/Shanghai），禁止裸 `LocalDate.now()`。
- 跨零点语义：对局记在**开局日**名下；昨日榜对"该日仍有未结算对局的请求者"保持脱敏。
- 新增任何按日期分组/揭晓的功能，必须写 mock-clock 跨日用例。
- 拦截：新增 pr_guard R9（`LocalDate.now()` 不带 zone）；回归 yesterdayBoardStaysMasked*。

**C7 脱敏（竞技防剧透）**【CLAUDE.md 高危 #4；审计 P0-3/P1-9】
- 竞技局（DAILY/ROOM/EVENT）任何对外日期必须 `BlindDates.mask`——**结算后也不揭晓窗口**（只揭晓标的）。journal 曾是唯一破口，勿再开第二个。
- 新增字段自问："能否反推窗口或标的？"（文本含年份/事件名/真实 code 都算）。
- 竞技局不下发新闻事件；榜单当日 + 请求者未结算时标的 `???`。
- 已知未修：价格指纹离线匹配（BlindDates 注释已登记），竞技行情口径变更需产品确认。
- 拦截：新增 pr_guard R10（竞技 DTO 新增 LocalDate 字段未经 mask）；BlindDatesTest + 竞技集成测试。

**C8 浮点/精度**【审计 1.5/2.x】
- Java 侧禁 double 参与金额（回测内核的 double 是已知豁免区，扩散需评审）；Spark 侧除法必须 `F.when(分母 != 0, ...)`（Infinity 入库下游 null 判防不住）。
- 均价/收益率 scale 口径改动 = 资金域变更，走 §5 加签。
- 拦截：pr_guard R6；pipeline pytest 的 OHLC 不变式用例。

**C9 空值/脏数据保护**【kb #7；审计 1.4】
- 行情边界：`bar == null`（停牌缺日）、`indicator == null`（窗口不足）、`close <= 0`（防御性）三件套，所有消费点必须兜底。
- 管道入库过质量门（`sanitize`：非正价/高低矛盾/重复日期），load 端兜底过滤。
- 前端渲染可空字段必须有占位（"--"），禁止 `undefined` 上屏。
- 拦截：pr_guard R7；ui_check；pipeline 质量门用例。

**C10 身份与越权**【CLAUDE.md 高危 #1/#2；审计 P1-8】
- 新 `/{id}/` 端点先 `requireAccess`；记战绩入口只走 `UserService.resolve`；游客可写接口必须 IP 限流（生产需 forward-headers 生效）。
- 拦截：pr_guard R2 + 新增 R11（新端点无 requireAccess/resolve/限流）；越权集成测试。

---

## 3. PR 勾选清单（贴进 PR 模板，逐项勾选）

```markdown
### 自查 (提交人勾选)
- [ ] 本机已跑对应验证 (前端: ui_check+buttons / 后端: mvn test / 管道: pytest+ruff), 贴结尾输出行
- [ ] `python tools/pr_guard.py` 无新增高置信命中 (有命中时在 PR 里解释或改掉)
- [ ] 改了 JS/CSS → index.html 对应 `?v=` 已 bump; 新文案中英双份走 t()
- [ ] 新表/新列 = 新 V{n}__*.sql, 未改旧迁移, 无 CHAR 列
- [ ] 本次修的 bug 已有自动化回归用例 (§6), 用例名含审计/issue 编号

### 风险域声明 (命中任何一项 → 按 §5 加签)
- [ ] 涉及 资金/费用/利息/重放口径 (C3)
- [ ] 涉及 结算/积分发放/幂等 (C5)
- [ ] 涉及 榜单查询/排名口径 (C2)
- [ ] 涉及 竞技脱敏/日期边界 (C6/C7)
- [ ] 涉及 定时任务/异步 (SOP-6 域)
- [ ] 新增 /{id} 端点或游客可写接口 (C10)

### 评审人核对 (CR 勾选)
- [ ] 对照 §2 清单逐条过了变更相关项
- [ ] 事务边界: 无 this 自调用、循环批量的 catch 范围是 RuntimeException (C1)
- [ ] 新查询分页前过滤、榜单排除测试前缀 (C2)
- [ ] 新增异常路径最终落到 BusinessException(400)/NotFoundException(404), 无中文文案分支判断
- [ ] diff 范围与 PR 描述一致, 无顺手重构
```

---

## 4. CI 门禁配置与阻断规则

### 4.1 现有 CI（ci.yml）即门禁执行器，各 job 全部**红灯禁并**

| Job | 内容 | 失败处置 |
|---|---|---|
| backend | `mvn -B test` + JaCoCo artifact | **阻断**。覆盖率暂为观测指标（artifact 留档），新增核心 service 行覆盖显著下降时 CR 质询 |
| python-check | `ruff check data-pipeline tools` + `pytest` | **阻断** |
| ui | 起后端灌合成数据 → `ui_check.py` + eslint + `npm run smoke` | **阻断** |

### 4.2 建议增补的 CI 步骤（落地项）

```yaml
# ui job 内追加 (真浏览器死按钮检查, 本机强制项上 CI)
- name: Button check
  run: cd tools/ui_smoke && npm run buttons

# 新 job: 反面模式门禁 (对比 origin/main 扫变更)
- name: Pitfall guard
  run: python tools/pr_guard.py --strict   # strict 下高置信规则红灯
```

### 4.3 pr_guard 规则扩编（RULES 登记，源自 2026-10 审计）

| 新规则 | 拦什么 | 级别 |
|---|---|---|
| R8-loop-catch-business | 循环/批量迁移上下文里 `catch (BusinessException` | strict 阻断 |
| R9-now-without-zone | `LocalDate.now()` 不带 GAME_ZONE | 警告 |
| R10-blind-dto-date | 竞技相关 DTO 新增 LocalDate 字段未见 `BlindDates.mask` | strict 阻断 |
| R11-endpoint-no-guard | 新 `/{id}` 端点无 requireAccess / 游客可写无 rateLimiter | strict 阻断 |
| R12-fee-constant-leak | 业务代码出现费率/印花税常量（绕过 FeeCalculator） | strict 阻断 |

### 4.4 阻断 vs 警告放行

**必须修复才能合并（任何人不得豁免）**：
- 任一 CI job 红灯；ui_check ERROR；buttons/smoke 非 0 退出
- pr_guard strict 规则命中且确认非误报
- 命中 §2 清单且无对应回归用例的 bug 修复类 PR

**警告，可评估放行（放行条件必须写进 PR）**：
- pr_guard 非 strict 规则命中 → 评审人确认误报并注明理由，或在扫描器里收窄规则（禁止用忽略注释绕过）
- JaCoCo 覆盖率下降 → 说明原因（如删除死代码）
- eslint warning 级 → 不新增即可
- 已登记的已知风险复现面（如价格指纹）→ 引用登记位置即可

---

## 5. 高危域变更评审机制（加签）

**触发条件**（PR 勾选清单"风险域声明"任一命中）：资金/费用/重放口径、结算与积分发放、榜单口径、竞技脱敏与日期边界、定时任务/异步、新增身份敏感端点。

**规则**：
1. 除常规 CR 外，**强制 +1 名加签评审人**（项目负责人或指定的域 owner）；加签人只审风险域清单（§2 对应条目），不泛审。
2. 加签 PR 必须包含：影响口径说明（改前/改后数值示例）、对应回归用例 diff、灰度观测哨兵中受影响项的核对计划。
3. 资金口径类（C3）额外要求：PR 里贴一局完整重放对账的前后对比（SOP-3 口径）。
4. 无加签审批的高危域 PR 禁止合并——GitHub 上用 CODEOWNERS 落地：
   ```
   # .github/CODEOWNERS (建议落地)
   backend/src/main/java/com/quantsim/service/FeeCalculator.java   @owner
   backend/src/main/java/com/quantsim/service/TradeEngine.java      @owner
   backend/src/main/java/com/quantsim/service/GameBenchmarks.java   @owner
   backend/src/main/java/com/quantsim/service/PointsService.java    @owner
   backend/src/main/java/com/quantsim/service/BlindDates.java       @owner
   backend/src/main/java/com/quantsim/service/DataRefreshService.java @owner
   backend/src/main/resources/db/migration/                          @owner
   ```

---

## 6. 回归用例管理机制

1. **修 bug 必带用例**：每个 bug 修复 PR 必须新增（或解禁）一个**修复前失败、修复后通过**的自动化用例，PR 里贴两段输出为证。无用例的 bug 修复 PR 直接退回（§4.4 阻断项）。
2. **命名与追溯**：用例 Javadoc/注释首行标出处——`回归 (审计 P0-1)` / `回归 T-04` / `kb #3`，与 `bug-knowledge-base.md` / `robustness-audit-2026-10.md` 编号互链。既有范例：`settle_awardsPointsOnlyWhenCompleted`、`expiredRoomSettlesDespiteMemberAccountMissing`、`staleNonEmptyQueuesAreEvicted`。
3. **回归集就是全量测试集**：本仓测试量级小（分钟级），不拆"冒烟/回归"两套——`mvn -B test` + pipeline pytest + smoke/buttons 全跑，避免"回归集漂移出主干"的维护债。
4. **用例的坑也要登记**：测试环境类问题（DB 端口被占、管道吞退出码）记 `issue_recode/`；测试里放宽限流等配置必须注释理由（范例：`guest-backtest-per-minute=10000 // 本类大量匿名回测`）。
5. **季度清理**：每季度过一遍 @Disabled/长期跳过的用例，要么修活要么删除并在 kb 登记原因；禁止带病用例无限期躺尸。

---

## 7. 门禁总规则（一页速查）

1. 五道闸顺序不可跳：自查 → CR → CI → 冒烟 → 灰度观测。
2. 红灯三件套（CI 任一 job、buttons/smoke 非 0、pr_guard strict 命中）= 禁止合并，无人可豁免。
3. 高危六域（资金/结算发放/榜单/脱敏时间/定时任务/身份端点）= 强制加签 + 口径前后对比。
4. 修 bug 不带"修复前失败"的回归用例 = 不算修完。
5. 警告放行必须留痕（PR 里写理由），绕过手段只有"收窄规则"没有"忽略注释"。
6. 验证输出要贴结尾行（`BUILD SUCCESS` / `0 error(s)` / `N passed`），管道接 `| tail` 会吞退出码——判定看文字不看 exit code。
7. 上线后 24h 五个哨兵（5xx/对账/挂单/积分/榜单）任一红线即回滚，复盘模板见应急手册 §4.2。
