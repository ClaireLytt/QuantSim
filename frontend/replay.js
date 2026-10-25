// 对局复盘报告 (2026-10 从 app.js 拆出, 行为不变)。依赖 app.js 的 $ / state / t / cssVar / echarts;
// app.js 的结算流程与悬浮复盘按钮调用这里的 openRecap。
// ---------- 对局复盘报告 ----------

// 复盘资金曲线走 qsChart 管家 (懒 init: 弹窗首开可见时才画)
const recapChartH = qsChart("recap-chart", () =>
    (state.klines.length && state.trades ? recapOption() : null));

function recapStats() {
  let shares = 0, cost = 0, buys = 0, sells = 0, wins = 0;
  state.trades.forEach((tr) => {
    if (tr.dir === "BUY") {
      cost = (cost * shares + tr.price * tr.shares) / (shares + tr.shares);
      shares += tr.shares;
      buys++;
    } else {
      sells++;
      if (tr.price > cost) wins++;
      shares = Math.max(0, shares - tr.shares);
    }
  });
  return { buys, sells, wins };
}

function recapVerdicts(stats) {
  const out = [];
  const ks = state.klines;
  const settle = state.lastSettle || {};
  // 服务端诊断已覆盖追涨/杀跌/过度交易, 有报告时客户端同类 heuristic 不再重复输出
  const serverBias = !!(settle.biasReport && settle.biasReport.verdicts
      && settle.biasReport.verdicts.length);

  if (state.trades.length === 0) {
    out.push(t("recap.v.idle"));
  } else {
    let chase = 0, goodEntry = 0, panic = 0;
    state.trades.forEach((tr) => {
      const after = ks.slice(tr.idx + 1, tr.idx + 6);
      const reboundHigh = after.length ? Math.max(...after.map((k) => Number(k.close))) : null;
      if (tr.dir === "BUY") {
        if (tr.idx >= 5) {
          const prevMax = Math.max(...ks.slice(tr.idx - 5, tr.idx).map((k) => Number(k.high)));
          if (tr.price >= prevMax * 0.98) chase++;
        }
        if (reboundHigh != null && reboundHigh >= tr.price * 1.05) goodEntry++;
      } else if (reboundHigh != null && reboundHigh >= tr.price * 1.05) {
        panic++;
      }
    });
    if (chase && !serverBias) out.push(t("recap.v.chaseHigh", chase));
    if (goodEntry) out.push(t("recap.v.goodEntry", goodEntry));
    if (panic && !serverBias) out.push(t("recap.v.sellEarly", panic));
    if (stats.sells > 0) {
      const rate = stats.wins / stats.sells;
      if (rate >= 0.6) out.push(t("recap.v.winHigh", (rate * 100).toFixed(0) + "%"));
      else if (rate < 0.4) out.push(t("recap.v.winLow", (rate * 100).toFixed(0) + "%"));
    }
    if (state.trades.length > state.totalTicks / 2 && !serverBias) out.push(t("recap.v.overtrade", state.trades.length));
  }

  if (settle.returnRate != null && settle.holdReturnRate != null) {
    const diff = Number(settle.returnRate) - Number(settle.holdReturnRate);
    const diffText = (Math.abs(diff) * 100).toFixed(2) + "%";
    if (diff > 0.0001) out.push(t("recap.v.beatHold", diffText));
    else if (diff < -0.0001) out.push(t("recap.v.loseHold", diffText));
  }
  return out;
}

