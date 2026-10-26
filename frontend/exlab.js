// 研究实验台: E1~E6 (docs/lab-experiments-2026-10.md 第一阶梯), 纯前端计算。
// 公共四件套在本页落地: 摩擦三滑块常开 (关 = 亮"无摩擦幻想"角标) / E5 训练-测试分区
// (揭晓后参数锁死, 换标的才重开) / E5 探索次数计数器 / 页脚铁句 (markup 静态常驻)。
// 数据复用 lab.js 的全局 labHistory(code) 与 labStocks (加载序: 本文件在 lab.js 之后)。
// 依赖 app.js 的 $ / toast / qsChart / cssVar / fmtPct, i18n.js 的 t。
(() => {
  // ---------- 摩擦面板 (全页共享) ----------
  const fr = { on: true, comm: 2.5, stamp: 5, slip: 2 }; // bp; A股真实档默认

  function frictionCost(turnover, reduction) {
    if (!fr.on) return 0;
    return turnover * (fr.comm + fr.slip) / 10000 + reduction * fr.stamp / 10000;
  }

  // ---------- 数值工具 ----------
  const rets = (c) => c.map((v, i) => (i === 0 ? 0 : v / c[i - 1] - 1));

  function ma(c, n) {
    const out = new Array(c.length).fill(null);
    let s = 0;
    for (let i = 0; i < c.length; i++) {
      s += c[i];
      if (i >= n) s -= c[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }

  /** 仓位序列 → 净值曲线 (pos[i] = 第 i 日收盘后的持仓比例, 吃第 i+1 日涨跌)。 */
  function simulate(closes, pos) {
    const r = rets(closes);
    const eq = [1];
    for (let i = 1; i < closes.length; i++) {
      let e = eq[i - 1] * (1 + pos[i - 1] * r[i]);
      const turnover = Math.abs(pos[i] - pos[i - 1]);
      if (turnover > 1e-9) e *= 1 - frictionCost(turnover, Math.max(0, pos[i - 1] - pos[i]));
      eq.push(e);
    }
    return eq;
  }

  const maxDD = (eq) => {
    let peak = eq[0];
    let dd = 0;
    eq.forEach((v) => { peak = Math.max(peak, v); dd = Math.max(dd, 1 - v / peak); });
    return dd;
  };
  const lastRet = (eq) => eq[eq.length - 1] - 1;
  const rollVol = (r, w) => r.map((_, i) => {
    if (i < w) return null;
    const seg = r.slice(i - w + 1, i + 1);
    const m = seg.reduce((a, b) => a + b, 0) / w;
    return Math.sqrt(seg.reduce((a, b) => a + (b - m) ** 2, 0) / w) * Math.sqrt(250);
  });

  // ---------- 数据与状态 ----------
  let code = null;
  let closes = [];
  let dates = [];
  const seg = { mode: "all" }; // E1 的段位选择 (全段/前半/后半)
  const e5 = { explored: 0, revealed: false };

  async function loadStock(c) {
    try {
      const h = await labHistory(c);
      code = c;
      closes = h.close.map(Number);
      dates = h.dates;
      e5.explored = 0;
      e5.revealed = false;
      setE5Locked(false);
      renderAll();
    } catch (err) { toast(err.message); }
  }

  const segSlice = () => {
    const n = closes.length;
    if (seg.mode === "front") return closes.slice(0, Math.floor(n / 2));
    if (seg.mode === "back") return closes.slice(Math.floor(n / 2));
    return closes;
  };

  // ---------- E1 均线的滞后税 ----------
  const e1Chart = qsChart("ex1-chart", () => {
    if (!closes.length) return null;
    const c = segSlice();
    const w = Number($("ex1-ma").value);
    return lineOption(c.map((_, i) => i + 1), [
      { name: "P", data: c, color: cssVar("--text-muted") },
      { name: "MA", data: ma(c, w), color: cssVar("--ma5") },
    ]);
  });

  function runE1() {
    if (!closes.length) return;
    const c = segSlice();
    const w = Number($("ex1-ma").value);
    $("ex1-ma-v").textContent = String(w);
    const m = ma(c, w);
    // 滞后: MA 斜率反转点, 回找 12 根内最近的价格局部极值, 距离即滞后天数
    const lags = [];
    for (let i = 2; i < c.length; i++) {
      if (m[i] == null || m[i - 2] == null) continue;
      const s1 = m[i] - m[i - 1];
      const s0 = m[i - 1] - m[i - 2];
      if (s1 * s0 >= 0) continue;
      for (let j = i; j >= Math.max(2, i - 12); j--) {
        const lo = Math.max(0, j - 2);
        const hi = Math.min(c.length - 1, j + 2);
        const win = c.slice(lo, hi + 1);
        if (c[j] === Math.max(...win) || c[j] === Math.min(...win)) { lags.push(i - j); break; }
      }
    }
    const avgLag = lags.length ? (lags.reduce((a, b) => a + b, 0) / lags.length).toFixed(1) : "--";
    // 价穿均线规则 vs 买入持有 (皆含当前摩擦设置)
    const pos = c.map((v, i) => (m[i] != null && v > m[i] ? 1 : 0));
    const strat = simulate(c, pos);
    const hold = simulate(c, c.map(() => 1));
    $("ex1-out").textContent = t("ex.e1.out", avgLag, fmtPct(lastRet(strat)), fmtPct(lastRet(hold)));
    e1Chart.refresh();
  }

  // ---------- E2 波动率的两张面孔 ----------
  const e2Chart = qsChart("ex2-chart", () => {
    if (!closes.length) return null;
    const { fixed, vt } = e2Calc();
    return lineOption(closes.map((_, i) => i + 1), [
      { name: t("ex.e2.fixed"), data: fixed, color: cssVar("--text-muted") },
      { name: t("ex.e2.vt"), data: vt, color: cssVar("--ma5") },
    ]);
  });

  function e2Calc() {
    const w = Number($("ex2-win").value);
    const target = Number($("ex2-target").value) / 100;
    const vol = rollVol(rets(closes), w);
    const posVT = closes.map((_, i) => (vol[i] == null || vol[i] <= 0 ? 0 : Math.min(1, target / vol[i])));
    return { fixed: simulate(closes, closes.map(() => 1)), vt: simulate(closes, posVT) };
  }

  function runE2() {
    if (!closes.length) return;
    $("ex2-target-v").textContent = $("ex2-target").value + "%";
    const { fixed, vt } = e2Calc();
    $("ex2-out").textContent = t("ex.e2.out",
      fmtPct(lastRet(fixed)), fmtPct(maxDD(fixed)), fmtPct(lastRet(vt)), fmtPct(maxDD(vt)));
    e2Chart.refresh();
  }

  // ---------- E3 手续费显微镜 ----------
  const e3Chart = qsChart("ex3-chart", () => {
    if (!closes.length) return null;
    const { gross, net } = e3Calc();
    return lineOption(closes.map((_, i) => i + 1), [
      { name: t("ex.e3.gross"), data: gross, color: cssVar("--up") },
      { name: t("ex.e3.net"), data: net, color: cssVar("--down") },
    ]);
  });

  function e3Pos(theta) {
    const m20 = ma(closes, 20);
    let p = 0;
    return closes.map((v, i) => {
      if (m20[i] == null) return 0;
      if (v > m20[i] * (1 + theta)) p = 1;
      else if (v < m20[i] * (1 - theta)) p = 0;
      return p;
    });
  }

  function e3Calc() {
    const theta = Number($("ex3-theta").value) / 1000; // 0~50‰ → 0~5%
    const pos = e3Pos(theta);
    const saved = fr.on;
    fr.on = false;
    const gross = simulate(closes, pos);
    fr.on = saved;
    const net = simulate(closes, pos);
    let trades = 0;
    for (let i = 1; i < pos.length; i++) if (pos[i] !== pos[i - 1]) trades++;
    return { gross, net, trades };
  }

  function runE3() {
    if (!closes.length) return;
    $("ex3-theta-v").textContent = (Number($("ex3-theta").value) / 10).toFixed(1) + "%";
    const { gross, net, trades } = e3Calc();
    const g = lastRet(gross);
    const eaten = Math.abs(g) < 1e-6 ? "--" : (((g - lastRet(net)) / Math.abs(g)) * 100).toFixed(0) + "%";
    $("ex3-out").textContent = t("ex.e3.out", trades, fmtPct(g), fmtPct(lastRet(net)), eaten);
    e3Chart.refresh();
  }

  // ---------- E4 滑点的非线性 ----------
  const e4Chart = qsChart("ex4-chart", () => {
    if (!closes.length) return null;
    const pts = [];
    for (let s = 0.1; s <= 10.001; s += 0.5) pts.push([s, e4Net(s) * 100]);
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "value", name: "%ADV", min: 0, max: 10,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", axisLabel: { color: cssVar("--text-muted"), fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: [
        { type: "line", data: pts, showSymbol: false, lineStyle: { width: 2, color: cssVar("--ma5") } },
        { type: "scatter", data: [[Number($("ex4-size").value) / 10, e4Net(Number($("ex4-size").value) / 10) * 100]],
          symbolSize: 10, itemStyle: { color: cssVar("--accent") } },
      ],
    };
  });

  function e4ImpactBp(sizePct) {
    return $("ex4-model").value === "sqrt" ? 25 * Math.sqrt(sizePct) : 8 * sizePct;
  }

  function e4Net(sizePct) {
    const savedSlip = fr.slip;
    const savedOn = fr.on;
    fr.on = true;
    fr.slip = fr.slip + e4ImpactBp(sizePct);
    const eq = simulate(closes, e3Pos(0.01));
    fr.slip = savedSlip;
    fr.on = savedOn;
    return lastRet(eq);
  }

  function runE4() {
    if (!closes.length) return;
    const size = Number($("ex4-size").value) / 10;
    $("ex4-size-v").textContent = size.toFixed(1) + "%";
    $("ex4-out").textContent = t("ex.e4.out", e4ImpactBp(size).toFixed(1), fmtPct(e4Net(size)));
    e4Chart.refresh();
  }

  // ---------- E5 止损线的代价谱 (训练/测试分区 + 探索计数) ----------
  const e5Chart = qsChart("ex5-chart", () => {
    if (!closes.length) return null;
    const split = Math.floor(closes.length * 0.7);
    const train = closes.slice(0, split);
    const sWith = e5Sim(train).eq;
    const sWo = simulate(train, train.map(() => 1));
    const series = [
      { name: t("ex.e5.with"), data: sWith, color: cssVar("--ma5") },
      { name: t("ex.e5.without"), data: sWo, color: cssVar("--text-muted") },
    ];
    if (e5.revealed) {
      // 测试段续画: 以训练末净值为基点衔接 (锁死的参数, 不许再调)
      const test = closes.slice(split - 1);
      const tWith = e5Sim(test).eq.map((v) => v * sWith[sWith.length - 1]);
      const tWo = simulate(test, test.map(() => 1)).map((v) => v * sWo[sWo.length - 1]);
      series[0].data = sWith.concat(tWith.slice(1));
      series[1].data = sWo.concat(tWo.slice(1));
    }
    const n = series[0].data.length;
    const opt = lineOption(Array.from({ length: n }, (_, i) => i + 1), series);
    if (e5.revealed) {
      opt.series[0].markArea = { silent: true, itemStyle: { color: cssVar("--mask") },
        data: [[{ xAxis: split }, { xAxis: n }]] };
    }
    return opt;
  });

  /** 止损模拟: 开局满仓, 破止损线清仓, 冷却后收盘价回到 MA5 上方才回场。 */
  function e5Sim(c) {
    const stop = Number($("ex5-stop").value) / 100;
    const cool = Number($("ex5-cool").value);
    const m5 = ma(c, 5);
    const pos = [];
    let holding = true;
    let entry = c[0];
    let coolLeft = 0;
    let triggers = 0;
    let washed = 0;
    for (let i = 0; i < c.length; i++) {
      if (holding && c[i] <= entry * (1 - stop)) {
        holding = false;
        coolLeft = cool;
        triggers++;
        // 洗出判定: 止损后 5 根内价格收复入场价
        for (let j = i + 1; j <= Math.min(c.length - 1, i + 5); j++) {
          if (c[j] >= entry) { washed++; break; }
        }
      } else if (!holding) {
        if (coolLeft > 0) coolLeft--;
        else if (m5[i] != null && c[i] > m5[i]) { holding = true; entry = c[i]; }
      }
      pos.push(holding ? 1 : 0);
    }
    return { eq: simulate(c, pos), triggers, washed };
  }

  function setE5Locked(locked) {
    ["ex5-stop", "ex5-cool"].forEach((id) => { $(id).disabled = locked; });
    $("btn-ex5-reveal").disabled = locked || !closes.length;
    $("ex5-locked").hidden = !locked;
  }

  function runE5(countExplore) {
    if (!closes.length) return;
    if (countExplore && !e5.revealed) e5.explored++;
    $("ex5-stop-v").textContent = $("ex5-stop").value + "%";
    const split = Math.floor(closes.length * 0.7);
    const train = closes.slice(0, split);
    const r = e5Sim(train);
    const wo = simulate(train, train.map(() => 1));
    $("ex5-out").textContent = t("ex.e5.out", r.triggers, r.washed,
      fmtPct(lastRet(r.eq)), fmtPct(lastRet(wo)), e5.explored);
    e5Chart.refresh();
  }

  function revealE5() {
    if (!closes.length || e5.revealed) return;
    e5.revealed = true;
    setE5Locked(true);
    const split = Math.floor(closes.length * 0.7);
    const test = closes.slice(split - 1);
    const r = e5Sim(test);
    const wo = simulate(test, test.map(() => 1));
    $("ex5-test-out").hidden = false;
    $("ex5-test-out").textContent = t("ex.e5.testOut",
      fmtPct(lastRet(r.eq)), fmtPct(lastRet(wo)), e5.explored);
    playSound("flip");
    e5Chart.refresh();
  }

  // ---------- E6 再平衡节奏 ----------
  let e6Res = null;
  const e6Chart = qsChart("ex6-chart", () => {
    if (!e6Res) return null;
    const cats = e6Res.map((r) => t("ex.e6.p." + r.key));
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 26, bottom: 26 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 } },
      xAxis: { type: "category", data: cats,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", axisLabel: { color: cssVar("--text-muted"), fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: [
        { name: t("ex.e6.ret"), type: "bar", data: e6Res.map((r) => (r.ret * 100).toFixed(2)), itemStyle: { color: cssVar("--up") } },
        { name: t("ex.e6.dd"), type: "bar", data: e6Res.map((r) => (r.dd * 100).toFixed(2)), itemStyle: { color: cssVar("--down") } },
      ],
    };
  });

  async function runE6() {
    const codeB = $("ex6-stock").value;
    if (!closes.length || !codeB || codeB === code) { toast(t("ex.e6.needTwo")); return; }
    let hb;
    try { hb = await labHistory(codeB); } catch (err) { toast(err.message); return; }
    // 日期对齐: 只留两标的共有的交易日
    const mapB = new Map(hb.dates.map((d, i) => [d, Number(hb.close[i])]));
    const ca = [];
    const cb = [];
    dates.forEach((d, i) => { if (mapB.has(d)) { ca.push(closes[i]); cb.push(mapB.get(d)); } });
    if (ca.length < 40) { toast(t("ex.e6.noOverlap")); return; }
    const wA = Number($("ex6-w").value) / 100;
    $("ex6-w-v").textContent = $("ex6-w").value + "%";
    const ra = rets(ca);
    const rb = rets(cb);
    e6Res = [{ key: "d", n: 1 }, { key: "w", n: 5 }, { key: "m", n: 21 }, { key: "never", n: 0 }].map(({ key, n }) => {
      let va = wA;
      let vb = 1 - wA;
      let eq = 1;
      let peak = 1;
      let dd = 0;
      let cost = 0;
      for (let i = 1; i < ca.length; i++) {
        va *= 1 + ra[i];
        vb *= 1 + rb[i];
        const tot = va + vb;
        if (n > 0 && i % n === 0) {
          const turnover = Math.abs(va - tot * wA) / tot * 2;
          const c = frictionCost(turnover, turnover / 2) * tot;
          cost += c * eq;
          va = (tot - c) * wA;
          vb = (tot - c) * (1 - wA);
        }
        eq = va + vb;
        peak = Math.max(peak, eq);
        dd = Math.max(dd, 1 - eq / peak);
      }
      return { key, ret: eq - 1, dd, cost };
    });
    $("ex6-out").textContent = t("ex.e6.out",
      t("ex.e6.p." + e6Res.reduce((a, b) => (b.ret > a.ret ? b : a)).key),
      t("ex.e6.p." + e6Res.reduce((a, b) => (b.dd < a.dd ? b : a)).key));
    e6Chart.refresh();
  }

  // ---------- 共享图表 option ----------
  function lineOption(xs, series) {
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 26, bottom: 26 },
      legend: series.length > 1
        ? { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 } } : undefined,
      xAxis: { type: "category", data: xs,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", scale: true,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: series.map((s) => ({
        name: s.name, type: "line", data: s.data, showSymbol: false,
        lineStyle: { width: 1.6, color: s.color }, itemStyle: { color: s.color },
      })),
    };
  }

  // ---------- 装配 ----------
  function renderAll() {
    runE1(); runE2(); runE3(); runE4(); runE5(false);
    if (e6Res) runE6();
  }

  async function fillStocks() {
    // labStocks 是 lab.js 的懒加载全局: 实验台可能先于研究所首页被打开, 自己兜底拉一次
    if (!Array.isArray(labStocks) || !labStocks.length) {
      try { labStocks = await api("/backtest/stocks"); } catch (e) { return; }
    }
    [["ex-stock", 0], ["ex6-stock", 1]].forEach(([id, defIdx]) => {
      const sel = $(id);
      if (sel.options.length) return;
      labStocks.forEach((s) => {
        const o = document.createElement("option");
        o.value = s.code;
        o.textContent = stockName(s.name, s.code);
        sel.appendChild(o);
      });
      sel.selectedIndex = Math.min(defIdx, sel.options.length - 1);
    });
    if (!code && $("ex-stock").value) loadStock($("ex-stock").value);
  }

  $("ex-stock").addEventListener("change", () => loadStock($("ex-stock").value));
  // 摩擦面板: 任何改动全页重算 (E4 自管冲击叠加)
  [["ex-fr-comm", "comm"], ["ex-fr-stamp", "stamp"], ["ex-fr-slip", "slip"]].forEach(([id, k]) => {
    $(id).addEventListener("input", () => {
      fr[k] = Number($(id).value);
      $(id + "-v").textContent = fr[k] + "bp";
      renderAll();
    });
  });
  $("ex-fr-on").addEventListener("change", () => {
    fr.on = $("ex-fr-on").checked;
    $("ex-fr-fantasy").hidden = fr.on;
    renderAll();
  });
  $("ex1-ma").addEventListener("input", runE1);
  $("ex1-seg").addEventListener("change", () => { seg.mode = $("ex1-seg").value; runE1(); });
  $("ex2-win").addEventListener("change", runE2);
  $("ex2-target").addEventListener("input", runE2);
  $("ex3-theta").addEventListener("input", runE3);
  $("ex4-size").addEventListener("input", runE4);
  $("ex4-model").addEventListener("change", runE4);
  $("ex5-stop").addEventListener("input", () => runE5(true));
  $("ex5-cool").addEventListener("change", () => runE5(true));
  $("btn-ex5-reveal").addEventListener("click", revealE5);
  $("ex6-stock").addEventListener("change", runE6);
  $("ex6-w").addEventListener("input", runE6);
  $("btn-exlab-open").addEventListener("click", () => switchView("exlab"));

  // details 展开时补画 (hidden 容器里 ECharts 尺寸为 0)
  document.querySelectorAll("#view-exlab .ex-exp").forEach((d) => {
    d.addEventListener("toggle", () => { if (d.open) renderAll(); });
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "exlab") return;
    fillStocks();
    renderAll();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-exlab").hidden) renderAll();
  });
})();
