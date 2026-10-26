// 周一的一千次: 时间循环 × 市场自反性。同一个交易周无限重放, 基础行情完全相同——
// 但你的交易会扰动它: 仓位越大, 买单把你记住的那个顶推没, 卖单把你记住的底砸穿。
// 小仓搬运答案有效, 大仓会亲手毁掉答案; 吃答案的最优规模在哪里, 是这局唯一的问题。
// 7 次循环内单周收益达到 +8% 即破环, 用的循环越少评级越高。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_loopweek";
  const DAYS = 5;
  const CAPITAL = 1000000;
  const MAX_LOOPS = 7;
  const TARGET = 0.08; // 破环线: 单循环收益 +8%
  const FRACS = [0.25, 0.5, 1.0];

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const g = {
    base: null, // 基础周行情 (所有循环共享的「记忆」)
    loop: 0, day: 0, path: null,
    cash: 0, shares: 0, buy: null, sell: null,
    history: [], // 每个循环的 {path, ret}
    done: false, escaped: false,
  };

  const chartH = qsChart("lw-chart", () => buildChartOption());
  const fmtPct = (x) => (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

  function startGame() {
    // 基础周: 设计成「有一个可吃的坑和顶」的形状 + 噪声
    const rng = mulberry32(Math.floor(Math.random() * 1e9));
    const shape = [0, -0.04 - rng() * 0.03, 0.05 + rng() * 0.04, 0.03 + rng() * 0.03, -0.02 - rng() * 0.02];
    const base = [100];
    shape.slice(1).forEach((s) => {
      base.push(+(base[base.length - 1] * (1 + s + 0.01 * (rng() - 0.5))).toFixed(2));
    });
    g.base = base;
    g.loop = 0;
    g.history = [];
    g.done = false;
    g.escaped = false;
    $("lw-select").hidden = true;
    $("lw-report").hidden = true;
    $("lw-room").hidden = false;
    startLoop();
  }

  function startLoop() {
    g.loop++;
    g.day = 0;
    g.path = [g.base[0]];
    g.cash = CAPITAL;
    g.shares = 0;
    g.buy = null;
    g.sell = null;
    renderDay();
  }

  // 自反性引擎: 今天的基础价 × 你此前交易留下的扰动。
  // 买入规模 f: 成交当日滑价 +0.5f; 次日被你推高 +0.4f; 之后每天回吐 -0.25f (均值回归更狠)。
  // 卖出对称反向。这正是「大仓位亲手毁掉记忆里的顶」的实现。
  function perturbedPrice(day) {
    let mult = 1;
    [{ tr: g.buy, sign: 1 }, { tr: g.sell, sign: -1 }].forEach(({ tr, sign }) => {
      if (!tr || day <= tr.day) return;
      const gap = day - tr.day;
      if (gap === 1) mult *= 1 + sign * 0.4 * tr.frac;
      else mult *= 1 + sign * (0.4 * tr.frac - 0.25 * tr.frac * (gap - 1));
    });
    return +(g.base[day] * mult).toFixed(2);
  }

  function doBuy(frac) {
    if (g.buy || g.done) return;
    const raw = perturbedPrice(g.day);
    const fill = +(raw * (1 + 0.5 * frac * 0.1)).toFixed(2); // 滑价: 规模的 5%
    const shares = Math.floor((CAPITAL * frac) / fill / 100) * 100;
    if (shares <= 0) return;
    g.cash -= shares * fill;
    g.shares = shares;
    g.buy = { day: g.day, frac, price: fill };
    playSound("fill");
    renderDay();
  }

  function doSell() {
    if (!g.buy || g.sell || g.shares <= 0 || g.done) return;
    const raw = perturbedPrice(g.day);
    const fill = +(raw * (1 - 0.5 * g.buy.frac * 0.1)).toFixed(2);
    g.cash += g.shares * fill;
    g.sell = { day: g.day, frac: g.buy.frac, price: fill };
    g.shares = 0;
    playSound("fill");
    renderDay();
  }

  function nextDay() {
    if (g.done) return;
    if (g.day >= DAYS - 1) {
      endLoop();
      return;
    }
    g.day++;
    g.path.push(perturbedPrice(g.day));
    renderDay();
  }

  function endLoop() {
    // 周五收盘: 没卖的强制平仓
    if (g.shares > 0) doSell();
    const eq = g.cash;
    const ret = eq / CAPITAL - 1;
    g.history.push({ path: g.path.slice(), ret, buy: g.buy, sell: g.sell });
    if (ret >= TARGET) {
      g.escaped = true;
      finish();
      return;
    }
    if (g.loop >= MAX_LOOPS) {
      finish();
      return;
    }
    toast(t("lw.loopEnd", g.loop, fmtPct(ret)));
    playSound("flip");
    startLoop();
  }

  function finish() {
    g.done = true;
    const last = g.history[g.history.length - 1];
    const gain = g.escaped ? Math.max(60, 300 - 40 * (g.loop - 1)) : 0;
    $("lw-room").hidden = true;
    $("lw-report").hidden = false;
    const concl = $("lwr-conclusion");
    concl.textContent = g.escaped
      ? t("lw.win", gain, g.loop, fmtPct(last.ret))
      : t("lw.lose", fmtPct(Math.max(...g.history.map((h) => h.ret))));
    concl.className = "qdr-conclusion " + (g.escaped ? "win" : "lose");
    const ul = $("lwr-loops");
    ul.innerHTML = "";
    g.history.forEach((h, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("lw.loopNo", i + 1);
      const dd = document.createElement("span");
      dd.textContent = h.buy
        ? t("lw.loopLine", t("lw.dayName" + h.buy.day), (h.buy.frac * 100) + "%", h.buy.price.toFixed(2), h.sell ? h.sell.price.toFixed(2) : "--", fmtPct(h.ret))
        : t("lw.loopIdle", fmtPct(h.ret));
      li.append(tt, dd);
      ul.appendChild(li);
    });
    $("lwr-why").textContent = t("lw.moral");
    playSound(g.escaped ? "win" : "lose");
    if (g.escaped) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("lw.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function renderDay() {
    $("lw-head").textContent = t("lw.loopNo", g.loop) + " · " + t("lw.dayName" + g.day);
    $("lw-loops-left").textContent = String(MAX_LOOPS - g.loop);
    const px = g.path[g.day];
    $("lw-price").textContent = px.toFixed(2);
    const eq = g.cash + g.shares * px;
    $("lw-equity").textContent = Math.round(eq).toLocaleString() + "（" + fmtPct(eq / CAPITAL - 1) + "）";
    // 记忆对照: 基础周里今天「本该」是什么价
    const drift = px / g.base[g.day] - 1;
    $("lw-memory").textContent = g.loop === 1
      ? t("lw.firstLoop")
      : t("lw.memoryLine", g.base[g.day].toFixed(2), Math.abs(drift) < 0.001 ? t("lw.onScript") : t("lw.offScript", fmtPct(drift)));
    $("lw-frac-row").hidden = !!g.buy;
    $("btn-lw-sell").disabled = !g.buy || !!g.sell || g.done;
    $("btn-lw-next").disabled = g.done;
    chartH.refresh();
  }

  function backToSelect() {
    g.done = true;
    $("lw-room").hidden = true;
    $("lw-report").hidden = true;
    $("lw-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("lw-best").hidden = !b.best;
    if (b.best) $("lw-best").textContent = t("lw.best", b.best);
  }

  // ---------- 图表: 当前循环实线, 历史循环淡影, 记忆 (基础周) 虚线 ----------

  function buildChartOption() {
    if (!g.base || $("lw-room").hidden) return null;
    const series = [];
    g.history.forEach((h, i) => {
      series.push({
        type: "line",
        name: t("lw.loopNo", i + 1),
        data: h.path,
        showSymbol: false,
        lineStyle: { width: 1, color: cssVar("--text-muted"), opacity: 0.3 },
        itemStyle: { color: cssVar("--text-muted") },
      });
    });
    if (g.loop > 1 || g.history.length) {
      series.push({
        type: "line",
        name: t("lw.lineMemory"),
        data: g.base,
        showSymbol: false,
        lineStyle: { width: 1.5, color: cssVar("--ma20"), type: "dashed" },
        itemStyle: { color: cssVar("--ma20") },
      });
    }
    series.push({
      type: "line",
      name: t("lw.lineNow"),
      data: g.path,
      showSymbol: true,
      symbolSize: 5,
      lineStyle: { width: 2, color: cssVar("--lab-blue") },
      itemStyle: { color: cssVar("--lab-blue") },
    });
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 26, bottom: 24 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 }, itemWidth: 14 },
      xAxis: {
        type: "category",
        data: Array.from({ length: DAYS }, (_, i) => t("lw.dayName" + i)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series,
    };
  }

  // ---------- 接线 ----------

  $("btn-lw-start").addEventListener("click", startGame);
  $("btn-lw-buy0").addEventListener("click", () => doBuy(FRACS[0]));
  $("btn-lw-buy1").addEventListener("click", () => doBuy(FRACS[1]));
  $("btn-lw-buy2").addEventListener("click", () => doBuy(FRACS[2]));
  $("btn-lw-sell").addEventListener("click", doSell);
  $("btn-lw-next").addEventListener("click", nextDay);
  $("btn-lw-back").addEventListener("click", backToSelect);
  $("btn-lwr-again").addEventListener("click", startGame);
  $("btn-lwr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "loopweek") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-loopweek").hidden) return;
    renderIntroBest();
    if (!$("lw-room").hidden && g.base && !g.done) renderDay();
  });

  renderIntroBest();
})();