function recapOption() {
  const dates = state.klines.map((k) => k.tradeDate);
  const candles = state.klines.map((k) => [k.open, k.close, k.low, k.high]);
  const buyPts = [], sellPts = [];
  state.trades.forEach((tr) => {
    const bar = state.klines[tr.idx];
    if (!bar) return;
    if (tr.dir === "BUY") buyPts.push([tr.idx, Number(bar.low)]);
    else sellPts.push([tr.idx, Number(bar.high)]);
  });
  return {
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      backgroundColor: COLORS.panel,
      borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      formatter(params) {
        // 散点系列的 dataIndex 是自身数组下标, 必须取 K 线系列的下标
        const p = params.find((x) => x.seriesType === "candlestick") || params[0];
        const i = p.dataIndex;
        const bar = state.klines[i];
        if (!bar) return "";
        const lines = [
          `<b>${bar.tradeDate}</b>`,
          `${t("chart.open")} ${bar.open}  ${t("chart.close")} ${bar.close}`,
        ];
        state.trades.forEach((tr) => {
          if (tr.idx === i) lines.push(t(tr.dir === "BUY" ? "recap.tip.buy" : "recap.tip.sell", tr.shares, tr.price));
        });
        return lines.join("<br>");
      },
    },
    legend: { data: [t("chart.kline"), "MA5", "MA20"], textStyle: { color: COLORS.muted }, top: 0 },
    grid: { left: 60, right: 20, top: 32, bottom: 28 },
    xAxis: {
      type: "category", data: dates,
      axisLine: { lineStyle: { color: COLORS.border } },
      axisLabel: { color: COLORS.muted },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
      axisLabel: { color: COLORS.muted },
    },
    series: [
      {
        name: t("chart.kline"), type: "candlestick", data: candles,
        itemStyle: {
          color: "transparent",
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down,
          borderWidth: 1.5,
        },
      },
      { name: "MA5", type: "line", data: state.klines.map((k) => k.ma5), smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: "MA20", type: "line", data: state.klines.map((k) => k.ma20), smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { type: "scatter", data: buyPts, symbol: "triangle", symbolSize: 13, symbolOffset: [0, 12], z: 10,
        itemStyle: { color: COLORS.up },
        label: { show: true, formatter: t("recap.b"), position: "bottom", color: COLORS.up, fontSize: 11, fontWeight: "bold" } },
      { type: "scatter", data: sellPts, symbol: "triangle", symbolRotate: 180, symbolSize: 13, symbolOffset: [0, -12], z: 10,
        itemStyle: { color: COLORS.down },
        label: { show: true, formatter: t("recap.s"), position: "top", color: COLORS.down, fontSize: 11, fontWeight: "bold" } },
    ],
  };
}

function renderRecap() {
  const stats = recapStats();
  const settle = state.lastSettle || {};
  $("recap-trades").textContent = t("recap.tradesVal", state.trades.length, stats.buys, stats.sells);
  $("recap-winrate").textContent = stats.sells > 0 ? ((stats.wins / stats.sells) * 100).toFixed(0) + "%" : "--";
  const setRate = (id, rate) => {
    const el = $(id);
    if (rate == null) { el.textContent = "--"; el.className = ""; return; }
    const v = Number(rate);
    el.textContent = fmtPct(v);
    el.className = v >= 0 ? "pos" : "neg";
  };
  setRate("recap-you", settle.returnRate);
  setRate("recap-hold", settle.holdReturnRate);

  const list = $("recap-verdicts");
  list.innerHTML = "";
  recapVerdicts(stats).forEach((text) => {
    const li = document.createElement("li");
    li.innerHTML = linkifyTerms(text);
    list.appendChild(li);
  });
  renderBias(settle.biasReport);
  renderJournal(settle.journal);

  recapChartH.refresh();
}

/**
 * 服务端行为偏差诊断 (结算响应 biasReport): 触发的判定 WARN 高亮,
 * 样本不足的判定不渲染 (短局两三笔交易下结论是误诊)。
 */
function renderBias(report) {
  const box = $("recap-bias");
  const list = $("recap-bias-list");
  list.innerHTML = "";
  const verdicts = (report && report.verdicts) || [];
  const shown = verdicts.filter((v) => !v.insufficient);
  if (!shown.length) { box.hidden = true; return; }
  box.hidden = false;
  let anyTriggered = false;
  shown.forEach((v) => {
    const li = document.createElement("li");
    li.className = v.triggered ? "bias-warn" : "bias-ok";
    const name = document.createElement("strong");
    name.textContent = t("recap.bias." + v.key);
    li.appendChild(name);
    const desc = document.createElement("span");
    desc.textContent = " " + biasDesc(v);
    li.appendChild(desc);
    list.appendChild(li);
    if (v.triggered) anyTriggered = true;
  });
  if (!anyTriggered) {
    const li = document.createElement("li");
    li.className = "bias-ok";
    li.textContent = t("recap.bias.none");
    list.appendChild(li);
  }
}

