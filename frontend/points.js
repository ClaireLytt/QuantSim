// 积分系统: 参考市面 App 的「签到 + 任务」模式攒积分, 旁边配模拟兑换商城。
// 规则: 每日签到 +10 / 完成结算 +50 / 战胜 AI +30 / 跑赢买入持有 +20 / 每日挑战 +40。
// 兑换为游戏内模拟演示 (话费/耳机/手机等奖品均不真实发放), 数据存 localStorage (设备本地)。
// 依赖 app.js 的 $ / toast / state / playSound 与 i18n.js 的 t()。

(() => {
  const KEY = "qs_points";

  // 奖品目录: emoji 当奖品图, cost 为所需积分 (对标市面积分商城的常见档位)
  const CATALOG = [
    { id: "blindbox", emoji: "🎁", cost: 500 },
    { id: "coffee", emoji: "☕", cost: 800 },
    { id: "credit10", emoji: "🧧", cost: 1000 },
    { id: "video", emoji: "🎬", cost: 1500 },
    { id: "credit50", emoji: "📞", cost: 4800 },
    { id: "earbuds", emoji: "🎧", cost: 8000 },
    { id: "watch", emoji: "⌚", cost: 20000 },
    { id: "iphone", emoji: "📱", cost: 100000 },
  ];
  const MAX_LOG = 50;

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d.balance === "number") return d;
    } catch (e) { /* 隐私模式/脏数据时重置 */ }
    return { balance: 0, lastSignIn: "", log: [], redeemed: [] };
  }
  const data = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function renderBalance() {
    $("shop-balance").textContent = data.balance.toLocaleString();
    $("points-balance-head").textContent = data.balance.toLocaleString();
  }

  /** 记一笔积分 (amount 可为负 = 兑换扣减), reason 为 i18n 键尾段。 */
  function book(amount, reason) {
    data.balance = Math.max(0, data.balance + amount);
    data.log.unshift({ t: Date.now(), amount, reason });
    if (data.log.length > MAX_LOG) data.log.length = MAX_LOG;
    save();
    renderBalance();
  }

  // ---------- 攒积分 ----------

  // 每日首次打开页面算签到
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastSignIn !== today) {
    data.lastSignIn = today;
    book(10, "signin");
    setTimeout(() => toast(t("points.earned", 10, t("points.r.signin"))), 800);
  }

  // 结算联动: 一局最多四项加成, 合并成一条 toast 免得互相覆盖
  document.addEventListener("qs:settled", (e) => {
    const r = e.detail || {};
    let total = 0;
    const add = (amount, reason) => { book(amount, reason); total += amount; };
    add(50, "settle");
    if (r.aiReturnRate != null && Number(r.returnRate) > Number(r.aiReturnRate)) add(30, "beatAi");
    if (r.holdReturnRate != null && Number(r.returnRate) > Number(r.holdReturnRate)) add(20, "beatHold");
    if (window.state && state.mode === "DAILY") add(40, "daily");
    setTimeout(() => toast(t("points.settleEarned", total)), 1200);
  });

  // ---------- 兑换商城 ----------

  function renderShop() {
    renderBalance();
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
      btn.disabled = data.balance < item.cost;
      btn.addEventListener("click", () => redeem(item));
      tile.append(pic, name, cost, btn);
      grid.appendChild(tile);
    });
    renderHistory();
  }

  function renderHistory() {
    const ul = $("points-history");
    ul.innerHTML = "";
    if (!data.redeemed.length) {
      const li = document.createElement("li");
      li.textContent = t("points.historyEmpty");
      ul.appendChild(li);
      return;
    }
    data.redeemed.slice(0, 10).forEach((rec) => {
      const li = document.createElement("li");
      li.textContent = `${new Date(rec.t).toLocaleDateString()} · ${t("points.item." + rec.id)}`;
      ul.appendChild(li);
    });
  }

  function redeem(item) {
    if (data.balance < item.cost) {
      toast(t("points.notEnough"));
      return;
    }
    if (!window.confirm(t("points.confirm", item.cost.toLocaleString(), t("points.item." + item.id)))) return;
    book(-item.cost, "redeem");
    data.redeemed.unshift({ id: item.id, t: Date.now() });
    if (data.redeemed.length > MAX_LOG) data.redeemed.length = MAX_LOG;
    save();
    if (window.playSound) playSound("buy");
    if (item.id === "blindbox") {
      // 盲盒: 随机返 100~1000 积分, 市面积分商城的保底玩法
      const win = 100 + Math.floor(Math.random() * 901);
      book(win, "blindbox");
      toast(t("points.blindboxWin", win));
    } else {
      toast(t("points.redeemOk", t("points.item." + item.id)));
    }
    renderShop();
  }

  function openShop() {
    renderShop();
    $("points-modal").hidden = false;
  }
  function closeShop() {
    $("points-modal").hidden = true;
  }

  $("btn-points-head").addEventListener("click", openShop); // 顶栏常驻入口, 详情都在弹窗里
  $("btn-points-close").addEventListener("click", closeShop);
  $("points-modal").addEventListener("click", (e) => {
    if (e.target === $("points-modal")) closeShop(); // 点遮罩关闭
  });
  document.addEventListener("qs:lang", () => {
    if (!$("points-modal").hidden) renderShop();
  });

  renderBalance();
})();
