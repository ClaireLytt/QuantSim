// 闪电盘口: 60 秒实时盘口小游戏。做多/做空/平仓三键, 每笔 0.05% 手续费 ——
// 用手感教「过度交易」的代价: 追噪声会被佣金磨死, 等真趋势一两笔就够。
// 依赖 app.js 的 $ / toast / cssVar / playSound 与 i18n.js 的 t()。

(() => {
  const DURATION_TICKS = 240;   // 60 秒 × 4 tick/秒
  const TICK_MS = 250;
  const START_CASH = 100000;
  const FEE_RATE = 0.0005;      // 单边 0.05%
  const BEST_KEY = "qs_tape_best";

  let g = null;
  let timer = null;
  let tpChart = null;

  function gauss() {
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * 预生成整条盘口: 噪声为主, 随机埋 2~3 段趋势 (每段 20~50 tick 带漂移)。
   * 预生成保证"离开页面暂停再回来"结果一致, 也防止拉长局时间刷分。
   */
  function genPath() {
    const path = [100];
    const drift = new Array(DURATION_TICKS + 1).fill(0);
    const segs = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < segs; i++) {
      const start = 20 + Math.floor(Math.random() * (DURATION_TICKS - 80));
      const len = 20 + Math.floor(Math.random() * 30);
      const d = (Math.random() < 0.5 ? -1 : 1) * (0.0008 + Math.random() * 0.0012);
      for (let k = start; k < Math.min(start + len, DURATION_TICKS); k++) drift[k] += d;
    }
    for (let i = 1; i <= DURATION_TICKS; i++) {
      const ret = drift[i] + gauss() * 0.0016;
      path.push(+(path[i - 1] * (1 + ret)).toFixed(2));
    }
    return path;
  }

  function newGame() {
    return {
      tick: 0, path: genPath(), cash: START_CASH,
      side: 0,          // 1 多 / -1 空 / 0 空仓
      qty: 0, entry: 0,
      trades: 0, fees: 0,
      over: false,
    };
  }

  function price() { return g.path[g.tick]; }

  /** 浮动盈亏: 多 = (现价-开仓价)×数量, 空取反 */
  function upnl() {
    if (!g.side) return 0;
    return (price() - g.entry) * g.qty * g.side;
  }

  function equity() { return g.cash + (g.side ? g.entry * g.qty + upnl() : 0); }

  // ---------- 交易 ----------

  function open(side) {
    if (g.side === side) return;        // 同向重复点击忽略
    if (g.side !== 0) close(true);      // 反手先平
    const notional = g.cash * 0.98;     // 留一点现金付手续费
    const qty = notional / price();
    const fee = notional * FEE_RATE;
    g.cash -= notional + fee;
    g.side = side;
    g.qty = qty;
    g.entry = price();
    g.trades++;
    g.fees += fee;
    if (typeof playSound === "function") playSound(side > 0 ? "buy" : "sell");
    renderStats();
  }

  function close(silent) {
    if (!g.side) return;
    const value = g.entry * g.qty + upnl();
    const fee = value * FEE_RATE;
    g.cash += value - fee;
    g.fees += fee;
    g.trades++;
    g.side = 0;
    g.qty = 0;
    if (!silent && typeof playSound === "function") playSound("sell");
    renderStats();
  }

  // ---------- 推进 ----------

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      g.tick++;
      if (g.tick >= DURATION_TICKS) {
        finish();
        return;
      }
      renderStats();
      renderChart(false);
    }, TICK_MS);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function finish() {
    stopTimer();
    close(true);
    g.over = true;
    const ret = (g.cash - START_CASH) / START_CASH;
    const tier = ret >= 0.03 ? "sniper" : ret > 0.005 ? "scalper" : ret > -0.005 ? "breakeven"
        : ret > -0.03 ? "churned" : "rekt";
    $("tp-game").hidden = true;
    $("tp-result").hidden = false;
    $("tp-result-title").textContent = t("tp.tier." + tier);
    $("tp-result-detail").textContent =
      t("tp.resultDetail", (ret * 100).toFixed(2) + "%", g.trades, fmt(g.fees));
    // 教学点睛: 手续费和收益放一起看, 过度交易一目了然
    const insight = $("tp-result-insight");
    if (g.trades > 14) {
      insight.textContent = t("tp.insightOvertrade", g.trades, fmt(g.fees));
    } else if (g.trades > 0 && ret > 0) {
      insight.textContent = t("tp.insightClean", g.trades);
    } else {
      insight.textContent = t("tp.insightIdle");
    }
    try {
      const best = Number(localStorage.getItem(BEST_KEY) || "-1e9");
      if (ret > best) {
        localStorage.setItem(BEST_KEY, String(ret));
        toast(t("tp.newBest"));
      }
    } catch (e) { /* ignore */ }
    if (typeof playSound === "function") playSound(ret >= 0 ? "win" : "lose");
  }

  // ---------- 渲染 ----------

  function fmt(n) {
    return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }

  function renderStats() {
    $("tp-time").textContent = Math.ceil((DURATION_TICKS - g.tick) * TICK_MS / 1000) + "s";
    $("tp-price").textContent = price().toFixed(2);
    $("tp-pos").textContent = g.side === 0 ? t("tp.posNone")
      : (g.side > 0 ? t("tp.long") : t("tp.short")) + " @ " + g.entry.toFixed(2);
    const u = upnl();
    const upnlEl = $("tp-upnl");
    upnlEl.textContent = (u >= 0 ? "+" : "-") + fmt(Math.abs(u));
    upnlEl.className = u >= 0 ? "pos" : "neg";
    const eq = equity();
    const eqEl = $("tp-equity");
    eqEl.textContent = fmt(eq);
    eqEl.className = eq >= START_CASH ? "pos" : "neg";
    $("tp-trades").textContent = String(g.trades);
    $("tp-fees").textContent = fmt(g.fees);
    $("btn-tp-long").disabled = g.side === 1;
    $("btn-tp-short").disabled = g.side === -1;
    $("btn-tp-flat").disabled = g.side === 0;
  }

  function renderChart(full) {
    if (!tpChart) {
      tpChart = echarts.init($("tp-chart"));
      window.addEventListener("resize", () => tpChart.resize());
    }
    const ys = g.path.slice(0, g.tick + 1);
    const marks = g.side ? [{ yAxis: g.entry }] : [];
    tpChart.setOption({
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 48, right: 12, top: 10, bottom: 20 },
      xAxis: { type: "category", data: ys.map((_, i) => i), show: false,
        min: 0, max: DURATION_TICKS },
      yAxis: { type: "value", scale: true,
        axisLabel: { color: cssVar("--text-muted") },
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } } },
      series: [{ type: "line", data: ys, showSymbol: false,
        lineStyle: { width: 2, color: g.side === 0 ? cssVar("--accent")
          : upnl() >= 0 ? cssVar("--up") : cssVar("--down") },
        markLine: { symbol: "none", silent: true,
          lineStyle: { color: cssVar("--warn"), type: "dashed" },
          label: { show: false }, data: marks } }],
    }, full === true);
    if (full === true) tpChart.resize();
  }

  function renderBest() {
    try {
      const best = localStorage.getItem(BEST_KEY);
      const el = $("tp-best");
      if (best == null) { el.hidden = true; return; }
      el.hidden = false;
      el.textContent = t("tp.best", (Number(best) * 100).toFixed(2) + "%");
    } catch (e) { /* ignore */ }
  }

  function start() {
    g = newGame();
    $("tp-intro").hidden = true;
    $("tp-result").hidden = true;
    $("tp-game").hidden = false;
    renderStats();
    renderChart(true);
    startTimer();
  }

  // ---------- 事件绑定 ----------

  $("btn-tp-start").addEventListener("click", start);
  $("btn-tp-again").addEventListener("click", () => { renderBest(); start(); });
  $("btn-tp-long").addEventListener("click", () => { if (g && !g.over && timer) open(1); });
  $("btn-tp-short").addEventListener("click", () => { if (g && !g.over && timer) open(-1); });
  $("btn-tp-flat").addEventListener("click", () => { if (g && !g.over && timer) close(false); });

  // 离开视图暂停计时 (盘口在后台空跑既不公平也浪费), 回来继续
  document.addEventListener("qs:view", (e) => {
    if (e.detail === "tape") {
      renderBest();
      if (g && !g.over) { renderChart(true); startTimer(); }
    } else {
      stopTimer();
    }
  });
  document.addEventListener("qs:theme", () => {
    if (!$("view-tape").hidden && g && !g.over) renderChart(true);
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-tape").hidden) { renderBest(); if (g && !g.over) renderStats(); }
  });
})();
