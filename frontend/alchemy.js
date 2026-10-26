// 仓位炼金术: 未来全部公开, 你还是赢不了——五只股票的完整走势摆在眼前,
// 你只能提交一个静态权重向量 (中途不许动), 让组合通过关卡的风险约束。
// 考的不是预测, 是协方差直觉: 全仓涨最多的那只, 夏普往往过不了关。
// 三关递进, 每关 3 次提交机会, 剩得越多得分越高。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_alchemy";
  const DAYS = 120;
  const TRIES = 3;
  const ANN = Math.sqrt(252);

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const NAMES = [
    { zh: "蓝鲸科技", en: "BlueWhale Tech" },
    { zh: "红杉重工", en: "Sequoia Heavy" },
    { zh: "极光医药", en: "Aurora Pharma" },
    { zh: "磐石银行", en: "Bedrock Bank" },
    { zh: "流星游戏", en: "Meteor Games" },
  ];

  // 原型: 因子模型 r = mu + beta*m + eps。明星股收益高波动也高, 对冲股负 beta,
  // 压舱石低波动, 周期股高 beta, 还有一只阴跌的垃圾股——分散与对冲是唯一解法。
  const ARCHETYPES = [
    { id: "star", mu: 0.0022, beta: 1.2, eps: 0.022 },
    { id: "steady", mu: 0.0007, beta: 0.3, eps: 0.006 },
    { id: "hedge", mu: 0.0002, beta: -0.8, eps: 0.009 },
    { id: "cyc", mu: 0.0010, beta: 1.5, eps: 0.012 },
    { id: "junk", mu: -0.0012, beta: 0.6, eps: 0.014 },
  ];

  // 关卡约束: check 返回是否通过, descKey 用于标题, hintKey 在失败时指路
  const LEVELS = [
    { id: 1, check: (m) => m.sharpe >= 1.1, descKey: "al.l1", target: (m) => m.sharpe.toFixed(2) + " / 1.10" },
    { id: 2, check: (m) => m.sharpe >= 1.0 && m.maxDD >= -0.12, descKey: "al.l2", target: (m) => m.sharpe.toFixed(2) + " / 1.00 · " + (m.maxDD * 100).toFixed(1) + "% / -12%" },
    { id: 3, check: (m) => m.totalRet >= 0.15 && m.vol <= 0.18, descKey: "al.l3", target: (m) => (m.totalRet * 100).toFixed(1) + "% / +15% · " + (m.vol * 100).toFixed(1) + "% / 18%" },
  ];

  // ---------- 关卡生成与组合数学 ----------

  function genLevel(seed) {
    const rng = mulberry32(seed);
    // 市场因子序列 + 五只原型股的日收益率与价格路径
    const market = Array.from({ length: DAYS }, () => 0.012 * (rng() * 2 - 1));
    const order = ARCHETYPES.slice().sort(() => rng() - 0.5);
    const stocks = order.map((a, i) => {
      const rets = market.map((m) => a.mu + a.beta * m + a.eps * (rng() * 2 - 1));
      const path = [100];
      rets.forEach((r) => path.push(+(path[path.length - 1] * (1 + r)).toFixed(2)));
      return { name: NAMES[i], rets, path };
    });
    return { stocks };
  }

  function metrics(weights) {
    // 组合日收益 = Σ w_i r_i (现金部分收益 0), 由此算总收益/年化波动/夏普/最大回撤
    const rets = Array.from({ length: DAYS }, (_, d) =>
      g.level.stocks.reduce((s, st, i) => s + weights[i] * st.rets[d], 0));
    let nav = 1, peak = 1, maxDD = 0, sum = 0, sq = 0;
    const navs = [];
    rets.forEach((r) => {
      nav *= 1 + r;
      navs.push(nav);
      peak = Math.max(peak, nav);
      maxDD = Math.min(maxDD, nav / peak - 1);
      sum += r;
    });
    const mean = sum / DAYS;
    rets.forEach((r) => { sq += (r - mean) * (r - mean); });
    const sd = Math.sqrt(sq / (DAYS - 1));
    return {
      navs,
      totalRet: nav - 1,
      vol: sd * ANN,
      sharpe: sd === 0 ? 0 : (mean / sd) * ANN,
      maxDD,
    };
  }

  // ---------- 局状态 ----------

  const g = { levelIdx: 0, level: null, tries: 0, score: 0, lastMetrics: null, done: false, passed: false };

  const chartH = qsChart("al-chart", () => buildChartOption());
  const navChartH = qsChart("al-nav-chart", () => buildNavOption());

  function startLevel(idx) {
    g.levelIdx = idx;
    g.level = genLevel(Math.floor(Math.random() * 1e9));
    g.tries = TRIES;
    g.lastMetrics = null;
    g.done = false;
    $("al-select").hidden = true;
    $("al-report").hidden = true;
    $("al-room").hidden = false;
    $("al-metrics").hidden = true;
    renderLevelHead();
    renderWeights();
    renderStockStats();
    chartH.refresh();
    navChartH.refresh();
  }

  function renderLevelHead() {
    $("al-level-title").textContent = t("al.levelTitle", g.levelIdx + 1) + " · " + t(LEVELS[g.levelIdx].descKey);
    $("al-tries").textContent = String(g.tries);
    $("al-score").textContent = String(g.score);
  }

  function renderWeights() {
    const wrap = $("al-weights");
    wrap.innerHTML = "";
    g.level.stocks.forEach((st, i) => {
      const label = document.createElement("label");
      label.className = "al-weight-row";
      const name = document.createElement("span");
      name.textContent = pick(st.name);
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.step = "5";
      input.value = "0";
      input.id = "al-w" + i;
      input.addEventListener("input", renderCash);
      const unit = document.createElement("i");
      unit.textContent = "%";
      label.append(name, input, unit);
      wrap.appendChild(label);
    });
    renderCash();
  }

  const readWeights = () => g.level.stocks.map((_, i) => Math.max(0, Math.min(100, Number($("al-w" + i).value) || 0)) / 100);

  function renderCash() {
    const sum = readWeights().reduce((s, w) => s + w, 0);
    $("al-cash").textContent = Math.round((1 - sum) * 100) + "%";
    $("al-cash").classList.toggle("neg", sum > 1);
  }

  function renderStockStats() {
    const ul = $("al-stats");
    ul.innerHTML = "";
    g.level.stocks.forEach((st) => {
      const total = st.path[DAYS] / 100 - 1;
      const mean = st.rets.reduce((s, r) => s + r, 0) / DAYS;
      const sd = Math.sqrt(st.rets.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (DAYS - 1));
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = pick(st.name);
      const dd = document.createElement("span");
      dd.textContent = t("al.stockStat", (total > 0 ? "+" : "") + (total * 100).toFixed(0) + "%", (sd * ANN * 100).toFixed(0) + "%");
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function submit() {
    if (g.done) return;
    const w = readWeights();
    const sum = w.reduce((s, x) => s + x, 0);
    if (sum > 1.0001) {
      toast(t("al.overWeight"));
      return;
    }
    if (sum <= 0) {
      toast(t("al.zeroWeight"));
      return;
    }
    g.tries--;
    const m = metrics(w);
    g.lastMetrics = m;
    renderMetrics(m);
    navChartH.refresh();
    const lv = LEVELS[g.levelIdx];
    if (lv.check(m)) {
      g.score += 100 + g.tries * 50;
      playSound("win");
      if (g.levelIdx + 1 < LEVELS.length) {
        toast(t("al.levelPass", g.levelIdx + 1));
        startLevel(g.levelIdx + 1);
      } else {
        finish(true);
      }
      return;
    }
    playSound(g.tries > 0 ? "fill" : "lose");
    if (g.tries <= 0) {
      finish(false);
      return;
    }
    toast(t("al.tryFail", g.tries));
    renderLevelHead();
  }

  function renderMetrics(m) {
    $("al-metrics").hidden = false;
    $("al-m-ret").textContent = (m.totalRet > 0 ? "+" : "") + (m.totalRet * 100).toFixed(1) + "%";
    $("al-m-vol").textContent = (m.vol * 100).toFixed(1) + "%";
    $("al-m-sharpe").textContent = m.sharpe.toFixed(2);
    $("al-m-dd").textContent = (m.maxDD * 100).toFixed(1) + "%";
    $("al-m-target").textContent = t("al.targetNow") + " " + LEVELS[g.levelIdx].target(m);
  }

  function finish(passed) {
    g.done = true;
    g.passed = passed;
    $("al-room").hidden = true;
    $("al-report").hidden = false;
    const concl = $("alr-conclusion");
    concl.textContent = passed ? t("al.allPass", g.score) : t("al.fail", g.levelIdx + 1, g.score);
    concl.className = "qdr-conclusion " + (passed ? "win" : "lose");
    $("alr-why").textContent = t("al.moral");
    if (g.score > 0) {
      const b = qsLoadBest(BEST_KEY);
      if (g.score > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: g.score });
        toast(t("al.newBest", g.score));
      }
    }
    g.score = 0;
    renderIntroBest();
  }

  function backToSelect() {
    g.score = 0;
    $("al-room").hidden = true;
    $("al-report").hidden = true;
    $("al-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("al-best").hidden = !b.best;
    if (b.best) $("al-best").textContent = t("al.best", b.best);
  }

  // ---------- 图表: 五线全裸的未来 + 提交后的组合净值 ----------

  const LINE_VARS = ["--lab-blue", "--up", "--down", "--ma5", "--ma20"];

  function buildChartOption() {
    if (!g.level || $("al-room").hidden) return null;
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 26, bottom: 24 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 }, itemWidth: 14 },
      xAxis: {
        type: "category",
        data: Array.from({ length: DAYS + 1 }, (_, i) => "D" + i),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series: g.level.stocks.map((st, i) => ({
        type: "line",
        name: pick(st.name),
        data: st.path,
        showSymbol: false,
        lineStyle: { width: 1.5, color: cssVar(LINE_VARS[i]) },
        itemStyle: { color: cssVar(LINE_VARS[i]) },
      })),
    };
  }

  function buildNavOption() {
    if (!g.lastMetrics || $("al-room").hidden) return null;
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 10, bottom: 20 },
      xAxis: {
        type: "category",
        data: g.lastMetrics.navs.map((_, i) => "D" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      series: [{
        type: "line",
        data: g.lastMetrics.navs.map((v) => +(v * 100).toFixed(2)),
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--accent") },
        areaStyle: { opacity: 0.08, color: cssVar("--accent") },
      }],
    };
  }

  // ---------- 接线 ----------

  $("btn-al-start").addEventListener("click", () => {
    g.score = 0;
    startLevel(0);
  });
  $("btn-al-submit").addEventListener("click", submit);
  $("btn-al-back").addEventListener("click", backToSelect);
  $("btn-alr-again").addEventListener("click", () => {
    g.score = 0;
    startLevel(0);
  });
  $("btn-alr-games").addEventListener("click", () => switchView("games"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "alchemy") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-alchemy").hidden) return;
    renderIntroBest();
    if (g.level && !$("al-room").hidden) {
      renderLevelHead();
      renderStockStats();
      if (g.lastMetrics) renderMetrics(g.lastMetrics);
      chartH.refresh();
      navChartH.refresh();
    }
  });

  renderIntroBest();
})();
