// 小游戏专区: 六个量化小游戏的聚合入口, 左下研究积分面板, 底部回研究所。
// 依赖 app.js 的 $ / switchView, auth.js 的 Auth, i18n 的 t。
(() => {
  document.querySelectorAll(".gz-card").forEach(bindGoto);
  document.querySelectorAll(".gz-link").forEach(bindGoto);
  function bindGoto(card) {
    card.addEventListener("click", () => {
      const view = card.dataset.goto;
      switchView(view);
      // 幸存者陷阱: 进量化侦探后直达第三案
      if (card.dataset.case && window.qsOpenCase) qsOpenCase(card.dataset.case);
    });
  }

  // 研究积分面板: 登录读服务端余额, 游客提示登录解锁
  async function renderPoints() {
    const balEl = $("gz-points");
    if (!window.Auth || !Auth.user) {
      balEl.textContent = "--";
      $("gz-points-hint").textContent = t("gz.loginHint");
      return;
    }
    try {
      const s = await api("/me/points");
      balEl.textContent = Number(s.balance).toLocaleString();
      $("gz-points-hint").textContent = t("gz.redeemHint");
    } catch (e) {
      balEl.textContent = "--";
    }
  }

  $("btn-gz-redeem").addEventListener("click", () => $("btn-points-head").click());
  $("btn-gz-lab").addEventListener("click", () => switchView("lab"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "games") renderPoints();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-games").hidden) renderPoints();
  });
})();