/** 判定描述: 触发时给偏差解释 + 关键数字, 未触发给正常反馈。 */
function biasDesc(v) {
  const s = v.stats || {};
  const pct = (x) => (Number(x) * 100).toFixed(0) + "%";
  switch (v.key) {
    case "disposition":
      return v.triggered
        ? t("recap.bias.disposition.desc", s.holdWin, s.holdLose)
        : t("recap.bias.stat.holdBoth", s.holdWin, s.holdLose);
    case "revenge":
      return v.triggered ? t("recap.bias.revenge.desc", s.ratio) : t("recap.bias.ok");
    case "chase":
      return v.triggered ? t("recap.bias.chase.desc", pct(s.rate)) : t("recap.bias.stat.rateOf", pct(s.rate));
    case "panic":
      return v.triggered ? t("recap.bias.panic.desc", pct(s.rate)) : t("recap.bias.stat.rateOf", pct(s.rate));
    case "overtrade":
      return v.triggered ? t("recap.bias.overtrade.desc", s.total) : t("recap.bias.ok");
    default:
      return "";
  }
}

/** 交易日志 (理由 vs 结果): 理由是用户文本, 必须 textContent。 */
function renderJournal(journal) {
  const box = $("recap-journal");
  const rows = journal || [];
  if (!rows.length) { box.hidden = true; return; }
  box.hidden = false;
  const tbody = $("recap-journal-table").querySelector("tbody");
  tbody.innerHTML = "";
  rows.forEach((j) => {
    const tr = document.createElement("tr");
    const outcome = j.outcomePct == null ? "--" : fmtPct(Number(j.outcomePct));
    const cls = j.outcomePct == null ? "" : Number(j.outcomePct) >= 0 ? "pos" : "neg";
    tr.innerHTML = `<td></td><td></td><td class="journal-reason"></td><td class="${cls}">${outcome}</td>`;
    tr.children[0].textContent = j.tradeDate || "";
    tr.children[1].textContent = t(j.direction === "BUY" ? "trade.buy" : "trade.sell");
    tr.children[2].textContent = j.reason || "";
    tbody.appendChild(tr);
  });
}

// ---------- 赛后复盘扩展区 (P1/P2): 四分解 + 逐笔配对 + 事实区, 数据来自 /game/{id}/recap ----------

// 带符号整数金额 (app.js 的全局 fmtMoney 是两位小数无符号版, 顶层同名会撞声明炸掉整个脚本)
const fmtSignedMoney = (v) => (Number(v) >= 0 ? "+" : "") + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

function renderBreakdown(r) {
  $("recap-breakdown").hidden = false;
  const segs = [
    ["bd-real", Number(r.realizedPnl)], ["bd-unreal", Number(r.unrealizedPnl)],
    ["bd-fee", -Number(r.feesTotal)], ["bd-int", Number(r.interestTotal)],
  ];
  // 四段彩条: 宽度 ∝ |金额| (全零则隐藏条, 只留数字)
  const total = segs.reduce((a, [, v]) => a + Math.abs(v), 0);
  const bar = $("recap-bd-bar");
  bar.innerHTML = "";
  bar.hidden = total <= 0;
  segs.forEach(([cls, v]) => {
    if (Math.abs(v) <= 0) return;
    const seg = document.createElement("i");
    seg.className = "bd-seg " + cls;
    seg.style.width = ((Math.abs(v) / total) * 100).toFixed(1) + "%";
    bar.appendChild(seg);
  });
  const set = (id, v) => {
    const el = $(id);
    el.textContent = fmtSignedMoney(v);
    el.className = Number(v) >= 0 ? "pos" : "neg";
  };
  set("recap-bd-realized", r.realizedPnl);
  set("recap-bd-unrealized", r.unrealizedPnl);
  set("recap-bd-fees", -Number(r.feesTotal)); // 费用恒为支出, 展示为负
  set("recap-bd-interest", r.interestTotal);
  $("recap-bd-conc").hidden = r.concentration == null;
  if (r.concentration != null) {
    $("recap-bd-conc-v").textContent = (Number(r.concentration) * 100).toFixed(0) + "%";
  }
}

