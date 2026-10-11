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

    (profile.trends || []).forEach((tr) => {
      if (!KEYS.includes(tr.key) || !tr.games) return;
      const row = document.createElement("div");
      row.className = "bp-row";

      const name = document.createElement("strong");
      name.textContent = t("recap.bias." + tr.key); // 复用诊断的偏差名
      row.appendChild(name);

      const rate = document.createElement("span");
      rate.className = "hint";
      rate.textContent = t("bp.rate", tr.triggered, tr.games);
      row.appendChild(rate);

      // 每局一个点: 触发=警示色, 未触发=健康色 (复用预测命中点阵的视觉语言)
      const dots = document.createElement("span");
      dots.className = "bp-dots";
      (tr.triggeredHistory || []).slice(-20).forEach((hit) => {
        const dot = document.createElement("span");
        dot.className = "pred-dot " + (hit ? "miss" : "hit");
        dots.appendChild(dot);
      });
      row.appendChild(dots);

      if (tr.trend && tr.trend !== "NA") {
        const trend = document.createElement("span");
        trend.className = "bp-trend " + tr.trend.toLowerCase();
        trend.textContent = t("bp.trend." + tr.trend.toLowerCase());
        row.appendChild(trend);
      }
      box.appendChild(row);
    });
  }

  document.addEventListener("qs:view", (e) => { if (e.detail === "profile") load(); });
  document.addEventListener("qs:lang", () => { if (!$("view-profile").hidden) load(); });
  if (window.Auth) Auth.onChange(() => { if (!$("view-profile").hidden) load(); });
})();
