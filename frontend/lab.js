// 量化研究所 + 交易人格测试
// 依赖 app.js 的 $ / api / toast / cssVar / COLORS / fmtPct, i18n.js 的 t / pick / stockName / marketTag,
// academy.js 的 prog / awardTitle / addXp / renderProfile

// ---------- 研究所: 数据 ----------

const MODEL_META = [
  { key: "LOGISTIC", name: { zh: "逻辑回归", en: "Logistic Regression" } },
  { key: "FOREST", name: { zh: "随机森林", en: "Random Forest" } },
  { key: "BOOST", name: { zh: "梯度提升", en: "Gradient Boost" } },
];

const SIGNALS = [
  {
    id: "golden", horizon: 5,
    name: { zh: "金叉：MA5 上穿 MA20 → 之后 5 日", en: "Golden cross: MA5 crosses above MA20 → next 5 days" },
    fire: (h, i) => i > 0 && h.ma5[i - 1] != null && h.ma20[i - 1] != null && h.ma5[i] != null && h.ma20[i] != null
      && Number(h.ma5[i - 1]) <= Number(h.ma20[i - 1]) && Number(h.ma5[i]) > Number(h.ma20[i]),
  },
  {
    id: "death", horizon: 5,
    name: { zh: "死叉：MA5 下穿 MA20 → 之后 5 日", en: "Death cross: MA5 crosses below MA20 → next 5 days" },
    fire: (h, i) => i > 0 && h.ma5[i - 1] != null && h.ma20[i - 1] != null && h.ma5[i] != null && h.ma20[i] != null
      && Number(h.ma5[i - 1]) >= Number(h.ma20[i - 1]) && Number(h.ma5[i]) < Number(h.ma20[i]),
  },
  {
    id: "bigdrop", horizon: 1,
    name: { zh: "单日大跌超 3% → 次日反弹?", en: "Daily drop > 3% → bounce next day?" },
    fire: (h, i) => h.pctChange[i] != null && Number(h.pctChange[i]) <= -0.03,
  },
  {
    id: "bigup", horizon: 1,
    name: { zh: "单日大涨超 3% → 次日追高?", en: "Daily gain > 3% → chase next day?" },
    fire: (h, i) => h.pctChange[i] != null && Number(h.pctChange[i]) >= 0.03,
  },
  {
    id: "breakma20", horizon: 5,
    name: { zh: "收盘价站上 MA20 → 之后 5 日", en: "Close breaks above MA20 → next 5 days" },
    fire: (h, i) => i > 0 && h.ma20[i - 1] != null && h.ma20[i] != null
      && Number(h.close[i - 1]) <= Number(h.ma20[i - 1]) && Number(h.close[i]) > Number(h.ma20[i]),
  },
  {
    id: "losema20", horizon: 5,
    name: { zh: "收盘价跌破 MA20 → 之后 5 日", en: "Close breaks below MA20 → next 5 days" },
    fire: (h, i) => i > 0 && h.ma20[i - 1] != null && h.ma20[i] != null
      && Number(h.close[i - 1]) >= Number(h.ma20[i - 1]) && Number(h.close[i]) < Number(h.ma20[i]),
  },
  {
    id: "threedown", horizon: 5,
    name: { zh: "三连阴 → 之后 5 日反弹?", en: "Three straight down days → bounce over next 5?" },
    fire: (h, i) => i >= 2
      && [i - 2, i - 1, i].every((j) => h.pctChange[j] != null && Number(h.pctChange[j]) < 0),
  },
  {
    id: "threeup", horizon: 5,
    name: { zh: "三连阳 → 之后 5 日还涨?", en: "Three straight up days → keeps rising over next 5?" },
    fire: (h, i) => i >= 2
      && [i - 2, i - 1, i].every((j) => h.pctChange[j] != null && Number(h.pctChange[j]) > 0),
  },
  {
    id: "biashigh", horizon: 5,
    name: { zh: "乖离过大：收盘高出 MA20 超 8% → 之后 5 日", en: "Overextended: close > 8% above MA20 → next 5 days" },
    fire: (h, i) => h.ma20[i] != null
      && Number(h.close[i]) > Number(h.ma20[i]) * 1.08,
  },
  {
    id: "biaslow", horizon: 5,
    name: { zh: "超跌乖离：收盘低于 MA20 超 8% → 之后 5 日", en: "Oversold: close > 8% below MA20 → next 5 days" },
    fire: (h, i) => h.ma20[i] != null
      && Number(h.close[i]) < Number(h.ma20[i]) * 0.92,
  },
];

