// 期权沙盒 30 日挑战: 纯前端小游戏 (仿重生逆袭/泡沫大亨)。
// 标的随机游走 + 财报日波动放大, BS 定价每日重估 —— 亲手体会时间衰减与杠杆。
// 依赖 app.js 的 $ / toast / cssVar / playSound 与 i18n.js 的 t()。

(() => {
  const TOTAL_DAYS = 30;
  const START_CASH = 100000;
  const MULTIPLIER = 100;        // 一张 = 100 股
  const BASE_VOL = 0.30;         // 定价年化波动率
  const DAILY_SD = 0.019;        // 日波动 (约对应 30% 年化)
  const BEST_KEY = "qs_opt_best";

  let g = null;        // 对局状态
  let ogChart = null;
  let tradeType = "call";

  // ---------- Black-Scholes (r=0, 到期按交易日/252 折年) ----------

  function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function bsPrice(spot, strike, daysLeft, isCall, vol) {
    if (daysLeft <= 0) {
      return Math.max(0, isCall ? spot - strike : strike - spot);
    }
    const T = daysLeft / 252;
    const sd = vol * Math.sqrt(T);
    const d1 = (Math.log(spot / strike) + (vol * vol / 2) * T) / sd;
    const d2 = d1 - sd;
    const call = spot * normCdf(d1) - strike * normCdf(d2);
    return isCall ? call : call - spot + strike; // put-call parity (r=0)
  }

  // ---------- 行情路径: 分段漂移 + 一个提前预告的财报日 ----------

  function newGame() {
    const path = [100];
    // 三段随机漂移: 让一局里有趋势也有震荡, 不至于纯噪声
    const drifts = [rand(-0.004, 0.004), rand(-0.006, 0.006), rand(-0.004, 0.004)];
    const earningsDay = 8 + Math.floor(Math.random() * 15); // 第 9~23 日
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      const drift = drifts[Math.floor((d - 1) / (TOTAL_DAYS / 3))] || 0;
      const shock = d === earningsDay ? 3 : 1; // 财报日波动三倍
      const ret = drift + gauss() * DAILY_SD * shock;
      path.push(+(path[d - 1] * (1 + ret)).toFixed(2));
    }
    return { day: 0, cash: START_CASH, path, earningsDay, positions: [], over: false };
  }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function gauss() {
    // Box-Muller
    const u = Math.random() || 1e-9;
    const v = Math.random() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // 财报临近波动溢价: 定价波动率在财报前 3 天逐步抬升, 财报过后回落
  function pricingVol() {
    const toEarnings = g.earningsDay - g.day;
    if (toEarnings > 0 && toEarnings <= 3) return BASE_VOL * (1 + (4 - toEarnings) * 0.15);
    return BASE_VOL;
  }

  function spot() { return g.path[g.day]; }

  function posValue(p) {
    return bsPrice(spot(), p.strike, p.expiryDay - g.day, p.isCall, pricingVol()) * MULTIPLIER * p.qty;
  }

  // ---------- 交易 ----------

  function strikeOptions() {
    const s = spot();
    // 围绕现价取 5 档 (约 ±10%), 取整到 1 元
    return [-0.1, -0.05, 0, 0.05, 0.1].map((off) => Math.max(1, Math.round(s * (1 + off))));
  }

  function refreshStrikes() {
    const sel = $("og-strike");
    const prev = sel.value;
    sel.innerHTML = "";
    strikeOptions().forEach((k) => {
      const opt = document.createElement("option");
      opt.value = String(k);
      opt.textContent = String(k);
      sel.appendChild(opt);
    });
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    else sel.selectedIndex = 2; // 默认 ATM
  }

  function tradeCost() {
    const strike = Number($("og-strike").value);
    const days = Number($("og-expiry").value);
    const qty = Math.min(10, Math.max(1, Number($("og-qty").value) || 1));
    const prem = bsPrice(spot(), strike, days, tradeType === "call", pricingVol());
    return { strike, days, qty, prem, cost: prem * MULTIPLIER * qty };
  }

  function buy() {
    const { strike, days, qty, prem, cost } = tradeCost();
    if (cost <= 0) return;
    if (cost > g.cash) {
      toast(t("og.noCash"));
      return;
    }
    g.cash -= cost;
    g.positions.push({
      isCall: tradeType === "call", strike, qty,
      expiryDay: g.day + days, cost, openPrem: prem,
    });
    if (typeof playSound === "function") playSound("buy");
    toast(t("og.bought", t(tradeType === "call" ? "opt.call" : "opt.put"), strike, qty));
    render();
  }

  function closePosition(idx) {
    const p = g.positions[idx];
    if (!p) return;
    const value = posValue(p);
    g.cash += value;
    g.positions.splice(idx, 1);
    if (typeof playSound === "function") playSound("sell");
    const pnl = value - p.cost;
    toast(t(pnl >= 0 ? "og.closedWin" : "og.closedLose", fmt(Math.abs(pnl))));
    render();
  }

  // ---------- 推进与结算 ----------

  function nextDay() {
    if (g.over) return;
    g.day++;
    // 到期结算: 按内在价值兑付
    const expired = g.positions.filter((p) => p.expiryDay <= g.day);
    g.positions = g.positions.filter((p) => p.expiryDay > g.day);
    expired.forEach((p) => {
      const payout = Math.max(0, (p.isCall ? spot() - p.strike : p.strike - spot())) * MULTIPLIER * p.qty;
      g.cash += payout;
      toast(t(payout > 0 ? "og.expiredWin" : "og.expiredZero",
        t(p.isCall ? "opt.call" : "opt.put"), p.strike, fmt(payout)));
    });
    if (g.day >= TOTAL_DAYS) {
      finish();
      return;
    }
    render();
  }

  function finish() {
    // 未平仓按当前 BS 价值折现离场
    g.positions.forEach((p) => { g.cash += posValue(p); });
    g.positions = [];
    g.over = true;
    const ret = (g.cash - START_CASH) / START_CASH;
    const tier = ret >= 0.5 ? "god" : ret >= 0.2 ? "pro" : ret > 0 ? "steady" : ret > -0.5 ? "tuition" : "zero";
    $("og-game").hidden = true;
    $("og-result").hidden = false;
    $("og-result-title").textContent = t("og.tier." + tier);
    $("og-result-detail").textContent = t("og.resultDetail", fmt(g.cash), (ret * 100).toFixed(1) + "%");
    try {
      const best = Number(localStorage.getItem(BEST_KEY) || "-1e9");
      if (ret > best) {
        localStorage.setItem(BEST_KEY, String(ret));
        toast(t("og.newBest"));
      }
    } catch (e) { /* 隐私模式忽略 */ }
    if (typeof playSound === "function") playSound(ret >= 0 ? "win" : "lose");
  }

  // ---------- 渲染 ----------

  function fmt(n) {
    return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }

  function render() {
    $("og-day").textContent = `${g.day + 1} / ${TOTAL_DAYS}`;
    $("og-cash").textContent = fmt(g.cash);
    const pv = g.positions.reduce((a, p) => a + posValue(p), 0);
    $("og-pos-value").textContent = fmt(pv);
    const total = g.cash + pv;
    const totalEl = $("og-total");
    totalEl.textContent = fmt(total);
    totalEl.className = total >= START_CASH ? "pos" : "neg";
    $("og-spot").textContent = spot().toFixed(2);

    // 财报预告 (提前 3 天) 与当日提醒
    const news = $("og-news");
    const toEarnings = g.earningsDay - g.day;
    if (toEarnings > 0 && toEarnings <= 3) {
      news.hidden = false;
      news.textContent = t("og.earningsSoon", toEarnings);
    } else if (toEarnings === 0) {
      news.hidden = false;
      news.textContent = t("og.earningsToday");
    } else {
      news.hidden = true;
    }

    refreshStrikes();
    renderCost();
    renderPositions();
    renderChart();
    $("btn-og-call").classList.toggle("active", tradeType === "call");
    $("btn-og-put").classList.toggle("active", tradeType === "put");
  }

  function renderCost() {
    if (!g || g.over) return;
    const { prem, qty, cost } = tradeCost();
    $("og-cost").textContent = `${prem.toFixed(2)} × ${MULTIPLIER} × ${qty} = ${fmt(cost)}`;
  }

  function renderPositions() {
    const tbody = $("og-positions").querySelector("tbody");
    tbody.innerHTML = "";
    if (!g.positions.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" class="empty-row"></td>`;
      tr.querySelector(".empty-row").textContent = t("og.noPos");
      tbody.appendChild(tr);
      return;
    }
    g.positions.forEach((p, i) => {
      const value = posValue(p);
      const pnl = value - p.cost;
      const cls = pnl >= 0 ? "pos" : "neg";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td></td><td>${p.strike}</td><td>${p.expiryDay - g.day}${t("og.dayUnit")}</td>
        <td>${p.qty}</td><td>${fmt(p.cost)}</td><td>${fmt(value)}</td>
        <td class="${cls}">${pnl >= 0 ? "+" : "-"}${fmt(Math.abs(pnl))}</td><td></td>`;
      tr.children[0].textContent = t(p.isCall ? "opt.call" : "opt.put");
      const btn = document.createElement("button");
      btn.className = "small";
      btn.textContent = t("og.close");
      btn.addEventListener("click", () => closePosition(i));
      tr.children[7].appendChild(btn);
      tbody.appendChild(tr);
    });
  }

  function renderChart() {
    if (!ogChart) {
      ogChart = echarts.init($("og-chart"));
      window.addEventListener("resize", () => ogChart.resize());
    }
    const xs = [];
    const ys = [];
    for (let d = 0; d <= g.day; d++) {
      xs.push(t("og.dayLabel", d + 1));
      ys.push(g.path[d]);
    }
    const marks = [];
    // 持仓行权价虚线: 直观看到现价离行权还差多远
    g.positions.forEach((p) => marks.push({ yAxis: p.strike }));
    ogChart.setOption({
      backgroundColor: "transparent",
      animation: false,
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: { type: "category", data: xs,
        axisLabel: { color: cssVar("--text-muted") },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", scale: true,
        axisLabel: { color: cssVar("--text-muted") },
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } } },
      series: [{ type: "line", data: ys, showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--accent") },
        areaStyle: { opacity: 0.08, color: cssVar("--accent") },
        markLine: { symbol: "none", silent: true,
          lineStyle: { color: cssVar("--warn"), type: "dashed" },
          label: { color: cssVar("--text-muted") }, data: marks } }],
    }, true);
    ogChart.resize();
  }

  function renderBest() {
    try {
      const best = localStorage.getItem(BEST_KEY);
      const el = $("og-best");
      if (best == null) { el.hidden = true; return; }
      el.hidden = false;
      el.textContent = t("og.best", (Number(best) * 100).toFixed(1) + "%");
    } catch (e) { /* ignore */ }
  }

  function start() {
    g = newGame();
    tradeType = "call";
    $("og-intro").hidden = true;
    $("og-result").hidden = true;
    $("og-game").hidden = false;
    render();
  }

  // ---------- 事件绑定 ----------

  $("btn-og-start").addEventListener("click", start);
  $("btn-og-again").addEventListener("click", () => { renderBest(); start(); });
  $("btn-og-next").addEventListener("click", () => { if (g && !g.over) nextDay(); });
  $("btn-og-quit").addEventListener("click", () => { if (g && !g.over) finish(); });
  $("btn-og-buy").addEventListener("click", () => { if (g && !g.over) buy(); });
  $("btn-og-call").addEventListener("click", () => { tradeType = "call"; if (g && !g.over) render(); });
  $("btn-og-put").addEventListener("click", () => { tradeType = "put"; if (g && !g.over) render(); });
  ["og-strike", "og-expiry", "og-qty"].forEach((id) => {
    $(id).addEventListener("input", renderCost);
    $(id).addEventListener("change", renderCost);
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "option") return;
    renderBest();
    if (g && !g.over) render(); // 图表在隐藏容器中尺寸为 0, 回到视图要重算
  });
  document.addEventListener("qs:theme", () => {
    if (!$("view-option").hidden && g && !g.over) renderChart();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-option").hidden) { renderBest(); if (g && !g.over) render(); }
  });
})();
