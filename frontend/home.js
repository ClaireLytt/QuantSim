// 首页功能总览: 每个玩法一张卡片, 点击直达。依赖 app.js 的 $ / switchView 与 i18n.js 的 t()。

(() => {
  // 功能总览按"玩法属性"分 4 组 (2026-10 游戏化改版): 可玩的突出、工具的下沉。
  // 档位三档: hero = 大卡占两列高亮 (优先推荐玩法), 默认中卡, tool = 小号低饱和 (进阶硬核工具)。
  // emoji 是视觉锚点不是文案, 本地映射不进 i18n (先例: pet.js 的配饰 emoji)。
  const CARD_GROUPS = [
    { id: "quick", cards: [ // ⚡即时速玩: 3-10 分钟碎片化开局
      { view: "games", tier: "hero" }, { view: "guess" }, { view: "newsjudge" },
      { view: "tape" }, { view: "qdetect" },
      { view: "stratbox", tier: "tool" }, { view: "buydip", tier: "tool" },
      { view: "richman", tier: "tool" }, { view: "option", tier: "tool" },
      { view: "reborn", tier: "tool" }, { view: "bubble", tier: "tool" },
    ] },
    { id: "long", cards: [ // ⏳长线对局: 赛季冲榜主玩法
      { view: "game", tier: "hero" }, { view: "daily", tier: "hero" },
      { view: "rooms" }, { view: "event" },
    ] },
    { id: "learn", cards: [ // 📖学习闯关: 边玩边学
      { view: "academy", tier: "hero" }, { view: "famous" }, { view: "story" },
      { view: "quiz", tier: "tool" },
    ] },
    { id: "tools", cards: [ // 🧪进阶量化工具: 对局后复盘用, 视觉弱化
      { view: "lab", tier: "tool" }, { view: "arena", tier: "tool" },
      { view: "duel", tier: "tool" }, { view: "wiki", tier: "tool" },
    ] },
  ];
  const GROUP_EMOJI = { quick: "⚡", long: "⏳", learn: "📖", tools: "🧪" };
  const CARD_EMOJI = {
    games: "🎮", guess: "📈", newsjudge: "📰", tape: "⚡", qdetect: "🔍",
    stratbox: "🎁", buydip: "🪂", richman: "🎲", option: "🧮", reborn: "🔄", bubble: "🫧",
    game: "⚔️", daily: "🗓️", rooms: "👥", event: "⏪",
    academy: "🏯", famous: "🎬", story: "🎭", quiz: "🧠",
    lab: "🔬", arena: "🏟️", duel: "🥊", wiki: "📚",
  };

  function renderHome() {
    const wrap = $("home-cards");
    wrap.innerHTML = "";
    CARD_GROUPS.forEach((g) => {
      const label = document.createElement("p");
      label.className = "home-group-label";
      label.textContent = GROUP_EMOJI[g.id] + " " + t("home.group." + g.id);
      const sub = document.createElement("span");
      sub.className = "home-group-sub";
      sub.textContent = t("home.groupSub." + g.id);
      label.appendChild(sub);
      wrap.appendChild(label);
      const grid = document.createElement("div");
      grid.className = "home-group-grid";
      g.cards.forEach(({ view, tier }) => {
        const btn = document.createElement("button");
        btn.className = "home-card" + (tier === "hero" ? " featured" : tier === "tool" ? " tool" : "");
        const title = document.createElement("strong");
        title.textContent = CARD_EMOJI[view] + " " + t(`home.card.${view}.t`);
        const desc = document.createElement("span");
        desc.className = "hint";
        desc.textContent = t(`home.card.${view}.d`);
        btn.append(title, desc);
        btn.addEventListener("click", () => switchView(view));
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
    });
  }

  // ---------- 首屏横幅 / 核心功能 / 新手推荐 / 榜单预览 ----------

  $("btn-home-game").addEventListener("click", () => switchView("game"));
  $("btn-home-lab").addEventListener("click", () => switchView("lab"));
  document.querySelectorAll(".home-core").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.goto); // 含小游戏专区聚合页 (view-games)
    });
  });

  // 本周推荐实验: 课题数由 lab.js 挂到 window (脚本顺序 lab 在前), 轮换口径统一走 qsWeekIndex
  function renderReco() {
    const i = qsWeekIndex() % (window.QS_LAB_WEEKLY_COUNT || 5);
    $("home-reco-weekly-t").textContent = t("lab.wk." + i + ".t");
    $("home-reco-weekly-d").textContent = t("lab.wk." + i + ".d");
  }
  $("home-reco-weekly").addEventListener("click", () => switchView("lab"));
  $("home-reco-game").addEventListener("click", () => switchView("newsjudge"));
  $("home-reco-learn").addEventListener("click", () => switchView("academy"));

  // 排行榜预览: 资金榜 top3 + 策略综合分 top3 (与擂台同口径: 收益50/夏普30/回撤20)
  const pctHome = (v) => ((Number(v) >= 0 ? "+" : "") + (Number(v) * 100).toFixed(1) + "%");

  function fillRankList(ulId, rows) {
    const ul = $(ulId);
    ul.innerHTML = "";
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      const rank = document.createElement("i");
      rank.textContent = "#" + (i + 1);
      const name = document.createElement("span");
      name.textContent = r.name; // 用户可控文本, textContent
      const val = document.createElement("b");
      val.textContent = r.val;
      if (r.cls) val.className = r.cls;
      li.append(rank, name, val);
      ul.appendChild(li);
    });
    if (!rows.length) {
      // 空态: 奖杯线描插画 + 引导语, 不留一行孤字 (静态内联 SVG, 无用户数据)
      const li = document.createElement("li");
      li.className = "home-rank-empty";
      li.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/>'
        + '<path d="M12 13v3M9 20h6M10 16h4v4h-4z"/></svg>';
      const txt = document.createElement("span");
      txt.textContent = t("home.rank.empty");
      li.appendChild(txt);
      ul.appendChild(li);
    }
  }

  async function renderRankPreview() {
    let moneyRows = [];
    let stratRows = [];
    try {
      const money = await api("/leaderboard");
      moneyRows = money.slice(0, 3).map((e) => ({
        name: e.username, val: pctHome(e.returnRate), cls: Number(e.returnRate) >= 0 ? "pos" : "neg",
      }));
      fillRankList("home-rank-money", moneyRows);
    } catch (e) { fillRankList("home-rank-money", []); }
    try {
      const raw = await api("/backtest/leaderboard");
      const scored = qsCompositeScores(raw).sort((a, b) => b.score - a.score); // 与擂台同口径 (app.js 共享实现)
      stratRows = scored.slice(0, 3).map((e) => ({
        name: e.username + " · " + t("strat." + e.strategy), val: String(e.score),
      }));
      fillRankList("home-rank-strategy", stratRows);
    } catch (e) { fillRankList("home-rank-strategy", []); }
    // 双榜全空 (后端未起/零数据) 时整区折叠, 不在首页中段暴尸 (评审 #3)
    $("home-rank-section").hidden = !moneyRows.length && !stratRows.length;
  }
  $("btn-home-rank-money").addEventListener("click", () => switchView("ranking"));
  $("btn-home-rank-strategy").addEventListener("click", () => switchView("duel"));

  // ---------- 市场情绪温度计: 全标的涨跌广度 + 近30日动量聚合成恐慌/贪婪读数 ----------

  let sentiChart = null;
  let sentiScore = null;

  async function renderSentiment() {
    try {
      const rows = await api("/lab/overview");
      if (!rows.length) return;
      const upRatio = rows.filter((r) => (r.lastChange || 0) > 0).length / rows.length;
      const avgRet30 = rows.reduce((a, r) => a + (r.ret30 || 0), 0) / rows.length;
      // 50 为中性; 上涨家数占比与近30日动量各占一半权重, 夹在 5~95
      sentiScore = Math.max(5, Math.min(95,
        Math.round(50 + (upRatio - 0.5) * 60 + avgRet30 * 120)));
      drawSentiment();
    } catch (e) { /* 无数据时温度计保持「计算中」 */ }
  }

  // 无数据时的占位仪表 (静态线描): 不给首页留空黑块
  function renderSentiPlaceholder() {
    $("senti-gauge").innerHTML = '<svg viewBox="0 0 200 110" fill="none" aria-hidden="true" style="width:100%;height:100%">'
      + '<path d="M20 100 A 80 80 0 0 1 180 100" style="stroke:var(--border)" stroke-width="10" stroke-linecap="round" stroke-dasharray="4 7"/>'
      + '<path d="M20 100 A 80 80 0 0 1 100 20" style="stroke:var(--text-muted);opacity:.5" stroke-width="10" stroke-linecap="round" stroke-dasharray="4 7"/>'
      + '<circle cx="100" cy="100" r="5" style="fill:var(--text-muted)"/>'
      + '<line x1="100" y1="100" x2="58" y2="52" style="stroke:var(--text-muted)" stroke-width="3" stroke-linecap="round"/>'
      + "</svg>";
  }

  function drawSentiment() {
    if (sentiScore == null) return;
    if (!sentiChart) {
      $("senti-gauge").innerHTML = ""; // 清掉占位仪表再交给 ECharts
      sentiChart = echarts.init($("senti-gauge"));
      window.addEventListener("resize", () => sentiChart.resize());
    }
    const zone = sentiScore < 25 ? "panic" : sentiScore < 45 ? "fear"
      : sentiScore <= 55 ? "neutral" : sentiScore <= 75 ? "optimism" : "greed";
    $("senti-text").textContent = t("senti.now", sentiScore, t("senti.zone." + zone));
    sentiChart.setOption({
      series: [{
        type: "gauge",
        min: 0, max: 100,
        startAngle: 200, endAngle: -20,
        progress: { show: false },
        axisLine: { lineStyle: { width: 16, color: [
          [0.25, cssVar("--down")],
          [0.55, cssVar("--text-muted")],
          [1, cssVar("--up")],
        ] } },
        axisTick: { show: false },
        splitLine: { length: 6, lineStyle: { color: cssVar("--border-strong") } },
        axisLabel: { show: false },
        pointer: { itemStyle: { color: cssVar("--accent") } },
        detail: { fontSize: 20, fontWeight: 700, color: cssVar("--text"), offsetCenter: [0, "62%"] },
        data: [{ value: sentiScore }],
      }],
    }, true);
    sentiChart.resize();
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "home") return;
    if (sentiScore == null) renderSentiment();
    else drawSentiment(); // 隐藏容器里尺寸为 0, 回到首页重算
    renderRankPreview();
  });
  document.addEventListener("qs:theme", drawSentiment);
  document.addEventListener("qs:lang", () => { renderHome(); renderReco(); drawSentiment(); });
  renderHome();
  renderReco();
  renderSentiPlaceholder();
  renderSentiment();
  renderRankPreview();
})();
