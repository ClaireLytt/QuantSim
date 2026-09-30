// 「我的 · 战绩历史」: 登录后展示个人对局与回测记录。依赖 $ / api / t / fmtPct / stockName / Auth。

(() => {
  let games = null;
  let backtests = null;

  function modeLabel(mode, aiModel) {
    const key = "me.mode." + (mode || "CLASSIC");
    const label = t(key);
    return label === key ? (mode || "CLASSIC") : label;
  }

  function render() {
    const gBody = $("hist-games").querySelector("tbody");
    const bBody = $("hist-bt").querySelector("tbody");
    gBody.innerHTML = "";
    bBody.innerHTML = "";
    const empty = (!games || games.length === 0) && (!backtests || backtests.length === 0);
    $("hist-empty").hidden = !empty;
    (games || []).forEach((g) => {
      const tr = document.createElement("tr");
      const rate = g.returnRate == null ? null : Number(g.returnRate);
      tr.innerHTML = `
        <td></td>
        <td></td>
        <td>${g.startDate || "--"}</td>
        <td></td>
        <td class="${rate == null ? "" : rate >= 0 ? "pos" : "neg"}">${rate == null ? "--" : fmtPct(rate)}</td>
        <td>${(g.createdAt || "").slice(0, 10)}</td>`;
      tr.children[0].textContent = stockName(g.stockName, g.stockCode);
      tr.children[1].textContent = modeLabel(g.mode, g.aiModel);
      tr.children[3].textContent = t(g.status === "SETTLED" ? "me.settled" : "me.inProgress");
      gBody.appendChild(tr);
    });
    (backtests || []).forEach((b) => {
      const tr = document.createElement("tr");
      const rate = Number(b.totalReturn);
      tr.innerHTML = `
        <td></td>
        <td>${t("strat." + b.strategy)}</td>
        <td class="param-cell"></td>
        <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>
        <td>${b.sharpeRatio == null ? "--" : Number(b.sharpeRatio).toFixed(2)}</td>
        <td>${(b.createdAt || "").slice(0, 10)}</td>`;
      tr.children[0].textContent = stockName(b.stockName, b.stockCode);
      tr.children[2].textContent = b.params || "--";
      bBody.appendChild(tr);
    });
  }

  async function load() {
    if (!window.Auth || !Auth.user) return;
    try {
      [games, backtests] = await Promise.all([api("/me/games"), api("/me/backtests")]);
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "history") return;
    if (window.Auth && Auth.require(load)) { /* 已登录时 load 已被调用 */ }
  });
  document.addEventListener("qs:lang", () => { if (games || backtests) render(); });
  if (window.Auth) Auth.onChange((u) => { if (!u) { games = null; backtests = null; render(); } });
})();
