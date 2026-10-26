// 供应链战争: 套保即生存。你经营一家制造厂, 8 个季度: 每季接订单 (售价锁定、
// 下季交付), 但生产成本跟着铜价走——铜价是波动的市场, 有平静季和风暴季,
// 每季有一条可靠度 75% 的市场传闻。你的核心决策不是交易, 是套保比例:
// 用期货把下季的原料成本锁住多少 (锁 = 付 1% 保费、放弃铜价下跌的红利)。
// 账上现金断裂即破产——哪怕累计利润是正的。交易在这里不是副业, 是经营的呼吸。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_supply";
  const QUARTERS = 8;
  const CASH0 = 1000000;
  const OPEX = 80000; // 每季固定开销
  const HEDGE_FEE = 0.01; // 套保保费: 名义本金的 1%
  const TARGET = 1500000; // 终局目标净现金

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 订单档位: 大单吃产能毛利薄, 小单稳当
  const ORDERS = [
    { id: "big", qty: 6000, price: 130 },
    { id: "small", qty: 3000, price: 142 },
    { id: "skip", qty: 0, price: 0 },
  ];
  const HEDGES = [0, 0.5, 1];

  const g = {
    rng: null, q: 0, cash: 0, copper: 100,
    coppers: [100], regimes: [], rumor: null,
    pending: null, // 上季接的单: {qty, price, hedgedQty, hedgePrice}
    log: [], done: false, bankrupt: false,
  };

  const chartH = qsChart("sp-chart", () => buildChartOption());
  const fmtMoney = (v) => Math.round(v).toLocaleString();

  function startGame() {
    g.rng = mulberry32(Math.floor(Math.random() * 1e9));
    g.q = 1;
    g.cash = CASH0;
    g.copper = 100;
    g.coppers = [100];
    g.pending = null;
    g.log = [];
    g.done = false;
    g.bankrupt = false;
    // 预生成每季体制: 平静 (±6%) / 风暴 (±28%), 风暴约占 1/3
    g.regimes = Array.from({ length: QUARTERS + 1 }, () => (g.rng() < 0.35 ? "storm" : "calm"));
    rollRumor();
    $("sp-select").hidden = true;
    $("sp-report").hidden = true;
    $("sp-room").hidden = false;
    renderQuarter();
  }

  // 市场传闻: 75% 概率说真话 (指向下季体制), 25% 概率是烟雾弹
  function rollRumor() {
    const truth = g.regimes[g.q]; // 下季 (结算季) 的体制
    const honest = g.rng() < 0.75;
    g.rumor = honest ? truth : (truth === "storm" ? "calm" : "storm");
  }

  function copperNext() {
    const regime = g.regimes[g.q];
    const amp = regime === "storm" ? 0.28 : 0.06;
    return +(g.copper * (1 + amp * (g.rng() * 2 - 1))).toFixed(2);
  }

  let selOrder = "small";

  function renderQuarter() {
    $("sp-q").textContent = t("sp.qNo", g.q, QUARTERS);
    $("sp-cash").textContent = fmtMoney(g.cash);
    $("sp-cash").classList.toggle("neg", g.cash < 200000);
    $("sp-copper").textContent = g.copper.toFixed(2);
    $("sp-rumor").textContent = t("sp.rumorLine", t(g.rumor === "storm" ? "sp.rumorStorm" : "sp.rumorCalm"));
    renderOrders();
    renderLog();
    chartH.refresh();
  }

  function renderOrders() {
    const wrap = $("sp-orders");
    wrap.innerHTML = "";
    ORDERS.forEach((o) => {
      const btn = document.createElement("button");
      btn.className = "mz-door" + (selOrder === o.id ? " active" : "");
      btn.disabled = g.done;
      const tt = document.createElement("b");
      tt.textContent = t("sp.order." + o.id);
      const dd = document.createElement("span");
      dd.className = "sub";
      dd.textContent = o.qty
        ? t("sp.orderInfo", o.qty.toLocaleString(), o.price, fmtMoney(o.qty * o.price))
        : t("sp.orderSkipInfo", fmtMoney(OPEX));
      btn.append(tt, dd);
      btn.addEventListener("click", () => {
        selOrder = o.id;
        renderOrders();
      });
      wrap.appendChild(btn);
    });
  }

  function commit() {
    if (g.done) return;
    const order = ORDERS.find((o) => o.id === selOrder);
    const hedge = HEDGES[Number($("sp-hedge").value)];
    // 1) 本季先结算上季接的单 (铜价现在才揭晓——这就是敞口)
    const newCopper = copperNext();
    let settle = null;
    if (g.pending) {
      const p = g.pending;
      const spotQty = p.qty - p.hedgedQty;
      const cost = p.hedgedQty * p.hedgePrice + spotQty * newCopper;
      const revenue = p.qty * p.price;
      settle = { q: g.q, revenue, cost, copper: newCopper, profit: revenue - cost };
      g.cash += revenue - cost;
    }
    // 2) 固定开销 + 本季新单的套保保费
    g.cash -= OPEX;
    let fee = 0;
    if (order.qty && hedge > 0) {
      fee = Math.round(order.qty * hedge * g.copper * HEDGE_FEE);
      g.cash -= fee;
    }
    g.log.push({
      q: g.q, order: order.id, hedge, fee, settle,
      newCopper, regime: g.regimes[g.q], rumor: g.rumor,
    });
    // 3) 挂起本季新单, 铜价走到下季
    g.pending = order.qty
      ? { qty: order.qty, price: order.price, hedgedQty: Math.round(order.qty * hedge), hedgePrice: g.copper }
      : null;
    g.copper = newCopper;
    g.coppers.push(newCopper);
    playSound("fill");
    // 4) 破产判定: 现金 < 0 当场出局
    if (g.cash < 0) {
      g.bankrupt = true;
      finish();
      return;
    }
    if (g.q >= QUARTERS) {
      finish();
      return;
    }
    g.q++;
    rollRumor();
    renderQuarter();
  }

  function finish() {
    g.done = true;
    // 终局若还有在途订单, 按当前铜价结算掉
    if (!g.bankrupt && g.pending) {
      const p = g.pending;
      const newCopper = copperNext();
      const cost = p.hedgedQty * p.hedgePrice + (p.qty - p.hedgedQty) * newCopper;
      g.cash += p.qty * p.price - cost;
      g.coppers.push(newCopper);
      if (g.cash < 0) g.bankrupt = true;
    }
    const win = !g.bankrupt && g.cash >= TARGET;
    const gain = g.bankrupt ? 0 : Math.max(0, Math.round((g.cash - CASH0) / 5000));
    $("sp-room").hidden = true;
    $("sp-report").hidden = false;
    const concl = $("spr-conclusion");
    concl.textContent = g.bankrupt
      ? t("sp.bankrupt", g.q)
      : win ? t("sp.win", gain, fmtMoney(g.cash)) : t("sp.survived", fmtMoney(g.cash), fmtMoney(TARGET));
    concl.className = "qdr-conclusion " + (win ? "win" : "lose");
    $("spr-why").textContent = t("sp.moral");
    renderReportLog();
    playSound(win ? "win" : "lose");
    if (win) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("sp.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function renderLog() {
    const ul = $("sp-log");
    ul.innerHTML = "";
    $("sp-log-empty").hidden = !!g.log.length;
    g.log.slice(-4).forEach((e) => appendLogRow(ul, e));
  }

  function renderReportLog() {
    const ul = $("spr-log");
    ul.innerHTML = "";
    g.log.forEach((e) => appendLogRow(ul, e));
  }

  function appendLogRow(ul, e) {
    const li = document.createElement("li");
    const tt = document.createElement("b");
    tt.textContent = t("sp.qShort", e.q) + " " + t("sp.order." + e.order) + " · " + t("sp.hedgeShort", Math.round(e.hedge * 100));
    const dd = document.createElement("span");
    const rumorMark = (e.rumor === e.regime) ? t("sp.rumorTrue") : t("sp.rumorFalse");
    dd.textContent = (e.settle
      ? t("sp.settleLine", e.settle.copper.toFixed(2), fmtMoney(e.settle.profit))
      : t("sp.noSettle")) + " " + rumorMark;
    li.append(tt, dd);
    ul.appendChild(li);
  }

  function backToSelect() {
    $("sp-room").hidden = true;
    $("sp-report").hidden = true;
    $("sp-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("sp-best").hidden = !b.best;
    if (b.best) $("sp-best").textContent = t("sp.best", b.best);
  }

  function buildChartOption() {
    if (!g.rng || $("sp-room").hidden) return null;
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: g.coppers.map((_, i) => t("sp.qShort", i)),
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
        data: g.coppers,
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { width: 2, color: cssVar("--ma5") },
        itemStyle: { color: cssVar("--ma5") },
      }],
    };
  }

  $("btn-sp-start").addEventListener("click", startGame);
  $("btn-sp-commit").addEventListener("click", commit);
  $("btn-sp-back").addEventListener("click", backToSelect);
  $("btn-spr-again").addEventListener("click", startGame);
  $("btn-spr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "supply") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-supply").hidden) return;
    renderIntroBest();
    if (!$("sp-room").hidden && g.rng && !g.done) renderQuarter();
    if (!$("sp-report").hidden && g.done) renderReportLog();
  });

  renderIntroBest();
})();
