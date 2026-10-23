// 策略回测竞技场 + 自定义条件编辑器 (2026-10 从 app.js 拆出, 行为不变)。
// 依赖 app.js 全局; duel.js 复用这里的 addCondRow/collectConds/COND_FIELDS/COND_OPS,
// ranking.js 调 loadArenaBoard —— 本文件必须在 app.js 之后、duel.js 之前加载。
// ---------- 策略回测竞技场 ----------

// 回测资金曲线走 qsChart 管家; 数据源 = lastEquityArgs (renderEquityChart 缓存实参)
let lastEquityArgs = null;
const btChartH = qsChart("bt-chart", () =>
    (lastEquityArgs ? buildEquityOption(lastEquityArgs.curve, lastEquityArgs.prev) : null));

// 策略说明含可点击名词, 用 innerHTML 渲染 (内容为本地静态文案, 无注入风险)
const STRATEGY_DESCS = {
  MA_CROSS: {
    zh: '快线上穿慢线（<span class="term" data-term="goldencross">金叉</span>）全仓买入，下穿（<span class="term" data-term="deathcross">死叉</span>）清仓。',
    en: 'Buy all-in when the fast MA crosses above the slow one (<span class="term" data-term="goldencross">golden cross</span>); sell everything on the <span class="term" data-term="deathcross">death cross</span>.',
  },
  MOMENTUM: {
    zh: '收盘价高于 N 天前买入，低于则卖出——赌<span class="term" data-term="momentum">动量</span>延续。',
    en: 'Buy when today\'s close is above N days ago, sell when below — betting on <span class="term" data-term="momentum">momentum</span>.',
  },
  MEAN_REVERSION: {
    zh: '价格跌破均线阈值买入，涨超阈值卖出——赌<span class="term" data-term="meanreversion">均值回归</span>。',
    en: 'Buy when price dips below the MA by the threshold, sell when it rises above — betting on <span class="term" data-term="meanreversion">mean reversion</span>.',
  },
  RSI: {
    zh: '<span class="term" data-term="rsi">RSI</span> 低于买入阈值（超卖）建仓，高于卖出阈值（超买）清仓。',
    en: 'Buy when <span class="term" data-term="rsi">RSI</span> drops below the buy threshold (oversold), sell above the sell threshold (overbought).',
  },
  MACD: {
    zh: '<span class="term" data-term="macd">MACD</span> 柱翻红（DIF 上穿 DEA）买入，翻绿清仓——经典趋势跟随。',
    en: 'Buy when the <span class="term" data-term="macd">MACD</span> histogram turns positive, sell when negative — classic trend following.',
  },
  BOLL: {
    zh: '价格跌破<span class="term" data-term="boll">布林带</span>下轨买入，涨破上轨卖出——波带均值回归。',
    en: 'Buy when price pierces the lower <span class="term" data-term="boll">Bollinger band</span>, sell above the upper band.',
  },
  GRID: {
    zh: '以首日价为基准画<span class="term" data-term="grid">网格</span>：每跌一格加一份仓，每涨一格减一份——震荡市收割机。',
    en: 'A price <span class="term" data-term="grid">grid</span> anchored at day one: add a slice every step down, trim every step up — a range-market harvester.',
  },
  TURTLE: {
    zh: '<span class="term" data-term="turtle">海龟策略</span>：突破 N 日高点买入，跌破 M 日低点离场——趋势突破派鼻祖。',
    en: 'The <span class="term" data-term="turtle">Turtle</span> rules: buy an N-day breakout, exit on an M-day breakdown — the granddaddy of trend systems.',
  },
  DCA: {
    zh: '每隔固定交易日投入一期等额资金（<span class="term" data-term="dca">定投</span>），只买不卖——用纪律代替择时。',
    en: 'Invest an equal slice every fixed interval (<span class="term" data-term="dca">DCA</span>), never selling — discipline instead of timing.',
  },
  BUY_HOLD: {
    zh: '首日<span class="term" data-term="fullposition">全仓</span>买入持有到底，作为对照基准。',
    en: 'Buy <span class="term" data-term="fullposition">all-in</span> on day one and hold to the end — the benchmark.',
  },
  CUSTOM: {
    zh: '自由组合条件：买入 / 卖出条件全部满足时触发（涨跌幅为小数，如 0.03 = 3%）。',
    en: 'Combine your own rules: buy / sell triggers when all its conditions hold (percentages are decimals, e.g. 0.03 = 3%).',
  },
};

