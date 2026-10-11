// 买还是等: 择时决策小游戏。每回合展示一段净值走势, 二选一:
//   立即买入 = 按当前价全仓; 等待回调 = 挂 -3% 限价单, 未来 15 天内触价成交, 否则踏空 (收益 0)。
// 未来走势逐日揭晓, 回合收益作用于总资产; 右下角面板实时对比「无脑立即买」基准。
// 8 回合后结算——亲身体会「等回调」到底是折扣还是代价。
// 依赖 app.js 的 $ / toast / playSound / cssVar / qsFmtInt / qsGauss, i18n.js 的 t。
(() => {
  const BEST_KEY = "qs_buydip";
  const ROUNDS = 8;
  const START_ASSETS = 100000;
  const PAST_DAYS = 30;
  const FUTURE_DAYS = 15;
  const DIP_PCT = 0.03; // 等待回调的限价折扣

  let chart = null;
  const g = {
    playing: false, busy: false, round: 0,
    assets: 0, baseAssets: 0,
    past: [], future: [], revealed: 0,
    choice: null, entry: null, fillIdx: null,
    history: [], // {you, base} 每回合收益率
  };

  const loadBest = () => qsLoadBest(BEST_KEY); // 共享实现在 app.js

  // ---------- 行情生成: 每回合随机一种"脾气" (趋势/震荡), 未来延续同脾气 ----------
  function genRound() {
    const drift = -0.005 + Math.random() * 0.013; // 日漂移 -0.5% ~ +0.8%
    const vol = 0.012;
    let p = 100;
    g.past = [p];
    for (let i = 1; i < PAST_DAYS; i++) {
      p = Math.max(1, p * (1 + drift + qsGauss() * vol));
      g.past.push(+p.toFixed(2));
    }
    g.future = [];
    for (let i = 0; i < FUTURE_DAYS; i++) {
      p = Math.max(1, p * (1 + drift + qsGauss() * vol));
      g.future.push(+p.toFixed(2));
    }
  }

  // ---------- 图表 ----------
  function renderChart() {
    if (!chart) chart = echarts.init($("bd-chart"));
    const data = [...g.past, ...g.future.slice(0, g.revealed)];
    const marks = [];
    const decideIdx = PAST_DAYS - 1;
    if (g.choice === "buy") {
      marks.push({ coord: [decideIdx, g.past[decideIdx]], value: "B", itemStyle: { color: cssVar("--up") } });
    } else if (g.choice === "wait" && g.fillIdx != null && g.revealed > g.fillIdx) {
      marks.push({ coord: [PAST_DAYS + g.fillIdx, g.entry], value: "B", itemStyle: { color: cssVar("--up") } });
    }
    chart.setOption({
      animation: false,
      grid: { left: 48, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: data.map((_, i) => "D" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series: [{
        type: "line",
        data,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        areaStyle: { opacity: 0.12, color: cssVar("--lab-blue") },
        markPoint: marks.length ? {
          data: marks.map((m) => ({ ...m, symbol: "pin", symbolSize: 30, label: { color: "#fff", fontSize: 11 } })),
        } : undefined,
        markLine: g.choice === "wait" && g.entry != null ? {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: cssVar("--warn") },
          label: { show: false },
          data: [{ yAxis: g.entry }],
        } : undefined,
      }],
    }, true);
  }

  // ---------- 流程 ----------
  function start() {
    g.playing = true;
    g.busy = false;
    g.round = 0;
    g.assets = START_ASSETS;
    g.baseAssets = START_ASSETS;
    g.history = [];
    $("bd-intro").hidden = true;
    $("bd-end").hidden = true;
    $("bd-play").hidden = false;
    nextRound();
  }

  function nextRound() {
    g.round++;
    g.choice = null;
    g.entry = null;
    g.fillIdx = null;
    g.revealed = 0;
    genRound();
    $("bd-msg").textContent = t("bd.prompt");
    $("bd-msg").className = "bd-msg";
    $("btn-bd-buy").disabled = false;
    $("btn-bd-wait").disabled = false;
    $("btn-bd-next").hidden = true;
    renderStats();
    renderChart();
    if (chart) chart.resize();
  }

  function renderStats() {
    $("bd-round").textContent = `${Math.min(g.round, ROUNDS)} / ${ROUNDS}`;
    $("bd-assets").textContent = qsFmtInt(g.assets);
  }

  function renderHistory() {
    const ul = $("bd-history");
    ul.innerHTML = "";
    g.history.forEach((h, i) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = t("bd.roundN", i + 1);
      const you = document.createElement("b");
      you.textContent = (h.you >= 0 ? "+" : "") + (h.you * 100).toFixed(1) + "%";
      you.className = h.you >= 0 ? "pos" : "neg";
      const base = document.createElement("span");
      base.className = "hint";
      base.textContent = t("bd.vsBase", (h.base >= 0 ? "+" : "") + (h.base * 100).toFixed(1) + "%");
      li.append(label, you, base);
      ul.appendChild(li);
    });
    const totalYou = g.assets / START_ASSETS - 1;
    const totalBase = g.baseAssets / START_ASSETS - 1;
    const sum = $("bd-history-sum");
    sum.textContent = t("bd.sum",
      (totalYou >= 0 ? "+" : "") + (totalYou * 100).toFixed(1) + "%",
      (totalBase >= 0 ? "+" : "") + (totalBase * 100).toFixed(1) + "%");
    sum.className = "bd-history-sum " + (totalYou >= totalBase ? "pos" : "neg");
  }

  function decide(choice) {
    if (!g.playing || g.busy || g.choice) return;
    g.choice = choice;
    g.busy = true;
    $("btn-bd-buy").disabled = true;
    $("btn-bd-wait").disabled = true;
    const now = g.past[PAST_DAYS - 1];
    if (choice === "buy") {
      g.entry = now;
      $("bd-msg").textContent = t("bd.bought", g.entry.toFixed(2));
    } else {
      g.entry = +(now * (1 - DIP_PCT)).toFixed(2);
      g.fillIdx = g.future.findIndex((p) => p <= g.entry);
      if (g.fillIdx < 0) g.fillIdx = null;
      $("bd-msg").textContent = t("bd.waiting", g.entry.toFixed(2));
    }
    playSound("fill");
    reveal();
  }

  function reveal() {
    const timer = setInterval(() => {
      g.revealed++;
      // 等待单触价当日提示成交
      if (g.choice === "wait" && g.fillIdx != null && g.revealed === g.fillIdx + 1) {
        $("bd-msg").textContent = t("bd.filled", g.entry.toFixed(2));
        playSound("buy");
      }
      renderChart();
      if (g.revealed >= FUTURE_DAYS) {
        clearInterval(timer);
        settleRound();
      }
    }, 160);
  }

  function settleRound() {
    const now = g.past[PAST_DAYS - 1];
    const end = g.future[FUTURE_DAYS - 1];
    const baseRet = end / now - 1;
    let youRet = 0;
    if (g.choice === "buy") {
      youRet = baseRet;
    } else if (g.fillIdx != null) {
      youRet = end / g.entry - 1;
    } // 没等到回调 = 空仓踏空, youRet 0
    g.assets = Math.round(g.assets * (1 + youRet));
    g.baseAssets = Math.round(g.baseAssets * (1 + baseRet));
    g.history.push({ you: youRet, base: baseRet });

    const msg = $("bd-msg");
    if (g.choice === "wait" && g.fillIdx == null) {
      msg.textContent = t("bd.missed", (baseRet >= 0 ? "+" : "") + (baseRet * 100).toFixed(1) + "%");
      msg.className = "bd-msg " + (baseRet > 0 ? "neg" : "pos"); // 涨了踏空是痛, 跌了躲过是福
    } else {
      msg.textContent = t("bd.roundDone", (youRet >= 0 ? "+" : "") + (youRet * 100).toFixed(1) + "%");
      msg.className = "bd-msg " + (youRet >= 0 ? "pos" : "neg");
    }
    playSound(youRet >= 0 ? "win" : "lose");
    renderStats();
    renderHistory();
    g.busy = false;
    $("btn-bd-next").textContent = t(g.round >= ROUNDS ? "bd.finish" : "bd.nextRound");
    $("btn-bd-next").hidden = false;
  }

  function next() {
    if (g.round >= ROUNDS) {
      finish();
      return;
    }
    nextRound();
  }

  function finish() {
    g.playing = false;
    const b = loadBest();
    const newBest = g.assets > (b.best || 0);
    if (newBest) {
      try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: g.assets })); } catch (e) { /* 忽略 */ }
    }
    $("bd-play").hidden = true;
    $("bd-end").hidden = false;
    const beat = g.assets >= g.baseAssets;
    $("bd-end-title").textContent = t(beat ? "bd.endWin" : "bd.endLose") + (newBest ? " " + t("bd.newBest") : "");
    $("bd-end-stats").textContent = t("bd.endStats", qsFmtInt(g.assets), qsFmtInt(g.baseAssets));
    $("bd-end-lesson").textContent = t(beat ? "bd.lessonWin" : "bd.lessonLose");
    playSound(beat ? "win" : "lose");
    document.dispatchEvent(new CustomEvent("qs:buydipEnd", { detail: { assets: g.assets, base: g.baseAssets } }));
  }

  function renderIntroBest() {
    const b = loadBest();
    $("bd-best").hidden = !b.best;
    if (b.best) $("bd-best").textContent = t("bd.best", qsFmtInt(b.best));
  }

  $("btn-bd-start").addEventListener("click", start);
  $("btn-bd-again").addEventListener("click", start);
  $("btn-bd-buy").addEventListener("click", () => decide("buy"));
  $("btn-bd-wait").addEventListener("click", () => decide("wait"));
  $("btn-bd-next").addEventListener("click", next);

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "buydip") {
      renderIntroBest();
      if (chart) chart.resize();
    }
  });
  // 主题切换后用新变量重画
  document.addEventListener("qs:theme", () => {
    if (chart && g.playing) renderChart();
  });
  window.addEventListener("resize", () => {
    if (chart) chart.resize();
  });
  renderIntroBest();
})();
