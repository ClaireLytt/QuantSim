// 策略擂台战: 竞技场榜单的「综合评分」视角——同台回测 PK, 不只看收益,
// 用 收益(50%) + 夏普(30%) + 回撤(20%) 的归一化综合分重排, 高收益高回撤的莽夫策略会被拉下来。
// 数据复用 /backtest/leaderboard (当前赛季), 本页只做评分与展示; 提交入口直通回测工坊。
// 依赖 app.js 的 $ / toast / switchView / stockName, i18n.js 的 t。
(() => {
  let entries = null;
  let timer = null;

  // ---------- 本周擂台倒计时: 到本周日 24:00 (本地时区) ----------
  function weekEnd() {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (d.getDay() + 6) % 7; // 周一=0
    d.setDate(d.getDate() + (7 - dow));
    return d;
  }

  function renderCountdown() {
    const ms = weekEnd() - Date.now();
    const dd = Math.floor(ms / 864e5);
    const hh = Math.floor((ms % 864e5) / 36e5);
    const mm = Math.floor((ms % 36e5) / 6e4);
    const ss = Math.floor((ms % 6e4) / 1e3);
    $("duel-countdown").textContent = t("duel.countdown", dd, String(hh).padStart(2, "0"),
      String(mm).padStart(2, "0"), String(ss).padStart(2, "0"));
  }

  // 综合评分统一走 app.js 的 qsCompositeScores (首页预览同口径), 不再本地复制一份

  const pctText = qsSignedPct; // 共享实现在 app.js
  // 回撤展示: 旧记录 maxDrawdown 可为 null (见 qsCompositeScores 注释), 显示 -- 而非 +0.0%
  const ddText = (v) => (v == null ? "--" : pctText(-Math.abs(Number(v))));

  async function loadBoard() {
    const list = $("duel-list");
    try {
      const raw = await api("/backtest/leaderboard");
      entries = qsCompositeScores(raw).sort((a, b) => b.score - a.score).slice(0, 20);
    } catch (e) {
      $("duel-empty").hidden = false;
      $("duel-empty").textContent = e.message;
      list.innerHTML = "";
      return;
    }
    render();
  }

  function render() {
    if (!entries) return;
    const list = $("duel-list");
    list.innerHTML = "";
    $("duel-empty").hidden = !!entries.length;
    // 上次加载失败会把错误信息留在空态里, 成功后必须还原默认文案
    $("duel-empty").textContent = t("duel.empty");
    entries.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "duel-card" + (i < 3 ? " duel-top" : "");
      const rank = document.createElement("b");
      rank.className = "duel-rank";
      rank.textContent = ["🥇", "🥈", "🥉"][i] || "#" + (i + 1);
      const main = document.createElement("div");
      main.className = "duel-main";
      const title = document.createElement("strong");
      // 策略名 + 标的; 用户名是用户可控文本, 全部 textContent
      title.textContent = t("strat." + e.strategy) + " · " + stockName(e.stockName, e.stockCode);
      const owner = document.createElement("span");
      owner.className = "hint";
      owner.textContent = e.username + (e.params ? " · " + e.params : "");
      main.append(title, owner);
      const stats = document.createElement("div");
      stats.className = "duel-stats";
      const mk = (label, val, cls) => {
        const sp = document.createElement("span");
        const i2 = document.createElement("i");
        i2.textContent = label;
        const b2 = document.createElement("b");
        b2.textContent = val;
        if (cls) b2.className = cls;
        sp.append(i2, b2);
        return sp;
      };
      stats.append(
        mk(t("duel.annual"), pctText(e.annualReturn != null ? e.annualReturn : e.totalReturn), Number(e.totalReturn) >= 0 ? "pos" : "neg"),
        mk(t("duel.dd"), ddText(e.maxDrawdown), "neg"),
      );
      const score = document.createElement("div");
      score.className = "duel-score";
      const sv = document.createElement("b");
      sv.textContent = String(e.score);
      const sl = document.createElement("i");
      sl.textContent = t("duel.score");
      score.append(sv, sl);
      li.append(rank, main, stats, score);
      list.appendChild(li);
    });
  }

  // ---------- 策略搭建屏: 条件积木 + 预回测 + 提交上台 ----------
  // 统一数据集: 每周按周序轮换一只"擂台标的", 所有人在同一段历史上 PK
  const DB_MAX_CONDS = 3; // 字段/算子表随条件行构建器共享 app.js 的 COND_FIELDS/COND_OPS
  let ringStocks = [];
  let previewed = false;
  let lastBuildRes = null; // 预回测结果 (qsChart buildOption 数据源)
  const buildChartH = qsChart("duel-build-chart", () =>
      (lastBuildRes ? buildBuildOption(lastBuildRes) : null));

  async function ringStock() {
    if (!ringStocks.length) ringStocks = await api("/backtest/stocks");
    // 本地周一为界的周序 (app.js qsWeekIndex), 与倒计时"周日 24:00 切换"口径一致
    return ringStocks[qsWeekIndex() % ringStocks.length];
  }

  // 条件行构建/收集共享 app.js 的实现 (样式与上限按擂台口径传参);
  // 收集继承竞技场的严格校验: 常数非法直接 throw, 由调用方 try/catch 提示。
  // 顺带修复: 旧复制版算子前缀误写 cond.op.* (i18n 无此键, 下拉显示裸键名)
  const addRow = (wrapId, preset) => addCondRow(wrapId, preset,
      { max: DB_MAX_CONDS, maxMsgKey: "duel.build.maxConds", rowClass: "duel-cond-row", delClass: "small ghost" });
  const collectRows = (wrapId) => collectConds(wrapId);

  async function buildBody(preview) {
    const st = await ringStock();
    return {
      username: currentUsername(),
      stockCode: st.code,
      strategy: "CUSTOM",
      buyConditions: collectRows("duel-buy-conds"),
      sellConditions: collectRows("duel-sell-conds"),
      positionPct: Number($("duel-pos").value),
      preview,
    };
  }

  function renderBuildChart(res) {
    lastBuildRes = res;
    buildChartH.refresh();
  }

  function buildBuildOption(res) {
    const curve = res.equityCurve || [];
    return ({
      animation: false,
      grid: { left: 58, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: curve.map((p) => p.date),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: { scale: true, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      series: [
        { type: "line", data: curve.map((p) => Number(p.strategy)), showSymbol: false, lineStyle: { width: 2, color: cssVar("--lab-blue") }, areaStyle: { opacity: 0.1, color: cssVar("--lab-blue") } },
        { type: "line", data: curve.map((p) => Number(p.hold)), showSymbol: false, lineStyle: { width: 1.2, type: "dashed", color: cssVar("--text-muted") } },
      ],
    });
  }

  async function runPreview() {
    $("btn-duel-preview").disabled = true;
    try {
      // 收集放进 try: 共享校验对非法常数会 throw, 统一走下面的 toast
      const buy = collectRows("duel-buy-conds");
      const sell = collectRows("duel-sell-conds");
      if (!buy.length || !sell.length) {
        toast(t("duel.build.needConds"));
        return;
      }
      const res = await api("/backtest/run", { method: "POST", body: JSON.stringify(await buildBody(true)) });
      renderBuildChart(res);
      $("duel-build-stats").hidden = false;
      // 旧记录/短窗口 annualReturn 可能为 null, 直接 pctText 会显示 +0.0%, 判空同 ddText 口径
      $("db-ann").textContent = res.annualReturn == null ? "--" : pctText(res.annualReturn);
      $("db-ann").className = Number(res.annualReturn) >= 0 ? "pos" : "neg";
      $("db-dd").textContent = ddText(res.maxDrawdown); // 与榜单路径同口径, null 显示 --
      $("db-sharpe").textContent = res.sharpeRatio == null ? "--" : Number(res.sharpeRatio).toFixed(2);
      previewed = true;
      $("btn-duel-enter").disabled = false;
      playSound("fill");
    } catch (e) {
      toast(e.message);
    } finally {
      $("btn-duel-preview").disabled = false;
    }
  }

  async function submitToRing() {
    if (!previewed) {
      toast(t("duel.build.previewFirst"));
      return;
    }
    $("btn-duel-enter").disabled = true;
    try {
      await api("/backtest/run", { method: "POST", body: JSON.stringify(await buildBody(false)) });
      toast(t("duel.build.entered"));
      document.dispatchEvent(new CustomEvent("qs:duelSubmit")); // 桌宠里程碑: 提交策略上擂台
      playSound("win");
      showBoard();
      loadBoard();
    } catch (e) {
      toast(e.message);
      $("btn-duel-enter").disabled = false;
    }
  }

  async function showBuilder() {
    $("duel-board").hidden = true;
    $("duel-build").hidden = false;
    previewed = false;
    $("btn-duel-enter").disabled = true;
    // 默认给一组经典金叉模板, 空面板吓新手
    if (!$("duel-buy-conds").children.length) {
      addRow("duel-buy-conds", { left: "MA5", op: "CROSS_UP", rightField: "MA20" });
      addRow("duel-sell-conds", { left: "MA5", op: "CROSS_DOWN", rightField: "MA20" });
    }
    try {
      const st = await ringStock();
      $("duel-build-stock").textContent = t("duel.build.dataset", stockName(st.name, st.code), st.code);
    } catch (e) { /* 后端未就绪时留空, 预回测时会再报错 */ }
  }

  function showBoard() {
    $("duel-build").hidden = true;
    $("duel-board").hidden = false;
  }

  // ---------- 本轮结算屏: 多策略净值同图对比 + 终榜 ----------
  let finalEntries = null;
  const finalChartH = qsChart("duel-final-chart", () =>
      (finalEntries && finalEntries.length ? buildFinalOption() : null));
  let finalSel = 0;
  const FINAL_COLORS = ["--warn", "--lab-blue", "--up", "--ma5", "--accent-soft"];

  async function showFinal() {
    $("duel-board").hidden = true;
    $("duel-build").hidden = true;
    $("duel-final").hidden = false;
    try {
      // score 由服务端对全赛季算好 (预选即按综合分), 前端不再重算——只对 TOP5 做 min-max 会失真
      finalEntries = await api("/backtest/duel-final?limit=5");
    } catch (e) {
      toast(e.message);
      finalEntries = [];
    }
    finalSel = 0;
    renderFinal();
  }

  function parseCurve(e) {
    try {
      const arr = JSON.parse(e.curve);
      if (!Array.isArray(arr) || !arr.length) return null;
      const base = Number(arr[0]) || 1;
      return arr.map((v) => +(Number(v) / base * 100).toFixed(2)); // 归一到 100 起点才可同图对比
    } catch (err) {
      return null;
    }
  }

  function renderFinalChart() {
    finalChartH.refresh();
  }

  function buildFinalOption() {
    const series = [];
    let maxLen = 0;
    finalEntries.forEach((e, i) => {
      const c = parseCurve(e);
      if (!c) return;
      maxLen = Math.max(maxLen, c.length);
      series.push({
        type: "line",
        name: "#" + (i + 1),
        data: c,
        showSymbol: false,
        lineStyle: { width: i === finalSel ? 3 : 1.4, color: cssVar(FINAL_COLORS[i % FINAL_COLORS.length], $("view-duel")), opacity: i === finalSel ? 1 : 0.55 },
        emphasis: { focus: "series" },
      });
    });
    return ({
      animation: false,
      grid: { left: 48, right: 14, top: 26, bottom: 24 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 11 } },
      xAxis: {
        type: "category",
        data: Array.from({ length: maxLen }, (_, i) => i + 1),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: { scale: true, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      series,
    });
  }

  function renderFinal() {
    if (!finalEntries) return;
    $("duel-final-empty").hidden = !!finalEntries.length;
    renderFinalChart();
    const tbody = $("duel-final-rows");
    tbody.innerHTML = "";
    finalEntries.forEach((e, i) => {
      const tr = document.createElement("tr");
      if (i === 0) tr.className = "duel-final-first";
      if (i === finalSel) tr.classList.add("sel");
      const mk = (txt, cls) => {
        const td = document.createElement("td");
        td.textContent = txt;
        if (cls) td.className = cls;
        return td;
      };
      tr.append(
        mk(["🥇", "🥈", "🥉"][i] || "#" + (i + 1)),
        mk(e.username + " · " + t("strat." + e.strategy)),
        mk(String(e.score)),
        mk(pctText(e.totalReturn), Number(e.totalReturn) >= 0 ? "pos" : "neg"),
        mk(ddText(e.maxDrawdown), "neg"),
      );
      tr.addEventListener("click", () => {
        finalSel = i;
        renderFinal();
      });
      tbody.appendChild(tr);
    });
    // 选中策略详情
    const sel = finalEntries[finalSel];
    $("duel-final-detail").hidden = true;
    if (sel) {
      $("duel-final-detail").textContent = t("duel.final.detail",
        sel.username, t("strat." + sel.strategy), sel.params || "-",
        stockName(sel.stockName, sel.stockCode));
    }
  }

  $("btn-duel-final").addEventListener("click", showFinal);
  $("btn-duel-final-detail").addEventListener("click", () => {
    const box = $("duel-final-detail");
    box.hidden = !box.hidden;
  });
  $("btn-duel-final-next").addEventListener("click", () => {
    $("duel-final").hidden = true;
    showBuilder();
  });
  $("btn-duel-final-back").addEventListener("click", () => {
    $("duel-final").hidden = true;
    showBoard();
  });

  $("btn-duel-submit").addEventListener("click", showBuilder);
  $("btn-duel-back").addEventListener("click", showBoard);
  $("btn-duel-preview").addEventListener("click", runPreview);
  $("btn-duel-enter").addEventListener("click", submitToRing);
  $("btn-duel-add-buy").addEventListener("click", () => addRow("duel-buy-conds", { left: "CLOSE", op: "GT", rightField: "MA20" }));
  $("btn-duel-add-sell").addEventListener("click", () => addRow("duel-sell-conds", { left: "CLOSE", op: "LT", rightField: "MA20" }));
  $("duel-pos").addEventListener("input", () => { $("duel-pos-v").textContent = $("duel-pos").value + "%"; });
  // 图表 resize/主题重绘由 qsChart 统一兜底
  $("btn-duel-history").addEventListener("click", () => switchView("ranking"));

  // ---------- 竞技场右侧迷你擂台榜: TOP3 策略名 + 综合分, 点击去擂台 ----------
  async function renderArenaTop3() {
    const box = $("arena-top3");
    try {
      const raw = await api("/backtest/leaderboard");
      const top = qsCompositeScores(raw).sort((a, b) => b.score - a.score).slice(0, 3);
      box.hidden = !top.length;
      if (!top.length) return;
      const ul = $("arena-top3-list");
      ul.innerHTML = "";
      top.forEach((e, i) => {
        const li = document.createElement("li");
        const rank = document.createElement("i");
        rank.textContent = "#" + (i + 1);
        const name = document.createElement("span");
        name.textContent = t("strat." + e.strategy); // 策略名是本地枚举文案
        const score = document.createElement("b");
        score.textContent = String(e.score);
        li.append(rank, name, score);
        ul.appendChild(li);
      });
    } catch (e) {
      box.hidden = true; // 后端未起/无数据: 侧卡整体消失, 不留空壳
    }
  }
  $("btn-arena-top3-go").addEventListener("click", () => switchView("duel"));
  // 回测结果卡底部 CTA: 跑完顺手去擂台 PK, 闭环竞技动线
  $("btn-arena-to-duel").addEventListener("click", () => switchView("duel"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "arena") renderArenaTop3();
    if (e.detail === "duel") {
      loadBoard();
      renderCountdown();
      clearInterval(timer);
      timer = setInterval(renderCountdown, 1000);
    } else if (timer) {
      clearInterval(timer); // 离开页面停表, 别空转
      timer = null;
    }
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-duel").hidden) {
      render();
      renderCountdown();
    }
  });
  // 启动兜底: 停在擂台/竞技场刷新会错过首次 qs:view
  if (!$("view-duel").hidden) {
    loadBoard();
    renderCountdown();
    timer = setInterval(renderCountdown, 1000);
  }
  if (!$("view-arena").hidden) renderArenaTop3();
})();
