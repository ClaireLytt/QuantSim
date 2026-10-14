// 个人主页: 用户卡 + 三标签 (对局记录 / 我的实验 / 成就徽章) + 右侧统计概览。
// 全部复用既有数据源: /me/games、/me/points、研究报告 qs_lab_reports、学堂 prog/BADGES。
// 依赖 app.js 的 $ / switchView / currentUsername / fmtPct, auth.js 的 Auth,
//       academy.js 的 prog / BADGES, lab.js 的 openLabBlock, i18n 的 t / pick。
(() => {
  const TABS = ["games", "exps", "badges"];
  let curTab = "games";

  // ---------- 用户卡 ----------
  async function renderUserCard() {
    const name = (window.Auth && Auth.user) ? Auth.user.username : currentUsername();
    $("mine-name").textContent = name;
    $("mine-avatar").textContent = (name || "?").charAt(0).toUpperCase();
    $("mine-guest").hidden = !!(window.Auth && Auth.user);
    const ptsEl = $("mine-points");
    if (window.Auth && Auth.user) {
      try {
        const s = await api("/me/points");
        ptsEl.textContent = Number(s.balance).toLocaleString();
      } catch (e) { ptsEl.textContent = "--"; }
    } else {
      ptsEl.textContent = "--";
    }
  }

  // ---------- 标签切换 ----------
  function switchTab(tab) {
    curTab = tab;
    TABS.forEach((tId) => {
      $("mine-tab-" + tId).classList.toggle("active", tId === tab);
      $("mine-panel-" + tId).hidden = tId !== tab;
    });
    if (tab === "games") renderGames();
    else if (tab === "exps") renderExps();
    else renderBadges();
  }
  // 显式字面量绑定 (ui_check 的死按钮扫描不认动态拼接 id)
  $("mine-tab-games").addEventListener("click", () => switchTab("games"));
  $("mine-tab-exps").addEventListener("click", () => switchTab("exps"));
  $("mine-tab-badges").addEventListener("click", () => switchTab("badges"));

  // ---------- 对局记录: /me/games (需登录), 卡片 = 日期·模式·标的·收益 + 详情入口 ----------
  let gamesCache = null;

  async function loadGames() {
    if (!window.Auth || !Auth.user) return null;
    if (!gamesCache) {
      try { gamesCache = await api("/me/games"); } catch (e) { gamesCache = []; }
    }
    return gamesCache;
  }

  async function renderGames() {
    const ul = $("mine-games");
    ul.innerHTML = "";
    const empty = $("mine-games-empty");
    const games = await loadGames();
    if (!games) {
      empty.hidden = false;
      empty.textContent = t("mine.needLogin");
      return;
    }
    empty.hidden = !!games.length;
    empty.textContent = t("mine.gamesEmpty");
    games.slice(0, 20).forEach((g) => {
      const li = document.createElement("li");
      li.className = "mine-row";
      const head = document.createElement("div");
      const title = document.createElement("b");
      // 盲局 (进行中竞技局) 走 stockName 统一映射「神秘标的 / Mystery Stock」, 别把中文占位硬塞给英文界面
      const blind = g.stockCode === "???" || g.stockName === "神秘标的";
      title.textContent = `${stockName(g.stockName, g.stockCode) || "?"}${g.mode && g.mode !== "CLASSIC" ? " · " + g.mode : ""}`;
      const meta = document.createElement("span");
      meta.className = "hint";
      // 盲局日期已平移到虚拟纪元 (2000-xx), 当真实日期展示只会误导 —— 不如不显示
      meta.textContent = `${blind ? "" : (g.startDate || "") + " · "}${t("mine.status." + (g.status === "SETTLED" ? "settled" : "playing"))}`;
      head.append(title, meta);
      const ret = document.createElement("i");
      if (g.finalReturnRate != null) {
        const v = Number(g.finalReturnRate);
        ret.textContent = (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
        ret.className = v >= 0 ? "pos" : "neg";
      } else {
        ret.textContent = "--";
        ret.className = "hint";
      }
      const go = document.createElement("button");
      go.className = "small";
      go.textContent = t("mine.gameDetail");
      go.addEventListener("click", () => switchView("history")); // 复盘/续玩入口都在战绩历史页
      li.append(head, ret, go);
      ul.appendChild(li);
    });
  }

  // ---------- 我的实验: 研究所保存的报告, 可再次打开 / 去对局实战 ----------
  function loadReports() {
    try {
      const v = JSON.parse(localStorage.getItem("qs_lab_reports"));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  const LAB_NAME_KEY = {
    "lab-b-compare": "lab.compare", "lab-b-models": "lab.models", "lab-b-signal": "lab.signals",
    "lab-b-calib": "lab.calib", "lab-b-timing": "lab.timing", "lab-b-overview": "lab.overview",
  };

  function renderExps() {
    const ul = $("mine-exps");
    ul.innerHTML = "";
    const list = loadReports();
    $("mine-exps-empty").hidden = !!list.length;
    list.forEach((r) => {
      const li = document.createElement("li");
      li.className = "mine-row";
      const head = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = t(LAB_NAME_KEY[r.block] || "lab.section");
      const meta = document.createElement("span");
      meta.className = "hint";
      meta.textContent = (r.params ? r.params + " · " : "") + new Date(r.ts).toLocaleDateString();
      head.append(title, meta);
      const open = document.createElement("button");
      open.className = "small";
      open.textContent = t("mine.expOpen");
      open.addEventListener("click", () => {
        switchView("lab");
        if (typeof openLabBlock === "function") openLabBlock(r.block);
      });
      const apply = document.createElement("button");
      apply.className = "small replay";
      apply.textContent = t("mine.expApply");
      apply.addEventListener("click", () => {
        switchView("game");
        toast(t("mine.expApplyHint"));
      });
      li.append(head, open, apply);
      ul.appendChild(li);
    });
  }

  // ---------- 成就徽章墙: 已解锁徽章 (academy 的 prog/BADGES) ----------
  function renderBadges() {
    const wrap = $("mine-badges");
    wrap.innerHTML = "";
    const got = (typeof prog !== "undefined" && prog.badges) ? prog.badges : [];
    $("mine-badges-empty").hidden = !!got.length;
    // 未解锁也渲染灰态占位: desc 本身就是解锁条件, 收集墙要让人看见"还差什么"
    (typeof BADGES !== "undefined" ? BADGES : []).forEach((b) => {
      const unlocked = got.includes(b.id);
      const card = document.createElement("div");
      card.className = "mine-badge" + (unlocked ? "" : " locked");
      const name = document.createElement("b");
      name.textContent = pick(b.name);
      const desc = document.createElement("span");
      desc.className = "hint";
      desc.textContent = (unlocked ? "" : t("mine.badgeLocked") + " · ") + pick(b.desc);
      card.append(name, desc);
      wrap.appendChild(card);
    });
    $("mine-badges-count").textContent = t("mine.badgesCount", got.length,
      typeof BADGES !== "undefined" ? BADGES.length : 0);
  }
  $("btn-mine-profile").addEventListener("click", () => switchView("profile"));

  // ---------- 右侧统计概览 ----------
  // 各小游戏的最佳成绩键 (只做存在性判断, 不解析内容, 所以三种存档格式混用也没关系)。
  // 新增小游戏记得在这里登记, 否则"小游戏通关数"统计必漏 (2026-10 审计 P6: 曾漏 opt/tape)
  const GAME_BEST_KEYS = ["qs_newsjudge", "qs_richman", "qs_buydip", "qs_stratbox", "qs_qdetect",
    "qs_reborn", "qs_bubble", "qs_opt_best", "qs_tape_best"];

  async function renderStats() {
    const games = await loadGames();
    const settled = (games || []).filter((g) => g.status === "SETTLED" && g.finalReturnRate != null);
    const wins = settled.filter((g) => Number(g.finalReturnRate) > 0).length;
    $("mine-stat-win").textContent = settled.length
      ? Math.round((wins / settled.length) * 100) + "%" : "--";
    const avg = settled.length
      ? settled.reduce((a, g) => a + Number(g.finalReturnRate), 0) / settled.length : null;
    const avgEl = $("mine-stat-avg");
    if (avg == null) {
      avgEl.textContent = "--";
      avgEl.className = "";
    } else {
      avgEl.textContent = (avg >= 0 ? "+" : "") + (avg * 100).toFixed(1) + "%";
      avgEl.className = avg >= 0 ? "pos" : "neg";
    }
    // 完成实验数 = 研究所打开过的实验种类; 小游戏通关数 = 留有最佳成绩的玩法数
    let labDone = [];
    try { labDone = JSON.parse(localStorage.getItem("qs_lab_done")) || []; } catch (e) { /* 忽略 */ }
    $("mine-stat-exps").textContent = String(labDone.length);
    let gameCnt = 0;
    GAME_BEST_KEYS.forEach((k) => {
      try { if (localStorage.getItem(k)) gameCnt++; } catch (e) { /* 忽略 */ }
    });
    $("mine-stat-games").textContent = String(gameCnt);
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "mine") return;
    gamesCache = null; // 每次进页刷新战绩
    renderUserCard();
    switchTab(curTab);
    renderStats();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-mine").hidden) {
      switchTab(curTab);
      renderStats();
    }
  });
  // 启动兜底: 停在本视图刷新会错过首次 qs:view
  if (!$("view-mine").hidden) { renderUserCard(); switchTab(curTab); renderStats(); }
})();
