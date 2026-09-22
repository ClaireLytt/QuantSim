const API = "/api";

// 图表用色统一取自 style.css 的 CSS 变量, 避免两处维护
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 主题必须在读取 COLORS 前应用, 否则图表首帧取到错误配色
let THEME = "dark";
try { if (localStorage.getItem("qs_theme") === "light") THEME = "light"; } catch (e) { /* 隐私模式下忽略 */ }
document.documentElement.dataset.theme = THEME;

const COLORS = {
  up: cssVar("--up"),
  down: cssVar("--down"),
  ma5: cssVar("--ma5"),
  ma20: cssVar("--ma20"),
  text: cssVar("--text"),
  muted: cssVar("--text-muted"),
  border: cssVar("--border"),
  panel: cssVar("--panel-raised"),
};

const state = {
  sessionId: null,
  klines: [],
  trades: [],
  totalTicks: 20,
  startDate: null,
  settled: false,
  lotSize: 100,
  stockName: "",
  stockCode: "",
  market: "",
  aiLevel: "",
  daysElapsed: 0,
  // 语言切换时重渲染动态区域所需的缓存
  lastStatus: null,
  lastSettle: null,
  lastBt: null,
  lbRows: null,
  arenaRows: null,
  arenaStocks: [],
};

const $ = (id) => document.getElementById(id);
const chart = echarts.init($("chart"));
window.addEventListener("resize", () => chart.resize());

const fmtMoney = (v) => Number(v).toLocaleString(LANG === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";

function marketTag(market) {
  if (market === "CRYPTO") return t("tag.crypto");
  if (market === "US") return t("tag.us");
  return "";
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

async function api(path, options = {}) {
  const resp = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  // 非 JSON 响应 (502 HTML / 空体) 不能让解析错误盖过真实失败原因
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error((data && data.message) || t("err.http", resp.status));
  }
  if (data === null) {
    throw new Error(t("err.badResp"));
  }
  return data;
}

// 请求进行中禁止重复提交 (防止双击"下一天"导致前后端天数错位)
let busy = false;
async function guarded(fn) {
  if (busy) return;
  busy = true;
  setTradeEnabled(false);
  try {
    await fn();
  } finally {
    busy = false;
    if (!state.settled) setTradeEnabled(true);
  }
}

// ---------- 图表 ----------

function chartData() {
  return {
    dates: state.klines.map((k) => k.tradeDate),
    candles: state.klines.map((k) => [k.open, k.close, k.low, k.high]),
    ma5: state.klines.map((k) => k.ma5),
    ma20: state.klines.map((k) => k.ma20),
    volumes: state.klines.map((k) => ({
      value: k.volume,
      itemStyle: { color: k.close >= k.open ? COLORS.up : COLORS.down, opacity: 0.55 },
    })),
  };
}

// tick 后只增量更新数据 (merge 模式), 不做整图重建
function updateChartData() {
  const { dates, candles, ma5, ma20, volumes } = chartData();
  chart.setOption({
    xAxis: [{ data: dates }, { data: dates }],
    series: [
      { data: candles },
      { data: ma5 },
      { data: ma20 },
      { data: volumes },
    ],
  });
}

function renderChart() {
  const { dates, candles, ma5, ma20, volumes } = chartData();

  chart.setOption({
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: COLORS.panel,
      borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      formatter(params) {
        const bar = state.klines[params[0].dataIndex];
        if (!bar) return "";
        const pct = bar.pctChange == null ? "--" : fmtPct(Number(bar.pctChange));
        return [
          `<b>${bar.tradeDate}</b>`,
          `${t("chart.open")} ${bar.open}  ${t("chart.close")} ${bar.close}`,
          `${t("chart.low")} ${bar.low}  ${t("chart.high")} ${bar.high}`,
          `${t("chart.pct")} ${pct}`,
          `MA5 ${bar.ma5 ?? "--"}  MA20 ${bar.ma20 ?? "--"}`,
          `${t("chart.volume")} ${Number(bar.volume).toLocaleString()}`,
        ].join("<br>");
      },
    },
    legend: {
      data: [t("chart.kline"), "MA5", "MA20"],
      textStyle: { color: COLORS.muted },
      top: 0,
    },
    grid: [
      { left: 60, right: 20, top: 32, height: "58%" },
      { left: 60, right: 20, top: "74%", height: "16%" },
    ],
    xAxis: [
      {
        type: "category", data: dates, gridIndex: 0,
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted },
      },
      {
        type: "category", data: dates, gridIndex: 1,
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true, gridIndex: 0,
        splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
        axisLabel: { color: COLORS.muted },
      },
      {
        gridIndex: 1,
        splitLine: { show: false },
        axisLabel: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 },
      { type: "slider", xAxisIndex: [0, 1], bottom: 0, height: 18,
        borderColor: COLORS.border, textStyle: { color: COLORS.muted } },
    ],
    series: [
      {
        name: t("chart.kline"),
        type: "candlestick",
        data: candles,
        // 上涨空心、下跌实心: 除颜色外的第二重涨跌编码
        itemStyle: {
          color: "transparent",
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down,
          borderWidth: 1.5,
        },
        markLine: state.startDate ? {
          symbol: "none",
          label: { formatter: t("chart.start"), color: COLORS.muted },
          lineStyle: { color: COLORS.muted, type: "dashed" },
          data: [{ xAxis: state.startDate }],
        } : undefined,
      },
      { name: "MA5", type: "line", data: ma5, smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: "MA20", type: "line", data: ma20, smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { name: t("chart.volume"), type: "bar", data: volumes, xAxisIndex: 1, yAxisIndex: 1, barWidth: "60%" },
    ],
  }, { notMerge: true });
}