let labStocks = [];
const labHistCache = {};

async function labHistory(code) {
  if (!labHistCache[code]) {
    labHistCache[code] = await api("/lab/history/" + encodeURIComponent(code));
  }
  return labHistCache[code];
}

async function loadLabStocks() {
  try {
    labStocks = await api("/backtest/stocks");
    renderLabStockOptions();
  } catch (e) { /* 后端未就绪时静默, 切到本页时会重试 */ }
}

function fillStockSelect(sel, defaultIndex) {
  const prev = sel.value;
  sel.innerHTML = "";
  labStocks.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.code;
    opt.textContent = `${stockName(s.name, s.code)} (${s.code})${marketTag(s.market)}`;
    sel.appendChild(opt);
  });
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if (sel.options.length > defaultIndex) sel.selectedIndex = defaultIndex;
}

function renderLabStockOptions() {
  fillStockSelect($("lab-stock-a"), 0);
  fillStockSelect($("lab-stock-b"), 1);
  fillStockSelect($("lab-stock-m"), 0);
  fillStockSelect($("lab-stock-s"), 0);
  fillStockSelect($("lab-stock-t"), 0);
  renderSignalOptions();
}

function renderSignalOptions() {
  const sel = $("lab-signal");
  const prev = sel.value;
  sel.innerHTML = "";
  SIGNALS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = pick(s.name);
    sel.appendChild(opt);
  });
  if (prev && SIGNALS.some((s) => s.id === prev)) sel.value = prev;
}

// ---------- 研究所: 统计工具 ----------

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  return vx && vy ? cov / Math.sqrt(vx * vy) : 0;
}

const pct1 = (v) => (v * 100).toFixed(1) + "%";

async function loadIntoBox(box, fn) {
  box.hidden = false;
  box.textContent = t("lab.loading");
  try {
    await fn();
  } catch (e) {
    box.textContent = e.message;
  }
}

function labCard(title, big, rows) {
  const card = document.createElement("div");
  card.className = "lab-card";
  const h = document.createElement("div");
  h.className = "lab-card-name";
  h.textContent = title;
  const b = document.createElement("div");
  b.className = "lab-card-big";
  b.textContent = big;
  card.append(h, b);
  rows.forEach(([k, v]) => {
    const row = document.createElement("div");
    row.className = "lab-card-row";
    const ks = document.createElement("span");
    ks.textContent = k;
    const vs = document.createElement("span");
    vs.textContent = v;
    row.append(ks, vs);
    card.appendChild(row);
  });
  return card;
}

// ---------- 研究所: 双股对比 ----------

let labCmpChart = null;
let labCmp = null;

async function runCompare() {
  const a = $("lab-stock-a").value;
  const b = $("lab-stock-b").value;
  if (!a || !b) return;
  if (a === b) { toast(t("lab.needTwo")); return; }
  await loadIntoBox($("lab-corr"), async () => {
    const [ha, hb] = await Promise.all([labHistory(a), labHistory(b)]);
    labCmp = { ha, hb };
    renderCompare();
  });
}

function renderCompare() {
  if (!labCmp) return;
  const { ha, hb } = labCmp;
  const n = Math.min(ha.close.length, hb.close.length);
  const ra = [], rb = [];
  for (let i = 1; i < n; i++) {
    ra.push(Number(ha.close[i]) / Number(ha.close[i - 1]) - 1);
    rb.push(Number(hb.close[i]) / Number(hb.close[i - 1]) - 1);
  }
  const r = pearson(ra, rb);
  const label = r >= 0.7 ? t("lab.corrStrongPos")
    : r >= 0.3 ? t("lab.corrPos")
    : r > -0.3 ? t("lab.corrWeak")
    : t("lab.corrNeg");
  const box = $("lab-corr");
  box.hidden = false;
  box.textContent = t("lab.corr", n - 1, r.toFixed(2), label);

  const sa = ha.close.slice(0, n).map((c) => +(Number(c) / Number(ha.close[0]) * 100).toFixed(2));
  const sb = hb.close.slice(0, n).map((c) => +(Number(c) / Number(hb.close[0]) * 100).toFixed(2));
  const nameA = `${stockName(ha.name, ha.code)} (${ha.code})`;
  const nameB = `${stockName(hb.name, hb.code)} (${hb.code})`;

  const el = $("lab-compare-chart");
  el.hidden = false;
  if (!labCmpChart) labCmpChart = echarts.init(el);
  labCmpChart.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: [nameA, nameB], textStyle: { color: COLORS.text } },
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    xAxis: {
      type: "category",
      data: ha.dates.slice(0, n),
      axisLabel: { color: COLORS.muted },
      axisLine: { lineStyle: { color: COLORS.border } },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: COLORS.muted },
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
    },
    series: [
      { name: nameA, type: "line", data: sa, showSymbol: false, lineStyle: { width: 2, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: nameB, type: "line", data: sb, showSymbol: false, lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
    ],
  }, true);
  labCmpChart.resize();
}