// ---------- 自定义策略条件编辑器 ----------

const COND_FIELDS = ["CLOSE", "MA5", "MA20", "PCT_CHANGE", "RSI", "MACD_HIST", "BOLL_UP", "BOLL_MID", "BOLL_LOW"];
const COND_OPS = ["GT", "LT", "CROSS_UP", "CROSS_DOWN"];
const MAX_CONDS = 5;

function condSelect(values, keyPrefix, value) {
  const sel = document.createElement("select");
  sel.dataset.keyPrefix = keyPrefix;
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t(keyPrefix + v);
    sel.appendChild(opt);
  });
  sel.value = value;
  return sel;
}

// 语言切换时刷新已存在条件行的选项文案 (保留选中值; 覆盖竞技场与擂台两种行样式)
function refreshCondLabels() {
  document.querySelectorAll(".cond-row select[data-key-prefix], .duel-cond-row select[data-key-prefix]").forEach((sel) => {
    [...sel.options].forEach((opt) => { opt.textContent = t(sel.dataset.keyPrefix + opt.value); });
  });
  document.querySelectorAll(".cond-del").forEach((btn) => { btn.title = t("arena.delCond"); });
}

// 自定义策略条件行构建器: 竞技场与擂台共用一份 (之前 duel.js 复制了一套,
// 校验口径漂移 + 算子 i18n 前缀写错成 cond.op.*, 2026-10 审计 P4 收敛到这里)
function addCondRow(containerId, preset, opts = {}) {
  const max = opts.max ?? MAX_CONDS;
  const container = $(containerId);
  if (container.children.length >= max) {
    toast(t(opts.maxMsgKey || "cond.max", max));
    return;
  }
  const row = document.createElement("div");
  row.className = opts.rowClass || "cond-row";

  const left = condSelect(COND_FIELDS, "cond.f.", preset.left);
  const op = condSelect(COND_OPS, "cond.o.", preset.op);
  const right = condSelect([...COND_FIELDS, "CONST"], "cond.f.", preset.rightField || "CONST");
  const num = document.createElement("input");
  num.type = "number";
  num.step = "0.01";
  num.value = preset.rightValue ?? 0;
  num.hidden = right.value !== "CONST";
  right.addEventListener("change", () => { num.hidden = right.value !== "CONST"; });

  const del = document.createElement("button");
  del.type = "button";
  del.className = opts.delClass || "cond-del";
  del.textContent = "✕";
  del.title = t("arena.delCond");
  del.addEventListener("click", () => row.remove());

  row.append(left, op, right, num, del);
  container.appendChild(row);
}

function collectConds(containerId) {
  return [...$(containerId).children].map((row) => {
    const [left, op, right, num] = row.children;
    const cond = { left: left.value, op: op.value };
    if (right.value === "CONST") {
      const v = parseFloat(num.value);
      if (Number.isNaN(v)) throw new Error(t("cond.badConst"));
      cond.rightValue = v;
    } else {
      cond.rightField = right.value;
    }
    return cond;
  });
}

function updateStrategyUi() {
  const strategy = $("bt-strategy").value;
  document.querySelectorAll(".bt-param").forEach((el) => {
    el.hidden = el.dataset.for !== strategy;
  });
  $("bt-pos-wrap").hidden = strategy === "BUY_HOLD";
  $("bt-strategy-desc").innerHTML = pick(STRATEGY_DESCS[strategy]);
}

$("bt-pos").addEventListener("input", () => {
  $("bt-pos-val").textContent = $("bt-pos").value + "%";
});

