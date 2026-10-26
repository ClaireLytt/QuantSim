// 算法驯兽师: 你不直接交易——用积木条件组装一只「交易宠物」, 放生进 60 天行情里
// 看它自己扑腾。规则放生后不可改, 全程只有一次「出手相救」(立刻清仓) 的干预机会,
// 什么时候用是全部悬念。宠物净值跌破 70% 即死亡; 活到最后按收益计分, 没动用救场加分。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_tamer";
  const WARMUP = 20; // 前置日: 只喂指标不交易
  const RUN_DAYS = 60;
  const CAPITAL = 1000000;
  const DEATH = 0.7; // 净值跌破 70% = 宠物死亡
  const TICK_MS = 160;
  const MAX_RULES = 3;

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 条件积木: fn(ind, d) — ind 是指标快照
  const CONDS = [
    { id: "rsiLow", fn: (x) => x.rsi < 30 },
    { id: "rsiHigh", fn: (x) => x.rsi > 70 },
    { id: "aboveMa5", fn: (x) => x.price > x.ma5 },
    { id: "belowMa5", fn: (x) => x.price < x.ma5 },
    { id: "aboveMa20", fn: (x) => x.price > x.ma20 },
    { id: "bigDrop", fn: (x) => x.chg <= -0.03 },
    { id: "bigGain", fn: (x) => x.chg >= 0.03 },
    { id: "deepDd", fn: (x) => x.dd <= -0.1 },
  ];
  // 动作积木: 对 (cash, shares, price) 的操作
  const ACTS = [
    { id: "buy25", buyFrac: 0.25 },
    { id: "buy50", buyFrac: 0.5 },
    { id: "sell50", sellFrac: 0.5 },
    { id: "sellAll", sellFrac: 1 },
  ];

  // 行情模板: 混合体制, 让不同规则组各有生路与死路
  const SCENARIOS = [
    [{ len: 30, drift: 0.006, vol: 0.012 }, { len: 25, drift: -0.012, vol: 0.016 }, { len: 25, drift: 0.004, vol: 0.01 }],
    [{ len: 40, drift: -0.007, vol: 0.013 }, { len: 40, drift: 0.009, vol: 0.011 }],
    [{ len: 80, drift: 0.0015, vol: 0.018 }],
  ];

  function genPath(rng, start, segs) {
    const closes = [start];
    segs.forEach((seg) => {
      for (let i = 0; i < seg.len; i++) {
        const prev = closes[closes.length - 1];
        closes.push(+(prev * Math.exp(seg.drift + seg.vol * (rng() * 2 - 1))).toFixed(2));
      }
    });
    return closes.slice(0, WARMUP + RUN_DAYS + 1);
  }

  // 指标: RSI14 / MA5 / MA20 / 当日涨跌 / 距峰回撤
  function indicators(path, d) {
    const win = (n) => path.slice(Math.max(0, d - n + 1), d + 1);
    const ma = (n) => win(n).reduce((s, v) => s + v, 0) / win(n).length;
    let up = 0, down = 0;
    for (let i = Math.max(1, d - 13); i <= d; i++) {
      const diff = path[i] - path[i - 1];
      if (diff > 0) up += diff;
      else down -= diff;
    }
    const peak = Math.max(...path.slice(0, d + 1));
    return {
      price: path[d],
      ma5: ma(5),
      ma20: ma(20),
      rsi: up + down === 0 ? 50 : (up / (up + down)) * 100,
      chg: d > 0 ? path[d] / path[d - 1] - 1 : 0,
      dd: path[d] / peak - 1,
    };
  }

  // ---------- 局状态 ----------

  const g = {
    path: null, rules: [], day: 0,
    cash: 0, shares: 0, equities: [], trades: [],
    running: false, timer: null, saved: false, dead: false, done: false,
  };

  const chartH = qsChart("tm-chart", () => buildChartOption());

  const fmtMoney = (v) => Math.round(v).toLocaleString();
  const fmtPct = (x) => (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
  const equity = (d) => g.cash + g.shares * g.path[d];

  // ---------- 组装台 ----------

  function renderBuilder() {
    const wrap = $("tm-rules");
    wrap.innerHTML = "";
    for (let r = 0; r < MAX_RULES; r++) {
      const row = document.createElement("div");
      row.className = "tm-rule-row";
      const condSel = document.createElement("select");
      condSel.id = "tm-cond" + r;
      const off = document.createElement("option");
      off.value = "";
      off.textContent = t("tm.ruleOff");
      condSel.appendChild(off);
      CONDS.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = t("tm.cond." + c.id);
        condSel.appendChild(o);
      });
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      const actSel = document.createElement("select");
      actSel.id = "tm-act" + r;
      ACTS.forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = t("tm.act." + a.id);
        actSel.appendChild(o);
      });
      row.append(condSel, arrow, actSel);
      wrap.appendChild(row);
    }
  }

  function readRules() {
    const rules = [];
    for (let r = 0; r < MAX_RULES; r++) {
      const condId = $("tm-cond" + r).value;
      if (!condId) continue;
      rules.push({
        cond: CONDS.find((c) => c.id === condId),
        act: ACTS.find((a) => a.id === $("tm-act" + r).value),
      });
    }
    return rules;
  }

  // ---------- 放生与回放 ----------

  function release() {
    const rules = readRules();
    if (!rules.length) {
      toast(t("tm.noRules"));
      return;
    }
    g.rules = rules;
    g.path = genPath(mulberry32(Math.floor(Math.random() * 1e9)), 20 + Math.random() * 40,
      SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]);
    g.day = WARMUP;
    g.cash = CAPITAL;
    g.shares = 0;
    g.equities = [CAPITAL];
    g.trades = [];
    g.saved = false;
    g.dead = false;
    g.done = false;
    $("tm-select").hidden = true;
    $("tm-report").hidden = true;
    $("tm-room").hidden = false;
    $("btn-tm-save").disabled = false;
    renderRulesSummary();
    renderRun();
    g.running = true;
    g.timer = setInterval(tick, TICK_MS);
  }

  function renderRulesSummary() {
    const ul = $("tm-rule-list");
    ul.innerHTML = "";
    g.rules.forEach((r, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("tm.ruleNo", i + 1);
      const dd = document.createElement("span");
      dd.textContent = t("tm.cond." + r.cond.id) + " → " + t("tm.act." + r.act.id);
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function tick() {
    if (!g.running) return;
    g.day++;
    const d = g.day;
    const ind = indicators(g.path, d);
    // 每日最多触发一条规则 (按行序取第一条命中的)
    for (const r of g.rules) {
      if (!r.cond.fn(ind)) continue;
      if (r.act.buyFrac && g.cash > 1000) {
        const spend = g.cash * r.act.buyFrac;
        const add = Math.floor(spend / ind.price / 100) * 100;
        if (add > 0) {
          g.cash -= add * ind.price;
          g.shares += add;
          g.trades.push({ day: d, side: "buy", shares: add, price: ind.price, rule: r });
        }
      } else if (r.act.sellFrac && g.shares > 0) {
        const cut = Math.max(100, Math.floor((g.shares * r.act.sellFrac) / 100) * 100);
        const sold = Math.min(g.shares, cut);
        g.cash += sold * ind.price;
        g.shares -= sold;
        g.trades.push({ day: d, side: "sell", shares: sold, price: ind.price, rule: r });
      }
      break;
    }
    const eq = equity(d);
    g.equities.push(eq);
    if (eq <= CAPITAL * DEATH) {
      g.dead = true;
      stopRun();
      return;
    }
    if (d >= WARMUP + RUN_DAYS) {
      stopRun();
      return;
    }
    renderRun();
  }

  function rescue() {
    // 唯一一次干预: 立刻清仓。宠物之后仍按规则行动 (可能又买回去——救不救得彻底也是教学)
    if (g.saved || g.done || !g.running) return;
    g.saved = true;
    $("btn-tm-save").disabled = true;
    if (g.shares > 0) {
      const px = g.path[g.day];
      g.cash += g.shares * px;
      g.trades.push({ day: g.day, side: "sell", shares: g.shares, price: px, rescue: true });
      g.shares = 0;
    }
    playSound("flip");
    renderRun();
  }

  function stopRun() {
    g.running = false;
    clearInterval(g.timer);
    g.done = true;
    finish();
  }

  function renderRun() {
    $("tm-day").textContent = "D" + (g.day - WARMUP + 1) + " / D" + (RUN_DAYS + 1);
    const eq = equity(g.day);
    $("tm-equity").textContent = fmtMoney(eq) + "（" + fmtPct(eq / CAPITAL - 1) + "）";
    $("tm-pos").textContent = g.shares > 0 ? t("tm.posHolding", g.shares.toLocaleString()) : t("tm.posCash");
    $("tm-trades").textContent = String(g.trades.length);
    chartH.refresh();
  }

  function finish() {
    const eq = g.equities[g.equities.length - 1];
    const ret = eq / CAPITAL - 1;
    const gain = g.dead ? 0 : Math.max(10, 100 + Math.round(ret * 500) + (g.saved ? 0 : 50));
    $("tm-room").hidden = true;
    $("tm-report").hidden = false;
    const concl = $("tmr-conclusion");
    concl.textContent = g.dead
      ? t("tm.died", "D" + (g.day - WARMUP + 1))
      : t("tm.survived", gain, fmtPct(ret), String(g.trades.length));
    concl.className = "qdr-conclusion " + (g.dead ? "lose" : "win");
    $("tmr-save").textContent = g.dead
      ? t("tm.moralDead")
      : g.saved ? t("tm.moralSaved") : t("tm.moralHandsOff");
    playSound(g.dead ? "lose" : "win");
    if (!g.dead) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("tm.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function backToSelect() {
    g.running = false;
    clearInterval(g.timer);
    $("tm-room").hidden = true;
    $("tm-report").hidden = true;
    $("tm-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("tm-best").hidden = !b.best;
    if (b.best) $("tm-best").textContent = t("tm.best", b.best);
  }

  // ---------- 图表: 价格 + 宠物净值双线实时生长 ----------

  function buildChartOption() {
    if (!g.path || $("tm-room").hidden) return null;
    const days = g.day - WARMUP + 1;
    const px = g.path.slice(WARMUP, g.day + 1);
    const eqNorm = g.equities.map((e) => +((e / CAPITAL) * px[0]).toFixed(2));
    const marks = g.trades.map((tr) => ({
      coord: [tr.day - WARMUP, g.path[tr.day]],
      symbol: tr.rescue ? "diamond" : "circle",
      symbolSize: tr.rescue ? 12 : 7,
      itemStyle: { color: cssVar(tr.side === "buy" ? "--up" : "--down") },
    }));
    return {
      animation: false,
      grid: { left: 48, right: 14, top: 26, bottom: 24 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 }, itemWidth: 14 },
      xAxis: {
        type: "category",
        data: Array.from({ length: RUN_DAYS + 1 }, (_, i) => "D" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series: [
        {
          type: "line",
          name: t("tm.linePrice"),
          data: px,
          showSymbol: false,
          lineStyle: { width: 1.5, color: cssVar("--text-muted"), opacity: 0.7 },
          itemStyle: { color: cssVar("--text-muted") },
          markPoint: { data: marks, label: { show: false } },
        },
        {
          type: "line",
          name: t("tm.linePet"),
          data: eqNorm.slice(0, days),
          showSymbol: false,
          lineStyle: { width: 2, color: cssVar("--lab-blue") },
          itemStyle: { color: cssVar("--lab-blue") },
          markLine: {
            symbol: "none",
            label: { formatter: t("tm.lineDeath"), fontSize: 10, color: cssVar("--down") },
            lineStyle: { color: cssVar("--down"), type: "dashed" },
            data: [{ yAxis: +(DEATH * px[0]).toFixed(2) }],
          },
        },
      ],
    };
  }

  // ---------- 接线 ----------

  $("btn-tm-release").addEventListener("click", release);
  $("btn-tm-save").addEventListener("click", rescue);
  $("btn-tm-back").addEventListener("click", backToSelect);
  $("btn-tmr-again").addEventListener("click", backToSelect);
  $("btn-tmr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "tamer") {
      renderIntroBest();
      renderBuilder();
    }
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-tamer").hidden) return;
    renderIntroBest();
    if (!$("tm-select").hidden) renderBuilder();
    if (g.path && !$("tm-room").hidden) {
      renderRulesSummary();
      renderRun();
    }
  });

  renderIntroBest();
  renderBuilder();
})();
