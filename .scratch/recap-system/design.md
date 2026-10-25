# 赛后交易复盘系统 — 指标字典 / 报告结构 / 数据缺口 / 实施计划（分析稿，未改码）

2026-10-26。原则：全部指标基于真实落库数据可复算；样本不足显式降级（复用 BiasVerdict.insufficient 模式）；不把相关性写成因果。

## 0. 现有资产盘点（复盘系统的地基，大部分已存在）

- 数据：`trade_transactions`（价/量/费/理由/订单号/交易日）、`positions`（shares/avgCost）、`game_sessions` 结算列（finalReturnRate/finalSharpe/bias_report/equity_curve）、`daily_price`、`pending_orders`。
- 计算：`GameBenchmarks.riskMetrics`（RiskMath: maxDrawdown/volatility/sharpe/sortino/日胜率/日盈亏比）、三基准（买入持有/均线交叉/定投）、`LedgerReplay`（逐日重放内核，undo/计息/曲线同源）、`MeSummaryService.pairTrades`（均价法逐笔配对，P2 已入库）。
- 呈现：`SettleResponse`（24 字段）+ `replay.js` 复盘弹窗 + bias 报告 + journal（理由 vs 结果）。
- 关键规则：**成交只按收盘价**（security-lessons 钉死）→ 本模拟器不存在滑点自由度。

## 1. 指标字典

> 通用约定：金额 BigDecimal scale 2 HALF_UP，比率 scale 4；曲线 = `LedgerReplay` 重放的逐日净值（含期初本金首点）；"窗口" = startIdx..settleIdx 交易日序列。