/** 从竞技场表单读出完整回测参数 (runBacktest 与策略分享码共用)。 */
function collectArenaBody(username) {
  const stockCode = $("bt-stock").value;
  const strategy = $("bt-strategy").value;
  const body = { username, stockCode, strategy };
  if (strategy !== "BUY_HOLD") body.positionPct = parseInt($("bt-pos").value, 10);
  if (strategy === "MA_CROSS") {
    body.fastWindow = parseInt($("bt-fast").value, 10);
    body.slowWindow = parseInt($("bt-slow").value, 10);
  } else if (strategy === "MOMENTUM") {
    body.lookbackDays = parseInt($("bt-lookback").value, 10);
  } else if (strategy === "MEAN_REVERSION") {
    body.maWindow = parseInt($("bt-mawin").value, 10);
    body.threshold = parseFloat($("bt-threshold").value);
  } else if (strategy === "RSI") {
    body.rsiPeriod = parseInt($("bt-rsi-period").value, 10);
    body.rsiBuy = parseInt($("bt-rsi-buy").value, 10);
    body.rsiSell = parseInt($("bt-rsi-sell").value, 10);
  } else if (strategy === "MACD") {
    body.macdFast = parseInt($("bt-macd-fast").value, 10);
    body.macdSlow = parseInt($("bt-macd-slow").value, 10);
    body.macdSignal = parseInt($("bt-macd-signal").value, 10);
  } else if (strategy === "BOLL") {
    body.bollWindow = parseInt($("bt-boll-win").value, 10);
    body.bollK = parseFloat($("bt-boll-k").value);
  } else if (strategy === "GRID") {
    body.gridPct = parseFloat($("bt-grid-pct").value);
    body.gridLevels = parseInt($("bt-grid-levels").value, 10);
  } else if (strategy === "TURTLE") {
    body.turtleEntry = parseInt($("bt-turtle-entry").value, 10);
    body.turtleExit = parseInt($("bt-turtle-exit").value, 10);
  } else if (strategy === "DCA") {
    body.lookbackDays = parseInt($("bt-dca-interval").value, 10); // 后端把 lookbackDays 当定投间隔
  } else if (strategy === "CUSTOM") {
    body.buyConditions = collectConds("buy-conds");
    body.sellConditions = collectConds("sell-conds");
  }
  return body;
}

/** 用参数对象回填竞技场表单 (策略分享码导入 / 调参回填共用)。 */
function fillArenaForm(body) {
  if (body.strategy) $("bt-strategy").value = body.strategy;
  if (body.positionPct != null) {
    $("bt-pos").value = body.positionPct;
    $("bt-pos-val").textContent = body.positionPct + "%";
  }
  const set = (id, v) => { if (v != null) $(id).value = v; };
  set("bt-fast", body.fastWindow); set("bt-slow", body.slowWindow);
  set("bt-lookback", body.lookbackDays);
  if (body.strategy === "DCA") set("bt-dca-interval", body.lookbackDays);
  set("bt-mawin", body.maWindow); set("bt-threshold", body.threshold);
  set("bt-rsi-period", body.rsiPeriod); set("bt-rsi-buy", body.rsiBuy); set("bt-rsi-sell", body.rsiSell);
  set("bt-macd-fast", body.macdFast); set("bt-macd-slow", body.macdSlow); set("bt-macd-signal", body.macdSignal);
  set("bt-boll-win", body.bollWindow); set("bt-boll-k", body.bollK);
  set("bt-grid-pct", body.gridPct); set("bt-grid-levels", body.gridLevels);
  set("bt-turtle-entry", body.turtleEntry); set("bt-turtle-exit", body.turtleExit);
  if (body.strategy === "CUSTOM") {
    $("buy-conds").innerHTML = "";
    $("sell-conds").innerHTML = "";
    (body.buyConditions || []).forEach((c) => addCondRow("buy-conds", c));
    (body.sellConditions || []).forEach((c) => addCondRow("sell-conds", c));
  }
  updateStrategyUi();
}

async function loadArenaStocks() {
  try {
    state.arenaStocks = await api("/backtest/stocks");
    renderArenaStockOptions();
  } catch (e) {
    /* 下拉加载失败不打断页面 */
  }
}

function renderArenaStockOptions() {
  const sel = $("bt-stock");
  const prev = sel.value;
  sel.innerHTML = "";
  state.arenaStocks.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.code;
    opt.textContent = `${stockName(s.name, s.code)} (${s.code})${marketTag(s.market)}`;
    sel.appendChild(opt);
  });
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