// ---------- 研究所: AI 模型分歧 ----------

let labModelHist = null;

async function runModels() {
  const code = $("lab-stock-m").value;
  if (!code) return;
  await loadIntoBox($("lab-model-verdict"), async () => {
    labModelHist = await labHistory(code);
    renderModels();
  });
}

function renderModels() {
  const h = labModelHist;
  if (!h) return;
  const wrap = $("lab-model-cards");
  wrap.innerHTML = "";
  const stats = [];
  MODEL_META.forEach((m) => {
    const probs = h.probUp[m.key];
    if (!probs) return;
    let hit = 0, n = 0, conf = 0, bull = 0;
    for (let i = 0; i < h.close.length - 1; i++) {
      const p = probs[i];
      if (p == null) continue;
      const up = Number(h.close[i + 1]) > Number(h.close[i]);
      const predUp = Number(p) >= 0.5;
      n++;
      if (predUp === up) hit++;
      conf += Math.abs(Number(p) - 0.5) * 2;
      if (predUp) bull++;
    }
    if (!n) return;
    stats.push({ m, n, hitRate: hit / n, conf: conf / n, bull: bull / n });
  });
  stats.forEach((s) => {
    wrap.appendChild(labCard(pick(s.m.name), pct1(s.hitRate), [
      [t("lab.hitRate"), pct1(s.hitRate)],
      [t("lab.conf"), pct1(s.conf)],
      [t("lab.bullish"), pct1(s.bull)],
      ["", t("lab.samples", s.n)],
    ]));
  });

  let both = 0, dis = 0;
  for (let i = 0; i < h.close.length; i++) {
    const dirs = MODEL_META
      .map((m) => (h.probUp[m.key] && h.probUp[m.key][i] != null) ? Number(h.probUp[m.key][i]) >= 0.5 : null)
      .filter((v) => v !== null);
    if (dirs.length === MODEL_META.length) {
      both++;
      if (new Set(dirs).size > 1) dis++;
    }
  }
  const box = $("lab-model-verdict");
  box.hidden = false;
  if (!stats.length || !both) {
    box.textContent = t("lab.sigNone");
    return;
  }
  const disRate = dis / both;
  const best = stats.reduce((a, b) => (a.hitRate > b.hitRate ? a : b));
  let text = t("lab.disagree", pct1(disRate)) + " "
    + (disRate > 0.4 ? t("lab.disagreeHigh") : disRate < 0.2 ? t("lab.disagreeLow") : "") + " "
    + t("lab.modelBest", pick(best.m.name), pct1(best.hitRate));
  if (best.hitRate < 0.55) text += " " + t("lab.modelCoin");
  box.textContent = text;
}

// ---------- 研究所: 指标信号胜率 ----------

let labSig = null;

async function runSignal() {
  const code = $("lab-stock-s").value;
  const sig = SIGNALS.find((s) => s.id === $("lab-signal").value);
  if (!code || !sig) return;
  await loadIntoBox($("lab-signal-verdict"), async () => {
    const h = await labHistory(code);
    labSig = { h, sig };
    renderSignal();
  });
}

function renderSignal() {
  if (!labSig) return;
  const { h, sig } = labSig;
  const n = h.close.length;
  const fwdRet = (i) => Number(h.close[i + sig.horizon]) / Number(h.close[i]) - 1;
  const rets = [];
  const base = [];
  for (let i = 0; i < n - sig.horizon; i++) {
    const r = fwdRet(i);
    base.push(r);
    if (sig.fire(h, i)) rets.push(r);
  }
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const winRate = (arr) => arr.filter((v) => v > 0).length / (arr.length || 1);

  const wrap = $("lab-signal-cards");
  wrap.innerHTML = "";
  const box = $("lab-signal-verdict");
  box.hidden = false;
  if (!rets.length) {
    box.textContent = t("lab.sigNone");
    return;
  }
  const win = winRate(rets), baseWin = winRate(base);
  const ar = avg(rets), baseAr = avg(base);
  wrap.appendChild(labCard(pick(sig.name), pct1(win), [
    [t("lab.sigCount"), String(rets.length)],
    [t("lab.sigWin"), pct1(win) + " vs " + pct1(baseWin)],
    [t("lab.sigAvg"), fmtPct(ar)],
    [t("lab.sigBase"), fmtPct(baseAr)],
  ]));
  box.textContent = (win > baseWin && ar > baseAr) ? t("lab.sigGood") : t("lab.sigBad");
}

