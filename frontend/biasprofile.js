// 行为偏差档案: 成长档案页的跨对局诊断趋势卡。
// 数据来自 /api/me/bias-profile (结算时落库的诊断 JSON 聚合)。
// 依赖 $ / api / t / Auth。

(() => {
  const KEYS = ["disposition", "revenge", "chase", "panic", "overtrade"];

  async function load() {
    const box = $("bias-profile-box");
    if (!window.Auth || !Auth.user) {
      box.innerHTML = "";
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("bp.needLogin");
      box.appendChild(p);
      return;
    }
    try {
      render(await api("/me/bias-profile"));
    } catch (e) {
      /* 401/网络异常静默, 档案页其余部分照常 */
    }
  }

  function render(profile) {
    const box = $("bias-profile-box");
    box.innerHTML = "";
    if (!profile || !profile.totalGames) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("bp.empty");
      box.appendChild(p);
      return;
    }
    const head = document.createElement("p");
    head.className = "hint";
    head.textContent = t("bp.games", profile.totalGames);
    box.appendChild(head);

    // 每项偏差一张风险小卡 (名称 + 红黄绿星级 + 趋势 + 点阵), RPG 属性面板语言
    const grid = document.createElement("div");
    grid.className = "bp-cards";
    (profile.trends || []).forEach((tr) => {
      if (!KEYS.includes(tr.key) || !tr.games) return;
      const card = document.createElement("div");
      card.className = "bp-card";

      const name = document.createElement("strong");
      name.textContent = t("recap.bias." + tr.key); // 复用诊断的偏差名
      card.appendChild(name);

      // 风险星级: 触发率 <20% 绿★ / 20-50% 黄★★ / ≥50% 红★★★, 一眼读出轻重
      const ratio = tr.triggered / tr.games;
      const level = ratio < 0.2 ? "low" : ratio < 0.5 ? "mid" : "high";
      const stars = document.createElement("span");
      stars.className = "bp-stars bp-" + level;
      stars.textContent = (level === "low" ? "★" : level === "mid" ? "★★" : "★★★") + " " + t("bp.star." + level);
      card.appendChild(stars);

      const rate = document.createElement("span");
      rate.className = "hint";
      rate.textContent = t("bp.rate", tr.triggered, tr.games);
      card.appendChild(rate);

      // 每局一个点: 触发=警示色, 未触发=健康色 (复用预测命中点阵的视觉语言)
      const dots = document.createElement("span");
      dots.className = "bp-dots";
      (tr.triggeredHistory || []).slice(-20).forEach((hit) => {
        const dot = document.createElement("span");
        dot.className = "pred-dot " + (hit ? "miss" : "hit");
        dots.appendChild(dot);
      });
      card.appendChild(dots);

      if (tr.trend && tr.trend !== "NA") {
        const trend = document.createElement("span");
        trend.className = "bp-trend " + tr.trend.toLowerCase();
        trend.textContent = t("bp.trend." + tr.trend.toLowerCase());
        card.appendChild(trend);
      }
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  document.addEventListener("qs:view", (e) => { if (e.detail === "profile") load(); });
  document.addEventListener("qs:lang", () => { if (!$("view-profile").hidden) load(); });
  if (window.Auth) Auth.onChange(() => { if (!$("view-profile").hidden) load(); });
})();
