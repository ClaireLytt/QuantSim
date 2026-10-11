// 策略盲盒: 系统暗抽一种「市场脾气」生成隐藏行情, 你只能看到自己策略跑出来的净值与回撤——
// 调参数、花掉最多 5 次回测机会, 从策略的赚亏特征反推盲盒里是哪种行情, 提交猜测定输赢。
// 教育点: 趋势策略在牛市如鱼得水、震荡市反复止损、崩盘市靠止损保命——策略表现就是行情的指纹。
// 依赖 app.js 的 $ / toast / playSound / cssVar / qsGauss / qsLoadBest, i18n.js 的 t。
(() => {
  const BEST_KEY = "qs_stratbox";
  const MAX_RUNS = 5;
  const DAYS = 120;
  const START_CASH = 100000;

  // 四种市场脾气: 盲盒的谜底
  const REGIMES = [
    { id: "bull", icon: "🐂", gen: () => trendGen(0.0035, 0.012) },
    { id: "bear", icon: "🐻", gen: () => trendGen(-0.003, 0.014) },
    { id: "range", icon: "🌊", gen: rangeGen },
    { id: "bubble", icon: "🫧", gen: bubbleGen },
  ];

  function trendGen(drift, vol) {
    const p = [100];
    for (let i = 1; i < DAYS; i++) p.push(Math.max(1, p[i - 1] * (1 + drift + qsGauss() * vol)));
    return p;
  }

  function rangeGen() {
    // 宽幅震荡: 围绕中枢的正弦摆动 + 噪声
    const p = [];
    let noise = 0;
    for (let i = 0; i < DAYS; i++) {
      noise += qsGauss() * 0.8;
      p.push(Math.max(1, 100 * (1 + 0.09 * Math.sin(i / 7)) + noise));
    }
    return p;
  }

  function bubbleGen() {
    // 泡沫破裂: 先加速上冲, 再快速崩塌, 最后死寂
    const p = [100];
    for (let i = 1; i < DAYS; i++) {
      const drift = i < 70 ? 0.006 : i < 95 ? -0.02 : 0.0005;
      const vol = i < 70 ? 0.012 : i < 95 ? 0.03 : 0.012;
      p.push(Math.max(1, p[i - 1] * (1 + drift + qsGauss() * vol)));
    }
    return p;
  }

  const g = { playing: false, regime: null, prices: [], runs: 0, lastEquity: null, lastDd: null, done: false };
  let chart = null;

  const loadBest = () => qsLoadBest(BEST_KEY); // 共享实现在 app.js

  // ---------- 回测引擎: 双均线趋势策略 + 止损 ----------
  function ma(arr, n, i) {
    if (i + 1 < n) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += arr[j];
    return s / n;
  }

  function backtest(fast, slow, stopPct) {
    const p = g.prices;
    let cash = START_CASH;
    let shares = 0;
    let entry = 0;
    let trades = 0;
    const equity = [];
    for (let i = 0; i < p.length; i++) {
      const f = ma(p, fast, i);
      const s = ma(p, slow, i);
      const fPrev = ma(p, fast, i - 1);
      const sPrev = ma(p, slow, i - 1);
      if (shares > 0 && p[i] <= entry * (1 - stopPct / 100)) {
        cash += shares * p[i]; // 止损离场
        shares = 0;
        trades++;
      } else if (f != null && s != null && fPrev != null && sPrev != null) {
        if (shares === 0 && fPrev <= sPrev && f > s) {
          shares = Math.floor(cash / p[i]);
          cash -= shares * p[i];
          entry = p[i];
          trades++;
        } else if (shares > 0 && fPrev >= sPrev && f < s) {
          cash += shares * p[i];
          shares = 0;
          trades++;
        }
      }
      equity.push(cash + shares * p[i]);
    }
    // 回撤曲线
    let peak = equity[0];
    const dd = equity.map((e) => {
      if (e > peak) peak = e;
      return -(1 - e / peak) * 100;
    });
    return { equity, dd, trades, ret: equity[equity.length - 1] / START_CASH - 1, maxDd: Math.min(...dd) };
  }

  // ---------- 图表: 净值曲线 + 回撤阴影 (双轴) ----------
  function renderChart(revealPrices) {
    if (!chart) chart = echarts.init($("sb-chart"));
    const series = [];
    if (g.lastEquity) {
      series.push({
        type: "line", name: "equity", data: g.lastEquity, showSymbol: false, yAxisIndex: 0,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        areaStyle: { opacity: 0.1, color: cssVar("--lab-blue") },
      });
      series.push({
        type: "line", name: "dd", data: g.lastDd, showSymbol: false, yAxisIndex: 1,
        lineStyle: { width: 1, color: cssVar("--down") },
        areaStyle: { opacity: 0.15, color: cssVar("--down") },
      });
    }
    if (revealPrices) {
      const base = revealPrices[0];
      series.push({
        type: "line", name: "price", data: revealPrices.map((p) => (p / base) * START_CASH), showSymbol: false,
        yAxisIndex: 0, lineStyle: { width: 1.5, type: "dashed", color: cssVar("--warn") },
      });
    }
    chart.setOption({
      animation: false,
      grid: { left: 58, right: 44, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: Array.from({ length: DAYS }, (_, i) => "D" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: [
        { scale: true, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
        { max: 0, min: -60, splitLine: { show: false }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10, formatter: "{value}%" } },
      ],
      series,
    }, true);
  }

  // ---------- 流程 ----------
  function start() {
    g.playing = true;
    g.done = false;
    g.runs = 0;
    g.lastEquity = null;
    g.lastDd = null;
    g.regime = REGIMES[Math.floor(Math.random() * REGIMES.length)];
    g.prices = g.regime.gen();
    $("sb-intro").hidden = true;
    $("sb-end").hidden = true;
    $("sb-play").hidden = false;
    $("sb-stats").hidden = true;
    $("btn-sb-run").disabled = false;
    $("sb-msg").textContent = t("sb.prompt");
    renderBox();
    renderChart();
    if (chart) chart.resize();
    renderGuessBtns();
  }

  function renderBox() {
    $("sb-left").textContent = String(MAX_RUNS - g.runs);
    $("sb-box-ico").textContent = g.done ? g.regime.icon : "🎁";
  }

  function runBacktest() {
    if (!g.playing || g.done) return;
    if (g.runs >= MAX_RUNS) {
      toast(t("sb.noRuns"));
      return;
    }
    g.runs++;
    const fast = Number($("sb-fast").value);
    const slow = Number($("sb-slow").value);
    const stop = Number($("sb-stop").value);
    const r = backtest(fast, Math.max(slow, fast + 2), stop);
    g.lastEquity = r.equity.map((e) => Math.round(e));
    g.lastDd = r.dd.map((d) => +d.toFixed(2));
    renderChart();
    $("sb-stats").hidden = false;
    $("sb-ret").textContent = (r.ret >= 0 ? "+" : "") + (r.ret * 100).toFixed(1) + "%";
    $("sb-ret").className = r.ret >= 0 ? "pos" : "neg";
    $("sb-dd").textContent = r.maxDd.toFixed(1) + "%";
    $("sb-trades").textContent = String(r.trades);
    $("sb-msg").textContent = t("sb.ranMsg", MAX_RUNS - g.runs);
    playSound("fill");
    renderBox();
    if (g.runs >= MAX_RUNS) $("btn-sb-run").disabled = true;
  }

  function renderGuessBtns() {
    const wrap = $("sb-guesses");
    wrap.innerHTML = "";
    REGIMES.forEach((rg) => {
      const btn = document.createElement("button");
      btn.className = "small";
      btn.textContent = rg.icon + " " + t("sb.regime." + rg.id);
      btn.addEventListener("click", () => guess(rg.id));
      wrap.appendChild(btn);
    });
  }

  function guess(id) {
    if (!g.playing || g.done) return;
    if (!g.lastEquity) {
      toast(t("sb.runFirst"));
      return;
    }
    g.done = true;
    g.playing = false;
    const right = id === g.regime.id;
    const score = right ? 300 + (MAX_RUNS - g.runs) * 100 : 0;
    const b = loadBest();
    const newBest = score > (b.best || 0);
    if (newBest && score > 0) {
      try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: score })); } catch (e) { /* 忽略 */ }
    }
    renderBox();
    renderChart(g.prices); // 揭晓: 把隐藏行情(虚线)叠上图
    $("sb-play").hidden = false;
    $("sb-end").hidden = false;
    $("sb-end-title").textContent = (right ? t("sb.win") : t("sb.lose")) + (newBest && right ? " " + t("sb.newBest") : "");
    $("sb-end-stats").textContent = t("sb.endStats",
      g.regime.icon + " " + t("sb.regime." + g.regime.id), score, g.runs);
    $("sb-end-lesson").textContent = t("sb.lesson." + g.regime.id);
    playSound(right ? "win" : "lose");
    document.dispatchEvent(new CustomEvent("qs:stratboxEnd", { detail: { score, right } }));
  }

  function renderIntroBest() {
    const b = loadBest();
    $("sb-best").hidden = !b.best;
    if (b.best) $("sb-best").textContent = t("sb.best", b.best);
  }

  // 滑杆数值回显
  [["sb-fast", "sb-fast-v"], ["sb-slow", "sb-slow-v"], ["sb-stop", "sb-stop-v"]].forEach(([id, out]) => {
    $(id).addEventListener("input", () => { $(out).textContent = $(id).value; });
  });

  $("btn-sb-start").addEventListener("click", start);
  $("btn-sb-again").addEventListener("click", start);
  $("btn-sb-run").addEventListener("click", runBacktest);

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "stratbox") {
      renderIntroBest();
      if (chart) chart.resize();
    }
  });
  document.addEventListener("qs:theme", () => {
    if (chart && (g.playing || g.done)) renderChart(g.done ? g.prices : null);
  });
  window.addEventListener("resize", () => {
    if (chart) chart.resize();
  });
  renderIntroBest();
})();