// ---------- 交易人格测试 ----------

const QUIZ_DIMS = [
  { key: "risk", name: { zh: "冒险", en: "Risk" } },
  { key: "discipline", name: { zh: "纪律", en: "Discipline" } },
  { key: "patience", name: { zh: "耐心", en: "Patience" } },
  { key: "analysis", name: { zh: "数据", en: "Data" } },
  { key: "composure", name: { zh: "心态", en: "Composure" } },
];

const QUIZ_QUESTIONS = [
  {
    q: { zh: "你重仓的股票早盘突然跳水 7%，你的第一反应是？", en: "Your biggest holding suddenly drops 7% at the open. First reaction?" },
    opts: [
      { t: { zh: "马上补仓，拉低成本", en: "Buy the dip immediately to lower my cost" }, s: { risk: 2 } },
      { t: { zh: "按事先设好的止损线执行", en: "Execute my pre-set stop loss" }, s: { discipline: 2 } },
      { t: { zh: "淡定，逻辑没变就拿着", en: "Stay calm — thesis unchanged, keep holding" }, s: { patience: 1, composure: 1 } },
    ],
  },
  {
    q: { zh: "朋友圈都在晒某只妖股翻倍，你会？", en: "Everyone is posting about a meme stock that doubled. You?" },
    opts: [
      { t: { zh: "冲！晚了连汤都没得喝", en: "Jump in! Late means no soup left" }, s: { risk: 2 } },
      { t: { zh: "先翻财报和估值，再决定", en: "Check the financials and valuation first" }, s: { analysis: 2 } },
      { t: { zh: "不眼红，我有自己的计划", en: "Not jealous — I have my own plan" }, s: { discipline: 1, composure: 1 } },
    ],
  },
  {
    q: { zh: "你的策略连续亏了 3 次，你会？", en: "Your strategy just lost 3 times in a row. You?" },
    opts: [
      { t: { zh: "果断换一套，这个不灵了", en: "Switch strategies — this one is dead" }, s: { risk: 1 } },
      { t: { zh: "回测检查：是运气差还是逻辑坏了", en: "Backtest it: bad luck or broken logic?" }, s: { analysis: 2 } },
      { t: { zh: "继续执行，3 次说明不了什么", en: "Keep executing — 3 trades prove nothing" }, s: { discipline: 1, patience: 1 } },
    ],
  },
  {
    q: { zh: "买入后多久不涨，你会开始坐立难安？", en: "How long can a position go nowhere before you get restless?" },
    opts: [
      { t: { zh: "三天，不动我就烦", en: "Three days. Flat drives me crazy" }, s: { risk: 1 } },
      { t: { zh: "一个月，还能接受", en: "A month is acceptable" }, s: { composure: 1 } },
      { t: { zh: "一年也无所谓，好东西值得等", en: "Even a year — good things take time" }, s: { patience: 2 } },
    ],
  },
  {
    q: { zh: "你更相信哪种判断依据？", en: "What do you trust most when deciding?" },
    opts: [
      { t: { zh: "盘感和消息，市场是活的", en: "Gut feel and the tape — markets are alive" }, s: { risk: 1, composure: 1 } },
      { t: { zh: "财报和数据，数字不说谎", en: "Financials and data — numbers don't lie" }, s: { analysis: 2 } },
      { t: { zh: "时间，好公司拿住就赢", en: "Time — hold great companies and win" }, s: { patience: 2 } },
    ],
  },
  {
    q: { zh: "账户浮盈 30%，你会？", en: "Your account is up 30%. You?" },
    opts: [
      { t: { zh: "加杠杆，放大战果", en: "Add leverage and press the win" }, s: { risk: 2 } },
      { t: { zh: "按计划分批止盈", en: "Take profits in tranches, per plan" }, s: { discipline: 2 } },
      { t: { zh: "不动，复利是第八大奇迹", en: "Do nothing — compounding is the 8th wonder" }, s: { patience: 2 } },
    ],
  },
  {
    q: { zh: "大盘熔断那天，你在做什么？", en: "The market hits a circuit breaker. What are you doing?" },
    opts: [
      { t: { zh: "兴奋抄底，遍地都是黄金", en: "Excitedly bottom-fishing — gold everywhere" }, s: { risk: 2 } },
      { t: { zh: "对照清单，看哪些标的进入买入区间", en: "Checking my watchlist for buy-zone entries" }, s: { analysis: 1, discipline: 1 } },
      { t: { zh: "关电脑陪家人，明天再说", en: "Closing the laptop to be with family" }, s: { composure: 2 } },
    ],
  },
  {
    q: { zh: "买入一支股票前，你会研究多久？", en: "How long do you research before buying a stock?" },
    opts: [
      { t: { zh: "5 分钟，机会稍纵即逝", en: "5 minutes — opportunities vanish fast" }, s: { risk: 2 } },
      { t: { zh: "一周，把财报翻完", en: "A week — read every filing" }, s: { analysis: 2 } },
      { t: { zh: "先建观察仓，跟踪一个月", en: "Open a tiny tracker position and watch a month" }, s: { patience: 1, discipline: 1 } },
    ],
  },
  {
    q: { zh: "手里的亏损单，你一般怎么处理？", en: "How do you usually handle a losing position?" },
    opts: [
      { t: { zh: "扛着等回本，不卖就不算亏", en: "Hold till breakeven — not sold, not lost" }, s: { patience: 1 } },
      { t: { zh: "到止损线立刻走人", en: "Hit the stop, get out instantly" }, s: { discipline: 2 } },
      { t: { zh: "先复盘找错因，再决定去留", en: "Review what went wrong, then decide" }, s: { analysis: 2 } },
    ],
  },
  {
    q: { zh: "如果突然给你一个亿，你会？", en: "You suddenly get 100 million. You?" },
    opts: [
      { t: { zh: "全押最看好的机会，富贵险中求", en: "All-in my best idea — fortune favors the bold" }, s: { risk: 2 } },
      { t: { zh: "股债现金做资产配置", en: "Allocate across stocks, bonds and cash" }, s: { discipline: 1, analysis: 1 } },
      { t: { zh: "买指数基金，然后环游世界", en: "Buy index funds and travel the world" }, s: { patience: 1, composure: 1 } },
    ],
  },
];

