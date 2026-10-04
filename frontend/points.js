// 积分系统前端 (服务端权威版): 余额/道具/连胜/签到/转盘/任务全部来自
// /api/me/points, 前端只展示和发起动作 —— 改本地存档刷不了分。
// 兑换记录是纯展示, 留在本机 localStorage。
// 依赖 app.js 的 $ / api / toast / state / guarded / tick / refreshStatus /
// updateChartData / playSound, auth.js 的 Auth, i18n.js 的 t()。

(() => {
  // 服务端积分状态 { balance, peek, undo, fast, winStreak, signedToday, spunToday, taskFlags }
  let S = null;
  const TASK_SETTLE = 1;
  const TASK_BACKTEST = 2;
  const TASK_DAILY = 4;

  // 商城目录 (价格以服务端为准, 这里只做展示); 前 8 个为虚拟奖品, 后 3 个是可用道具
  const CATALOG = [
    { id: "blindbox", emoji: "🎁", cost: 500 },
    { id: "coffee", emoji: "☕", cost: 800 },
    { id: "credit10", emoji: "🧧", cost: 1000 },
    { id: "video", emoji: "🎬", cost: 1500 },
    { id: "credit50", emoji: "📞", cost: 4800 },
    { id: "earbuds", emoji: "🎧", cost: 8000 },
    { id: "watch", emoji: "⌚", cost: 20000 },
    { id: "iphone", emoji: "📱", cost: 100000 },
    { id: "peek", emoji: "🔮", cost: 300 },
    { id: "undo", emoji: "💊", cost: 400 },
    { id: "fast", emoji: "⏩", cost: 200 },
  ];
  // 转盘奖池顺序必须与服务端 PointsService.WHEEL 一致 (按 wheelIndex 对位动画)
  const WHEEL_EMOJI = ["🪙", "🔮", "💰", "💊", "💎", "⏩", "👑", "🧧"];

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem("qs_redeem_log")) || []; } catch (e) { return []; }
  }
  const history = loadHistory();
  function saveHistory() {
    try { localStorage.setItem("qs_redeem_log", JSON.stringify(history.slice(0, 20))); } catch (e) { /* ignore */ }
  }

  // ---------- 渲染 ----------

  function renderAll() {
    const bal = S ? S.balance : 0;
    $("points-balance-head").textContent = bal.toLocaleString();
    $("shop-balance").textContent = bal.toLocaleString();
    renderStreak();
    renderItemBar();
    renderTasks();
    renderWheel();
    renderMyItems();
  }

  function renderStreak() {
    const el = $("streak-flame");
    const streak = S ? S.winStreak : 0;
    el.hidden = streak < 2;
    el.textContent = "🔥×" + streak;
  }

  const ITEM_EMOJI = { peek: "🔮", undo: "💊", fast: "⏩" };

  function renderItemBar() {
    const bar = $("item-bar");
    const blind = window.state && (state.mode === "DAILY" || state.mode === "ROOM");
    const total = S ? S.peek + S.undo + S.fast : 0;
    bar.hidden = blind || total === 0;
    ["peek", "undo", "fast"].forEach((k) => {
      const btn = $("btn-item-" + k);
      const n = S ? S[k] : 0;
      btn.textContent = `${ITEM_EMOJI[k]} ${t("item." + k)} ×${n}`;
      btn.disabled = n <= 0;
    });
  }

  function renderMyItems() {
    $("my-items").textContent = S
      ? t("item.mine", S.peek, S.undo, S.fast) : "";
  }

  function renderTasks() {
    const flags = S ? S.taskFlags : 0;
    const row = (id, flag) => {
      const el = $("task-" + id);
      const done = (flags & flag) !== 0;
      el.classList.toggle("done", done);
      el.querySelector(".task-state").textContent = done ? "✅" : "⬜";
    };
    row("settle", TASK_SETTLE);
    row("backtest", TASK_BACKTEST);
    row("daily", TASK_DAILY);
  }

  // ---------- 数据同步 ----------

  async function refresh() {
    if (!window.Auth || !Auth.user) { S = null; renderAll(); return; }
    try {
      S = await api("/me/points");
      renderAll();
    } catch (e) { /* 未登录/网络异常时保持旧值 */ }
  }

  // 登录即签到 (服务端幂等, 当天重复调用不重复加分)
  async function signInDaily() {
    try {
      S = await api("/me/points/signin", { method: "POST" });
      renderAll();
    } catch (e) { /* ignore */ }
  }

  if (window.Auth) {
    Auth.onChange((user) => { if (user) signInDaily(); else { S = null; renderAll(); } });
    if (Auth.user) signInDaily();
  }

  // 结算入账由服务端完成, 前端拿响应里的 pointsEarned/winStreak 展示
  document.addEventListener("qs:settled", (e) => {
    const r = e.detail || {};
    setTimeout(() => {
      toast(r.winStreak >= 2
        ? t("points.settleStreak", r.pointsEarned, r.winStreak)
        : t("points.settleEarned", r.pointsEarned));
    }, 1200);
    document.dispatchEvent(new CustomEvent("qs:aiStreak", { detail: r.winStreak || 0 }));
    refresh();
  });

  // ---------- 兑换商城 ----------

  function renderShop() {
    const grid = $("points-grid");
    grid.innerHTML = "";
    CATALOG.forEach((item) => {
      const tile = document.createElement("div");
      tile.className = "points-item";
      const pic = document.createElement("span");
      pic.className = "pic";
      pic.textContent = item.emoji;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = t("points.item." + item.id);
      const cost = document.createElement("span");
      cost.className = "cost";
      cost.textContent = item.cost.toLocaleString() + " " + t("points.unit");
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = t("points.redeemBtn");
      btn.disabled = !S || S.balance < item.cost;
      btn.addEventListener("click", () => redeem(item, btn));
      tile.append(pic, name, cost, btn);
      grid.appendChild(tile);
    });
    renderHistoryList();
  }

  function renderHistoryList() {
    const ul = $("points-history");
    ul.innerHTML = "";
    if (!history.length) {
      const li = document.createElement("li");
      li.textContent = t("points.historyEmpty");
      ul.appendChild(li);
      return;
    }
    history.slice(0, 10).forEach((rec) => {
      const li = document.createElement("li");
      li.textContent = `${new Date(rec.t).toLocaleDateString()} · ${t("points.item." + rec.id)}`;
      ul.appendChild(li);
    });
  }

  async function redeem(item, btn) {
    if (!window.confirm(t("points.confirm", item.cost.toLocaleString(), t("points.item." + item.id)))) return;
    btn.disabled = true;
    try {
      const res = await api("/me/points/redeem", {
        method: "POST", body: JSON.stringify({ itemId: item.id }),
      });
      S = res.state;
      history.unshift({ id: item.id, t: Date.now() });
      saveHistory();
      if (window.playSound) playSound("buy");
      if (item.id === "blindbox") toast(t("points.blindboxWin", res.blindboxWin));
      else toast(t("points.redeemOk", t("points.item." + item.id)));
      renderAll();
      renderShop();
    } catch (e) {
      toast(e.message);
      renderShop();
    }
  }

  // ---------- 幸运大转盘 (开奖在服务端, 前端只负责转到对应扇区) ----------

  let wheelAngle = 0;
  let spinning = false;

  function renderWheel() {
    const wheel = $("wheel");
    if (wheel.childElementCount === 0) {
      WHEEL_EMOJI.forEach((emoji, i) => {
        const el = document.createElement("span");
        el.className = "seg";
        el.style.transform = `rotate(${i * 45 + 22.5}deg) translate(-50%, -62px)`;
        el.textContent = emoji;
        wheel.appendChild(el);
      });
    }
    const btn = $("btn-wheel-spin");
    btn.disabled = spinning || !S || S.spunToday;
    btn.textContent = S && S.spunToday ? t("wheel.doneToday") : t("wheel.spin");
  }

  async function spinWheel() {
    if (spinning || !S || S.spunToday) return;
    spinning = true;
    renderWheel();
    try {
      const res = await api("/me/points/spin", { method: "POST" });
      const idx = res.wheelIndex;
      wheelAngle += 5 * 360 + ((360 - (idx * 45 + 22.5)) - (wheelAngle % 360) + 360) % 360;
      $("wheel").style.transform = `rotate(${wheelAngle}deg)`;
      setTimeout(() => {
        spinning = false;
        S = res.state;
        if (res.kind === "pts") toast(t("wheel.wonPts", res.value));
        else toast(t("wheel.wonItem", t("item." + res.value)));
        renderAll();
        renderShop();
      }, 3200);
    } catch (e) {
      spinning = false;
      toast(e.message);
      refresh();
    }
  }
  $("btn-wheel-spin").addEventListener("click", spinWheel);

  // ---------- 道具使用 (peek/undo 的计数由对局端点在服务端内扣) ----------

  async function usePeek() {
    const btn = $("btn-item-peek");
    btn.disabled = true;
    try {
      const res = await api(`/game/${state.sessionId}/peek`, { method: "POST" });
      if (S) S.peek--;
      toast(t("item.peekResult." + res.direction));
    } catch (e) { toast(e.message); }
    renderAll();
  }

  async function useUndo() {
    const btn = $("btn-item-undo");
    btn.disabled = true;
    try {
      await api(`/game/${state.sessionId}/undo-trade`, { method: "POST" });
      if (S) S.undo--;
      if (state.trades.length) state.trades.pop();
      if (state.mode !== "PORTFOLIO") updateChartData();
      await refreshStatus();
      toast(t("item.undoOk"));
    } catch (e) { toast(e.message); }
    renderAll();
  }

  async function useFast() {
    if (!window.state || state.settled) return;
    const btn = $("btn-item-fast");
    btn.disabled = true;
    try {
      S = await api("/me/points/use-item", {
        method: "POST", body: JSON.stringify({ kind: "fast" }),
      });
    } catch (e) {
      toast(e.message);
      renderAll();
      return;
    }
    renderAll();
    toast(t("item.fastGo"));
    await guarded(async () => {
      for (let i = 0; i < 3 && !state.settled; i++) {
        await tick();
      }
    });
  }

  $("btn-item-peek").addEventListener("click", usePeek);
  $("btn-item-undo").addEventListener("click", useUndo);
  $("btn-item-fast").addEventListener("click", useFast);
  document.addEventListener("qs:view", (e) => {
    if (e.detail === "game") renderItemBar();
  });

  // ---------- 弹窗开关 ----------

  function openShop() {
    renderAll();
    renderShop();
    $("points-modal").hidden = false;
    refresh().then(renderShop);
  }
  function closeShop() {
    $("points-modal").hidden = true;
  }
  $("btn-points-head").addEventListener("click", openShop);
  $("btn-points-close").addEventListener("click", closeShop);
  $("points-modal").addEventListener("click", (e) => {
    if (e.target === $("points-modal")) closeShop();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("points-modal").hidden) { renderAll(); renderShop(); }
  });

  renderAll();
})();
