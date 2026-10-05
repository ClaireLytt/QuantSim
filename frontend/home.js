// 首页功能总览: 每个玩法一张卡片, 点击直达。依赖 app.js 的 $ / switchView 与 i18n.js 的 t()。

(() => {
  // view -> 图标; 标题/描述取 i18n 键 home.card.<view>.t / .d
  const CARDS = [
    { view: "game", icon: "📈" },
    { view: "daily", icon: "🗓️" },
    { view: "rooms", icon: "🤝" },
    { view: "arena", icon: "⚔️" },
    { view: "ranking", icon: "🏆" },
    { view: "academy", icon: "🎓" },
    { view: "guess", icon: "🎯" },
    { view: "famous", icon: "🌋" },
    { view: "story", icon: "🕵️" },
    { view: "quiz", icon: "🧬" },
    { view: "option", icon: "🎟️" },
    { view: "reborn", icon: "👑" },
    { view: "bubble", icon: "🫧" },
    { view: "lab", icon: "🔬" },
    { view: "profile", icon: "📜" },
    { view: "history", icon: "🗂️" },
    { view: "account", icon: "👤" },
  ];

  function renderHome() {
    const wrap = $("home-cards");
    wrap.innerHTML = "";
    CARDS.forEach((c) => {
      const div = document.createElement("button");
      div.className = "home-card";
      div.innerHTML = `<span class="home-icon"></span><strong></strong><span class="hint"></span>`;
      div.querySelector(".home-icon").textContent = c.icon;
      div.querySelector("strong").textContent = t(`home.card.${c.view}.t`);
      div.querySelector(".hint").textContent = t(`home.card.${c.view}.d`);
      div.addEventListener("click", () => switchView(c.view));
      wrap.appendChild(div);
    });
  }

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

  function drawSentiment() {
    if (sentiScore == null) return;
    if (!sentiChart) {
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
  });
  document.addEventListener("qs:theme", drawSentiment);
  document.addEventListener("qs:lang", () => { renderHome(); drawSentiment(); });
  renderHome();
  renderSentiment();
})();
