// 每日挑战: 全服同题同起点, 每人每天一局。依赖 $ / api / t / toast / switchView / Auth / qsEnterGame / stockName / fmtPct。

(() => {
  let today = null;

  function renderInfo() {
    const info = $("daily-info");
    const btn = $("btn-daily-start");
    if (!window.Auth || !Auth.user) {
      info.textContent = t("auth.needLogin");
      btn.disabled = false;
      return;
    }
    if (!today) {
      info.textContent = t("daily.loading");
      return;
    }
    info.textContent = t("daily.info", stockName(today.stockName, today.stockCode));
    if (today.played) {
      btn.disabled = true;
      $("daily-msg").hidden = false;
      $("daily-msg").textContent = t("daily.played");
    } else {
      btn.disabled = false;
      $("daily-msg").hidden = true;
    }
  }

  async function load() {
    try {
      today = await api("/daily/today");
      renderInfo();
    } catch (e) {
      if (!String(e.message).includes("登录")) toast(e.message);
      renderInfo();
    }
    loadBoard();
  }

  async function loadBoard() {
    try {
      const rows = await api("/daily/leaderboard");
      const tbody = $("daily-board").querySelector("tbody");
      tbody.innerHTML = "";
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row"></td></tr>`;
        tbody.querySelector(".empty-row").textContent = t("daily.empty");
        return;
      }
      rows.forEach((r, i) => {
        const tr = document.createElement("tr");
        const rate = Number(r.returnRate);
        tr.innerHTML = `<td>${i + 1}</td><td></td><td></td>
          <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>`;
        tr.children[1].textContent = r.username;
        tr.children[2].textContent = stockName(r.stockName, r.stockCode);
        tbody.appendChild(tr);
      });
    } catch (e) { /* 未登录/网络异常时榜单留空 */ }
  }

  async function start() {
    if (!window.Auth) return;
    Auth.require(async () => {
      try {
        const res = await api("/daily/start", { method: "POST" });
        await window.qsEnterGame(res);
        switchView("game");
        toast(t("toast.gameStart", fmtMoney(res.initialCash), t("unit.money")));
        today = { ...today, played: true };
      } catch (e) {
        toast(e.message);
        load();
      }
    });
  }

  $("btn-daily-start").addEventListener("click", () => guarded(start));
  document.addEventListener("qs:view", (e) => {
    if (e.detail === "daily") load();
  });
  document.addEventListener("qs:lang", renderInfo);
  if (window.Auth) Auth.onChange(() => { today = null; renderInfo(); });
})();
