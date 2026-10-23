// 调参热力图: 展示自动调参的完整网格 (x/y = 两个参数轴, 颜色 = 总收益)。
// 依赖 $ / t / cssVar / echarts; app.js 在 runTune 成功后调用 window.qsRenderHeatmap(res)。

(() => {
  let lastRes = null;
  const hmChartH = qsChart("tune-heatmap", () => buildHeatmapOption());

  function render(res) {
    lastRes = res;
    const card = $("heatmap-card");
    if (!res || !res.grid || !res.grid.length || !res.paramKeys || res.paramKeys.length < 2) {
      // 单参数策略画不了二维热力图
      card.hidden = true;
      return;
    }
    card.hidden = false;
    hmChartH.refresh();
  }

  function buildHeatmapOption() {
    const res = lastRes;
    if (!res || !res.grid || !res.grid.length || !res.paramKeys || res.paramKeys.length < 2) return null;
    const xs = [...new Set(res.grid.map((g) => g.x))].sort((a, b) => a - b);
    const ys = [...new Set(res.grid.map((g) => g.y))].sort((a, b) => a - b);
    const data = res.grid.map((g) => [
      xs.indexOf(g.x), ys.indexOf(g.y), Number((Number(g.totalReturn) * 100).toFixed(2)),
      g.sharpeRatio == null ? null : Number(g.sharpeRatio),
    ]);
    const values = data.map((d) => d[2]);
    const maxAbs = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 1);

    return ({
      grid: { left: 70, right: 90, top: 20, bottom: 50 },
      tooltip: {
        formatter: (p) => {
          const [xi, yi, ret, sharpe] = p.data;
          return `${res.paramKeys[0]}=${xs[xi]}, ${res.paramKeys[1]}=${ys[yi]}<br>`
            + `${t("bt.return")}: ${ret >= 0 ? "+" : ""}${ret}%<br>`
            + `${t("bt.sharpe")}: ${sharpe == null ? "--" : sharpe.toFixed(2)}`;
        },
      },
      xAxis: {
        type: "category",
        name: res.paramKeys[0],
        data: xs,
        axisLabel: { color: cssVar("--text-muted") },
        nameTextStyle: { color: cssVar("--text-muted") },
      },
      yAxis: {
        type: "category",
        name: res.paramKeys[1],
        data: ys,
        axisLabel: { color: cssVar("--text-muted") },
        nameTextStyle: { color: cssVar("--text-muted") },
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: true,
        orient: "vertical",
        right: 6,
        top: "center",
        textStyle: { color: cssVar("--text-muted") },
        // 以 0 为锚的发散色板: 跌用市场绿, 涨用市场红 (中国配色)
        inRange: { color: [cssVar("--down"), cssVar("--panel-raised"), cssVar("--up")] },
      },
      series: [{
        type: "heatmap",
        data,
        label: { show: xs.length * ys.length <= 48, formatter: (p) => p.data[2] + "%", fontSize: 10 },
        emphasis: { itemStyle: { shadowBlur: 8 } },
      }],
    });
  }

  window.qsRenderHeatmap = render;

  // 主题/视图/窗口尺寸由 qsChart 兜底; tooltip 文案含 t(), 语言切换仍需重画
  document.addEventListener("qs:lang", () => {
    if (lastRes && !$("heatmap-card").hidden) render(lastRes);
  });
})();