| # | 指标 | 公式 | 数据依赖 | 边界情况 | 测试案例 |
|---|---|---|---|---|---|
| 1 | 收益率 returnRate | (期末净值 − 期初本金) / 期初本金；期末净值 = 现金 + Σ持仓×结算收盘（空头为负） | account, positions, 结算日 close | 结算日行情缺失→拒结算（已有）；强平局照常计算并标记 liquidated | 10 万本金、持 100 股成本 100、结算收盘 110、现金 89,995 → (100,995−100,000)/100,000 = 0.995% |
| 2 | 逐笔胜率 tradeWinRate | 均价法配对：每笔减仓 = 一次平仓；胜 = 实现盈亏(含费摊)>0；胜率 = 胜/平仓数 | trade_transactions（按局内时序） | 0 次平仓 → 显示"无平仓样本"而非 0%；反手只对平掉部分计一次；多空对称 | `MeSummaryServiceTest` 已有 4 例（加仓摊薄/费吃价差/部分平仓/反手） |
| 3 | 逐笔盈亏比 profitLossRatio | Σ盈利平仓盈额/盈次 ÷ Σ亏损平仓亏额/亏次（平均盈 ÷ 平均亏，取绝对值） | 同 #2（需扩展 pairTrades 累计盈亏金额） | 无亏损平仓 → 显示"∞（无亏损样本）"；无盈利 → 0；总平仓 <5 → 标 insufficient | 两胜(+200,+400)一负(−300) → (300)/(300) = 1.0 |
| 4 | 最大回撤 maxDrawdown | 净值曲线峰谷最大跌幅 max((peak−v)/peak)，峰滚动更新 | equityCurve（LedgerReplay） | 单调上涨 → 0；曲线不可得（组合旧流水缺 stock_id）→ null 不展示；首点即本金 | 10万→12万→9万→11万 → 25%（`MeSummaryServiceTest` 已钉） |
| 5 | 回撤曲线 ddCurve | dd_t = (rollingPeak_t − v_t)/rollingPeak_t，逐日序列 | 同 #4 | 全程 0 回撤 → 一条 0 线照常画（不是无数据） | 上例逐日 dd = [0,0,.25,.0833] |
| 6 | 已实现盈亏 realizedPnl | Σ各笔平仓 (平仓价−均价)×量 −（买卖手续费+利税全额，含未平部分的买入费） | #2 配对结果 + fee 列 | 口径声明：手续费全额计入已实现侧（而非按持仓摊到未实现），保证 #6+#7+#8 恒等式成立 | 买100股@100费5、卖100@110费6 → realized = 1000−11 = 989 |
| 7 | 未实现盈亏 unrealizedPnl | Σ结算时点持仓 (结算收盘 − avgCost)×shares（空头取反）；avgCost 为不含费裸均价 | positions, 结算日 close | 无持仓 → 0；avgCost=0（异常数据）→ 跳过该票并标注 | 持 100 股 avgCost 100、收盘 103 → +300 |
| 8 | 费用合计 costs | Σfee（佣金+印花税，FeeCalculator 已并入 fee 列）+ interestTotal（融资利息，结算已单列） | trade_transactions.fee, SettleResponse.interestTotal | 防重复计算恒等式（测试钉死）：**returnRate×本金 = realized + unrealized − interest**（fee 已在 realized 内，不再单独相减） | 全流水 fee 求和 = sumFeesBySessionId（已有查询）对拍 |
| 9 | 滑点 | **不展示**。撮合规则只按收盘价成交（无盘口模型），滑点自由度在规则内不存在；报告中以"费用说明"一句话声明，而非显示 0 冒充计算过 | — | — | — |
| 10 | 持仓集中度 concentration | 结算时点 max(单票市值)/总持仓市值；组合(PORTFOLIO)模式专属 | positions × 结算收盘 | 经典单票模式恒 100% 无信息量 → 不展示；空仓 → 不展示；逐日集中度序列留二期（需 LedgerReplay 加持仓快照出口） | 三票市值 5/3/2 万 → 50% |
| 11 | 基准对比 | 已有三基准（买入持有/均线交叉/定投）+ AI 对手收益，超额 = returnRate − 基准 | SettleResponse 现成字段 | 基准不可得（窗口缺索引）→ null 已处理 | 现有集成测试覆盖 |
| 12 | 日粒度风险组 | RiskMath 现有 sharpe/sortino/volatility/日胜率——**命名区分**：日胜率(正收益交易日占比) ≠ 逐笔胜率(#2)，报告里分别标注口径 | equityCurve | 窗口 <2 日 → 全 null | RiskMath 已有实现与既有测试 |

## 2. 盈亏分解恒等式（防重复计算的总闸）

```
finalAssets − initialCash
  = realizedPnl(含全部 fee) + unrealizedPnl − interestTotal
```
单测以随机流水重放验证恒等式（容差 1 分钱内），谁改口径谁先把这条测试弄绿。

## 3. 复盘报告结构（扩展现有 recap 弹窗，不另起炉灶）

```
① 收益分解条   finalAssets · returnRate · [已实现 | 未实现 | 费用 | 利息] 四段彩条
② 曲线区       资产曲线(已有) + 回撤曲线(新, 同轴副图) + 三基准/AI 叠线(已有)
③ 交易质量     逐笔胜率 · 盈亏比 · 平仓笔数 · 逐笔配对表(新):
               每行 = 开仓均价→平仓价 · 量 · 持有天数 · 盈亏(含费摊) · 当笔理由(journal 已有)
④ 风险暴露     maxDD · 回撤区间标注 · 波动/夏普/索提诺(已有) · 集中度(组合模式)
⑤ 行为诊断     bias 报告(已有, 原样)
⑥ 结论区       「数据支持的事实」与「无法归因」两栏, 见 §4
```

## 4. 结论生成规则（相关 ≠ 因果）

- 只输出**可由本局数据直接复算的陈述**：如"3 笔卖出后标的 5 日内平均再涨 2.1%（卖早了 _的事实_）"；禁止输出"因为恐慌所以卖早"这类归因——动机归因只允许出现在 bias 报告（它自带 insufficient 护栏与"倾向"措辞）。
- 每条结论挂样本数；样本 <5 笔 → 整条替换为"样本不足（N 笔），不足以判断"。
- 固定提供一栏「无法确定」：运气 vs 水平（单局无法区分）、滑点影响（规则内不存在）、未走出的反事实路径。文案进 i18n 双语。

## 5. 数据缺口（按真实缺失程度排序）

| 缺口 | 现状 | 补法 |
|---|---|---|
| G1 逐笔配对明细 | pairTrades 只返回 (closed, wins) 计数 | 扩展返回 List<ClosedTrade>(entryAvg, exitPrice, qty, pnl, holdDays, direction)——纯内存扩展, 无新表 |
| G2 平均盈/亏金额（盈亏比#3） | 未累计 | 同 G1 一起扩展 |
| G3 回撤曲线 | 只有 maxDrawdown 标量 | 前端由 equityCurve 现算（纯展示层） |
| G4 集中度 | 无 | 结算时点由 positions×close 现算；逐日序列二期 |
| G5 卖后走势（结论区事实） | 无 | 结算时服务端对每笔 SELL 查后 5 日收盘（窗口内数据已在缓存） |
| 非缺口 | 滑点（规则不存在）、资产曲线/基准/bias/journal/风险组（全部已有） | — |

## 6. 实施计划

- **P0（后端口径 + 恒等式）**：pairTrades 扩展为明细版（G1/G2，兼容 /me/summary 现调用）；新 `RecapService.breakdown(sessionId)`：盈亏四分解 + 恒等式；`GET /api/game/{id}/recap`（属主校验——读 security-lessons 的 /{id}/ 规则）；恒等式随机重放单测 + 指标字典 #1–#8 各边界用例。
- **P1（报告呈现）**：recap 弹窗加 ①③④ 区（回撤曲线前端现算；逐笔表 + journal 理由合流；集中度仅组合模式）；i18n 双语；ui_check/buttons/截图证据。
- **P2（结论区）**：G5 卖后走势事实 + 「无法确定」栏 + 样本不足降级；二期再看逐日集中度。
- 验收：`mvn -B test` 全绿（含恒等式）；一局含多空/部分平仓的真实对局结算后，报告四分解之和与 finalAssets−initialCash 对拍一致（⑥ 截图 + 数字手算）；0 平仓局显示"无平仓样本"。

## 7. 明确不做

- 滑点/市场冲击模型（与"只按收盘价"的既定撮合规则冲突）；
- 跨局策略归因（单局样本在统计上不支持，人生维度已有 /me/summary 与 bias 档案）；
- 另建复盘落库表（全部指标可由现有落库数据复算，结算响应即席计算足够）。
