// 抢同一口汤: 流动性争夺。你和 2 个 AI 共享同一个订单簿——谁下单谁抬价/砸价,
// 对手看得到每笔成交对盘口的冲击, 看不到彼此的仓位。12 回合后强制平仓:
// 重仓者要亲手把价格砸给自己看。胜负来自对"人"的误判, 不来自行情。
// 纸面原型 A 的数字化 (docs/gameplay-core-loops-2026-10.md)。
// 依赖 app.js 的 $ / toast / playSound / qsLoadBest / qsSaveBest, i18n.js 的 t。
(() => {
  const BEST_KEY = "qs_soup";
  const ROUNDS = 12;
  const CASH0 = 100;
  const LEVELS = 5; // 盘口每侧档位数
  const LOT_Q = 3; // 每档挂单量 (手)
  const SHOCK_ROUNDS = [4, 8]; // 这些回合结束后掷"外部行情"骰

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const g = {
    rng: null, round: 0, done: false,
    asks: [], bids: [], // [{p, q}] asks 升序 / bids 降序
    players: [], // {id, ai, cash, pos, acts}
    turn: [], log: [], fair: 10,
  };

  let selAct = "buy";
  let selQty = 1;

  function newBook() {
    g.asks = Array.from({ length: LEVELS }, (_, i) => ({ p: 11 + i, q: LOT_Q }));
    g.bids = Array.from({ length: LEVELS }, (_, i) => ({ p: 9 - i, q: LOT_Q }));
  }

  function startGame() {
    g.rng = mulberry32(Math.floor(Math.random() * 1e9));
    g.round = 1;
    g.done = false;
    g.fair = 10;
    g.log = [];
    newBook();
    g.players = [
      { id: "you", ai: null, cash: CASH0, pos: 0, acts: 0 },
      { id: "momo", ai: "momo", cash: CASH0, pos: 0, acts: 0 },
      { id: "shark", ai: "shark", cash: CASH0, pos: 0, acts: 0 },
    ];
    $("sop-select").hidden = true;
    $("sop-report").hidden = true;
    $("sop-room").hidden = false;
    selAct = "buy";
    selQty = 1;
    renderRound();
  }

  // 市价吃单: 买走 asks / 卖进 bids, 吃穿一档价格就顺延——冲击成本在这里发生
  function execute(player, side, qty) {
    const book = side === "buy" ? g.asks : g.bids;
    let cost = 0, filled = 0;
    while (filled < qty && book.length) {
      const lv = book[0];
      const take = Math.min(qty - filled, lv.q);
      cost += take * lv.p;
      lv.q -= take;
      filled += take;
      if (lv.q === 0) book.shift();
    }
    // 补档: 盘口永远有 5 档, 新档往更深处挂——盘子被买上去/砸下来
    refill();
    if (side === "buy") { player.cash -= cost; player.pos += filled; }
    else { player.cash += cost; player.pos -= filled; }
    player.acts++;
    return { filled, avg: filled ? cost / filled : 0 };
  }

  function refill() {
    while (g.asks.length < LEVELS) {
      const last = g.asks.length ? g.asks[g.asks.length - 1].p : g.bids[0].p + 2;
      g.asks.push({ p: last + 1, q: LOT_Q });
    }
    while (g.bids.length < LEVELS) {
      const last = g.bids.length ? g.bids[g.bids.length - 1].p : g.asks[0].p - 2;
      g.bids.push({ p: Math.max(1, last - 1), q: LOT_Q });
    }
  }

  // 外部行情骰: 全部档位整体平移, 谁都躲不开的系统性风险
  function shock() {
    const roll = g.rng();
    const d = roll < 0.34 ? -1 : roll > 0.66 ? 1 : 0;
    if (!d) return 0;
    g.asks.forEach((l) => { l.p = Math.max(2, l.p + d); });
    g.bids.forEach((l) => { l.p = Math.max(1, l.p + d); });
    g.fair += d;
    return d;
  }

  const mid = () => (g.asks[0].p + g.bids[0].p) / 2;

  // 跟风客: 盯着最近两笔成交的方向追; 阴鸷鲨: 围绕"合理价"低吸高抛, 临近终局提前减仓
  function aiDecide(p) {
    const m = mid();
    const recent = g.log.slice(-2).reduce((s, e) => s + (e.side === "buy" ? e.qty : e.side === "sell" ? -e.qty : 0), 0);
    const roomLeft = ROUNDS - g.round;
    if (p.ai === "momo") {
      if (recent > 0 && p.pos < 4 && p.cash >= g.asks[0].p * 2) return { side: "buy", qty: g.rng() < 0.5 ? 1 : 2 };
      if (recent < 0 && p.pos > 0) return { side: "sell", qty: Math.min(2, p.pos) };
      if (p.pos > 0 && roomLeft <= 2) return { side: "sell", qty: Math.min(2, p.pos) };
      return { side: "pass", qty: 0 };
    }
    // shark: 知道终局要砸价平仓, 仓位上限 3 且最后 3 回合开始出货
    if (roomLeft <= 3 && p.pos > 0) return { side: "sell", qty: Math.min(2, p.pos) };
    if (m < g.fair - 0.5 && p.pos < 3 && p.cash >= g.asks[0].p * 2) return { side: "buy", qty: 2 };
    if (m > g.fair + 0.5 && p.pos > 0) return { side: "sell", qty: Math.min(2, p.pos) };
    return { side: "pass", qty: 0 };
  }

  function pushLog(p, side, qty, avg) {
    g.log.push({ round: g.round, who: p.id, side, qty, avg });
  }

  function commit() {
    if (g.done) return;
    const you = g.players[0];
    if (selAct === "sell" && you.pos < selQty) { toast(t("sop.noPos")); return; }
    if (selAct === "buy" && you.cash < g.asks[0].p * selQty) { toast(t("sop.noCash")); return; }
    if (selAct === "pass") pushLog(you, "pass", 0, 0);
    else {
      const r = execute(you, selAct, selQty);
      pushLog(you, selAct, r.filled, r.avg);
    }
    // AI 依次行动 (每局行动顺序固定你先手——先手便宜但暴露意图)
    g.players.slice(1).forEach((p) => {
      const d = aiDecide(p);
      if (d.side === "pass") { pushLog(p, "pass", 0, 0); return; }
      if (d.side === "buy" && p.cash < g.asks[0].p * d.qty) { pushLog(p, "pass", 0, 0); return; }
      const r = execute(p, d.side, d.qty);
      pushLog(p, d.side, r.filled, r.avg);
    });
    playSound("fill");
    if (SHOCK_ROUNDS.includes(g.round)) {
      const d = shock();
      if (d) {
        g.log.push({ round: g.round, who: "market", side: d > 0 ? "up" : "down", qty: 0, avg: 0 });
        toast(t(d > 0 ? "sop.shockUp" : "sop.shockDown"));
      }
    }
    if (g.round >= ROUNDS) { finish(); return; }
    g.round++;
    renderRound();
  }

  // 强制平仓: 随机顺序逐人把全部持仓市价卖出——重仓者砸自己的价, 终局翻盘点
  function finish() {
    g.done = true;
    const order = [...g.players].sort(() => g.rng() - 0.5);
    const liq = [];
    order.forEach((p) => {
      if (p.pos <= 0) { liq.push({ who: p.id, qty: 0, avg: 0 }); return; }
      const qty = p.pos;
      const r = execute(p, "sell", qty);
      p.acts--; // 强平不计出手
      liq.push({ who: p.id, qty, avg: r.avg });
    });
    const rank = [...g.players].sort((a, b) => b.cash - a.cash);
    const you = g.players[0];
    const myRank = rank.indexOf(you) + 1;
    const profit = Math.round((you.cash - CASH0) * 10) / 10;
    const win = myRank === 1;
    $("sop-room").hidden = true;
    $("sop-report").hidden = false;
    const concl = $("sopr-conclusion");
    concl.textContent = win ? t("sop.win", profit) : t("sop.lose", myRank, profit);
    concl.className = "qdr-conclusion " + (win ? "win" : "lose");
    const ul = $("sopr-rank");
    ul.innerHTML = "";
    rank.forEach((p, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = `#${i + 1} ` + t("sop.name." + p.id);
      const dd = document.createElement("span");
      dd.textContent = t("sop.rankLine", p.cash.toFixed(1), p.acts);
      li.append(tt, dd);
      ul.appendChild(li);
    });
    const lq = $("sopr-liq");
    lq.innerHTML = "";
    liq.forEach((e) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("sop.name." + e.who);
      const dd = document.createElement("span");
      dd.textContent = e.qty ? t("sop.liqLine", e.qty, e.avg.toFixed(2)) : t("sop.liqNone");
      li.append(tt, dd);
      ul && lq.appendChild(li);
    });
    $("sopr-why").textContent = t("sop.moral");
    playSound(win ? "win" : "lose");
    if (win && profit > 0) {
      const b = qsLoadBest(BEST_KEY);
      if (profit > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: profit });
        toast(t("sop.newBest", profit));
      }
    }
    renderIntroBest();
  }

  function renderRound() {
    const you = g.players[0];
    $("sop-round").textContent = t("sop.roundNo", g.round, ROUNDS);
    $("sop-cash").textContent = you.cash.toFixed(1);
    $("sop-pos").textContent = String(you.pos);
    renderBook();
    renderRivals();
    renderActions();
    renderLog();
  }

  function renderBook() {
    const wrap = $("sop-book");
    wrap.innerHTML = "";
    [...g.asks].reverse().forEach((l) => wrap.appendChild(bookRow(l, "ask")));
    const midRow = document.createElement("div");
    midRow.className = "sop-mid";
    midRow.textContent = t("sop.midLine", mid().toFixed(1));
    wrap.appendChild(midRow);
    g.bids.forEach((l) => wrap.appendChild(bookRow(l, "bid")));
  }

  function bookRow(l, side) {
    const row = document.createElement("div");
    row.className = "sop-row " + side;
    const price = document.createElement("b");
    price.textContent = l.p.toFixed(0);
    const bar = document.createElement("i");
    bar.style.width = (l.q / LOT_Q) * 100 + "%";
    const qty = document.createElement("span");
    qty.textContent = t("sop.lots", l.q);
    row.append(price, bar, qty);
    return row;
  }

  function renderRivals() {
    const ul = $("sop-rivals");
    ul.innerHTML = "";
    g.players.slice(1).forEach((p) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("sop.name." + p.id);
      const dd = document.createElement("span");
      dd.textContent = t("sop.rivalLine", p.acts);
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function renderActions() {
    const wrap = $("sop-acts");
    wrap.innerHTML = "";
    ["buy", "sell", "pass"].forEach((a) => {
      const btn = document.createElement("button");
      btn.className = "mz-door" + (selAct === a ? " active" : "");
      btn.disabled = g.done;
      const tt = document.createElement("b");
      tt.textContent = t("sop.act." + a);
      const dd = document.createElement("span");
      dd.className = "sub";
      dd.textContent = t("sop.actd." + a);
      btn.append(tt, dd);
      btn.addEventListener("click", () => { selAct = a; renderActions(); });
      wrap.appendChild(btn);
    });
    const qtyWrap = $("sop-qtys");
    qtyWrap.innerHTML = "";
    [1, 2, 3].forEach((n) => {
      const b = document.createElement("button");
      b.className = selQty === n ? "primary" : "";
      b.disabled = g.done || selAct === "pass";
      b.textContent = t("sop.qtyN", n);
      b.addEventListener("click", () => { selQty = n; renderActions(); });
      qtyWrap.appendChild(b);
    });
  }

  function renderLog() {
    const ul = $("sop-log");
    ul.innerHTML = "";
    $("sop-log-empty").hidden = !!g.log.length;
    g.log.slice(-6).forEach((e) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      const dd = document.createElement("span");
      if (e.who === "market") {
        tt.textContent = t("sop.rShort", e.round) + " " + t("sop.marketMove");
        dd.textContent = t(e.side === "up" ? "sop.shockUp" : "sop.shockDown");
      } else {
        tt.textContent = t("sop.rShort", e.round) + " " + t("sop.name." + e.who);
        dd.textContent = e.side === "pass"
          ? t("sop.passLine")
          : t(e.side === "buy" ? "sop.buyLine" : "sop.sellLine", e.qty, e.avg.toFixed(2));
      }
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function backToSelect() {
    $("sop-room").hidden = true;
    $("sop-report").hidden = true;
    $("sop-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("sop-best").hidden = !b.best;
    if (b.best) $("sop-best").textContent = t("sop.best", b.best);
  }

  $("btn-sop-start").addEventListener("click", startGame);
  $("btn-sop-commit").addEventListener("click", commit);
  $("btn-sop-back").addEventListener("click", backToSelect);
  $("btn-sopr-again").addEventListener("click", startGame);
  $("btn-sopr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "soup") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-soup").hidden) return;
    renderIntroBest();
    if (!$("sop-room").hidden && g.rng && !g.done) renderRound();
  });

  renderIntroBest();
})();