async function runBacktest() {
  const username = currentUsername();
  const stockCode = $("bt-stock").value;
  if (!stockCode) {
    toast(t("toast.noStock"));
    return;
  }
  const strategy = $("bt-strategy").value;
  let body;
  try {
    body = collectArenaBody(username);
  } catch (e) {
    toast(e.message);
    return;
  }
  if (strategy === "CUSTOM"
      && (!body.buyConditions.length || !body.sellConditions.length)) {
    toast(t("cond.needBoth"));
    return;
  }
  const btn = $("btn-backtest");
  const btnTune = $("btn-tune");
  // 两个按钮互斥禁用 (runTune 已是双禁): 否则回测飞行中点调参, 两个请求并发,
  // 结果面板谁后到谁覆盖, 面板可能描述两次不同的运行
  btn.disabled = true;
  btnTune.disabled = true;
  try {
    const res = await api("/backtest/run", {
      method: "POST",
      body: JSON.stringify(body),
    });
    renderBacktestResult(res);
    $("bt-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
    loadArenaBoard();
    toast(t("toast.btDone"));
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btnTune.disabled = false;
  }
}

const TUNABLE_STRATEGIES = ["MA_CROSS", "MOMENTUM", "MEAN_REVERSION", "RSI", "MACD", "BOLL", "GRID", "TURTLE"];

/** tune 返回的 bestParams (通用键名) -> 表单字段回填映射。 */
const BEST_PARAM_FILL = {
  fast: "bt-fast", slow: "bt-slow", lookback: "bt-lookback",
  maWindow: "bt-mawin", threshold: "bt-threshold",
  rsiPeriod: "bt-rsi-period", rsiBuy: "bt-rsi-buy", rsiSell: "bt-rsi-sell",
  macdFast: "bt-macd-fast", macdSlow: "bt-macd-slow", macdSignal: "bt-macd-signal",
  bollWindow: "bt-boll-win", bollK: "bt-boll-k",
  gridPct: "bt-grid-pct", gridLevels: "bt-grid-levels",
  turtleEntry: "bt-turtle-entry", turtleExit: "bt-turtle-exit",
};

async function runTune() {
  const username = currentUsername();
  const stockCode = $("bt-stock").value;
  if (!stockCode) {
    toast(t("toast.noStock"));
    return;
  }
  const strategy = $("bt-strategy").value;
  if (!TUNABLE_STRATEGIES.includes(strategy)) {
    toast(t("toast.tuneUnsupported"));
    return;
  }
  const btnRun = $("btn-backtest");
  const btnTune = $("btn-tune");
  btnRun.disabled = true;
  btnTune.disabled = true;
  const msg = $("bt-tune-msg");
  msg.hidden = false;
  msg.textContent = t("arena.tuning");
  try {
    const res = await api("/backtest/tune", {
      method: "POST",
      body: JSON.stringify({ username, stockCode, strategy }),
    });
    Object.entries(res.bestParams || {}).forEach(([k, v]) => {
      const id = BEST_PARAM_FILL[k];
      if (id) $(id).value = Number(v);
    });
    if ($("bt-pos-val")) $("bt-pos-val").textContent = $("bt-pos").value + "%";
    msg.textContent = t("arena.tuneMsg", res.triedCount, res.result.params || "--");
    if (window.qsRenderHeatmap) window.qsRenderHeatmap(res);
    renderBacktestResult(res.result);
    $("bt-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
    loadArenaBoard();
  } catch (e) {
    msg.hidden = true;
    toast(e.message);
  } finally {
    btnRun.disabled = false;
    btnTune.disabled = false;
  }
}

function renderBacktestResult(res) {
  state.lastBt = res;
  // 回测完成信号 (生涯任务/桌宠里程碑订阅); overfit = 样本内赚样本外亏, 过拟合预警时刻
  const overfit = res.inSampleReturn != null && res.outSampleReturn != null
    && Number(res.inSampleReturn) > 0 && Number(res.outSampleReturn) < 0;
  document.dispatchEvent(new CustomEvent("qs:backtest", {
    detail: { strategy: res.strategy, totalReturn: Number(res.totalReturn),
      maxDrawdown: Number(res.maxDrawdown), overfit },
  }));
  $("bt-result").hidden = false;
  $("bt-skeleton").hidden = true; // 骨架占位只在首次出结果前存在
  $("bt-title").textContent = `${stockName(res.stockName, res.stockCode)} (${res.stockCode}) · ${t("strat." + res.strategy)}` +
    (res.params ? ` [${res.params}]` : "");
  $("bt-range").textContent = `${res.startDate} ~ ${res.endDate}`;
  $("bt-days").textContent = res.tradingDays;
  setSigned($("bt-return"), Number(res.totalReturn), fmtPct(Number(res.totalReturn)));
  setOptional($("bt-annual"), res.annualReturn, (v) => fmtPct(v), true);
  setOptional($("bt-sharpe"), res.sharpeRatio, (v) => v.toFixed(2), true);
  setDrawdown($("bt-drawdown"), Number(res.maxDrawdown));
  // 顶部三大指标大卡与 dl 同源同步 (一眼结论区, 明细仍看 dl)
  setOptional($("bt-stat-annual"), res.annualReturn, (v) => fmtPct(v), true);
  setOptional($("bt-stat-sharpe"), res.sharpeRatio, (v) => v.toFixed(2), true);
  setDrawdown($("bt-stat-dd"), Number(res.maxDrawdown));
  $("bt-trades").textContent = res.tradeCount;
  setOptional($("bt-winrate"), res.winRate, (v) => (v * 100).toFixed(1) + "%", false);
  setOptional($("bt-vol"), res.volatility, (v) => (v * 100).toFixed(1) + "%", false);
  setOptional($("bt-sortino"), res.sortinoRatio, (v) => v.toFixed(2), true);
  setOptional($("bt-daywin"), res.dayWinRate, (v) => (v * 100).toFixed(1) + "%", false);
  setOptional($("bt-pl"), res.profitLossRatio, (v) => v.toFixed(2), false);
  // 前 70% / 后 30% 分段收益: 两段差距悬殊 = 过拟合预警
  const sample = $("bt-sample");
  if (res.inSampleReturn == null || res.outSampleReturn == null) {
    sample.textContent = "--";
    sample.className = "";
  } else {
    sample.textContent = `${fmtPct(Number(res.inSampleReturn))} → ${fmtPct(Number(res.outSampleReturn))}`;
    sample.className = Number(res.outSampleReturn) >= 0 ? "pos" : "neg";
  }
  setSigned($("bt-hold"), Number(res.holdReturn), fmtPct(Number(res.holdReturn)));

  const verdict = $("bt-verdict");
  const diff = Number(res.totalReturn) - Number(res.holdReturn);
  if (res.strategy === "BUY_HOLD") {
    verdict.textContent = "";
    verdict.className = "verdict";
  } else if (diff > 0) {
    verdict.textContent = t("bt.win", fmtPct(diff));
    verdict.className = "verdict win";
  } else if (diff < 0) {
    verdict.textContent = t("bt.lose", fmtPct(diff));
    verdict.className = "verdict lose";
  } else {
    verdict.textContent = t("bt.tie");
    verdict.className = "verdict";
  }

  // 双策略对比: 记录上一次 (不同的) 回测曲线, 勾选后叠加到图上
  if (!lastBtRun || lastBtRun.id !== res.backtestId) {
    prevBtRun = lastBtRun;
    lastBtRun = {
      id: res.backtestId,
      label: `${t("strat." + res.strategy)}${res.params ? " [" + res.params + "]" : ""}`,
      curve: res.equityCurve.map((p) => p.strategy),
    };
  }
  renderEquityChart(res.equityCurve, prevBtRun);
}

// 最近/上一次回测的资金曲线 (「叠加上次曲线」对比用, 主题重绘不滚动窗口)
let lastBtRun = null;
let prevBtRun = null;

// 最大回撤为正数分数, 展示为负百分比; 为 0 时不带负号也不标红
function setDrawdown(el, dd) {
  el.textContent = dd > 0 ? "-" + (dd * 100).toFixed(2) + "%" : "0.00%";
  el.className = dd > 0 ? "neg" : "";
}

function setOptional(el, value, fmt, signed) {
  if (value == null) {
    el.textContent = "--";
    el.className = "";
    return;
  }
  const v = Number(value);
  if (signed) {
    setSigned(el, v, fmt(v));
  } else {
    el.textContent = fmt(v);
    el.className = "";
  }
}

function renderEquityChart(curve, prev) {
  lastEquityArgs = { curve, prev };
  btChartH.refresh();
}

function buildEquityOption(curve, prev) {
  const overlay = prev && $("bt-compare").checked && prev.curve.length;
  const legendData = [t("bt.legendStrategy"), t("bt.legendHold")];
  if (overlay) legendData.push(t("bt.legendPrev", prev.label));
  return ({
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      backgroundColor: COLORS.panel,
      borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      valueFormatter: (v) => fmtMoney(v) + t("unit.money"),
    },
    legend: {
      data: legendData,
      textStyle: { color: COLORS.muted },
      top: 0,
    },
    grid: { left: 70, right: 20, top: 32, bottom: 40 },
    xAxis: {
      type: "category",
      data: curve.map((p) => p.date),
      axisLine: { lineStyle: { color: COLORS.border } },
      axisLabel: { color: COLORS.muted },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
      axisLabel: { color: COLORS.muted },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", bottom: 0, height: 18,
        borderColor: COLORS.border, textStyle: { color: COLORS.muted } },
    ],
    series: [
      { name: t("bt.legendStrategy"), type: "line", data: curve.map((p) => p.strategy),
        showSymbol: false, lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { name: t("bt.legendHold"), type: "line", data: curve.map((p) => p.hold),
        showSymbol: false, lineStyle: { width: 2, color: COLORS.ma5, type: "dashed" }, itemStyle: { color: COLORS.ma5 } },
      ...(overlay ? [{ name: t("bt.legendPrev", prev.label), type: "line", data: prev.curve,
        showSymbol: false, lineStyle: { width: 1.5, color: COLORS.accent2, opacity: 0.8 },
        itemStyle: { color: COLORS.accent2 } }] : []),
    ],
  });
}

async function loadArenaBoard() {
  try {
    state.arenaRows = await api("/backtest/leaderboard" + (window.qsSeason ? "?season=" + window.qsSeason : ""));
    renderArenaBoard();
  } catch (e) {
    /* 排行榜加载失败不打断页面 */
  }
}

function renderArenaBoard() {
  const rows = state.arenaRows;
  if (!rows) return;
  qsRenderRows($("arena-board").querySelector("tbody"), rows, 8, "arena.empty", (r, i) => {
    const tr = document.createElement("tr");
    const rate = Number(r.totalReturn);
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td></td>
      <td></td>
      <td>${t("strat." + r.strategy)}</td>
      <td class="param-cell"></td>
      <td>${r.sharpeRatio == null ? "--" : Number(r.sharpeRatio).toFixed(2)}</td>
      <td></td>
      <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>`;
    tr.children[1].textContent = r.username;
    tr.children[2].textContent = `${stockName(r.stockName, r.stockCode)} (${r.stockCode})`;
    tr.children[4].textContent = r.params || "--";
    setDrawdown(tr.children[6], Number(r.maxDrawdown));
    return tr;
  });
}

$("bt-strategy").addEventListener("change", updateStrategyUi);
$("btn-backtest").addEventListener("click", runBacktest);
$("btn-tune").addEventListener("click", runTune);
$("btn-add-buy").addEventListener("click", () => addCondRow("buy-conds", { left: "CLOSE", op: "GT", rightField: "MA20" }));
$("btn-add-sell").addEventListener("click", () => addCondRow("sell-conds", { left: "CLOSE", op: "LT", rightField: "MA20" }));
// 默认预置经典金叉策略, 开箱即用
addCondRow("buy-conds", { left: "MA5", op: "CROSS_UP", rightField: "MA20" });
addCondRow("sell-conds", { left: "MA5", op: "CROSS_DOWN", rightField: "MA20" });
updateStrategyUi();
loadArenaStocks();
loadArenaBoard();
