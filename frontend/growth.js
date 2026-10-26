// 成长系统前端 (docs/progression-system-2026-10.md 的 F1 六维技能树 + A1 风格罗盘)。
// 哲学与 relics 一致: 一切从既有进度派生, 零新增存档——
//   技能树 = 各小游戏 best (qsLoadBest) + 学堂/生涯进度 (prog) 的质量过线计数;
//   罗盘 = 服务端从真实流水算的两轴坐标 (/api/me/style-compass, 登录且 ≥10 局才 ready)。
// 公平性: 全部 L0 展示层; LV3 奖励位目前是预告文案, 对应玩法上线后再接门。
// 加载序: 在 academy.js (prog) 与 auth.js (Auth) 之后。依赖 $ / api / t / qsLoadBest / pick。
(() => {
  const bestOf = (k) => Number((qsLoadBest(k) || {}).best || 0);
  const sleuthSolved = () => Object.values(qsLoadBest("qs_sleuth") || {})
    .filter((v) => typeof v === "number" && v > 0).length;
  const careerSteps = () => ((prog.career || {}).done || []).length;

  // 六维 × 各 5 条质量过线条件 (过线数 = 等级)。cond: [进度文案(双语), 判定函数]
  // 门槛全部是"赢过/达标过"而非次数——刷 100 次不过线等于 0 次 (防刷总纲)。
  const DIMS = [
    { id: "timing", icon: "⏱", conds: [
      { txt: { zh: "抄底挑战获胜一次", en: "Win Buy-the-Dip once" }, ok: () => bestOf("qs_buydip") > 0 },
      { txt: { zh: "周一的一千次获胜一次", en: "Win A Thousand Mondays once" }, ok: () => bestOf("qs_loopweek") > 0 },
      { txt: { zh: "通关 1 个名场面", en: "Clear 1 famous moment" }, ok: () => prog.famous.length >= 1 },
      { txt: { zh: "通关 3 个名场面", en: "Clear 3 famous moments" }, ok: () => prog.famous.length >= 3 },
      { txt: { zh: "通关 6 个名场面", en: "Clear 6 famous moments" }, ok: () => prog.famous.length >= 6 },
    ] },
    { id: "risk", icon: "🛡", conds: [
      { txt: { zh: "黑天鹅轮盘双指标获胜", en: "Win Black Swan Roulette (both bars)" }, ok: () => bestOf("qs_swan") > 0 },
      { txt: { zh: "仓位炼金术获胜一次", en: "Win Portfolio Alchemy once" }, ok: () => bestOf("qs_alchemy") > 0 },
      { txt: { zh: "供应链战争达成目标", en: "Hit the Supply Chain Wars target" }, ok: () => bestOf("qs_supply") > 0 },
      { txt: { zh: "平仓迷宫成功出逃", en: "Escape the Liquidation Maze" }, ok: () => bestOf("qs_maze") > 0 },
      { txt: { zh: "期权沙盘留下战绩", en: "Set a best in the Options Sandbox" }, ok: () => bestOf("qs_opt_best") > 0 },
    ] },
    { id: "info", icon: "🔍", conds: [
      { txt: { zh: "量化侦探获胜一次", en: "Win Quant Detective once" }, ok: () => bestOf("qs_qdetect") > 0 },
      { txt: { zh: "新闻判断获胜一次", en: "Win News Judge once" }, ok: () => bestOf("qs_newsjudge") > 0 },
      { txt: { zh: "财报盲品会 ≥16 分", en: "Blind Tasting: score 16+" }, ok: () => bestOf("qs_taste") >= 16 },
      { txt: { zh: "市场侦探破 1 案", en: "Market Detective: solve 1 case" }, ok: () => sleuthSolved() >= 1 },
      { txt: { zh: "市场侦探三案全破", en: "Market Detective: solve all 3" }, ok: () => sleuthSolved() >= 3 },
    ] },
    { id: "discipline", icon: "🧘", conds: [
      { txt: { zh: "止损僧侣守满一局", en: "Hold the vow in Stop-Loss Monk" }, ok: () => bestOf("qs_monk") > 0 },
      { txt: { zh: "闪电盘口留下战绩", en: "Set a best in Lightning Tape" }, ok: () => bestOf("qs_tape_best") > 0 },
      { txt: { zh: "爆仓倒推破案一次", en: "Solve a Blowup Autopsy" }, ok: () => bestOf("qs_autopsy") > 0 },
      { txt: { zh: "生涯任务完成 5 步", en: "Finish 5 career steps" }, ok: () => careerSteps() >= 5 },
      { txt: { zh: "生涯任务完成 12 步", en: "Finish 12 career steps" }, ok: () => careerSteps() >= 12 },
    ] },
    { id: "game", icon: "♟", conds: [
      { txt: { zh: "抢同一口汤夺冠一次", en: "Win One Bowl of Soup once" }, ok: () => bestOf("qs_soup") > 0 },
      { txt: { zh: "幸存者陷阱获胜一次", en: "Win the Survivor Trap once" }, ok: () => bestOf("qs_fool") > 0 },
      { txt: { zh: "大富翁对局获胜一次", en: "Win the Tycoon board once" }, ok: () => bestOf("qs_richman") > 0 },
      { txt: { zh: "算法驯兽师获胜一次", en: "Win Algo Tamer once" }, ok: () => bestOf("qs_tamer") > 0 },
      { txt: { zh: "抢汤夺冠且盈利 ≥10", en: "Win the Soup with profit 10+" }, ok: () => bestOf("qs_soup") >= 10 },
    ] },
    { id: "knowledge", icon: "📖", conds: [
      { txt: { zh: "学堂经验 ≥100", en: "Academy XP 100+" }, ok: () => prog.xp >= 100 },
      { txt: { zh: "学堂经验 ≥300", en: "Academy XP 300+" }, ok: () => prog.xp >= 300 },
      { txt: { zh: "获得 3 枚徽章", en: "Earn 3 badges" }, ok: () => prog.badges.length >= 3 },
      { txt: { zh: "获得 8 枚徽章", en: "Earn 8 badges" }, ok: () => prog.badges.length >= 8 },
      { txt: { zh: "策略盲盒猜中市场", en: "Call the market in Strategy Box" }, ok: () => bestOf("qs_stratbox") > 0 },
    ] },
  ];

  // ---------- 六维技能树 ----------

  function renderTree() {
    const wrap = $("gw-tree");
    if (!wrap) return;
    wrap.innerHTML = "";
    DIMS.forEach((d) => {
      const met = d.conds.map((c) => !!c.ok());
      const lv = met.filter(Boolean).length;
      const row = document.createElement("details");
      row.className = "gw-dim";
      const head = document.createElement("summary");
      const name = document.createElement("b");
      name.textContent = d.icon + " " + t("gw.dim." + d.id);
      const stars = document.createElement("span");
      stars.className = "gw-stars" + (lv >= 5 ? " maxed" : "");
      stars.textContent = "★".repeat(lv) + "☆".repeat(5 - lv);
      const lvTag = document.createElement("i");
      lvTag.textContent = lv >= 5 ? t("gw.maxed") : t("gw.lv", lv);
      head.append(name, stars, lvTag);
      row.appendChild(head);
      const ul = document.createElement("ul");
      ul.className = "gw-conds";
      d.conds.forEach((c, i) => {
        const li = document.createElement("li");
        li.className = met[i] ? "done" : "";
        li.textContent = (met[i] ? "✓ " : "○ ") + pick(c.txt);
        ul.appendChild(li);
      });
      // LV3 奖励位: 进阶内容预告 (对应玩法上线后把这里换成真实入口)
      const reward = document.createElement("p");
      reward.className = "hint gw-reward";
      reward.textContent = t("gw.reward." + d.id) + (lv >= 3 ? " " + t("gw.rewardSoon") : " " + t("gw.rewardLocked", 3));
      ul.appendChild(reward);
      row.appendChild(ul);
      wrap.appendChild(row);
    });
  }

  // ---------- 风格罗盘 ----------

  // 两轴分档: 持仓天数 <3 猎手 / <8 游走 / ≥8 农夫; 单笔规模 <0.35 轻刀 / <0.7 均衡 / ≥0.7 重剑
  const holdBand = (d) => (d < 3 ? 0 : d < 8 ? 1 : 2);
  const sizeBand = (s) => (s < 0.35 ? 0 : s < 0.7 ? 1 : 2);

  let compass = null; // 同会话缓存; 结算后 qs:settled 使之失效

  async function renderCompass() {
    const lock = $("gw-compass-lock");
    const grid = $("gw-compass-grid");
    const stats = $("gw-compass-stats");
    if (!grid) return;
    if (!window.Auth || !Auth.user) {
      lock.hidden = false;
      lock.textContent = t("gw.compassLogin");
      grid.hidden = true;
      stats.hidden = true;
      return;
    }
    try {
      if (!compass) compass = await api("/me/style-compass");
    } catch (e) {
      lock.hidden = false;
      lock.textContent = t("gw.compassLogin");
      grid.hidden = true;
      stats.hidden = true;
      return;
    }
    if (!compass.ready) {
      lock.hidden = false;
      lock.textContent = t("gw.compassLocked", compass.games, 10);
      grid.hidden = true;
      stats.hidden = true;
      return;
    }
    lock.hidden = true;
    grid.hidden = false;
    stats.hidden = false;
    const col = holdBand(compass.avgHoldDays);
    const row = sizeBand(compass.avgTradeSize);
    grid.innerHTML = "";
    // 纵轴自上而下 = 重剑(2)→轻刀(0): 画 3 行 × 3 列, 命中格高亮 + 风格名
    for (let r = 2; r >= 0; r--) {
      for (let c = 0; c < 3; c++) {
        const cell = document.createElement("div");
        const hit = r === row && c === col;
        cell.className = "gw-cell" + (hit ? " hit" : "");
        cell.textContent = t("gw.style." + r + c);
        grid.appendChild(cell);
      }
    }
    $("gw-style-name").textContent = t("gw.styleIs", t("gw.style." + row + col));
    stats.textContent = t("gw.compassStats",
      compass.avgHoldDays, (compass.avgTradeSize * 100).toFixed(0), compass.games, compass.samples);
  }

  function renderAll() {
    renderTree();
    renderCompass();
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "profile") renderAll();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-profile").hidden) renderAll();
  });
  document.addEventListener("qs:progress", () => {
    if (!$("view-profile").hidden) renderTree();
  });
  // 结算改变流水 → 罗盘缓存失效, 下次进档案页重拉
  document.addEventListener("qs:settled", () => { compass = null; });
  if (window.Auth) Auth.onChange(() => { compass = null; renderCompass(); });

  renderAll();
})();