const QUIZ_PERSONAS = [
  {
    id: "gambler",
    name: { zh: "天台边缘的赌徒", en: "The Gambler" },
    desc: { zh: "你的血液里流着肾上腺素：满仓、梭哈、抄底、追涨样样敢干。市场爱你的手续费，也随时准备教你做人。", en: "Adrenaline runs in your veins: all-in, YOLO, catching knives, chasing spikes. The market loves your fees — and is always ready to teach you a lesson." },
    advice: { zh: "动量策略 + 铁血止损。你不缺胆量，缺的是让你活到下一局的纪律。", en: "Momentum strategy + iron stop losses. You have plenty of guts; what keeps you alive to play again is discipline." },
    match: (v) => v.risk >= 0.6 && v.discipline < 0.3,
  },
  {
    id: "sniper",
    name: { zh: "冷静狙击手", en: "Calm Sniper" },
    desc: { zh: "敢重仓出手，但每一枪都有预案：进场位、止损位、目标位清清楚楚。危险而优雅，是市场里最稀有的物种。", en: "Bold enough for big positions, but every shot has a plan: entry, stop, target — all mapped. Dangerous and elegant, the rarest species in the market." },
    advice: { zh: "均线交叉这类趋势策略适合你，配合严格仓位管理，你能吃到大行情。", en: "Trend systems like MA crossover suit you. With strict position sizing, you can ride the big moves." },
    match: (v) => v.risk >= 0.5 && v.discipline >= 0.5,
  },
  {
    id: "machine",
    name: { zh: "纪律机器", en: "Discipline Machine" },
    desc: { zh: "计划你的交易，交易你的计划——这句话就是为你写的。你也许错过一些暴富机会，但你几乎不会被市场消灭。", en: "Plan the trade, trade the plan — that line was written for you. You may miss some moonshots, but the market almost never destroys you." },
    advice: { zh: "任何带明确规则的策略都适合你，试试在竞技场里对比均线交叉与均值回归的参数。", en: "Any rules-based strategy fits. Try comparing MA crossover vs mean reversion parameters in the Arena." },
    match: (v, top) => top === "discipline" && v.discipline >= 0.5,
  },
  {
    id: "detective",
    name: { zh: "数据侦探", en: "Data Detective" },
    desc: { zh: "别人看K线，你看财报附注；别人听消息，你查数据源。市场传闻在你面前会自动现出原形。", en: "Others read candles; you read footnotes. Others chase rumors; you check the source data. Market legends unmask themselves in front of you." },
    advice: { zh: "研究所就是你的主场：先验证信号胜率再上仓位，均值回归策略值得你深挖。", en: "The Research Lab is your home turf: verify a signal's win rate before sizing up. Mean reversion deserves your deep dive." },
    match: (v, top) => top === "analysis" && v.analysis >= 0.5,
  },
  {
    id: "zen",
    name: { zh: "佛系钓鱼佬", en: "Zen Angler" },
    desc: { zh: "涨也好跌也好，你自岿然不动。你赚的不是波动的钱，是时间的钱——这恰恰是绝大多数人做不到的。", en: "Up or down, you do not move. You earn time's money, not volatility's — which is exactly what most people can't do." },
    advice: { zh: "定投与长期持有是你的天赋技能，注意别把「拿得住」用在错误的标的上。", en: "DCA and long-term holding are your innate skills. Just make sure 'holding power' isn't wasted on the wrong asset." },
    match: (v, top) => top === "patience" && v.patience >= 0.5,
  },
  {
    id: "turtle",
    name: { zh: "稳健老乌龟", en: "Steady Turtle" },
    desc: { zh: "涨不狂喜、跌不心慌，睡眠质量全市场第一。你深知市场先生喜怒无常，而你只做自己情绪的主人。", en: "No euphoria on green days, no panic on red ones — best sleep quality in the market. Mr. Market is moody; you only master your own mood." },
    advice: { zh: "低波动组合 + 分散配置。研究所的双股对比能帮你找到相关性低的搭配。", en: "Low-volatility portfolio + diversification. The Lab's pair comparison helps you find low-correlation pairs." },
    match: (v, top) => top === "composure" && v.composure >= 0.5,
  },
  {
    id: "chaser",
    name: { zh: "追风少年", en: "Trend Chaser" },
    desc: { zh: "哪里热闹哪里冲，热点轮动的速度都追不上你换股的速度。偶尔吃到大肉，也常常两边挨耳光。", en: "Wherever the action is, you charge. Sector rotation can't keep up with how fast you swap stocks. Sometimes you feast — often you get slapped both ways." },
    advice: { zh: "承认吧，你需要冷静期：设定持仓最短天数，动量策略能把「追热点」变成有纪律的系统。", en: "Admit it — you need a cooling-off rule: a minimum holding period. Momentum strategy turns 'chasing' into a disciplined system." },
    match: (v) => v.risk >= 0.4 && v.patience < 0.3,
  },
  {
    id: "balanced",
    name: { zh: "六边形操盘手", en: "All-Round Trader" },
    desc: { zh: "没有明显短板：敢出手、有纪律、耐得住、看得懂、稳得起。不是天赋异禀，就是问卷填得太圆滑。", en: "No obvious weakness: bold, disciplined, patient, data-savvy and composed. Either you're gifted — or you answered too diplomatically." },
    advice: { zh: "多策略组合是你的方向：趋势 + 均值回归各配一半，让不同市场环境都有人干活。", en: "Multi-strategy is your path: half trend, half mean reversion, so something is always working in any regime." },
    match: () => true,
  },
];
window.QUIZ_PERSONAS = QUIZ_PERSONAS;

