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
    // 今日规则卡 (D1~D8 轮换): 开打前先亮规则, 玩家带着约束进场
    const ruleEl = $("daily-rule");
    const ruleDesc = $("daily-rule-desc");
    ruleEl.hidden = !today.dailyRule;
    ruleDesc.hidden = !today.dailyRule;
    if (today.dailyRule) {
      ruleEl.textContent = t("dc.badge", t("dc." + today.dailyRule + ".t"));
      ruleDesc.textContent = t("dc." + today.dailyRule + ".d");
    }
    // 连续挑战 streak: 留存钩子, 有连续记录就展示在标的信息后
    let text = t("daily.info", stockName(today.stockName, today.stockCode));
    if (today.streak > 0) {
      text += "　" + t("daily.streak", today.streak);
      // 成就联动: academy 监听该事件发放「连续挑战」徽章
      document.dispatchEvent(new CustomEvent("qs:dailyStreak", { detail: today.streak }));
    }
    info.textContent = text;
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
      if (e.status !== 401) toast(e.message); // 未登录是预期态, 其余才值得提示
      renderInfo();
    }
    loadBoard();
  }

  async function loadBoard() {
    try {
      const rows = await api("/daily/leaderboard");
      qsRenderRows($("daily-board").querySelector("tbody"), rows, 4, "daily.empty", (r, i) => {
        const tr = document.createElement("tr");
        const rate = Number(r.returnRate);
        tr.innerHTML = `<td>${i + 1}</td><td></td><td></td>
          <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>`;
        tr.children[1].textContent = r.username;
        tr.children[2].textContent = stockName(r.stockName, r.stockCode);
        return tr;
      });
      renderDist(rows);
    } catch (e) { /* 未登录/网络异常时榜单留空 */ }
  }

  // 今日收益分布直方图 + 你的百分位 (样本太少不画, 没有统计意义)
  let distRows = null; // 最近一次榜单数据 (qsChart buildOption 的数据源)
  const distH = qsChart("daily-dist", () => buildDistOption());
  function buildDistOption() {
    const rows = distRows;
    if (!rows || rows.length < 5) return null;
    const rates = rows.map((r) => Number(r.returnRate));
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const bins = 10;
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    rates.forEach((v) => {
      counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
    });
    const labels = counts.map((_, i) => fmtPct(min + width * (i + 0.5)));
    const accent = cssVar("--accent");
    const muted = cssVar("--text-muted");
    const border = cssVar("--border");
    return ({
      backgroundColor: "transparent",
      animation: false,
      tooltip: { backgroundColor: cssVar("--panel-raised"), borderColor: border,
        textStyle: { color: cssVar("--text") } },
      grid: { left: 40, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "category", data: labels,
        axisLine: { lineStyle: { color: border } },
        axisLabel: { color: muted, fontSize: 10, interval: 1 } },
      yAxis: { type: "value", minInterval: 1,
        splitLine: { lineStyle: { color: border, opacity: 0.4 } },
        axisLabel: { color: muted, fontSize: 10 } },
      series: [{ type: "bar", data: counts, barWidth: "70%",
        itemStyle: { color: accent, opacity: 0.8, borderRadius: [3, 3, 0, 0] } }],
    });
  }

  function renderDist(rows) {
    distRows = rows;
    const box = $("daily-dist-box");
    if (!rows || rows.length < 5) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    distH.refresh();
    const rates = rows.map((r) => Number(r.returnRate));

    // 我的百分位: 已登录且今日已入榜时展示
    const pctEl = $("daily-pct");
    // 榜单用户名已在后端脱敏, 按名字认不出自己了——用后端下发的 isSelf 标记
    const mine = rows.find((r) => r.isSelf);
    if (mine) {
      const below = rates.filter((v) => v < Number(mine.returnRate)).length;
      pctEl.hidden = false;
      pctEl.textContent = t("daily.pct", Math.round((below / rates.length) * 100));
    } else {
      pctEl.hidden = true;
    }
  }

  async function start() {
    if (!window.Auth) return;
    // return 让 guarded 等到请求完成 (防双击并发开局)
    return Auth.require(async () => {
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
  // 主题重绘由 qsChart 统一兜底, 本视图不再自挂 qs:theme
  if (window.Auth) Auth.onChange(() => { today = null; renderInfo(); });
  // 启动兜底: app.js 首次 switchView 早于本脚本, 停在本视图刷新会错过 qs:view
  if (!$("view-daily").hidden) load();
})();
