// 排行榜视图: 对局榜 + 竞技场榜, 赛季筛选。依赖 $ / api / t / loadLeaderboard / loadArenaBoard。

(() => {
  window.qsSeason = "";
  let seasonsLoaded = false;

  async function loadSeasons() {
    if (seasonsLoaded) return;
    try {
      const seasons = await api("/leaderboard/seasons");
      const sel = $("season-select");
      seasons.forEach((sn) => {
        const opt = document.createElement("option");
        opt.value = sn;
        opt.textContent = sn;
        sel.appendChild(opt);
      });
      seasonsLoaded = true;
    } catch (e) {
      // 赛季接口不可用时隐藏筛选, 只看全时段
      $("season-select").closest(".rank-controls").hidden = true;
    }
  }

  function refreshBoards() {
    loadLeaderboard();
    loadArenaBoard();
    loadPointsBoard();
    loadPodium();
  }

  // 积分榜 TOP20 (服务端权威积分, 刷不了)
  async function loadPointsBoard() {
    try {
      const rows = await api("/leaderboard/points");
      const tbody = $("points-board").querySelector("tbody");
      tbody.innerHTML = "";
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-row"></td></tr>`;
        tbody.querySelector(".empty-row").textContent = t("lb.empty");
        return;
      }
      rows.forEach((r, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i + 1}</td><td></td><td>${Number(r.balance).toLocaleString()}</td>`;
        tr.children[1].textContent = r.username;
        tbody.appendChild(tr);
      });
    } catch (e) { /* 积分榜加载失败不打断页面 */ }
  }

  // 上赛季颁奖台: 上月收益榜前三; 自己上榜时联动学院发徽章
  async function loadPodium() {
    try {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const season = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const rows = await api("/leaderboard?season=" + season);
      const box = $("podium-box");
      if (rows.length === 0) { box.hidden = true; return; }
      box.hidden = false;
      const podium = $("podium");
      podium.innerHTML = "";
      const medals = ["🥇", "🥈", "🥉"];
      rows.slice(0, 3).forEach((r, i) => {
        const div = document.createElement("div");
        div.className = "podium-slot rank" + (i + 1);
        const rate = Number(r.returnRate);
        div.innerHTML = `<span class="medal">${medals[i]}</span><strong></strong>
          <span class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</span>`;
        div.querySelector("strong").textContent = r.username;
        podium.appendChild(div);
        if (window.Auth && Auth.user && Auth.user.username === r.username) {
          document.dispatchEvent(new CustomEvent("qs:seasonPodium", { detail: i + 1 }));
        }
      });
    } catch (e) { /* 颁奖台加载失败不打断页面 */ }
  }

  $("season-select").addEventListener("change", (e) => {
    window.qsSeason = e.target.value;
    refreshBoards();
  });

  // 收益榜 / 夏普榜切换 (夏普榜只收录有风险指标的新对局)
  window.qsRankSort = "";
  $("rank-sort").addEventListener("change", (e) => {
    window.qsRankSort = e.target.value;
    loadLeaderboard();
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "ranking") return;
    loadSeasons();
    refreshBoards();
  });
})();
