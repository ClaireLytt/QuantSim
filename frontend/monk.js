// 止损僧侣: 行为金融修行局。开局立军令状 (止损/止盈线), 之后 40 个交易日里
// 行情按「引诱型」模板生成, 在止损位/止盈位/深坑处弹出贪婪诱惑——守戒得佛珠,
// 从了诱惑记罪, 三次破戒即败; 亏穿止损死扛同样计罪。结算页对比「如果每次都从了
// 诱惑」的平行宇宙净值: 对抗的不是市场, 是界面本身的心理攻击。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_monk";
  const DAYS = 41; // D1 建仓 + 40 个交易日
  const CAPITAL = 1000000;
  const POSITION = 500000; // 首仓
  const ADD_SIZE = 250000; // 每次「加仓摊平」诱惑若从了, 动用的备用金
  const MAX_SINS = 3;

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 军令状档位
  const STOPS = [-0.06, -0.10, -0.15];
  const TPS = [0.08, 0.15, 0.25];

  // 引诱型行情模板: 形状 + 「黄金坑」加仓诱惑的预埋日
  const SCENARIOS = [
    { id: "pumpdump", segs: [{ len: 15, drift: 0.011, vol: 0.008 }, { len: 25, drift: -0.014, vol: 0.012 }], avgDays: [20, 27] },
    { id: "grind", segs: [{ len: 40, drift: -0.008, vol: 0.009 }], avgDays: [10, 22] },
    { id: "fakedrop", segs: [{ len: 12, drift: -0.011, vol: 0.008 }, { len: 28, drift: 0.011, vol: 0.009 }], avgDays: [6, 10] },
  ];

  // 诱惑话术: 魔鬼的三种腔调 (止损位死扛按加深层级换话术)
  const WHISPERS = {
    stop: [
      { zh: "就差一点就反弹了——现在卖就是倒在黎明前。把止损往下挪一挡，再给它一次机会？", en: "It's about to bounce - selling now is dying at dawn. Nudge the stop lower, give it one more chance?" },
      { zh: "都亏这么多了，现在卖就是把浮亏变成实亏！拿住不动才是真功夫。", en: "You're this deep already - selling just turns paper loss into real loss! Holding tight is the real skill." },
      { zh: "主力就是在洗盘，专洗你这种拿不住的。割在地板上，你甘心吗？", en: "They're shaking out weak hands - exactly like you. Sell at the floor, really?" },
    ],
    tp: [
      { zh: "势头正猛，现在止盈就是踏空后面的主升浪——再拿一天，明天更高！", en: "The momentum is roaring - take profit now and you'll miss the main wave. One more day, higher tomorrow!" },
    ],
    avg: [
      { zh: "跌出黄金坑了！现在加仓摊平成本，反弹时一倍速回本！", en: "A golden pit! Average down now and the bounce pays you back at double speed!" },
      { zh: "恐慌盘杀出来的便宜筹码，别人恐惧我贪婪——补一笔？", en: "Panic sellers are handing out cheap chips. Be greedy when others are fearful - add a slice?" },
    ],
  };

  function genPath(rng, start, segs) {
    const closes = [start];
    segs.forEach((seg) => {
      for (let i = 0; i < seg.len; i++) {
        const prev = closes[closes.length - 1];
        closes.push(+(prev * Math.exp(seg.drift + seg.vol * (rng() * 2 - 1))).toFixed(2));
      }
    });
    return closes.slice(0, DAYS);
  }

  // ---------- 局状态 ----------

  const g = {
    path: null, scenario: null, vow: null,
    day: 0, cash: 0, shares: 0, entry: 0,
    beads: 0, sins: 0, closed: null, done: false,
    pending: null, // {type, whisper} 待抉择的诱惑
    stopLevel: 0, tpPrompted: false, avgPrompted: [],
    log: [], // {day, type, disciplined}
    lastGain: 0, lastRight: false,
  };

  const chartH = qsChart("mk-chart", () => buildChartOption());

  const fmtMoney = (v) => Math.round(v).toLocaleString();
  const fmtPct = (x) => (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
  const price = () => g.path[g.day];
  const equity = () => g.closed ? g.cash : g.cash + g.shares * price();
  const stopPrice = () => g.entry * (1 + g.vow.stop);
  const tpPrice = () => g.entry * (1 + g.vow.tp);

  function startRun() {
    const seed = Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    g.scenario = SCENARIOS[Math.floor(rng() * SCENARIOS.length)];
    g.path = genPath(rng, 20 + rng() * 40, g.scenario.segs);
    g.vow = { stop: STOPS[Number($("mk-stop").value)], tp: TPS[Number($("mk-tp").value)] };
    g.day = 0;
    g.entry = g.path[0];
    g.shares = Math.floor(POSITION / g.entry / 100) * 100;
    g.shares0 = g.shares; // 平行宇宙用的初始仓位
    g.cash = CAPITAL - g.shares * g.entry;
    g.beads = 0;
    g.sins = 0;
    g.closed = null;
    g.done = false;
    g.pending = null;
    g.stopLevel = 0;
    g.tpPrompted = false;
    g.avgPrompted = [];
    g.log = [];
    $("mk-select").hidden = true;
    $("mk-report").hidden = true;
    $("mk-room").hidden = false;
    renderVow();
    renderRun();
  }

  function renderVow() {
    $("mk-vow").textContent = t("mk.vowLine", fmtPct(g.vow.stop), fmtPct(g.vow.tp), fmtMoney(g.shares * g.entry), g.entry.toFixed(2));
  }

  function renderRun() {
    $("mk-day").textContent = "D" + (g.day + 1) + " / D" + DAYS;
    $("mk-beads").textContent = "●".repeat(g.beads) || "—";
    $("mk-sins").textContent = String(g.sins) + " / " + MAX_SINS;
    $("mk-price").textContent = price().toFixed(2) + "（" + fmtPct(price() / g.entry - 1) + "）";
    $("mk-equity").textContent = fmtMoney(equity());
    const p = g.pending;
    $("mk-prompt").hidden = !p;
    if (p) $("mk-whisper").textContent = pick(p.whisper);
    if (p) {
      // 守戒按钮按诱惑类型换文案: 止损/止盈 = 执行军令状, 加仓 = 拒绝
      $("btn-mk-keep").textContent = t(p.type === "avg" ? "mk.keepRefuse" : p.type === "tp" ? "mk.keepTp" : "mk.keepStop");
    }
    $("btn-mk-next").disabled = !!p || g.done;
    renderLog();
    chartH.refresh();
  }

  function renderLog() {
    const ul = $("mk-log");
    ul.innerHTML = "";
    $("mk-log-empty").hidden = !!g.log.length;
    g.log.forEach((e) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = "D" + (e.day + 1) + " " + t("mk.temptation." + e.type);
      const dd = document.createElement("span");
      dd.textContent = t(e.disciplined ? "mk.logKept" : "mk.logYield");
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function nextDay() {
    if (g.pending || g.done) return;
    g.day++;
    const px = price();
    if (!g.closed) {
      // 触发优先级: 止损位死扛 (每加深 6% 再问一次) > 止盈位 > 预埋黄金坑
      const stopTrigger = stopPrice() * Math.pow(0.94, g.stopLevel);
      if (px <= stopTrigger) {
        g.pending = { type: "stop", whisper: WHISPERS.stop[Math.min(g.stopLevel, WHISPERS.stop.length - 1)] };
      } else if (!g.tpPrompted && px >= tpPrice()) {
        g.pending = { type: "tp", whisper: WHISPERS.tp[0] };
      } else if (g.scenario.avgDays.includes(g.day) && !g.avgPrompted.includes(g.day) && px < g.entry * 0.96) {
        g.avgPrompted.push(g.day);
        g.pending = { type: "avg", whisper: WHISPERS.avg[g.avgPrompted.length % WHISPERS.avg.length] };
      }
      if (g.pending) playSound("flip");
    }
    if (g.day >= DAYS - 1 && !g.pending) {
      endRun();
      return;
    }
    renderRun();
  }

  function choose(disciplined) {
    const p = g.pending;
    if (!p || g.done) return;
    g.pending = null;
    g.log.push({ day: g.day, type: p.type, disciplined });
    if (disciplined) {
      g.beads++;
      playSound("fill");
      if (p.type === "stop" || p.type === "tp") {
        // 执行军令状: 全部平仓
        g.cash += g.shares * price();
        g.shares = 0;
        g.closed = { day: g.day, reason: p.type };
        endRun();
        return;
      }
    } else {
      g.sins++;
      playSound("lose");
      if (p.type === "stop") g.stopLevel++; // 死扛一次, 下一档更深的止损位还会再问
      if (p.type === "tp") g.tpPrompted = true; // 错过的止盈不会再来
      if (p.type === "avg") {
        const add = Math.floor(Math.min(ADD_SIZE, g.cash) / price() / 100) * 100;
        g.cash -= add * price();
        g.shares += add;
      }
      if (g.sins >= MAX_SINS) {
        endRun();
        return;
      }
    }
    if (g.day >= DAYS - 1) {
      endRun();
      return;
    }
    renderRun();
  }

  // 平行宇宙: 每个诱惑都从了——不止损不止盈, 在预埋的黄金坑日全数加仓, 扛到最后一天
  function altUniverse() {
    let cash = CAPITAL - g.shares0 * g.entry;
    let shares = g.shares0;
    g.scenario.avgDays.forEach((d) => {
      if (g.path[d] < g.entry * 0.96) {
        const add = Math.floor(Math.min(ADD_SIZE, cash) / g.path[d] / 100) * 100;
        cash -= add * g.path[d];
        shares += add;
      }
    });
    return cash + shares * g.path[DAYS - 1];
  }

  function endRun() {
    g.done = true;
    const failed = g.sins >= MAX_SINS;
    if (!g.closed) {
      // 到期收盘 / 破戒清算: 按当日价平仓
      g.cash += g.shares * price();
      g.shares = 0;
      g.closed = { day: g.day, reason: failed ? "fail" : "expire" };
    }
    const youEq = g.cash;
    const altEq = altUniverse();
    const gain = failed ? 0 : g.beads * 60 + 100 + (youEq >= altEq ? 80 : 0);
    g.lastGain = gain;
    g.lastRight = !failed;
    playSound(failed ? "lose" : "win");
    $("mk-room").hidden = true;
    $("mk-report").hidden = false;
    const concl = $("mkr-conclusion");
    concl.textContent = failed ? t("mk.fail") : t("mk.pass", gain, g.beads);
    concl.className = "qdr-conclusion " + (failed ? "lose" : "win");
    $("mkr-you").textContent = fmtMoney(youEq) + "（" + fmtPct(youEq / CAPITAL - 1) + "）";
    $("mkr-alt").textContent = fmtMoney(altEq) + "（" + fmtPct(altEq / CAPITAL - 1) + "）";
    $("mkr-verdict").textContent = youEq >= altEq
      ? t("mk.verdictWin", fmtPct((youEq - altEq) / CAPITAL))
      : t("mk.verdictLose");
    if (!failed) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("mk.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function backToSelect() {
    $("mk-room").hidden = true;
    $("mk-report").hidden = true;
    $("mk-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("mk-best").hidden = !b.best;
    if (b.best) $("mk-best").textContent = t("mk.best", b.best);
  }

  // ---------- 行情图: 逐日揭示, 军令状三线常驻 ----------

  function buildChartOption() {
    if (!g.path || $("mk-room").hidden) return null;
    const data = g.path.slice(0, g.day + 1);
    return {
      animation: false,
      grid: { left: 48, right: 56, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: g.path.map((_, i) => "D" + (i + 1)),
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
        markLine: {
          symbol: "none",
          data: [
            { yAxis: g.entry, label: { formatter: t("mk.lineEntry"), fontSize: 10, color: cssVar("--text-muted") }, lineStyle: { color: cssVar("--border"), type: "dashed" } },
            { yAxis: stopPrice(), label: { formatter: t("mk.lineStop"), fontSize: 10, color: cssVar("--down") }, lineStyle: { color: cssVar("--down"), type: "dashed" } },
            { yAxis: tpPrice(), label: { formatter: t("mk.lineTp"), fontSize: 10, color: cssVar("--up") }, lineStyle: { color: cssVar("--up"), type: "dashed" } },
          ],
        },
      }],
    };
  }

  // ---------- 接线 ----------

  $("btn-mk-start").addEventListener("click", startRun);
  $("btn-mk-next").addEventListener("click", nextDay);
  $("btn-mk-keep").addEventListener("click", () => choose(true));
  $("btn-mk-yield").addEventListener("click", () => choose(false));
  $("btn-mk-back").addEventListener("click", backToSelect);
  $("btn-mkr-again").addEventListener("click", backToSelect);
  $("btn-mkr-games").addEventListener("click", () => switchView("games"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "monk") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-monk").hidden) return;
    renderIntroBest();
    if (g.path && !$("mk-room").hidden) {
      renderVow();
      renderRun();
    }
  });

  renderIntroBest();
})();