// 各维度理论满分 (每题取该维度最高分的选项)
const QUIZ_DIM_MAX = {};
QUIZ_DIMS.forEach((d) => {
  QUIZ_DIM_MAX[d.key] = QUIZ_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.opts.map((o) => o.s[d.key] || 0)), 0);
});

let quiz = null;
let quizRadar = null;
let quizResult = null;

function renderQuizCollected() {
  const got = QUIZ_PERSONAS.filter((p) => prog.titles.includes(p.name.zh)).length;
  $("quiz-collected").textContent = t("quiz.collected", got, QUIZ_PERSONAS.length);
}

function startQuiz() {
  quiz = { i: 0, scores: { risk: 0, discipline: 0, patience: 0, analysis: 0, composure: 0 } };
  quizResult = null;
  $("quiz-start").hidden = true;
  $("quiz-result").hidden = true;
  $("quiz-run").hidden = false;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (!quiz) return;
  const q = QUIZ_QUESTIONS[quiz.i];
  $("quiz-progress").textContent = t("quiz.progress", quiz.i + 1, QUIZ_QUESTIONS.length);
  $("quiz-question").innerHTML = linkifyTerms(pick(q.q));
  const wrap = $("quiz-options");
  wrap.innerHTML = "";
  q.opts.forEach((o, idx) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.innerHTML = linkifyTerms(pick(o.t));
    btn.addEventListener("click", (e) => {
      // 点选项里的名词只弹解释, 不算作答
      if (e.target.closest(".term")) return;
      pickQuizOption(idx);
    });
    wrap.appendChild(btn);
  });
}

