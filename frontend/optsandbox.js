// 期权入门沙盒 (2026-10 从 academy.js 拆出, 行为不变)。自包裹 IIFE, 零跨节符号;
// 仅依赖 app.js 的 $ / cssVar 与 i18n.js 的 t, 在 academy.js 之后加载只为分组可读。
// ---------- 期权入门沙盒: 欧式期权 BS 定价 + 到期损益曲线 ----------

(() => {
  const SPOT = 100;       // 现价固定 100, 聚焦"结构"而不是行情
  const VOL = 0.3;        // 年化波动率 30%
  const RATE = 0.03;      // 无风险利率 3%
  const T = 30 / 365;     // 30 天到期
  let optType = "call";
  const optChartH = qsChart("opt-chart", () => buildOptOption());

  // 定价共享 app.js 的 qsBsPrice (沙盒假设: 无风险利率 3%, 自然日年化)
  const bsPremium = (strike) => qsBsPrice(SPOT, strike, T, VOL, optType === "call", RATE);

  function renderOption() {
    const strike = Number($("opt-strike").value);
    $("opt-strike-val").textContent = strike;
    const premium = bsPremium(strike);
    $("opt-premium").textContent = premium.toFixed(2);
    $("btn-opt-call").classList.toggle("active", optType === "call");
    $("btn-opt-put").classList.toggle("active", optType === "put");
    optChartH.refresh();
    const breakeven = optType === "call" ? strike + premium : strike - premium;
    $("opt-verdict").textContent = t("opt.verdict", premium.toFixed(2), breakeven.toFixed(1));
  }

  function buildOptOption() {
    const strike = Number($("opt-strike").value);
    const premium = bsPremium(strike);
    const xs = [];
    const ys = [];
    for (let s = 60; s <= 140; s += 1) {
      const intrinsic = optType === "call" ? Math.max(0, s - strike) : Math.max(0, strike - s);
      xs.push(s);
      ys.push(+(intrinsic - premium).toFixed(2));
    }
    const breakeven = optType === "call" ? strike + premium : strike - premium;
    return ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", valueFormatter: (v) => (v >= 0 ? "+" : "") + v },
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: { type: "category", data: xs, name: t("opt.axisX"), nameLocation: "middle", nameGap: 24,
        axisLabel: { color: cssVar("--text-muted") }, axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value",
        axisLabel: { color: cssVar("--text-muted") },
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } } },
      series: [{ type: "line", data: ys, showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--accent") },
        areaStyle: { opacity: 0.1, color: cssVar("--accent") },
        markLine: { symbol: "none", lineStyle: { color: cssVar("--text-muted"), type: "dashed" },
          label: { color: cssVar("--text-muted") },
          data: [{ yAxis: 0 }, { xAxis: String(Math.round(breakeven)) }] } }],
    });
  }

  $("btn-opt-call").addEventListener("click", () => { optType = "call"; renderOption(); });
  $("btn-opt-put").addEventListener("click", () => { optType = "put"; renderOption(); });
  $("opt-strike").addEventListener("input", renderOption);
  document.addEventListener("qs:view", (e) => { if (e.detail === "option") renderOption(); });
  document.addEventListener("qs:lang", () => { if (!$("view-option").hidden) renderOption(); });
  if (!$("view-option").hidden) renderOption(); // 启动兜底: 停在期权沙盒刷新会错过首次 qs:view
})();
