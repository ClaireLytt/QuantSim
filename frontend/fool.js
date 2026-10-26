// 最后一个接盘侠: 博傻心理局。你和 5 个 AI 玩家同时持有一只注定归零的妖股,
// 价格不走行情数据——完全由全场的卖出行为内生决定: 没人跑它就涨, 有人跑它就砸。
// 隐藏的「音乐停止」回合一到, 还拿着的人接走全部亏损。跑得越晚价越高, 但最后
// 一个没跑掉的就是接盘侠。随机「熔断假停牌」回合会锁死卖出按钮搅乱节奏。
// (设计说明: 本体是纯 PvP 玩法, 真人同房版需后端实时房间; 本版以 5 个性格 AI 对局)
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_fool";
  const ENTRY = 100;
  const SHARES = 1000;

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // AI 人设: 性格决定计划逃跑时点的分布 + 恐慌敏感度 (前一轮 >= panicAt 人卖出就跟跑)
  const PERSONAS = [
    { name: { zh: "胆小的老王", en: "Timid Wang" }, bias: -5, panicAt: 1 },
    { name: { zh: "跟风的小芳", en: "Follower Fang" }, bias: -3, panicAt: 2 },
    { name: { zh: "冷静的陈总", en: "Cool-headed Chen" }, bias: -2, panicAt: 2 },
    { name: { zh: "贪婪的大刘", en: "Greedy Liu" }, bias: -1, panicAt: 3 },
    { name: { zh: "头铁的阿强", en: "Diamond-hands Qiang" }, bias: 0, panicAt: 99 },
  ];

  // ---------- 局状态 ----------

  const g = {
    round: 0, price: ENTRY, prices: [ENTRY],
    doom: 0, halt: 0, rng: null,
    players: [], // {name, isYou, sold: null|{round, price}, plan, panicAt}
    sellsLastRound: 0, done: false, youSold: null, events: [],
  };

  const chartH = qsChart("fl-chart", () => buildChartOption());

  const fmtMoney = (v) => Math.round(v).toLocaleString();
  const you = () => g.players[0];
  const holding = () => g.players.filter((p) => !p.sold);

  function startGame() {
    const seed = Math.floor(Math.random() * 1e9);
    g.rng = mulberry32(seed);
    g.doom = 12 + Math.floor(g.rng() * 11); // 音乐停止: 第 12~22 轮之间, 对所有人隐藏
    g.halt = 5 + Math.floor(g.rng() * Math.max(1, g.doom - 7)); // 熔断假停牌轮
    g.round = 0;
    g.price = ENTRY;
    g.prices = [ENTRY];
    g.sellsLastRound = 0;
    g.done = false;
    g.youSold = null;
    g.events = [];
    g.players = [{ name: null, isYou: true, sold: null }];
    PERSONAS.forEach((p) => {
      g.players.push({
        name: p.name, isYou: false, sold: null,
        plan: Math.max(3, g.doom - 1 + p.bias - Math.floor(g.rng() * 3)),
        panicAt: p.panicAt,
      });
    });
    $("fl-select").hidden = true;
    $("fl-report").hidden = true;
    $("fl-room").hidden = false;
    renderRound();
  }

  // 价格内生: 基础抬升 +6% 上下, 每个上一轮卖出者砸掉 7%
  function updatePrice() {
    const hype = 0.06 + 0.04 * (g.rng() - 0.5);
    const dump = 0.07 * g.sellsLastRound;
    g.price = +(g.price * (1 + hype - dump)).toFixed(2);
    g.prices.push(g.price);
  }

  function aiDecide() {
    // 恐慌传染: 上一轮卖出人数达到阈值就跟跑; 否则按各自的计划时点跑
    let sells = 0;
    g.players.forEach((p) => {
      if (p.isYou || p.sold) return;
      const panic = g.sellsLastRound >= p.panicAt;
      if (g.round >= p.plan || panic) {
        p.sold = { round: g.round, price: g.price, panic };
        sells++;
      }
    });
    return sells;
  }

  function nextRound(youSell) {
    if (g.done) return;
    g.round++;
    updatePrice();
    const isHalt = g.round === g.halt;
    let sells = 0;
    if (g.round >= g.doom) {
      // 音乐停止: 妖股现出原形, 直接跌到脚踝, 所有还持仓的人一起接盘
      g.price = +(ENTRY * 0.05).toFixed(2);
      g.prices[g.prices.length - 1] = g.price;
      holding().forEach((p) => { p.sold = { round: g.round, price: g.price, doom: true }; });
      finish();
      return;
    }
    if (isHalt) {
      // 熔断假停牌: 本轮谁都卖不出去 (包括想跑的 AI)
      g.events.push({ round: g.round, type: "halt" });
      playSound("flip");
    } else {
      if (youSell && !you().sold) {
        you().sold = { round: g.round, price: g.price };
        g.youSold = you().sold;
        sells++;
        playSound("fill");
      }
      sells += aiDecide();
    }
    g.sellsLastRound = sells;
    if (sells > 0 && !isHalt) g.events.push({ round: g.round, type: "sell", count: sells });
    renderRound();
    // 你跑掉之后自动快进看戏, 直到音乐停止
    if (you().sold && !g.done) setTimeout(() => nextRound(false), 420);
  }

  function renderRound() {
    $("fl-round").textContent = t("fl.roundNo", g.round + 1);
    $("fl-price").textContent = g.price.toFixed(2) + "（" + (g.price >= ENTRY ? "+" : "") + ((g.price / ENTRY - 1) * 100).toFixed(0) + "%）";
    $("fl-holders").textContent = String(holding().length) + " / " + g.players.length;
    const isHalt = g.round + 1 === g.halt; // 下一轮是否熔断在本轮不可知 —— 这里只锁当前轮
    const youOut = !!you().sold;
    $("btn-fl-sell").disabled = youOut || g.done || g.round === g.halt;
    $("btn-fl-wait").disabled = youOut || g.done;
    $("fl-halt-note").hidden = g.round !== g.halt;
    $("fl-you-out").hidden = !youOut;
    if (youOut) $("fl-you-out").textContent = t("fl.youOut", you().sold.price.toFixed(2));
    void isHalt;
    renderPlayers();
    chartH.refresh();
  }

  function renderPlayers() {
    const ul = $("fl-players");
    ul.innerHTML = "";
    g.players.forEach((p) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = p.isYou ? t("fl.you") : pick(p.name);
      const dd = document.createElement("span");
      if (!p.sold) dd.textContent = t("fl.holding");
      else if (p.sold.doom) dd.textContent = t("fl.bagged", p.sold.price.toFixed(2));
      else dd.textContent = t("fl.soldAt", p.sold.round, p.sold.price.toFixed(2)) + (p.sold.panic ? t("fl.panicTag") : "");
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function finish() {
    g.done = true;
    $("fl-room").hidden = true;
    $("fl-report").hidden = false;
    const yours = you().sold;
    const bagged = !!yours.doom;
    const pnl = (yours.price - ENTRY) * SHARES;
    // 逃顶之王: 所有成功逃脱者中卖价最高的
    const escaped = g.players.filter((p) => p.sold && !p.sold.doom);
    const top = escaped.length ? Math.max(...escaped.map((p) => p.sold.price)) : 0;
    const king = !bagged && yours.price >= top - 0.001;
    const gain = bagged ? 0 : Math.max(10, Math.round((yours.price - ENTRY) * 2)) + (king ? 100 : 0);
    const concl = $("flr-conclusion");
    concl.textContent = bagged
      ? t("fl.lose", fmtMoney(-pnl))
      : t("fl.win", gain, fmtMoney(pnl)) + (king ? " " + t("fl.king") : "");
    concl.className = "qdr-conclusion " + (bagged ? "lose" : "win");
    $("flr-doom").textContent = t("fl.doomReveal", g.doom);
    $("flr-why").textContent = t("fl.moral");
    renderRanking();
    playSound(bagged ? "lose" : "win");
    if (!bagged) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("fl.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function renderRanking() {
    const ul = $("flr-ranking");
    ul.innerHTML = "";
    const sorted = g.players.slice().sort((a, b) => b.sold.price - a.sold.price);
    sorted.forEach((p, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = "#" + (i + 1) + " " + (p.isYou ? t("fl.you") : pick(p.name));
      const dd = document.createElement("span");
      dd.textContent = p.sold.doom
        ? t("fl.rankBagged", p.sold.price.toFixed(2))
        : t("fl.rankSold", p.sold.round, p.sold.price.toFixed(2));
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function backToSelect() {
    g.done = true; // 停掉可能在跑的快进定时链
    $("fl-room").hidden = true;
    $("fl-report").hidden = true;
    $("fl-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("fl-best").hidden = !b.best;
    if (b.best) $("fl-best").textContent = t("fl.best", b.best);
  }

  // ---------- 价格曲线: 玩家们的逃跑点标在曲线上 ----------

  function buildChartOption() {
    if ($("fl-room").hidden && $("fl-report").hidden) return null;
    const marks = g.players
      .filter((p) => p.sold && !p.sold.doom)
      .map((p) => ({
        coord: [p.sold.round, p.sold.price],
        symbol: "circle",
        symbolSize: p.isYou ? 11 : 7,
        itemStyle: { color: cssVar(p.isYou ? "--accent" : "--down") },
      }));
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: g.prices.map((_, i) => t("fl.roundShort", i + 1)),
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
        data: g.prices,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        areaStyle: { opacity: 0.08, color: cssVar("--lab-blue") },
        markPoint: { data: marks, label: { show: false } },
        markLine: {
          symbol: "none",
          label: { formatter: t("fl.lineEntry"), fontSize: 10, color: cssVar("--text-muted") },
          lineStyle: { color: cssVar("--border"), type: "dashed" },
          data: [{ yAxis: ENTRY }],
        },
      }],
    };
  }

  // ---------- 接线 ----------

  $("btn-fl-start").addEventListener("click", startGame);
  $("btn-fl-sell").addEventListener("click", () => nextRound(true));
  $("btn-fl-wait").addEventListener("click", () => nextRound(false));
  $("btn-fl-back").addEventListener("click", backToSelect);
  $("btn-flr-again").addEventListener("click", startGame);
  $("btn-flr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "fool") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-fool").hidden) return;
    renderIntroBest();
    if (!$("fl-room").hidden) renderRound();
    if (!$("fl-report").hidden && g.done && you().sold) {
      renderRanking();
      $("flr-doom").textContent = t("fl.doomReveal", g.doom);
      $("flr-why").textContent = t("fl.moral");
    }
  });

  renderIntroBest();
})();
