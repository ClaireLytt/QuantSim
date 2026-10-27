// 隐藏机制 1-10 (策略单一化审计后的"可发现奖励层"方案, 2026-10-27):
// 纪律之手 / 以静制动 / 对手镜 / 晨钟 / 睡后收入 / 以彼之道 /
// 历史回声印章 / 抄底试炼 / 排队文化 / 凤凰计划。
// 设计守则: 纯奖励层 (徽章/称号/彩蛋), 不发积分、不改任何竞技口径; 线索全部来自
// 游戏内可见数据。跨局进度存 localStorage (qs_hidden), 与 qs_progress 分开。
// 加载序依赖: app.js ($ / t / toast / qsModal) + i18n.js (t 键) +
// academy.js (awardBadge / awardTitle) + play.js (全局 state 与 qs:* 事件), 必须在四者之后。

(() => {
  const KEY = "qs_hidden";
  let H = { bellLast: "", bellStreak: 0, mirrorStreak: 0, stamps: [], phoenixArmed: false };
  try { H = Object.assign(H, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* 隐私模式下忽略 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(H)); } catch (e) { /* ignore */ } };
  window.qsHidden = H; // academy.js 的徽章进度条 (晨钟/亲历者) 从这里读

  // 会话内状态: 每局开局 (qs:gameStart) 重置
  let queueHits = 0;       // #9 同一局内涨停板拒单次数
  let dipShown = false;    // #8 抄底试炼每局最多弹一次
  let dipAccepted = false;
  let phoenixPending = false; // #10 点了凤凰按钮、等开局成功
  let phoenixSession = false;

  document.addEventListener("qs:gameStart", () => {
    queueHits = 0;
    dipShown = false;
    dipAccepted = false;
    phoenixSession = phoenixPending;
    phoenixPending = false;
  });

  // ---------- #8 抄底试炼: 连续 3 根阴线且累计 ≤ -8% 时弹试炼卡 ----------

  const dipModal = qsModal("dip-modal", { closeBtnId: "btn-dip-close", escape: true });
  $("btn-dip-accept").addEventListener("click", () => {
    dipAccepted = true;
    dipModal.close();
    toast(t("hidden.dipAccepted"));
  });
  $("btn-dip-decline").addEventListener("click", dipModal.close);

  document.addEventListener("qs:tick", () => {
    const s = window.state || {};
    const k = s.klines || [];
    if (dipShown || k.length < 4) return;
    const base = Number(k[k.length - 4].close);
    const closes = k.slice(-3).map((b) => Number(b.close));
    const allDown = closes[0] < base && closes[1] < closes[0] && closes[2] < closes[1];
    if (base > 0 && allDown && closes[2] / base - 1 <= -0.08) {
      dipShown = true;
      dipModal.open();
    }
  });

  // ---------- #9 排队文化: 同一局涨停拒单三连 ----------

  document.addEventListener("qs:tradeRejected", (e) => {
    if (!String(e.detail || "").includes("涨停")) return;
    queueHits++;
    if (queueHits === 3) {
      toast(t("hidden.queue3"));
      awardBadge("h_queue");
    }
  });

  // ---------- #6 以彼之道: 战书榜踢馆成功 (mates.js 派发) ----------

  document.addEventListener("qs:gateCrash", () => awardBadge("h_gate"));

  // ---------- 结算时判定 #1/#2/#3/#5/#7/#8/#10 ----------

  document.addEventListener("qs:settled", (e) => {
    const r = e.detail || {};
    const s = window.state || {};
    const trades = s.trades || [];
    const ret = Number(r.returnRate);

    // #1 纪律之手: 全理由 (≥8 字, 与 AUDIT 口径一致) + 未用道具 + 正收益。
    // 线索: 只要全理由就在结算卡留批注, 不论胜负——引导玩家保持直到集齐三条件
    const allReasons = trades.length > 0
      && trades.every((tx) => String(tx.reason || "").trim().length >= 8);
    if (allReasons) {
      const card = $("settle-card");
      if (card && !card.querySelector(".hidden-note")) {
        const p = document.createElement("p");
        p.className = "hint hidden-note";
        p.textContent = t("hidden.allReasons");
        card.appendChild(p);
      }
      if (!s.itemUsed && ret > 0) awardBadge("h_discipline");
    }

    // #2 以静制动: 熊市生存零交易, 靠利息跑赢买入持有
    if (s.mode === "SURVIVAL" && trades.length === 0 && r.holdReturnRate != null
        && ret > Number(r.holdReturnRate)) {
      awardBadge("h_idle");
    }

    // #5 睡后收入: 利息 > |交易盈亏| 且至少交易过一笔 (与 #2 的纯躺平区分)
    const interest = Number(r.interestTotal || 0);
    const tradePnl = Number(r.finalAssets) - Number(r.initialCash) - interest;
    if (trades.length >= 1 && interest > 0 && interest > Math.abs(tradePnl)) {
      awardBadge("h_interest");
    }

    // #3 对手镜: AI 出手的每一天方向都相反且胜之, 连续三局
    updateMirror(r, s, trades, ret);

    // #4 晨钟: 每日挑战在刷新 (上海零点) 后 1 小时内完赛, 连续 7 天
    if (s.mode === "DAILY") updateBell();

    // #7 历史回声: 本局见过的 HIGH 级历史事件记成印章 (play.js 收集进 state.newsHigh)
    const seen = s.newsHigh || [];
    if (seen.length) {
      seen.forEach((n) => {
        if (!H.stamps.some((x) => x.zh === n.zh)) H.stamps.push(n);
      });
      save();
      renderStamps();
      if (H.stamps.length >= 5) awardBadge("h_witness");
    }

    // #8 抄底试炼收卷: 接了试炼、真买过、正收益
    if (dipAccepted && ret > 0 && trades.some((tx) => tx.dir === "BUY")) {
      awardBadge("h_knife");
    }

    // #10 凤凰计划: 凤凰局正收益得称号; 被强平则点亮下次开局的凤凰入口
    if (phoenixSession && ret > 0) {
      awardTitle({ zh: "涅槃", en: "Phoenix" });
    }
    if (s.wasLiquidated) {
      H.phoenixArmed = true;
      save();
      renderPhoenix();
    }
  });

  /** #3 判定: AI 每个出手日 (shares≠0) 玩家当日净方向必须相反; AI 出手 <3 天的局不计。 */
  function updateMirror(r, s, trades, ret) {
    if (r.aiReturnRate == null) return;
    const aiMoves = (s.aiMoves || []).filter((m) => m.shares);
    if (aiMoves.length < 3) return;
    const mineByIdx = new Map();
    trades.forEach((tx) => mineByIdx.set(tx.idx,
      (mineByIdx.get(tx.idx) || 0) + (tx.dir === "BUY" ? tx.shares : -tx.shares)));
    const opposedAll = aiMoves.every((m) =>
      Math.sign(mineByIdx.get(m.idx) || 0) === -Math.sign(m.shares));
    H.mirrorStreak = opposedAll && ret > Number(r.aiReturnRate) ? H.mirrorStreak + 1 : 0;
    save();
    if (H.mirrorStreak >= 3) awardBadge("h_mirror");
  }

  /** #4: 以 UTC+8 (无夏令时) 近似游戏时区; 仅视觉奖励, 客户端时钟作弊无利可图。 */
  function shanghaiNow() {
    return new Date(Date.now() + 8 * 3600e3);
  }

  function updateBell() {
    const sh = shanghaiNow();
    if (sh.getUTCHours() !== 0) return; // 刷新后 1 小时内
    const today = sh.toISOString().slice(0, 10);
    if (H.bellLast === today) return;
    const yesterday = new Date(sh.getTime() - 86400e3).toISOString().slice(0, 10);
    H.bellStreak = H.bellLast === yesterday ? H.bellStreak + 1 : 1;
    H.bellLast = today;
    save();
    if (H.bellStreak >= 7) awardBadge("h_bell");
  }

  // ---------- #7 印章墙 (个人页): 集到第一枚才出现 ----------

  function renderStamps() {
    const card = $("profile-stamps-card");
    const list = $("stamp-list");
    if (!card || !list) return;
    card.hidden = H.stamps.length === 0;
    list.innerHTML = "";
    H.stamps.forEach((n) => {
      const span = document.createElement("span");
      span.className = "badge got";
      span.textContent = pick(n);
      list.appendChild(span);
    });
  }

  // ---------- #10 凤凰入口 (开局区): 强平后点亮, 点击即按预设限制开局 ----------

  function renderPhoenix() {
    const box = $("phoenix-banner");
    if (box) box.hidden = !H.phoenixArmed;
  }

  $("btn-phoenix").addEventListener("click", () => {
    H.phoenixArmed = false;
    save();
    renderPhoenix();
    phoenixPending = true;
    startGame({ maxTrades: 10, requireReason: true });
  });

  // ---------- #4 线索: 清晨访问每日页时的一句话 ----------

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "daily") return;
    if (shanghaiNow().getUTCHours() !== 0) return;
    const view = $("view-daily");
    if (!view || view.querySelector(".hidden-bell-hint")) return;
    const p = document.createElement("p");
    p.className = "hint hidden-bell-hint";
    p.textContent = t("hidden.bellHint");
    view.prepend(p);
  });

  renderStamps();
  renderPhoenix();
})();