function renderTradePairs(r) {
  const box = $("recap-trades-box");
  box.hidden = false;
  const statsEl = $("recap-tq-stats");
  if (!r.closedCount) {
    statsEl.textContent = t("recap.tq.none");
    $("recap-trades-table").hidden = true;
    return;
  }
  // 胜率/盈亏比 + 样本护栏: 不足 5 笔明说, 无亏损样本明说, 不编数字
  const plr = r.profitLossRatio != null ? Number(r.profitLossRatio).toFixed(2)
    : r.noLossSample ? t("recap.tq.noLoss") : "--";
  statsEl.textContent = t("recap.tq.line",
    (Number(r.tradeWinRate) * 100).toFixed(0) + "%", r.winCount, r.closedCount, plr)
    + (r.insufficientSample ? " " + t("recap.tq.insufficient", r.closedCount) : "");
  const table = $("recap-trades-table");
  table.hidden = false;
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";
  r.trades.forEach((ct) => {
    const tr = document.createElement("tr");
    const cls = Number(ct.pnl) >= 0 ? "pos" : "neg";
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td class="${cls}"></td>`;
    tr.children[0].textContent = t(ct.isLong ? "recap.tq.long" : "recap.tq.short");
    tr.children[1].textContent = String(ct.qty);
    tr.children[2].textContent = Number(ct.entryAvg).toFixed(2);
    tr.children[3].textContent = Number(ct.exitPrice).toFixed(2);
    tr.children[4].textContent = String(ct.holdDays);
    tr.children[5].textContent = fmtSignedMoney(ct.pnl);
    tbody.appendChild(tr);
  });
}

function renderFacts(r) {
  const box = $("recap-facts");
  const ul = $("recap-facts-list");
  ul.innerHTML = "";
  const facts = [];
  // 事实只陈述可复算数字 + 样本数; 样本 <3 降级为"样本不足"
  if (r.sellSamples >= 3) {
    facts.push(t("recap.fact.sellAfter", qsSignedPct(r.sellAfterAvgPct), r.sellSamples));
  } else if (r.sellSamples > 0) {
    facts.push(t("recap.fact.sellFew", r.sellSamples));
  }
  if (!facts.length) { box.hidden = true; return; }
  box.hidden = false;
  facts.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = f;
    ul.appendChild(li);
  });
}

async function renderRecapServer() {
  // 扩展区先藏后取: 旧局/接口失败时弹窗退回原有区块, 不留半截 UI
  $("recap-breakdown").hidden = true;
  $("recap-trades-box").hidden = true;
  $("recap-facts").hidden = true;
  const s = state.lastSettle;
  if (!s || !s.sessionId) return;
  let r;
  try { r = await api(`/game/${s.sessionId}/recap`); } catch (e) { return; }
  renderBreakdown(r);
  renderTradePairs(r);
  renderFacts(r);
}

function openRecap() {
  if (!state.lastSettle) return;
  $("recap-modal").hidden = false;
  document.body.style.overflow = "hidden";
  renderRecap();
  renderRecapServer();
}

function closeRecap() {
  $("recap-modal").hidden = true;
  document.body.style.overflow = "";
}

$("btn-recap").addEventListener("click", openRecap);
$("btn-recap-close").addEventListener("click", closeRecap);
qsModal("recap-modal", { onClose: closeRecap }); // 背板关闭走既有 closeRecap (恢复 body 滚动)
// 图表主题/尺寸由 qsChart 兜底; 语言切换还要重渲染列表/画像/日记等 DOM, 保留整体重绘
document.addEventListener("qs:lang", () => {
  if (!$("recap-modal").hidden) renderRecap();
});