function pickQuizOption(idx) {
  const o = QUIZ_QUESTIONS[quiz.i].opts[idx];
  for (const [k, v] of Object.entries(o.s)) quiz.scores[k] += v;
  quiz.i++;
  if (quiz.i < QUIZ_QUESTIONS.length) {
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  const norm = {};
  QUIZ_DIMS.forEach((d) => { norm[d.key] = quiz.scores[d.key] / (QUIZ_DIM_MAX[d.key] || 1); });
  const top = QUIZ_DIMS.reduce((a, b) => (norm[a.key] >= norm[b.key] ? a : b)).key;
  const persona = QUIZ_PERSONAS.find((p) => p.match(norm, top));
  quizResult = { norm, persona };
  quiz = null;
  $("quiz-run").hidden = true;
  $("quiz-result").hidden = false;
  renderQuizResult();
  if (!prog.titles.includes(persona.name.zh)) {
    awardTitle(persona.name);
    addXp(30);
    toast(t("quiz.newPersona", pick(persona.name)));
  }
  renderQuizCollected();
}

function renderQuizResult() {
  if (!quizResult) return;
  const { norm, persona } = quizResult;
  $("quiz-persona").textContent = t("quiz.resultTitle", pick(persona.name));
  $("quiz-desc").innerHTML = linkifyTerms(pick(persona.desc));
  const adviceEl = $("quiz-advice");
  adviceEl.hidden = false;
  adviceEl.innerHTML = linkifyTerms(t("quiz.advice", pick(persona.advice)));

  const el = $("quiz-radar");
  if (!quizRadar) quizRadar = echarts.init(el);
  quizRadar.setOption({
    radar: {
      indicator: QUIZ_DIMS.map((d) => ({ name: pick(d.name), max: 1 })),
      radius: "65%",
      axisName: { color: COLORS.text },
      splitLine: { lineStyle: { color: COLORS.border } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: COLORS.border } },
    },
    series: [{
      type: "radar",
      data: [{ value: QUIZ_DIMS.map((d) => +norm[d.key].toFixed(2)) }],
      symbolSize: 5,
      lineStyle: { width: 2, color: COLORS.ma5 },
      itemStyle: { color: COLORS.ma5 },
      areaStyle: { color: COLORS.ma5, opacity: 0.25 },
    }],
  }, true);
  quizRadar.resize();
}

// ---------- 研究所: 择时的代价 ----------

let labTiming = null;

async function runTiming() {
  const code = $("lab-stock-t").value;
  if (!code) return;
  await loadIntoBox($("lab-timing-verdict"), async () => {
    labTiming = await labHistory(code);
    renderTiming();
  });
}

function renderTiming() {
  const h = labTiming;
  if (!h) return;
  const rets = [];
  for (let i = 1; i < h.close.length; i++) {
    rets.push(Number(h.close[i]) / Number(h.close[i - 1]) - 1);
  }
  const box = $("lab-timing-verdict");
  box.hidden = false;
  if (rets.length < 30) {
    box.textContent = t("lab.sigNone");
    return;
  }
  const sorted = [...rets].sort((a, b) => b - a);
  const best5 = new Set(sorted.slice(0, 5));
  const worst5 = new Set(sorted.slice(-5));
  const compound = (skip) => rets.reduce((acc, r) => (skip(r) ? acc : acc * (1 + r)), 1) - 1;
  const hold = compound(() => false);
  const missBest = compound((r) => best5.has(r));
  const missWorst = compound((r) => worst5.has(r));
  const missBoth = compound((r) => best5.has(r) || worst5.has(r));

  const wrap = $("lab-timing-cards");
  wrap.innerHTML = "";
  [
    ["lab.timingHold", hold],
    ["lab.timingMissBest", missBest],
    ["lab.timingMissWorst", missWorst],
    ["lab.timingMissBoth", missBoth],
  ].forEach(([key, v]) => {
    wrap.appendChild(labCard(t(key), fmtPct(v), [[t("lab.timingDays"), String(rets.length)]]));
  });
  box.textContent = t("lab.timingVerdict", String(rets.length), fmtPct(hold), fmtPct(missBest), fmtPct(missWorst));
}