// ---------- 游戏流程 ----------

function renderStockLabel() {
  if (!state.stockName) return;
  $("stock-label").textContent = `${stockName(state.stockName, state.stockCode)} (${state.stockCode})${marketTag(state.market)}`;
}

function updateDayLabel() {
  $("day-label").textContent = t("session.day", state.daysElapsed, state.totalTicks);
}

function renderAiLevelLabel() {
  $("ai-level-label").textContent =
    state.aiLevel ? t("ailevel." + state.aiLevel.toLowerCase()) : "";
}

async function startGame() {
  const username = $("username").value.trim();
  if (!username) {
    toast(t("toast.needUsername"));
    return;
  }
  try {
    const market = $("market-select").value;
    const aiLevel = $("ai-level-select").value;
    const body = { username, aiLevel };
    if (market) body.market = market;
    const res = await api("/game/start", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.sessionId = res.sessionId;
    state.totalTicks = res.totalTicks;
    state.startDate = res.startDate;
    state.settled = false;
    state.lotSize = res.lotSize;
    state.stockName = res.stockName;
    state.stockCode = res.stockCode;
    state.market = res.market;
    state.aiLevel = res.aiLevel;
    state.daysElapsed = 0;
    state.lastStatus = null;
    state.lastSettle = null;
    state.trades = [];

    switchView("game");
    $("game-intro").hidden = true;
    $("game-area").hidden = false;
    $("settle-card").hidden = true;
    renderStockLabel();
    updateDayLabel();
    renderAiLevelLabel();
    const reviewBox = $("review-text");
    reviewBox.hidden = true;
    reviewBox.textContent = "";
    $("btn-review").hidden = true;
    $("btn-recap").hidden = true;
    const sharesInput = $("trade-shares");
    sharesInput.step = res.lotSize;
    sharesInput.min = res.lotSize;
    sharesInput.value = res.lotSize;
    const advisorBox = $("advisor-text");
    advisorBox.hidden = true;
    advisorBox.textContent = "";
    setTradeEnabled(true);

    await loadHistory();
    await refreshStatus();
    toast(t("toast.gameStart", fmtMoney(res.initialCash), t("unit.money")));
  } catch (e) {
    toast(e.message);
  }
}

async function loadHistory() {
  const res = await api(`/game/${state.sessionId}/history`);
  state.klines = res.klines;
  renderChart();
  updateSessionBar(res.currentTradeDate);
  syncTradeInputs();
}

async function tick() {
  try {
    const res = await api(`/game/${state.sessionId}/tick`, { method: "POST" });
    state.klines.push(res.newBar);
    updateChartData();
    updateSessionBar(res.currentTradeDate, res.daysElapsed);
    syncTradeInputs();
    // 后端已内嵌账户快照, 无需再请求 /status
    renderStatus(res.status);
    if (res.settled) {
      showSettle(res.settleResult);
    }
  } catch (e) {
    toast(e.message);
  }
}

async function trade(direction) {
  const price = parseFloat($("trade-price").value);
  const shares = parseInt($("trade-shares").value, 10);
  if (!price || !shares || shares <= 0) {
    toast(t("toast.invalidTrade"));
    return;
  }
  if (shares % state.lotSize !== 0) {
    toast(t("toast.lotMultiple", state.lotSize));
    return;
  }
  try {
    await api(`/game/${state.sessionId}/trade`, {
      method: "POST",
      body: JSON.stringify({ direction, price, shares }),
    });
    // 复盘报告需要在前端记录每笔成交对应的 K 线位置
    const idx = state.klines.length - 1;
    state.trades.push({ idx, date: state.klines[idx].tradeDate, dir: direction, price, shares });
    toast(t(direction === "BUY" ? "toast.buyOk" : "toast.sellOk", shares));
    await refreshStatus();
  } catch (e) {
    toast(e.message);
  }
}

async function settle() {
  try {
    const res = await api(`/game/${state.sessionId}/settle`, { method: "POST" });
    showSettle(res);
  } catch (e) {
    toast(e.message);
  }
}

async function askReview() {
  const btn = $("btn-review");
  const box = $("review-text");
  btn.disabled = true;
  box.hidden = false;
  box.textContent = t("review.thinking");
  try {
    const res = await api(`/game/${state.sessionId}/review?lang=${LANG}`, { method: "POST" });
    box.textContent = res.advice;
  } catch (e) {
    box.hidden = true;
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function askAdvisor() {
  const box = $("advisor-text");
  box.hidden = false;
  box.textContent = t("ai.thinking");
  try {
    const res = await api(`/game/${state.sessionId}/advisor?lang=${LANG}`, { method: "POST" });
    box.textContent = res.advice;
  } catch (e) {
    box.hidden = true;
    toast(e.message);
  }
}

async function refreshStatus() {
  renderStatus(await api(`/game/${state.sessionId}/status`));
}

function renderStatus(s) {
  state.lastStatus = s;
  $("st-cash").textContent = fmtMoney(s.cashBalance);
  $("st-shares").textContent = s.holdingShares;
  $("st-cost").textContent = fmtMoney(s.holdingCost);
  $("st-price").textContent = fmtMoney(s.currentPrice);
  $("st-value").textContent = fmtMoney(s.marketValue);
  $("st-total").textContent = fmtMoney(s.totalAssets);
  setSigned($("st-pnl"), Number(s.floatingPnl), fmtMoney(Math.abs(s.floatingPnl)));
  setSigned($("st-return"), Number(s.returnRate), fmtPct(Number(s.returnRate)));
  state.daysElapsed = s.daysElapsed;
  state.totalTicks = s.totalTicks;
  updateDayLabel();
  renderAi(s.prediction, s.ai);
}

function renderAi(pred, ai) {
  const dir = $("ai-pred-dir");
  const fill = $("ai-conf-fill");
  const text = $("ai-conf-text");
  if (pred) {
    const up = pred.direction === "UP";
    const prob = Number(pred.probUp);
    dir.textContent = up ? t("ai.up") : t("ai.down");
    dir.className = up ? "pos" : "neg";
    const conf = up ? prob : 1 - prob;
    fill.style.width = (conf * 100).toFixed(1) + "%";
    fill.style.background = up ? COLORS.up : COLORS.down;
    // 置信度是可点击的名词解释
    text.innerHTML = termSpan("confidence") + t("ai.conf", (conf * 100).toFixed(1), (prob * 100).toFixed(1));
  } else {
    dir.textContent = "--";
    dir.className = "";
    fill.style.width = "0";
    text.textContent = t("ai.noPred");
  }
  if (ai) {
    $("ai-total").textContent = fmtMoney(ai.totalAssets);
    $("ai-shares").textContent = ai.shares;
    setSigned($("ai-return"), Number(ai.returnRate), fmtPct(Number(ai.returnRate)));
  } else {
    $("ai-total").textContent = "--";
    $("ai-shares").textContent = "--";
    const ret = $("ai-return");
    ret.textContent = "--";
    ret.className = "";
  }
}

function setSigned(el, value, text) {
  el.textContent = (value > 0 ? "+" : value < 0 ? "-" : "") + text.replace(/^[+-]/, "");
  el.className = value > 0 ? "pos" : value < 0 ? "neg" : "";
}

function updateSessionBar(currentDate, daysElapsed) {
  $("date-label").textContent = currentDate;
  if (daysElapsed != null) {
    state.daysElapsed = daysElapsed;
    updateDayLabel();
  }
}

function syncTradeInputs() {
  const last = state.klines[state.klines.length - 1];
  if (last) {
    $("trade-price").value = last.close;
    $("price-range").textContent = t("trade.range", last.low, last.high);
  }
}

function showSettle(result) {
  state.settled = true;
  setTradeEnabled(false);
  renderSettle(result);
  toast(t("settle.done"));
  loadLeaderboard();
  document.dispatchEvent(new CustomEvent("qs:settled", { detail: result }));
}

function renderSettle(result) {
  state.lastSettle = result;
  $("settle-card").hidden = false;
  $("settle-initial").textContent = fmtMoney(result.initialCash) + t("unit.money");
  $("settle-final").textContent = fmtMoney(result.finalAssets) + t("unit.money");
  const el = $("settle-return");
  el.textContent = fmtPct(Number(result.returnRate));
  el.className = Number(result.returnRate) >= 0 ? "pos" : "neg";
  renderComparison(result);
  renderSettleExtras(result);
}

function renderSettleExtras(result) {
  const styleEl = $("settle-style");
  if (result.styleTag) {
    styleEl.hidden = false;
    styleEl.textContent = t("settle.style", t("style." + result.styleTag));
  } else {
    styleEl.hidden = true;
  }

  const days = result.predictionDays || [];
  const predBox = $("settle-pred");
  if (days.length === 0) {
    predBox.hidden = true;
  } else {
    predBox.hidden = false;
    const hit = days.filter((d) => d.correct).length;
    $("settle-pred-rate").textContent =
      t("settle.predRate", hit, days.length, ((hit / days.length) * 100).toFixed(0));
    const dots = $("settle-pred-dots");
    dots.innerHTML = "";
    days.forEach((d) => {
      const dot = document.createElement("span");
      dot.className = "pred-dot " + (d.correct ? "hit" : "miss");
      dot.title = `${d.date} ${t(d.predictedUp ? "ai.up" : "ai.down")} · ${t(d.correct ? "settle.hit" : "settle.miss")}`;
      dots.appendChild(dot);
    });
  }

  $("btn-review").hidden = false;
  $("btn-recap").hidden = false;
}

function renderComparison(result) {
  const setCell = (id, rate) => {
    const cell = $(id);
    if (rate == null) {
      cell.textContent = "--";
      cell.className = "";
    } else {
      const v = Number(rate);
      cell.textContent = fmtPct(v);
      cell.className = v >= 0 ? "pos" : "neg";
    }
  };
  setCell("cmp-you", result.returnRate);
  setCell("cmp-ai", result.aiReturnRate);
  setCell("cmp-hold", result.holdReturnRate);
  setCell("cmp-ma", result.maCrossReturnRate);

  const verdict = $("settle-verdict");
  if (result.aiReturnRate == null) {
    verdict.textContent = "";
    return;
  }
  const you = Number(result.returnRate);
  const aiR = Number(result.aiReturnRate);
  if (you > aiR) {
    verdict.textContent = t("verdict.win");
    verdict.className = "verdict win";
  } else if (you < aiR) {
    verdict.textContent = t("verdict.lose");
    verdict.className = "verdict lose";
  } else {
    verdict.textContent = t("verdict.tie");
    verdict.className = "verdict";
  }
}

function setTradeEnabled(enabled) {
  ["btn-buy", "btn-sell", "btn-tick", "btn-settle", "btn-advisor"].forEach((id) => {
    $(id).disabled = !enabled;
  });
}

async function loadLeaderboard() {
  try {
    state.lbRows = await api("/leaderboard");
    renderLeaderboard();
  } catch (e) {
    /* 排行榜加载失败不打断游戏 */
  }
}

function renderLeaderboard() {
  const rows = state.lbRows;
  if (!rows) return;
  const tbody = $("leaderboard").querySelector("tbody");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row"></td></tr>`;
    tbody.querySelector(".empty-row").textContent = t("lb.empty");
    return;
  }
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    const rate = Number(r.returnRate);
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td></td>
      <td></td>
      <td>${r.startDate}</td>
      <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>`;
    tr.children[1].textContent = r.username;
    tr.children[2].textContent = stockName(r.stockName, r.stockCode);
    tbody.appendChild(tr);
  });
}

// ---------- 策略回测竞技场 ----------

const btChart = echarts.init($("bt-chart"));
window.addEventListener("resize", () => btChart.resize());

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

const COND_FIELDS = ["CLOSE", "MA5", "MA20", "PCT_CHANGE"];
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

// 语言切换时刷新已存在条件行的选项文案 (保留选中值)
function refreshCondLabels() {
  document.querySelectorAll(".cond-row select[data-key-prefix]").forEach((sel) => {
    [...sel.options].forEach((opt) => { opt.textContent = t(sel.dataset.keyPrefix + opt.value); });
  });
  document.querySelectorAll(".cond-del").forEach((btn) => { btn.title = t("arena.delCond"); });
}

function addCondRow(containerId, preset) {
  const container = $(containerId);
  if (container.children.length >= MAX_CONDS) {
    toast(t("cond.max", MAX_CONDS));
    return;
  }
  const row = document.createElement("div");
  row.className = "cond-row";

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
  del.className = "cond-del";
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
  $("bt-strategy-desc").innerHTML = pick(STRATEGY_DESCS[strategy]);
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
  const username = $("username").value.trim();
  if (!username) {
    toast(t("toast.needUsernameTop"));
    return;
  }
  const stockCode = $("bt-stock").value;
  if (!stockCode) {
    toast(t("toast.noStock"));
    return;
  }
  const strategy = $("bt-strategy").value;
  const body = { username, stockCode, strategy };
  if (strategy === "MA_CROSS") {
    body.fastWindow = parseInt($("bt-fast").value, 10);
    body.slowWindow = parseInt($("bt-slow").value, 10);
  } else if (strategy === "MOMENTUM") {
    body.lookbackDays = parseInt($("bt-lookback").value, 10);
  } else if (strategy === "MEAN_REVERSION") {
    body.maWindow = parseInt($("bt-mawin").value, 10);
    body.threshold = parseFloat($("bt-threshold").value);
  } else if (strategy === "CUSTOM") {
    try {
      body.buyConditions = collectConds("buy-conds");
      body.sellConditions = collectConds("sell-conds");
    } catch (e) {
      toast(e.message);
      return;
    }
    if (body.buyConditions.length === 0 || body.sellConditions.length === 0) {
      toast(t("cond.needBoth"));
      return;
    }
  }
  const btn = $("btn-backtest");
  btn.disabled = true;
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
  }
}

const TUNABLE_STRATEGIES = ["MA_CROSS", "MOMENTUM", "MEAN_REVERSION"];

async function runTune() {
  const username = $("username").value.trim();
  if (!username) {
    toast(t("toast.needUsernameTop"));
    return;
  }
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
    if (res.fastWindow != null) $("bt-fast").value = res.fastWindow;
    if (res.slowWindow != null) $("bt-slow").value = res.slowWindow;
    if (res.lookbackDays != null) $("bt-lookback").value = res.lookbackDays;
    if (res.maWindow != null) $("bt-mawin").value = res.maWindow;
    if (res.threshold != null) $("bt-threshold").value = Number(res.threshold);
    msg.textContent = t("arena.tuneMsg", res.triedCount, res.result.params || "--");
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
  $("bt-result").hidden = false;
  $("bt-title").textContent = `${stockName(res.stockName, res.stockCode)} (${res.stockCode}) · ${t("strat." + res.strategy)}` +
    (res.params ? ` [${res.params}]` : "");
  $("bt-range").textContent = `${res.startDate} ~ ${res.endDate}`;
  $("bt-days").textContent = res.tradingDays;
  setSigned($("bt-return"), Number(res.totalReturn), fmtPct(Number(res.totalReturn)));
  setOptional($("bt-annual"), res.annualReturn, (v) => fmtPct(v), true);
  setOptional($("bt-sharpe"), res.sharpeRatio, (v) => v.toFixed(2), true);
  setDrawdown($("bt-drawdown"), Number(res.maxDrawdown));
  $("bt-trades").textContent = res.tradeCount;
  setOptional($("bt-winrate"), res.winRate, (v) => (v * 100).toFixed(1) + "%", false);
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

  renderEquityChart(res.equityCurve);
}

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

function renderEquityChart(curve) {
  btChart.setOption({
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
      data: [t("bt.legendStrategy"), t("bt.legendHold")],
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
    ],
  }, { notMerge: true });
  btChart.resize();
}

async function loadArenaBoard() {
  try {
    state.arenaRows = await api("/backtest/leaderboard");
    renderArenaBoard();
  } catch (e) {
    /* 排行榜加载失败不打断页面 */
  }
}

function renderArenaBoard() {
  const rows = state.arenaRows;
  if (!rows) return;
  const tbody = $("arena-board").querySelector("tbody");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row"></td></tr>`;
    tbody.querySelector(".empty-row").textContent = t("arena.empty");
    return;
  }
  rows.forEach((r, i) => {
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
    tbody.appendChild(tr);
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

// ---------- 玩法说明弹窗 ----------

function openHelp() {
  $("help-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeHelp() {
  $("help-modal").hidden = true;
  document.body.style.overflow = "";
  try { localStorage.setItem("qs_help_seen", "1"); } catch (e) { /* 隐私模式下忽略 */ }
}

$("btn-help").addEventListener("click", openHelp);
$("btn-help-close").addEventListener("click", closeHelp);
$("btn-help-ok").addEventListener("click", closeHelp);
$("help-modal").addEventListener("click", (e) => {
  if (e.target === $("help-modal")) closeHelp();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("tour-pop").hidden) endTour();
  else if (!$("recap-modal").hidden) closeRecap();
  else if (!$("help-modal").hidden) closeHelp();
});

// 首次访问自动弹出玩法说明 (新手引导优先, 见文件末尾的自动启动逻辑)
try {
  if (localStorage.getItem("qs_tour_done") && !localStorage.getItem("qs_help_seen")) openHelp();
} catch (e) { /* 隐私模式下忽略 */ }

// ---------- 界面切换: 对局 / 竞技场 / 学堂 ----------

const VIEWS = ["game", "arena", "academy", "famous", "story", "lab", "quiz", "profile"];
const navTabs = document.querySelectorAll("#main-nav .nav-tab");

function switchView(name) {
  if (!VIEWS.includes(name)) name = "game";
  VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
  navTabs.forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  try { localStorage.setItem("qs_view", name); } catch (e) { /* 隐私模式下忽略 */ }
  // 图表在隐藏容器中初始化时尺寸为 0, 切换到可见后需重算
  if (name === "game") chart.resize();
  else if (name === "arena") btChart.resize();
  document.dispatchEvent(new CustomEvent("qs:view", { detail: name }));
}

navTabs.forEach((b) => {
  b.addEventListener("click", () => switchView(b.dataset.view));
});

let savedView = "game";
try { savedView = localStorage.getItem("qs_view") || "game"; } catch (e) { /* 隐私模式下忽略 */ }
switchView(savedView);

// ---------- 深色 / 浅色主题 ----------

function renderThemeBtn() {
  $("btn-theme").textContent = t(THEME === "light" ? "theme.toDark" : "theme.toLight");
}

function toggleTheme() {
  THEME = THEME === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = THEME;
  try { localStorage.setItem("qs_theme", THEME); } catch (e) { /* 隐私模式下忽略 */ }
  // COLORS 在加载时缓存, 主题变化后需重读再重绘图表
  Object.assign(COLORS, {
    up: cssVar("--up"),
    down: cssVar("--down"),
    ma5: cssVar("--ma5"),
    ma20: cssVar("--ma20"),
    text: cssVar("--text"),
    muted: cssVar("--text-muted"),
    border: cssVar("--border"),
    panel: cssVar("--panel-raised"),
  });
  renderThemeBtn();
  if (state.klines.length) renderChart();
  if (state.lastStatus) renderStatus(state.lastStatus);
  if (state.lastBt) renderBacktestResult(state.lastBt);
  document.dispatchEvent(new CustomEvent("qs:theme"));
}

$("btn-theme").addEventListener("click", toggleTheme);
renderThemeBtn();

// ---------- 语言切换: 重渲染所有动态区域 ----------

document.addEventListener("qs:lang", () => {
  renderThemeBtn();
  if (state.klines.length) renderChart();
  renderStockLabel();
  renderAiLevelLabel();
  if (state.sessionId) updateDayLabel();
  if (state.lastStatus) renderStatus(state.lastStatus);
  syncTradeInputs();
  if (state.lastSettle) renderSettle(state.lastSettle);
  updateStrategyUi();
  renderArenaStockOptions();
  refreshCondLabels();
  if (state.lastBt) renderBacktestResult(state.lastBt);
  renderLeaderboard();
  renderArenaBoard();
});

// ---------- 绑定 ----------

$("btn-start").addEventListener("click", () => guarded(startGame));
$("btn-tick").addEventListener("click", () => guarded(tick));
$("btn-buy").addEventListener("click", () => guarded(() => trade("BUY")));
$("btn-sell").addEventListener("click", () => guarded(() => trade("SELL")));
$("btn-settle").addEventListener("click", () => {
  if (confirm(t("confirm.settle"))) guarded(settle);
});
$("btn-advisor").addEventListener("click", () => guarded(askAdvisor));
$("btn-review").addEventListener("click", askReview);
$("username").addEventListener("keydown", (e) => {
  if (e.key === "Enter") guarded(startGame);
});

// ---------- 对局复盘报告 ----------

let recapChart = null;

function recapStats() {
  let shares = 0, cost = 0, buys = 0, sells = 0, wins = 0;
  state.trades.forEach((tr) => {
    if (tr.dir === "BUY") {
      cost = (cost * shares + tr.price * tr.shares) / (shares + tr.shares);
      shares += tr.shares;
      buys++;
    } else {
      sells++;
      if (tr.price > cost) wins++;
      shares = Math.max(0, shares - tr.shares);
    }
  });
  return { buys, sells, wins };
}

function recapVerdicts(stats) {
  const out = [];
  const ks = state.klines;
  const settle = state.lastSettle || {};

  if (state.trades.length === 0) {
    out.push(t("recap.v.idle"));
  } else {
    let chase = 0, goodEntry = 0, panic = 0;
    state.trades.forEach((tr) => {
      const after = ks.slice(tr.idx + 1, tr.idx + 6);
      const reboundHigh = after.length ? Math.max(...after.map((k) => Number(k.close))) : null;
      if (tr.dir === "BUY") {
        if (tr.idx >= 5) {
          const prevMax = Math.max(...ks.slice(tr.idx - 5, tr.idx).map((k) => Number(k.high)));
          if (tr.price >= prevMax * 0.98) chase++;
        }
        if (reboundHigh != null && reboundHigh >= tr.price * 1.05) goodEntry++;
      } else if (reboundHigh != null && reboundHigh >= tr.price * 1.05) {
        panic++;
      }
    });
    if (chase) out.push(t("recap.v.chaseHigh", chase));
    if (goodEntry) out.push(t("recap.v.goodEntry", goodEntry));
    if (panic) out.push(t("recap.v.sellEarly", panic));
    if (stats.sells > 0) {
      const rate = stats.wins / stats.sells;
      if (rate >= 0.6) out.push(t("recap.v.winHigh", (rate * 100).toFixed(0) + "%"));
      else if (rate < 0.4) out.push(t("recap.v.winLow", (rate * 100).toFixed(0) + "%"));
    }
    if (state.trades.length > state.totalTicks / 2) out.push(t("recap.v.overtrade", state.trades.length));
  }

  if (settle.returnRate != null && settle.holdReturnRate != null) {
    const diff = Number(settle.returnRate) - Number(settle.holdReturnRate);
    const diffText = (Math.abs(diff) * 100).toFixed(2) + "%";
    if (diff > 0.0001) out.push(t("recap.v.beatHold", diffText));
    else if (diff < -0.0001) out.push(t("recap.v.loseHold", diffText));
  }
  return out;
}

function recapOption() {
  const dates = state.klines.map((k) => k.tradeDate);
  const candles = state.klines.map((k) => [k.open, k.close, k.low, k.high]);
  const buyPts = [], sellPts = [];
  state.trades.forEach((tr) => {
    const bar = state.klines[tr.idx];
    if (!bar) return;
    if (tr.dir === "BUY") buyPts.push([tr.idx, Number(bar.low)]);
    else sellPts.push([tr.idx, Number(bar.high)]);
  });
  return {
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      backgroundColor: COLORS.panel,
      borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      formatter(params) {
        // 散点系列的 dataIndex 是自身数组下标, 必须取 K 线系列的下标
        const p = params.find((x) => x.seriesType === "candlestick") || params[0];
        const i = p.dataIndex;
        const bar = state.klines[i];
        if (!bar) return "";
        const lines = [
          `<b>${bar.tradeDate}</b>`,
          `${t("chart.open")} ${bar.open}  ${t("chart.close")} ${bar.close}`,
        ];
        state.trades.forEach((tr) => {
          if (tr.idx === i) lines.push(t(tr.dir === "BUY" ? "recap.tip.buy" : "recap.tip.sell", tr.shares, tr.price));
        });
        return lines.join("<br>");
      },
    },
    legend: { data: [t("chart.kline"), "MA5", "MA20"], textStyle: { color: COLORS.muted }, top: 0 },
    grid: { left: 60, right: 20, top: 32, bottom: 28 },
    xAxis: {
      type: "category", data: dates,
      axisLine: { lineStyle: { color: COLORS.border } },
      axisLabel: { color: COLORS.muted },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
      axisLabel: { color: COLORS.muted },
    },
    series: [
      {
        name: t("chart.kline"), type: "candlestick", data: candles,
        itemStyle: {
          color: "transparent",
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down,
          borderWidth: 1.5,
        },
      },
      { name: "MA5", type: "line", data: state.klines.map((k) => k.ma5), smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: "MA20", type: "line", data: state.klines.map((k) => k.ma20), smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { type: "scatter", data: buyPts, symbol: "triangle", symbolSize: 13, symbolOffset: [0, 12], z: 10,
        itemStyle: { color: COLORS.up },
        label: { show: true, formatter: t("recap.b"), position: "bottom", color: COLORS.up, fontSize: 11, fontWeight: "bold" } },
      { type: "scatter", data: sellPts, symbol: "triangle", symbolRotate: 180, symbolSize: 13, symbolOffset: [0, -12], z: 10,
        itemStyle: { color: COLORS.down },
        label: { show: true, formatter: t("recap.s"), position: "top", color: COLORS.down, fontSize: 11, fontWeight: "bold" } },
    ],
  };
}

function renderRecap() {
  const stats = recapStats();
  const settle = state.lastSettle || {};
  $("recap-trades").textContent = t("recap.tradesVal", state.trades.length, stats.buys, stats.sells);
  $("recap-winrate").textContent = stats.sells > 0 ? ((stats.wins / stats.sells) * 100).toFixed(0) + "%" : "--";
  const setRate = (id, rate) => {
    const el = $(id);
    if (rate == null) { el.textContent = "--"; el.className = ""; return; }
    const v = Number(rate);
    el.textContent = fmtPct(v);
    el.className = v >= 0 ? "pos" : "neg";
  };
  setRate("recap-you", settle.returnRate);
  setRate("recap-hold", settle.holdReturnRate);

  const list = $("recap-verdicts");
  list.innerHTML = "";
  recapVerdicts(stats).forEach((text) => {
    const li = document.createElement("li");
    li.innerHTML = linkifyTerms(text);
    list.appendChild(li);
  });

  if (!recapChart) recapChart = echarts.init($("recap-chart"));
  recapChart.setOption(recapOption(), { notMerge: true });
  recapChart.resize();
}

function openRecap() {
  if (!state.lastSettle) return;
  $("recap-modal").hidden = false;
  document.body.style.overflow = "hidden";
  renderRecap();
}

function closeRecap() {
  $("recap-modal").hidden = true;
  document.body.style.overflow = "";
}

$("btn-recap").addEventListener("click", openRecap);
$("btn-recap-close").addEventListener("click", closeRecap);
$("recap-modal").addEventListener("click", (e) => {
  if (e.target === $("recap-modal")) closeRecap();
});
document.addEventListener("qs:theme", () => {
  if (!$("recap-modal").hidden) renderRecap();
});
document.addEventListener("qs:lang", () => {
  if (!$("recap-modal").hidden) renderRecap();
});
window.addEventListener("resize", () => {
  if (recapChart && !$("recap-modal").hidden) recapChart.resize();
});

// ---------- 新手引导 (可随时重新打开) ----------

const tourTab = (v) => document.querySelector(`#main-nav .nav-tab[data-view="${v}"]`);
const TOUR_STEPS = [
  { key: "welcome" },
  { key: "start", el: () => document.querySelector("header .start-box") },
  { key: "game", view: "game", el: () => tourTab("game") },
  { key: "arena", view: "arena", el: () => tourTab("arena") },
  { key: "academy", view: "academy", el: () => tourTab("academy") },
  { key: "famous", view: "famous", el: () => tourTab("famous") },
  { key: "story", view: "story", el: () => tourTab("story") },
  { key: "lab", view: "lab", el: () => tourTab("lab") },
  { key: "quiz", view: "quiz", el: () => tourTab("quiz") },
  { key: "profile", view: "profile", el: () => tourTab("profile") },
  { key: "help", el: () => $("btn-help") },
  { key: "end", el: () => $("btn-tour") },
];

let tourStep = 0;
let tourReturnView = "game";
const tourActive = () => !$("tour-pop").hidden;

function positionTourPop(rect) {
  const pop = $("tour-pop");
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  if (!rect) {
    pop.style.left = Math.max(16, (window.innerWidth - pw) / 2) + "px";
    pop.style.top = Math.max(16, (window.innerHeight - ph) / 2) + "px";
    return;
  }
  let top = rect.bottom + 14;
  if (top + ph > window.innerHeight - 16) top = Math.max(16, rect.top - ph - 14);
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.min(Math.max(16, left), window.innerWidth - pw - 16);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function renderTourStep() {
  const step = TOUR_STEPS[tourStep];
  if (step.view) switchView(step.view);
  $("tour-pop-title").textContent = t(`tour.${step.key}.t`);
  $("tour-pop-text").textContent = t(`tour.${step.key}.d`);
  $("tour-step-label").textContent = t("tour.stepLabel", tourStep + 1, TOUR_STEPS.length);
  $("btn-tour-prev").disabled = tourStep === 0;
  $("btn-tour-next").textContent = t(tourStep === TOUR_STEPS.length - 1 ? "tour.done" : "tour.next");

  const ring = $("tour-ring");
  const el = step.el && step.el();
  if (el) {
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    const pad = 6;
    ring.classList.remove("bare");
    ring.style.left = (r.left - pad) + "px";
    ring.style.top = (r.top - pad) + "px";
    ring.style.width = (r.width + pad * 2) + "px";
    ring.style.height = (r.height + pad * 2) + "px";
    positionTourPop(ring.getBoundingClientRect());
  } else {
    // 无目标步骤: 光圈缩为不可见的点, 只保留全屏遮罩
    ring.classList.add("bare");
    ring.style.left = window.innerWidth / 2 + "px";
    ring.style.top = window.innerHeight / 2 + "px";
    ring.style.width = "0";
    ring.style.height = "0";
    positionTourPop(null);
  }
}

function startTour() {
  tourReturnView = VIEWS.find((v) => !$("view-" + v).hidden) || "game";
  tourStep = 0;
  $("tour-mask").hidden = false;
  $("tour-ring").hidden = false;
  $("tour-pop").hidden = false;
  renderTourStep();
}

function endTour() {
  $("tour-mask").hidden = true;
  $("tour-ring").hidden = true;
  $("tour-pop").hidden = true;
  try { localStorage.setItem("qs_tour_done", "1"); } catch (e) { /* 隐私模式下忽略 */ }
  switchView(tourReturnView);
}

function tourNext() {
  if (tourStep >= TOUR_STEPS.length - 1) endTour();
  else { tourStep++; renderTourStep(); }
}

$("btn-tour").addEventListener("click", startTour);
$("btn-tour-skip").addEventListener("click", endTour);
$("btn-tour-next").addEventListener("click", tourNext);
$("btn-tour-prev").addEventListener("click", () => {
  if (tourStep > 0) { tourStep--; renderTourStep(); }
});
$("tour-mask").addEventListener("click", tourNext);
window.addEventListener("resize", () => {
  if (tourActive()) renderTourStep();
});
document.addEventListener("qs:lang", () => {
  if (tourActive()) renderTourStep();
});

// 首次访问自动开启引导 (优先于玩法说明弹窗)
try {
  if (!localStorage.getItem("qs_tour_done")) startTour();
} catch (e) { /* 隐私模式下忽略 */ }

loadLeaderboard();
