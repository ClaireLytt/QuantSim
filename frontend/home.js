// 首页功能总览: 每个玩法一张卡片, 点击直达。依赖 app.js 的 $ / switchView 与 i18n.js 的 t()。

(() => {
  // 功能总览按"玩法属性"分 4 组 (2026-10 游戏化改版): 可玩的突出、工具的下沉。
  // 档位三档: hero = 大卡占两列高亮 (优先推荐玩法), 默认中卡, tool = 小号低饱和 (进阶硬核工具)。
  // emoji 是视觉锚点不是文案, 本地映射不进 i18n (先例: pet.js 的配饰 emoji)。
  // 每张卡的数据 (view/tier/emoji) 收在一个对象里, 不另开平行映射表 —— 删卡时不会漏删
  // 功能卡图标: 单色描边 SVG path (ticket 19, emoji 功能图标违反设计禁令)。
  // 与 home-core 的 lab-ico 同语系: 24x24 / currentColor / 1.8 描边; 内容是本地静态串, 无注入面。
  const CARD_ICONS = {
    games: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    guess: '<path d="M3 17l6-6 4 4 7-8M14 7h6v6"/>',
    newsjudge: '<path d="M4 5h13v14H5a1 1 0 0 1-1-1zM17 8h3v10a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 17h4"/>',
    tape: '<path d="M13 2L5 13h5l-2 9 8-11h-5z"/>',
    qdetect: '<path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20"/>',
    stratbox: '<path d="M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    buydip: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    richman: '<path d="M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
    option: '<path d="M5 8h14M5 16h14M9 5v6M15 13v6"/>',
    reborn: '<path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6"/>',
    bubble: '<path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM17 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>',
    game: '<path d="M7 4v16M5 8h4v8H5zM17 2v20M15 6h4v9h-4z"/>',
    daily: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    rooms: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 10a3 3 0 1 0 0-6M17 15c3 0 5 2 5 5"/>',
    event: '<path d="M11 19V5l-8 7zM21 19V5l-8 7z"/>',
    academy: '<path d="M4 6h16M6 4v3M18 4v3M7 7v13M17 7v13M7 12h10"/>',
    famous: '<path d="M3 8h18v12H3zM3 8l2-4h4L7 8M11 4h4l-2 4M17 4h4l-2 4"/>',
    story: '<path d="M12 3c5 0 8 2 8 2v6c0 6-4 10-8 10S4 17 4 11V5s3-2 8-2zM8.5 10h.01M15.5 10h.01M8 15c1.5 1.5 6.5 1.5 8 0"/>',
    quiz: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3a6 6 0 0 1 4-10z"/>',
    lab: '<path d="M10 3h4M11 3v6l-5 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>',
    arena: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h.01"/>',
    duel: '<path d="M5 5l5.5 5.5M19 5l-5.5 5.5M5 5h4M5 5v4M19 5h-4M19 5v4M8 16l-3 3M16 16l3 3M12 12l4 4M12 12l-4 4"/>',
    wiki: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM18 16H7a2 2 0 0 0-2 2M9 8h6"/>',
  };
  const CARD_GROUPS = [
    { id: "quick", cards: [ // 即时速玩: 3-10 分钟碎片化开局
      { view: "games", tier: "hero" }, { view: "guess" },
      { view: "newsjudge" }, { view: "tape" }, { view: "qdetect" },
      { view: "stratbox", tier: "tool" }, { view: "buydip", tier: "tool" },
      { view: "richman", tier: "tool" }, { view: "option", tier: "tool" },
      { view: "reborn", tier: "tool" }, { view: "bubble", tier: "tool" },
    ] },
    { id: "long", cards: [ // 长线对局: 赛季冲榜主玩法
      { view: "game", tier: "hero" }, { view: "daily", tier: "hero" },
      { view: "rooms" }, { view: "event" },
    ] },
    { id: "learn", cards: [ // 学习闯关: 边玩边学
      { view: "academy", tier: "hero" }, { view: "famous" },
      { view: "story" }, { view: "quiz", tier: "tool" },
    ] },
    { id: "tools", cards: [ // 进阶量化工具: 对局后复盘用, 视觉弱化
      { view: "lab", tier: "tool" }, { view: "arena", tier: "tool" },
      { view: "duel", tier: "tool" }, { view: "wiki", tier: "tool" },
    ] },
  ];

  function renderHome() {
    const wrap = $("home-cards");
    wrap.innerHTML = "";
    CARD_GROUPS.forEach((g) => {
      const label = document.createElement("p");
      label.className = "home-group-label";
      label.textContent = t("home.group." + g.id); // 组名前的主色短条已是锚点, emoji 退场 (ticket 19)
      const sub = document.createElement("span");
      sub.className = "home-group-sub";
      sub.textContent = t("home.groupSub." + g.id);
      label.appendChild(sub);
      wrap.appendChild(label);
      const grid = document.createElement("div");
      // 组级 class: 即时速玩 12 卡压成两列行式条目 (ticket 18, critic "卡片海"), 其余组维持网格
      grid.className = "home-group-grid home-group-" + g.id;
      g.cards.forEach(({ view, tier }) => {
        const btn = document.createElement("button");
        btn.className = "home-card" + (tier === "hero" ? " featured" : tier === "tool" ? " tool" : "");
        const title = document.createElement("strong");
        const ico = document.createElement("span");
        ico.className = "hc-ico";
        // innerHTML 只插本地静态 path 串 (CARD_ICONS), 用户数据仍走 textContent
        ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (CARD_ICONS[view] || "") + "</svg>";
        title.append(ico, document.createTextNode(t(`home.card.${view}.t`)));
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
  $("btn-home-career").addEventListener("click", () => switchView("career"));
  $("home-life-career").addEventListener("click", () => switchView("career"));

  // 生涯身份外显 (成长系统): career.js 在本文件之后加载, 用 qs:progress 事件兜初始渲染
  function renderCareerLine() {
    const el = $("home-life-career");
    if (!window.qsCareerStatus) { el.hidden = true; return; }
    const st = qsCareerStatus();
    el.hidden = false;
    el.textContent = st.done ? t("home.life.careerDone", st.title)
      : t("home.life.career", st.title, st.goal);
  }
  document.addEventListener("qs:progress", renderCareerLine);
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
  const pctHome = qsSignedPct; // 共享实现在 app.js

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

  const sentiH = qsChart("senti-gauge", () => buildSentiOption());
  function drawSentiment() {
    if (sentiScore == null) return;
    if (!sentiH.instance()) $("senti-gauge").innerHTML = ""; // 清掉占位仪表再交给 ECharts
    const zone = sentiScore < 25 ? "panic" : sentiScore < 45 ? "fear"
      : sentiScore <= 55 ? "neutral" : sentiScore <= 75 ? "optimism" : "greed";
    $("senti-text").textContent = t("senti.now", sentiScore, t("senti.zone." + zone));
    sentiH.refresh();
  }

  function buildSentiOption() {
    if (sentiScore == null) return null;
    return ({
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
    });
  }

  // ---------- 我的交易人生仪表盘 (2026-10-25 改版) ----------
  // 三状态: 游客/无战绩 = 现状导航页; 有已结算对局 = 仪表盘态 (hero/core 收起, 总览折叠);
  // 连续签到 ≥3 天 = streak 荣誉位点亮。口径 (10 万归一化几何连乘) 在后端 MeSummaryService。

  let lifeSummary = null; // 最近一次 /me/summary 结果 (曲线重绘用)

  const lifeCurveH = qsChart("home-life-curve", () => buildLifeCurveOption());

  function buildLifeCurveOption() {
    const s = lifeSummary;
    if (!s || s.curve.length < 1) return null;
    // x 轴用交易日序号而非日期: 各局玩的是不同历史窗口, 直排日期会非单调且重复;
    // 局内真实日期保留在第三列, 只进 tooltip
    const points = [[t("home.life.start"), 100000, ""]]
      .concat(s.curve.map((p, i) => [t("home.life.dayN", i + 1), Number(p.value), p.date]));
    // 最大回撤区间: 净值序列里"峰 → 之后最深谷"那一段, 茶红底标注
    let peakI = 0; let troughI = 0; let worst = 0; let curPeak = 0;
    points.forEach((p, i) => {
      if (p[1] > points[curPeak][1]) curPeak = i;
      const dd = (points[curPeak][1] - p[1]) / points[curPeak][1];
      if (dd > worst) { worst = dd; peakI = curPeak; troughI = i; }
    });
    return {
      grid: { left: 70, right: 16, top: 20, bottom: 28 },
      tooltip: { trigger: "axis", backgroundColor: cssVar("--panel-raised"),
        borderColor: cssVar("--border"), textStyle: { color: cssVar("--text") },
        // 序号轴补回局内真实日期 (值与日期都是本地数值/后端日期串, 无用户输入)
        formatter: (ps) => {
          const i = ps[0].dataIndex;
          const date = points[i][2];
          return ps[0].name + (date ? " · " + date : "") + "<br/>"
            + Number(points[i][1]).toLocaleString();
        } },
      xAxis: { type: "category", data: points.map((p) => p[0]),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted") } },
      yAxis: { type: "value", scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted") } },
      series: [{
        type: "line", data: points.map((p) => p[1]),
        symbol: "circle", symbolSize: 5,
        lineStyle: { color: cssVar("--accent"), width: 2.5 },
        itemStyle: { color: cssVar("--accent") },
        areaStyle: { opacity: 0.12, color: cssVar("--accent") },
        markArea: worst > 0 ? { silent: true,
          itemStyle: { color: cssVar("--bad"), opacity: 0.12 },
          data: [[{ xAxis: points[peakI][0] }, { xAxis: points[troughI][0] }]] } : undefined,
      }],
    };
  }

  function setDashboardMode(on) {
    $("home-hero").hidden = on;
    $("home-core-section").hidden = on;
    setOverviewCollapsed(on);
  }

  function renderLifeNumbers(s) {
    $("home-life-assets").textContent = Number(s.virtualAssets)
      .toLocaleString(undefined, { maximumFractionDigits: 0 });
    const ret = $("home-life-ret");
    ret.textContent = fmtPct(Number(s.cumulativeReturn));
    ret.className = Number(s.cumulativeReturn) >= 0 ? "pos" : "neg";
    $("home-life-winrate").textContent = (Number(s.winRate) * 100).toFixed(0) + "%";
    const dd = $("home-life-dd");
    dd.textContent = (Number(s.maxDrawdown) * 100).toFixed(1) + "%";
    dd.className = Number(s.maxDrawdown) > 0 ? "neg" : "";
    const tw = $("home-life-tradewr");
    tw.hidden = !(s.closedTrades > 0); // 无平仓流水不显示, 不造 0% 假数据
    if (s.closedTrades > 0) {
      tw.textContent = t("home.life.tradeWr",
        (Number(s.tradeWinRate) * 100).toFixed(0) + "%", s.closedTrades);
    }
    const streakEl = $("home-life-streak");
    streakEl.hidden = s.signInStreak < 1;
    streakEl.textContent = t("home.life.streakN", s.signInStreak);
    streakEl.classList.toggle("lit", s.signInStreak >= 3); // 连续 3 天点亮荣誉位
  }

  // 最近对局 3 条: 展示态列表 (进行中标注), 续局走 CTA, 全部记录走「我的」
  function renderRecent(games) {
    const card = $("home-recent-card");
    card.hidden = !games.length;
    const ul = $("home-recent-list");
    ul.innerHTML = "";
    games.slice(0, 3).forEach((g) => {
      const li = document.createElement("li");
      const mode = document.createElement("i");
      mode.textContent = t("me.mode." + g.mode); // 动态键前缀已在 ui_check 白名单
      const name = document.createElement("span");
      name.textContent = g.stockName; // 后端已按进行中/事件局脱敏
      const val = document.createElement("b");
      if (g.status === "IN_PROGRESS") {
        val.textContent = t("home.recent.playing");
      } else {
        val.textContent = qsSignedPct(g.returnRate);
        val.className = Number(g.returnRate) >= 0 ? "pos" : "neg";
      }
      li.append(mode, name, val);
      ul.appendChild(li);
    });
  }

  // 偏差摘要: 触发率最高的一条上首页, 全未触发/无档案则整块隐藏
  async function renderBias() {
    const box = $("home-bias-box");
    box.hidden = true;
    let profile;
    try { profile = await api("/me/bias-profile"); } catch (e) { return; }
    const top = (profile && profile.trends || [])
      .filter((tr) => tr.triggered > 0)
      .sort((a, b) => b.triggered / b.games - a.triggered / a.games)[0];
    if (!top) return;
    $("home-bias-top").textContent = t("recap.bias." + top.key);
    $("home-bias-stat").textContent = t("home.bias.stat", top.triggered, top.games);
    box.hidden = false;
  }

  async function renderLife() {
    if (!window.Auth || !Auth.user) { setDashboardMode(false); $("home-life").hidden = true; $("home-life-curve-section").hidden = true; $("home-recent-card").hidden = true; return; }
    let s = null; let games = [];
    try { s = await api("/me/summary"); } catch (e) { /* 拉不到保持导航态 */ }
    try { games = await api("/me/games"); } catch (e) { /* 同上 */ }
    const active = !!(s && s.settledCount > 0);
    lifeSummary = s;
    $("home-life").hidden = !active;
    $("home-life-curve-section").hidden = !active;
    setDashboardMode(active);
    if (!active) { $("home-recent-card").hidden = true; return; }
    renderLifeNumbers(s);
    renderRecent(games);
    renderBias();
    renderCareerLine();
    // CTA: 有进行中对局 → 继续; 否则开新局
    $("btn-home-life-cta").textContent =
      games.some((g) => g.status === "IN_PROGRESS") ? t("home.life.resume") : t("home.hero.play");
    // 曲线: 含起点 ≥3 点才有阅读价值, 不足时显示解锁引导
    const unlocked = s.settledCount >= 2;
    $("home-life-curve").hidden = !unlocked;
    const lock = $("home-life-curve-lock");
    lock.hidden = unlocked;
    if (!unlocked) lock.textContent = t("home.life.curveLock", 2 - s.settledCount);
    else lifeCurveH.refresh();
  }

  $("btn-home-life-cta").addEventListener("click", () => switchView("game"));
  $("btn-home-recent-all").addEventListener("click", () => switchView("mine"));
  $("btn-home-bias-all").addEventListener("click", () => switchView("profile"));
  // 登录/登出即时切换首页形态 (auth.js 在 home.js 之前加载, 文件头声明的加载序)
  if (window.Auth) Auth.onChange(() => renderLife());

  // 功能总览折叠: 仪表盘态默认收起, 新用户/游客展开
  let overviewCollapsed = false;
  function setOverviewCollapsed(c) {
    overviewCollapsed = c;
    $("home-cards").hidden = c;
    $("btn-home-all-toggle").textContent = t(c ? "home.all.show" : "home.all.hide");
  }
  $("btn-home-all-toggle").addEventListener("click", () => setOverviewCollapsed(!overviewCollapsed));

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "home") return;
    if (sentiScore == null) renderSentiment();
    else drawSentiment(); // 隐藏容器里尺寸为 0, 回到首页重算
    renderRankPreview();
    renderLife();
  });
  // 仪表主题重绘由 qsChart 兜底; 语言切换要同步 senti-text 文案, 仍整体重画
  document.addEventListener("qs:lang", () => {
    renderHome(); renderReco(); drawSentiment();
    setOverviewCollapsed(overviewCollapsed);
    if (lifeSummary && lifeSummary.settledCount > 0) { renderLifeNumbers(lifeSummary); lifeCurveH.refresh(); }
  });
  renderHome();
  renderReco();
  renderSentiPlaceholder();
  renderSentiment();
  renderRankPreview();
  setOverviewCollapsed(false);
  renderLife();
})();