// ---------- 市场风云榜 ----------

let labRanks = null;

async function runOverview() {
  const btn = $("btn-lab-overview");
  btn.disabled = true;
  btn.textContent = t("lab.loading");
  try {
    labRanks = await api("/lab/overview");
    renderOverview();
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t("lab.overviewBtn");
  }
}

function renderOverview() {
  if (!labRanks) return;
  const wrap = $("lab-rank-cards");
  wrap.innerHTML = "";
  const boards = [
    { key: "lab.rankGain", metric: (r) => r.ret30, desc: true, fmt: fmtPct, signed: true },
    { key: "lab.rankLoss", metric: (r) => r.ret30, desc: false, fmt: fmtPct, signed: true },
    { key: "lab.rankMove", metric: (r) => r.lastChange, sort: (r) => Math.abs(r.lastChange), desc: true, fmt: fmtPct, signed: true },
    { key: "lab.rankVol", metric: (r) => r.volatility, desc: true, fmt: pct1 },
    { key: "lab.rankCalm", metric: (r) => r.volatility, desc: false, fmt: pct1 },
    { key: "lab.rankAi", metric: (r) => r.aiProb, desc: true, fmt: pct1 },
    { key: "lab.rankBear", metric: (r) => r.aiProb, desc: false, fmt: pct1 },
  ];
  boards.forEach((b) => {
    const sortKey = b.sort || b.metric;
    const rows = labRanks
      .filter((r) => b.metric(r) != null)
      .sort((x, y) => (b.desc ? sortKey(y) - sortKey(x) : sortKey(x) - sortKey(y)))
      .slice(0, 5);
    const card = document.createElement("div");
    card.className = "lab-rank";
    const h = document.createElement("div");
    h.className = "lab-card-name";
    h.textContent = t(b.key);
    card.appendChild(h);
    const ol = document.createElement("ol");
    ol.className = "lab-rank-list";
    rows.forEach((r) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "lab-rank-name";
      const tag = marketTag(r.market);
      name.textContent = stockName(r.name, r.code) + (tag ? " " + tag : "");
      const v = b.metric(r);
      const val = document.createElement("span");
      val.className = "lab-rank-val" + (b.signed ? (v >= 0 ? " pos" : " neg") : "");
      val.textContent = b.fmt(v);
      li.append(name, val);
      ol.appendChild(li);
    });
    card.appendChild(ol);
    wrap.appendChild(card);
  });
}

// ---------- 事件绑定与联动 ----------

$("btn-lab-compare").addEventListener("click", runCompare);
$("btn-lab-overview").addEventListener("click", runOverview);
$("btn-lab-models").addEventListener("click", runModels);
$("btn-lab-signal").addEventListener("click", runSignal);
$("btn-lab-timing").addEventListener("click", runTiming);
$("btn-quiz-start").addEventListener("click", startQuiz);
$("btn-quiz-retry").addEventListener("click", startQuiz);

document.addEventListener("qs:view", (e) => {
  if (e.detail === "lab") {
    if (!labStocks.length) loadLabStocks();
    if (labCmpChart) labCmpChart.resize();
  } else if (e.detail === "quiz") {
    if (quizRadar) quizRadar.resize();
  }
});

document.addEventListener("qs:theme", () => {
  if (labCmp) renderCompare();
  if (quizResult && !$("quiz-result").hidden) renderQuizResult();
});

document.addEventListener("qs:lang", () => {
  renderLabStockOptions();
  if (labCmp) renderCompare();
  if (labModelHist) renderModels();
  if (labSig) renderSignal();
  if (labTiming) renderTiming();
  if (labRanks) renderOverview();
  renderQuizCollected();
  if (quiz) renderQuizQuestion();
  if (quizResult && !$("quiz-result").hidden) renderQuizResult();
});

window.addEventListener("resize", () => {
  if (labCmpChart) labCmpChart.resize();
  if (quizRadar) quizRadar.resize();
});

loadLabStocks();
renderQuizCollected();
// 人格加入称号图鉴后重算收集度 (academy.js 首次渲染时本文件尚未加载)
renderProfile();
