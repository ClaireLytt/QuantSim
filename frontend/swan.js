// 黑天鹅轮盘: 一局 20 个交易日, 你确切知道会发生 3 次重大事件——但不知道哪天、
// 什么事件、什么方向 (利好也是黑天鹅, 踏空同样致命)。每天两个决策: 仓位 (调仓
// 有手续费磨损) 和保险 (价格随市场恐慌度浮动——越多人觉得要出事越贵)。
// 胜负是双指标: 终值达标 且 最大回撤守住——只看收益会鼓励裸奔。
// 纸面原型 C 的数字化 (docs/gameplay-core-loops-2026-10.md)。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_swan";
  const DAYS = 20;
  const EQ0 = 100;
  const WIN_EQ = 115; // 终值线
  const FLOOR_EQ = 75; // 回撤线: 全程最低点不得击穿
  const FEE_PER_STEP = 0.5; // 每调 10% 仓位的手续费 (净值点)

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 事件卡池: 利空利好各半, 幅度 = 当日标的涨跌 (常规日只有 ±2%)
  const EVENTS = [
    { id: "hike", pct: -0.15, zh: "央行紧急加息 50 基点", en: "Emergency 50bp rate hike" },
    { id: "blowup", pct: -0.18, zh: "行业龙头财务暴雷", en: "Sector leader accounting blowup" },
    { id: "geo", pct: -0.12, zh: "地缘冲突升级", en: "Geopolitical conflict escalates" },
    { id: "margin", pct: -0.14, zh: "两融强平连环踩踏", en: "Margin-call liquidation cascade" },
    { id: "reg", pct: -0.11, zh: "行业监管新政落地", en: "Harsh new industry regulation" },
    { id: "default", pct: -0.16, zh: "巨头债务违约", en: "Giant corporate debt default" },
    { id: "cut", pct: 0.13, zh: "超预期全面降准", en: "Surprise broad reserve-ratio cut" },
    { id: "ma", pct: 0.15, zh: "龙头溢价要约收购", en: "Premium takeover bid for the leader" },
    { id: "earn", pct: 0.12, zh: "业绩集体超预期", en: "Earnings beat across the board" },
    { id: "policy", pct: 0.14, zh: "重磅产业扶持政策", en: "Major industrial policy stimulus" },
    { id: "fund", pct: 0.11, zh: "长线资金宣布入场", en: "Long-term funds announce entry" },
    { id: "deal", pct: 0.12, zh: "贸易协议意外达成", en: "Surprise trade deal signed" },
  ];

  const g = {
    rng: null, day: 0, eq: EQ0, minEq: EQ0, pos: 0, prevPos: 0,
    eventDays: [], events: [], history: [], // {day, move, isEvent, event, insured, fee, eqAfter}
    curve: [EQ0], feesPaid: 0, insSpent: 0, done: false,
  };

  const chartH = qsChart("sw-chart", () => buildChartOption());

  function startGame() {
    g.rng = mulberry32(Math.floor(Math.random() * 1e9));
    g.day = 1;
    g.eq = EQ0;
    g.minEq = EQ0;
    g.pos = 0;
    g.prevPos = 0;
    g.history = [];
    g.curve = [EQ0];
    g.feesPaid = 0;
    g.insSpent = 0;
    g.done = false;
    // 暗抽 3 个事件日 (第 3 天起, 互不相同) + 3 张事件卡
    const days = [];
    while (days.length < 3) {
      const d = 3 + Math.floor(g.rng() * (DAYS - 2));
      if (!days.includes(d)) days.push(d);
    }
    g.eventDays = days.sort((a, b) => a - b);
    g.events = [...EVENTS].sort(() => g.rng() - 0.5).slice(0, 3);
    $("sw-select").hidden = true;
    $("sw-report").hidden = true;
    $("sw-room").hidden = false;
    $("sw-pos").value = "0";
    $("sw-ins").checked = false;
    renderDay();
  }

  // 保险动态定价: 恐慌定价的微缩模型——刚出过事便宜 (人人惊魂未定没人续保),
  // 连续平静 5 天变贵 (温水里保费最贵的时候才想起要买)
  function insPrice() {
    const lastEvent = [...g.history].reverse().find((h) => h.isEvent);
    if (lastEvent && lastEvent.day === g.day - 1) return 1;
    const calmStreak = g.history.length - (lastEvent ? lastEvent.day : 0);
    return calmStreak >= 5 ? 3 : 2;
  }

  function settle() {
    if (g.done) return;
    const pos = Number($("sw-pos").value);
    const insured = $("sw-ins").checked;
    const price = insPrice();
    // 1) 调仓手续费: 每 10% 一档
    const fee = Math.abs(pos - g.prevPos) / 10 * FEE_PER_STEP;
    g.eq -= fee;
    g.feesPaid += fee;
    // 2) 保险费
    if (insured) { g.eq -= price; g.insSpent += price; }
    // 3) 当日行情: 事件日翻事件卡, 常规日掷骰 ±2%/0
    const evIdx = g.eventDays.indexOf(g.day);
    const isEvent = evIdx >= 0;
    const event = isEvent ? g.events[evIdx] : null;
    let move;
    if (isEvent) move = event.pct;
    else {
      const roll = g.rng();
      move = roll < 0.33 ? -0.02 : roll > 0.67 ? 0.02 : 0;
    }
    // 4) 结算: 保险只在事件日生效且只对损失减半 (方向受益不打折)
    let pnl = g.eq * (pos / 100) * move;
    if (isEvent && insured && pnl < 0) pnl /= 2;
    g.eq += pnl;
    g.minEq = Math.min(g.minEq, g.eq);
    g.prevPos = pos;
    g.pos = pos;
    g.history.push({ day: g.day, move, isEvent, event, insured, fee, pnl, eqAfter: g.eq });
    g.curve.push(g.eq);
    if (isEvent) {
      playSound(pnl >= 0 ? "win" : "lose");
      toast(t("sw.extra", pick(event), (event.pct * 100).toFixed(0)));
    } else playSound("fill");
    // 击穿回撤线不直接出局, 但胜利已无望——继续玩完看完整曲线
    if (g.day >= DAYS) { finish(); return; }
    g.day++;
    $("sw-ins").checked = false;
    renderDay();
  }

  function finish() {
    g.done = true;
    const retOk = g.eq >= WIN_EQ;
    const ddOk = g.minEq >= FLOOR_EQ;
    const win = retOk && ddOk;
    const half = retOk || ddOk;
    $("sw-room").hidden = true;
    $("sw-report").hidden = false;
    const concl = $("swr-conclusion");
    concl.textContent = win
      ? t("sw.win", g.eq.toFixed(1), g.minEq.toFixed(1))
      : half
        ? t("sw.half", g.eq.toFixed(1), g.minEq.toFixed(1), t(retOk ? "sw.failDd" : "sw.failRet"))
        : t("sw.lose", g.eq.toFixed(1), g.minEq.toFixed(1));
    concl.className = "qdr-conclusion " + (win ? "win" : "lose");
    $("swr-stats").textContent = t("sw.statsLine", g.feesPaid.toFixed(1), g.insSpent.toFixed(1));
    const ul = $("swr-log");
    ul.innerHTML = "";
    g.history.filter((h) => h.isEvent).forEach((h) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("sw.dayShort", h.day) + " " + pick(h.event);
      const dd = document.createElement("span");
      dd.textContent = t("sw.evLogLine", (h.move * 100).toFixed(0), g.prettyPnl(h.pnl),
        t(h.insured ? "sw.insYes" : "sw.insNo"));
      li.append(tt, dd);
      ul.appendChild(li);
    });
    $("swr-why").textContent = t("sw.moral");
    playSound(win ? "win" : "lose");
    const score = win ? Math.round(g.eq - EQ0) : 0;
    if (win && score > 0) {
      const b = qsLoadBest(BEST_KEY);
      if (score > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: score });
        toast(t("sw.newBest", score));
      }
    }
    renderIntroBest();
  }

  g.prettyPnl = (v) => (v >= 0 ? "+" : "") + v.toFixed(1);

  function renderDay() {
    $("sw-day").textContent = t("sw.dayNo", g.day, DAYS);
    const eqEl = $("sw-eq");
    eqEl.textContent = g.eq.toFixed(1);
    eqEl.classList.toggle("neg", g.eq < FLOOR_EQ + 10);
    $("sw-min").textContent = g.minEq.toFixed(1);
    const left = g.eventDays.filter((d) => d >= g.day).length;
    $("sw-left").textContent = t("sw.leftLine", left);
    $("sw-insprice").textContent = t("sw.insLine", insPrice());
    renderCalendar();
    renderSlider();
    chartH.refresh();
  }

  function renderCalendar() {
    const wrap = $("sw-cal");
    wrap.innerHTML = "";
    for (let d = 1; d <= DAYS; d++) {
      const cell = document.createElement("i");
      const past = g.history.find((h) => h.day === d);
      let cls = "sw-cell";
      if (past) {
        cls += past.isEvent ? " ev" : past.move > 0 ? " up" : past.move < 0 ? " down" : " flat";
        cell.textContent = past.isEvent ? "!" : "";
      } else if (d === g.day) {
        cls += " today";
        cell.textContent = String(d);
      } else cell.textContent = "?";
      cell.className = cls;
      wrap.appendChild(cell);
    }
  }

  function renderSlider() {
    const pos = Number($("sw-pos").value);
    $("sw-pos-v").textContent = pos + "%";
    const fee = Math.abs(pos - g.prevPos) / 10 * FEE_PER_STEP;
    $("sw-fee").textContent = t("sw.feeLine", fee.toFixed(1));
  }

  function backToSelect() {
    $("sw-room").hidden = true;
    $("sw-report").hidden = true;
    $("sw-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("sw-best").hidden = !b.best;
    if (b.best) $("sw-best").textContent = t("sw.best", b.best);
  }

  function buildChartOption() {
    if (!g.rng || $("sw-room").hidden) return null;
    return {
      animation: false,
      grid: { left: 40, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: g.curve.map((_, i) => t("sw.dayShort", i)),
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
        data: g.curve,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--ma5") },
        markLine: {
          symbol: "none",
          silent: true,
          label: { color: cssVar("--text-muted"), fontSize: 10 },
          lineStyle: { type: "dashed" },
          data: [
            { yAxis: WIN_EQ, lineStyle: { color: cssVar("--good") } },
            { yAxis: FLOOR_EQ, lineStyle: { color: cssVar("--bad") } },
          ],
        },
      }],
    };
  }

  $("btn-sw-start").addEventListener("click", startGame);
  $("btn-sw-settle").addEventListener("click", settle);
  $("btn-sw-back").addEventListener("click", backToSelect);
  $("btn-swr-again").addEventListener("click", startGame);
  $("btn-swr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });
  $("sw-pos").addEventListener("input", renderSlider);

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "swan") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-swan").hidden) return;
    renderIntroBest();
    if (!$("sw-room").hidden && g.rng && !g.done) renderDay();
  });

  renderIntroBest();
})();
