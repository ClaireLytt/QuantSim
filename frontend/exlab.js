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
      e9.splitChanges = 0;
      e9.warned = false;
      e10.revealed = false;
      $("ex10-test-note").hidden = true;
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

  // ---------- E7 买卖规则拼装台 ----------
  const E7_ENTRIES = ["cross", "breakout", "pullback"];
  const E7_EXITS = ["death", "fixed", "trail"];

  /** 入场×出场组合的仓位序列。规则全部只用当日及之前数据。 */
  function e7Pos(c, entry, exit) {
    const m5 = ma(c, 5);
    const m20 = ma(c, 20);
    const pos = [];
    let holding = false;
    let entryIdx = -1;
    let peak = 0;
    for (let i = 0; i < c.length; i++) {
      if (m20[i] == null) { pos.push(0); continue; }
      if (!holding) {
        const hi20 = i >= 20 ? Math.max(...c.slice(i - 20, i)) : Infinity;
        const enter = entry === "cross" ? (m5[i] != null && m5[i] > m20[i] && m5[i - 1] != null && m5[i - 1] <= m20[i - 1])
          : entry === "breakout" ? c[i] > hi20
            : (c[i] > m20[i] && m5[i] != null && c[i] < m5[i]); // pullback: 趋势内回踩
        if (enter) { holding = true; entryIdx = i; peak = c[i]; }
      } else {
        peak = Math.max(peak, c[i]);
        const leave = exit === "death" ? c[i] < m20[i]
          : exit === "fixed" ? i - entryIdx >= 10
            : c[i] <= peak * 0.92; // trail: 距持有期高点 -8%
        if (leave) holding = false;
      }
      pos.push(holding ? 1 : 0);
    }
    return pos;
  }

  let e7Metric = "ret";
  const e7Chart = qsChart("ex7-chart", () => {
    if (!closes.length) return null;
    const data = [];
    let best = null;
    E7_ENTRIES.forEach((en, x) => E7_EXITS.forEach((ex, y) => {
      const eq = simulate(closes, e7Pos(closes, en, ex));
      const v = e7Metric === "ret" ? lastRet(eq) * 100 : maxDD(eq) * 100;
      data.push([x, y, v.toFixed(1)]);
      if (!best || (e7Metric === "ret" ? v > best.v : v < best.v)) best = { en, ex, v };
    }));
    if (best) {
      $("ex7-out").textContent = t("ex.e7.out",
        t("ex.e7.en." + best.en), t("ex.e7.ex." + best.ex), best.v.toFixed(1) + "%");
    }
    return {
      animation: false,
      grid: { left: 90, right: 16, top: 10, bottom: 40 },
      xAxis: { type: "category", data: E7_ENTRIES.map((k) => t("ex.e7.en." + k)),
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      yAxis: { type: "category", data: E7_EXITS.map((k) => t("ex.e7.ex." + k)),
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      visualMap: { show: false, min: Math.min(...data.map((d) => +d[2])), max: Math.max(...data.map((d) => +d[2])),
        inRange: { color: [cssVar("--down"), cssVar("--surface-2"), cssVar("--up")] } },
      series: [{ type: "heatmap", data, label: { show: true, fontSize: 11, color: cssVar("--text") } }],
    };
  });

  function runE7() {
    if (!closes.length) return;
    e7Chart.refresh();
  }

  // ---------- E8 参数敏感性地形图 ----------
  function e8Grid() {
    const fasts = [];
    for (let f = 2; f <= 14; f += 2) fasts.push(f);
    const slows = [];
    for (let s = 12; s <= 40; s += 4) slows.push(s);
    const cells = [];
    fasts.forEach((f, xi) => slows.forEach((s, yi) => {
      if (f >= s) return;
      const mf = ma(closes, f);
      const ms = ma(closes, s);
      const pos = closes.map((_, i) => (mf[i] != null && ms[i] != null && mf[i] > ms[i] ? 1 : 0));
      cells.push({ f, s, xi, yi, pos });
    }));
    return { fasts, slows, cells };
  }

  let e8Metric = "ret";
  const e8Chart = qsChart("ex8-chart", () => {
    if (!closes.length) return null;
    const { fasts, slows, cells } = e8Grid();
    const vals = new Map();
    let best = null;
    cells.forEach((cell) => {
      const eq = simulate(closes, cell.pos);
      const v = e8Metric === "ret" ? lastRet(eq) * 100 : maxDD(eq) * 100;
      vals.set(cell.xi + ":" + cell.yi, v);
      if (!best || (e8Metric === "ret" ? v > best.v : v < best.v)) best = { ...cell, v };
    });
    // 针尖 vs 高原: 最优格的邻格均值衰减 >40% 判针尖
    if (best) {
      const neigh = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const v = vals.get((best.xi + dx) + ":" + (best.yi + dy));
        if (v != null) neigh.push(v);
      });
      const avgN = neigh.length ? neigh.reduce((a, b) => a + b, 0) / neigh.length : best.v;
      const spike = e8Metric === "ret" && best.v > 0 && (best.v - avgN) / Math.abs(best.v) > 0.4;
      $("ex8-out").textContent = t(spike ? "ex.e8.spike" : "ex.e8.plateau",
        best.f, best.s, best.v.toFixed(1) + "%", avgN.toFixed(1) + "%");
    }
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 10, bottom: 40 },
      xAxis: { type: "category", name: "fast", data: fasts,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      yAxis: { type: "category", name: "slow", data: slows,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      visualMap: { show: false,
        min: Math.min(...[...vals.values()]), max: Math.max(...[...vals.values()]),
        inRange: { color: [cssVar("--down"), cssVar("--surface-2"), cssVar("--up")] } },
      series: [{ type: "heatmap",
        data: [...vals.entries()].map(([k, v]) => [...k.split(":").map(Number), v.toFixed(1)]) }],
    };
  });

  function runE8() {
    if (!closes.length) return;
    e8Chart.refresh();
  }

  // ---------- E9 样本外的审判 ----------
  const e9 = { splitChanges: 0, warned: false };
  const e9Chart = qsChart("ex9-chart", () => {
    if (!closes.length) return null;
    const split = Math.floor(closes.length * Number($("ex9-split").value) / 100);
    const { cells } = e8Grid();
    const scored = cells.map((cell) => ({
      cell,
      train: lastRet(simulate(closes.slice(0, split), cell.pos.slice(0, split))),
      test: lastRet(simulate(closes.slice(split), cell.pos.slice(split))),
    }));
    const byTrain = [...scored].sort((a, b) => b.train - a.train);
    const byTest = [...scored].sort((a, b) => b.test - a.test);
    const testRank = new Map(byTest.map((s, i) => [s.cell, i + 1]));
    const top10 = byTrain.slice(0, 10);
    const pts = top10.map((s, i) => [i + 1, testRank.get(s.cell)]);
    const champTest = testRank.get(byTrain[0].cell);
    $("ex9-out").textContent = t("ex.e9.out", scored.length, champTest, scored.length,
      (top10.reduce((a, s) => a + testRank.get(s.cell), 0) / 10).toFixed(1));
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 16, bottom: 36 },
      xAxis: { type: "value", name: t("ex.e9.xTrain"), min: 0, max: 11,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      yAxis: { type: "value", name: t("ex.e9.yTest"), inverse: true, min: 1, max: scored.length,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: [{ type: "scatter", data: pts, symbolSize: 10,
        itemStyle: { color: cssVar("--ma5") } }],
    };
  });

  function runE9(fromSplit) {
    if (!closes.length) return;
    $("ex9-split-v").textContent = $("ex9-split").value + "%";
    if (fromSplit) {
      e9.splitChanges++;
      // 切分点改 ≥3 次 = 正在"测试集调参", 当场命名这个错误 (设计文档 E9)
      if (e9.splitChanges >= 3 && !e9.warned) {
        e9.warned = true;
        toast(t("ex.e9.peekWarn"));
      }
    }
    e9Chart.refresh();
  }

  // ---------- E10 过拟合制造机 ----------
  const E10_CONDS = ["ma5", "ma20", "up1", "up2", "mom5", "lowvol", "monTue", "earlyMonth"];
  const e10 = { revealed: false };

  function e10Pos() {
    const m5 = ma(closes, 5);
    const m20 = ma(closes, 20);
    const r = rets(closes);
    const vol = rollVol(r, 10);
    const volSorted = vol.filter((v) => v != null).sort((a, b) => a - b);
    const volMed = volSorted[Math.floor(volSorted.length / 2)] ?? 0;
    const checked = E10_CONDS.filter((k) => $("ex10-" + k).checked);
    const pos = closes.map((c, i) => {
      if (m20[i] == null) return 0;
      const d = new Date(dates[i]);
      const ok = checked.every((k) => {
        switch (k) {
          case "ma5": return c > m5[i];
          case "ma20": return c > m20[i];
          case "up1": return r[i] > 0;
          case "up2": return i >= 2 && r[i] > 0 && r[i - 1] > 0;
          case "mom5": return i >= 5 && c > closes[i - 5];
          case "lowvol": return vol[i] != null && vol[i] < volMed;
          case "monTue": return d.getDay() === 1 || d.getDay() === 2;
          case "earlyMonth": return d.getDate() <= 10;
          default: return true;
        }
      });
      return ok ? 1 : 0;
    });
    return { pos, n: checked.length };
  }

  const e10Chart = qsChart("ex10-chart", () => {
    if (!closes.length) return null;
    const split = Math.floor(closes.length * 0.7);
    const { pos } = e10Pos();
    const train = simulate(closes.slice(0, split), pos.slice(0, split));
    const series = [{ name: t("ex.e10.curve"), data: train, color: cssVar("--ma5") }];
    let n = train.length;
    if (e10.revealed) {
      const test = simulate(closes.slice(split - 1), pos.slice(split - 1))
        .map((v) => v * train[train.length - 1]);
      series[0].data = train.concat(test.slice(1));
      n = series[0].data.length;
    }
    const opt = lineOption(Array.from({ length: n }, (_, i) => i + 1), series);
    if (e10.revealed) {
      opt.series[0].markArea = { silent: true, itemStyle: { color: cssVar("--mask") },
        data: [[{ xAxis: split }, { xAxis: n }]] };
    }
    return opt;
  });

  function runE10() {
    if (!closes.length) return;
    const split = Math.floor(closes.length * 0.7);
    const { pos, n } = e10Pos();
    const train = simulate(closes.slice(0, split), pos.slice(0, split));
    let text = t("ex.e10.out", n, fmtPct(lastRet(train)));
    if (e10.revealed) {
      const test = simulate(closes.slice(split - 1), pos.slice(split - 1));
      text += " " + t("ex.e10.testOut", fmtPct(lastRet(test)));
    }
    $("ex10-out").textContent = text;
    e10Chart.refresh();
  }

  // ---------- E11 幸存者名单 (事后筛选池版; 真退市表是管道工程, 口径已在文案声明) ----------
  let e11Data = null;
  const e11Chart = qsChart("ex11-chart", () => {
    if (!e11Data) return null;
    return lineOption(e11Data.all.map((_, i) => i + 1), [
      { name: t("ex.e11.all"), data: e11Data.all, color: cssVar("--text-muted") },
      { name: t("ex.e11.surv"), data: e11Data.surv, color: cssVar("--up") },
    ]);
  });

  async function runE11() {
    if (!Array.isArray(labStocks) || labStocks.length < 4) return;
    const codes = labStocks.slice(0, 8).map((s) => s.code);
    let hists;
    try { hists = await Promise.all(codes.map((c) => labHistory(c))); } catch (e) { return; }
    // 共同交易日对齐
    let common = null;
    hists.forEach((h) => {
      const set = new Set(h.dates);
      common = common ? common.filter((d) => set.has(d)) : h.dates.slice();
    });
    if (!common || common.length < 60) { $("ex11-out").textContent = t("ex.e6.noOverlap"); return; }
    const series = hists.map((h) => {
      const map = new Map(h.dates.map((d, i) => [d, Number(h.close[i])]));
      return common.map((d) => map.get(d));
    });
    const totalRet = (c) => c[c.length - 1] / c[0] - 1;
    // "幸存池" = 用整段(未来)收益挑出的前一半 —— 事后筛选即幸存者偏差的机制本体
    const ranked = series.map((c, i) => ({ i, r: totalRet(c) })).sort((a, b) => b.r - a.r);
    const survIdx = new Set(ranked.slice(0, Math.ceil(series.length / 2)).map((x) => x.i));
    const port = (idxs) => {
      const eq = [1];
      for (let d = 1; d < common.length; d++) {
        let rr = 0;
        idxs.forEach((i) => { rr += series[i][d] / series[i][d - 1] - 1; });
        eq.push(eq[d - 1] * (1 + rr / idxs.size));
      }
      return eq;
    };
    const allIdx = new Set(series.map((_, i) => i));
    e11Data = { all: port(allIdx), surv: port(survIdx) };
    const gap = lastRet(e11Data.surv) - lastRet(e11Data.all);
    const dropped = hists.filter((_, i) => !survIdx.has(i))
      .map((h) => stockName(h.name, h.code)).join(" / ");
    $("ex11-out").textContent = t("ex.e11.out", fmtPct(lastRet(e11Data.surv)),
      fmtPct(lastRet(e11Data.all)), fmtPct(gap), dropped);
    e11Chart.refresh();
  }

  // ---------- E12 信号的半衰期 ----------
  const e12Chart = qsChart("ex12-chart", () => {
    if (!closes.length) return null;
    const res = e12Calc();
    if (!res) return null;
    const xs = Array.from({ length: 21 }, (_, i) => "T" + i);
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 26, bottom: 26 },
      legend: { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 } },
      xAxis: { type: "category", data: xs, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { color: cssVar("--text-muted"), fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: [
        // 分位带: 下轨透明堆底 + 带宽填色 (ECharts 面积带惯用法)
        { name: "q25", type: "line", data: res.q25, stack: "band", showSymbol: false,
          lineStyle: { opacity: 0 }, tooltip: { show: false } },
        { name: t("ex.e12.band"), type: "line", data: res.q75.map((v, i) => (v - res.q25[i]).toFixed(2)),
          stack: "band", showSymbol: false, lineStyle: { opacity: 0 },
          areaStyle: { color: cssVar("--ma5"), opacity: 0.15 } },
        { name: t("ex.e12.mean"), type: "line", data: res.mean, showSymbol: false,
          lineStyle: { width: 2, color: cssVar("--ma5") } },
      ],
    };
  });

  function e12Calc() {
    const kind = $("ex12-signal").value;
    const m5 = ma(closes, 5);
    const m20 = ma(closes, 20);
    const r = rets(closes);
    const hits = [];
    for (let i = 21; i < closes.length - 21; i++) {
      const hit = kind === "cross"
        ? (m5[i] != null && m20[i] != null && m5[i] > m20[i] && m5[i - 1] <= m20[i - 1])
        : kind === "breakout" ? closes[i] > Math.max(...closes.slice(i - 20, i))
          : r[i] < -0.04; // oversold: 单日大跌
      if (hit) hits.push(i);
    }
    if (hits.length < 5) {
      $("ex12-out").textContent = t("ex.e12.tooFew", hits.length);
      return null;
    }
    // 事件研究: T0 对齐的累计收益路径, 逐期均值与 25/75 分位
    const paths = hits.map((i0) => {
      const path = [0];
      for (let k = 1; k <= 20; k++) path.push((closes[i0 + k] / closes[i0] - 1) * 100);
      return path;
    });
    const col = (k) => paths.map((p) => p[k]).sort((a, b) => a - b);
    const mean = [];
    const q25 = [];
    const q75 = [];
    for (let k = 0; k <= 20; k++) {
      const c = col(k);
      mean.push((c.reduce((a, b) => a + b, 0) / c.length).toFixed(2));
      q25.push(+c[Math.floor(c.length * 0.25)].toFixed(2));
      q75.push(+c[Math.floor(c.length * 0.75)].toFixed(2));
    }
    // 半衰期: 均值路径的峰值衰减到一半的第一期
    const peakK = mean.reduce((bi, v, i) => (Math.abs(+v) > Math.abs(+mean[bi]) ? i : bi), 0);
    let half = "--";
    for (let k = peakK + 1; k <= 20; k++) {
      if (Math.abs(+mean[k]) <= Math.abs(+mean[peakK]) / 2) { half = String(k); break; }
    }
    $("ex12-out").textContent = t("ex.e12.out", hits.length, mean[peakK] + "%", peakK, half,
      (q75[10] - q25[10]).toFixed(1) + "%");
    return { mean, q25, q75 };
  }

  function runE12() {
    if (!closes.length) return;
    e12Chart.refresh();
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
    runE7(); runE8(); runE9(false); runE10(); runE12();
    if (e11Data) e11Chart.refresh();
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
  ["ret", "dd"].forEach((m) => {
    $("ex7-m-" + m).addEventListener("click", () => {
      e7Metric = m;
      $("ex7-m-ret").classList.toggle("primary", m === "ret");
      $("ex7-m-dd").classList.toggle("primary", m === "dd");
      runE7();
    });
    $("ex8-m-" + m).addEventListener("click", () => {
      e8Metric = m;
      $("ex8-m-ret").classList.toggle("primary", m === "ret");
      $("ex8-m-dd").classList.toggle("primary", m === "dd");
      runE8();
    });
  });
  $("ex9-split").addEventListener("change", () => runE9(true));
  E10_CONDS.forEach((k) => $("ex10-" + k).addEventListener("change", runE10));
  $("btn-ex10-reveal").addEventListener("click", () => {
    if (!closes.length) return;
    e10.revealed = true;
    $("ex10-test-note").hidden = false;
    playSound("flip");
    runE10();
  });
  $("btn-ex11-run").addEventListener("click", runE11);
  $("ex12-signal").addEventListener("change", runE12);
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
