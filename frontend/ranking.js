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
  }

  $("season-select").addEventListener("change", (e) => {
    window.qsSeason = e.target.value;
    refreshBoards();
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "ranking") return;
    loadSeasons();
    refreshBoards();
  });
})();
