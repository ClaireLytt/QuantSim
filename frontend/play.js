// 对局视图 (play) 逻辑: 图表/交易/挂单/组合/结算/听盘 (架构评审⑤ 2026-10-25 自 app.js 拆出)。
// 加载序: 紧随 app.js 之后 (用其 $ / api / state / COLORS / qsChart / qsModal / guarded / playSound);
// mainChart 句柄定义在 app.js (导航层也用), 本文件通过全局名引用。
// 本文件内函数全部是事件回调里的惰性引用, 声明在哪不影响运行时解析。

// ---------- 图表 ----------

function chartData() {
  return {
    dates: state.klines.map((k) => k.tradeDate),
    candles: state.klines.map((k) => [k.open, k.close, k.low, k.high]),
    ma5: state.klines.map((k) => k.ma5),
    ma20: state.klines.map((k) => k.ma20),
    volumes: state.klines.map((k) => ({
      value: k.volume,
      itemStyle: { color: k.close >= k.open ? COLORS.up : COLORS.down, opacity: 0.55 },
    })),
    rsi: state.klines.map((k) => (k.rsi14 == null ? null : Number(k.rsi14))),
    macdHist: state.klines.map((k) => {
      if (k.macdDif == null || k.macdDea == null) return null;
      const h = Number(k.macdDif) - Number(k.macdDea);
      return { value: h, itemStyle: { color: h >= 0 ? COLORS.up : COLORS.down, opacity: 0.7 } };
    }),
    macdDif: state.klines.map((k) => (k.macdDif == null ? null : Number(k.macdDif))),
    macdDea: state.klines.map((k) => (k.macdDea == null ? null : Number(k.macdDea))),
  };
}

// K 线买卖点 + 涨跌停封板标记 (组合模式图表随标的切换, 不标交易点以免错位)
function buildKlineMarks() {
  const marks = [];
  if (state.mode !== "PORTFOLIO") {
    state.trades.forEach((tr) => {
      const buy = tr.dir === "BUY";
      marks.push({
        coord: [tr.idx, buy ? state.klines[tr.idx].low : state.klines[tr.idx].high],
        value: buy ? "B" : "S",
        symbol: "pin",
        symbolSize: 26,
        symbolRotate: buy ? 0 : 180,
        itemStyle: { color: buy ? COLORS.up : COLORS.down },
        label: { color: "#fff", fontSize: 11, offset: buy ? [0, 0] : [0, 2] },
      });
    });
  }
  // 结算后叠加 AI 的操作轨迹 (幽灵标记): 和你的 B/S 同图对照
  if (state.settled && state.mode !== "PORTFOLIO") {
    (state.aiMoves || []).forEach((m) => {
      if (m.idx == null || !state.klines[m.idx]) return;
      const buy = m.shares > 0;
      marks.push({
        coord: [m.idx, buy ? state.klines[m.idx].low : state.klines[m.idx].high],
        value: "AI",
        symbol: "circle",
        symbolSize: 16,
        symbolOffset: [0, buy ? 16 : -16],
        itemStyle: { color: buy ? COLORS.up : COLORS.down, opacity: 0.45 },
        label: { color: "#fff", fontSize: 8 },
      });
    });
  }
  if (state.market === "STOCK") {
    state.klines.forEach((k, i) => {
      const pct = k.pctChange == null ? null : Number(k.pctChange);
      if (pct == null || Math.abs(pct) < 0.0995) return;
      const up = pct > 0;
      marks.push({
        coord: [i, up ? k.high : k.low],
        value: t(up ? "chart.limitUp" : "chart.limitDown"),
        symbol: "rect",
        symbolSize: [30, 14],
        symbolOffset: [0, up ? -12 : 12],
        itemStyle: { color: "transparent" },
        label: { color: up ? COLORS.up : COLORS.down, fontSize: 10 },
      });
    });
  }
  return marks;
}

// 指标开关 (MA/MACD/RSI): 关掉的序列喂空数组, 结构不变只隐藏
const indShow = { ma: true, macd: true, rsi: true };
document.querySelectorAll(".ind-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    indShow[chip.dataset.ind] = !indShow[chip.dataset.ind];
    chip.classList.toggle("active", indShow[chip.dataset.ind]);
    if (state.sessionId) updateChartData();
  });
});

// tick 后只增量更新数据 (merge 模式), 不做整图重建
function updateChartData() {
  const c = mainChart.instance();
  if (!c) { renderChart(); return; } // 懒 init 尚未发生 (隐藏容器): 回退全量渲染
  const { dates, candles, ma5, ma20, volumes, rsi, macdHist, macdDif, macdDea } = chartData();
  c.setOption({
    xAxis: [{ data: dates }, { data: dates }, { data: dates }],
    series: [
      { data: candles, markPoint: { data: buildKlineMarks() } },
      { data: indShow.ma ? ma5 : [] },
      { data: indShow.ma ? ma20 : [] },
      { data: volumes },
      { data: indShow.macd ? macdHist : [] },
      { data: indShow.macd ? macdDif : [] },
      { data: indShow.macd ? macdDea : [] },
      { data: indShow.rsi ? rsi : [] },
    ],
  });
}

function renderChart() {
  mainChart.refresh();
}

// 主图完整 option (qsChart 的 buildOption; tick 增量路径见 updateChartData)
function buildChartOption() {
  const { dates, candles, ma5, ma20, volumes, rsi, macdHist, macdDif, macdDea } = chartData();

  return ({
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: COLORS.panel,
      borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      formatter(params) {
        const bar = state.klines[params[0].dataIndex];
        if (!bar) return "";
        const pct = bar.pctChange == null ? "--" : fmtPct(Number(bar.pctChange));
        const lines = [
          `<b>${bar.tradeDate}</b>`,
          `${t("chart.open")} ${bar.open}  ${t("chart.close")} ${bar.close}`,
          `${t("chart.low")} ${bar.low}  ${t("chart.high")} ${bar.high}`,
          `${t("chart.pct")} ${pct}`,
          `MA5 ${bar.ma5 ?? "--"}  MA20 ${bar.ma20 ?? "--"}`,
          `${t("chart.volume")} ${Number(bar.volume).toLocaleString()}`,
        ];
        if (bar.rsi14 != null) lines.push(`RSI ${Number(bar.rsi14).toFixed(1)}`);
        if (bar.macdDif != null && bar.macdDea != null) {
          lines.push(`DIF ${Number(bar.macdDif).toFixed(3)}  DEA ${Number(bar.macdDea).toFixed(3)}`);
        }
        return lines.join("<br>");
      },
    },
    legend: {
      data: [t("chart.kline"), "MA5", "MA20"],
      textStyle: { color: COLORS.muted },
      top: 0,
    },
    grid: [
      { left: 60, right: 44, top: 32, height: "44%" },
      { left: 60, right: 44, top: "56%", height: "10%" },
      { left: 60, right: 44, top: "70%", height: "16%" },
    ],
    xAxis: [
      {
        type: "category", data: dates, gridIndex: 0,
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { color: COLORS.muted },
      },
      {
        type: "category", data: dates, gridIndex: 1,
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { show: false },
      },
      {
        type: "category", data: dates, gridIndex: 2,
        axisLine: { lineStyle: { color: COLORS.border } },
        axisLabel: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true, gridIndex: 0,
        splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
        axisLabel: { color: COLORS.muted },
      },
      {
        gridIndex: 1,
        splitLine: { show: false },
        axisLabel: { show: false },
      },
      {
        // MACD 轴 (左): 与 RSI 共用副图网格
        scale: true, gridIndex: 2,
        splitLine: { show: false },
        axisLabel: { color: COLORS.muted, fontSize: 10 },
      },
      {
        // RSI 轴 (右): 固定 0~100, 画 30/70 参考区间
        min: 0, max: 100, gridIndex: 2, position: "right",
        splitLine: { show: false },
        axisLabel: { color: COLORS.muted, fontSize: 10 },
      },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, 2], start: 0, end: 100 },
      // 滑块主题化走共享口径 qsSliderZoom (app.js), 不再手搓 token 组合
      { ...qsSliderZoom(COLORS), xAxisIndex: [0, 1, 2], bottom: 0, height: 18 },
    ],
    series: [
      {
        name: t("chart.kline"),
        type: "candlestick",
        data: candles,
        // 上涨空心、下跌实心: 除颜色外的第二重涨跌编码
        itemStyle: {
          color: "transparent",
          color0: COLORS.down,
          borderColor: COLORS.up,
          borderColor0: COLORS.down,
          borderWidth: 1.5,
        },
        markLine: state.startDate ? {
          symbol: "none",
          label: { formatter: t("chart.start"), color: COLORS.muted },
          lineStyle: { color: COLORS.muted, type: "dashed" },
          data: [{ xAxis: state.startDate }],
        } : undefined,
        markPoint: { data: buildKlineMarks(), animation: false },
      },
      { name: "MA5", type: "line", data: ma5, smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: "MA20", type: "line", data: ma20, smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { name: t("chart.volume"), type: "bar", data: volumes, xAxisIndex: 1, yAxisIndex: 1, barWidth: "60%" },
      // 副图: MACD 柱 (DIF-DEA, 左轴) + DIF/DEA 线 + RSI14 (右轴 0~100)
      { name: "MACD", type: "bar", data: macdHist, xAxisIndex: 2, yAxisIndex: 2, barWidth: "50%" },
      { name: "DIF", type: "line", data: macdDif, xAxisIndex: 2, yAxisIndex: 2, showSymbol: false,
        lineStyle: { width: 1.5, color: COLORS.ma5 }, itemStyle: { color: COLORS.ma5 } },
      { name: "DEA", type: "line", data: macdDea, xAxisIndex: 2, yAxisIndex: 2, showSymbol: false,
        lineStyle: { width: 1.5, color: COLORS.ma20 }, itemStyle: { color: COLORS.ma20 } },
      { name: "RSI", type: "line", data: rsi, xAxisIndex: 2, yAxisIndex: 3, showSymbol: false,
        lineStyle: { width: 1.5, color: COLORS.accent2 }, itemStyle: { color: COLORS.accent2 },
        markLine: {
          symbol: "none", silent: true,
          label: { show: false },
          lineStyle: { color: COLORS.muted, type: "dotted", opacity: 0.6 },
          data: [{ yAxis: 30 }, { yAxis: 70 }],
        } },
    ],
  });
}

// ---------- 游戏流程 ----------

function renderStockLabel() {
  if (!state.stockName) return;
  const rules = state.realRules ? ` · ${t("real.tag")}` : "";
  const survival = state.mode === "SURVIVAL" ? ` · ${t("survival.tag")}` : "";
  $("stock-label").textContent = `${stockName(state.stockName, state.stockCode)} (${state.stockCode})${marketTag(state.market)}${rules}${survival}`;
}

function updateDayLabel() {
  $("day-label").textContent = t("session.day", state.daysElapsed, state.totalTicks);
}

function renderAiLevelLabel() {
  if (!state.aiLevel) { $("ai-level-label").textContent = ""; return; }
  // AI 对手拟人化: 每档难度一个人格名, 让"对手"有实体感
  const key = state.aiLevel.toLowerCase();
  $("ai-level-label").textContent = `${t("ai.persona." + key)} · ${t("ailevel." + key)}`;
}

// 头部不再放用户名输入框: 已登录用账户名, 游客自动生成持久昵称 (localStorage)
let guestNameCache = null; // 隐私模式下 localStorage 不可用时的进程内游客名
function currentUsername() {
  if (window.Auth && Auth.user) return Auth.user.username;
  let name = null;
  try { name = localStorage.getItem("qs_guest_name"); } catch (e) { /* 隐私模式下忽略 */ }
  if (!name) {
    // 隐私模式 setItem 会失败, 名字留在模块变量里复用——否则每次调用生成新昵称,
    // 同一局的预回测/提交会顶着两个身份 (身份碎片化)
    name = guestNameCache || t("guest.prefix") + Math.floor(1000 + Math.random() * 9000);
    guestNameCache = name;
    try { localStorage.setItem("qs_guest_name", name); } catch (e) { /* ignore */ }
  }
  return name;
}

// 行业筛选候选 (开局挑喜欢的行业), 启动时拉一次, 随市场选择联动过滤
let industryOptions = [];
async function loadIndustries() {
  try {
    industryOptions = await api("/game/industries");
    renderIndustryOptions();
  } catch (e) { /* 行业列表加载失败不影响开局 (退化为全部行业) */ }
}

function renderIndustryOptions() {
  const sel = $("industry-select");
  const market = $("market-select").value;
  const prev = sel.value;
  // 保留第一项「全部行业」, 其余按当前市场重建
  while (sel.options.length > 1) sel.remove(1);
  const seen = new Set();
  industryOptions
    .filter((o) => !market || o.market === market)
    .forEach((o) => {
      if (seen.has(o.industry)) return;
      seen.add(o.industry);
      const opt = document.createElement("option");
      opt.value = o.industry; // 发给后端的值保持原始中文
      opt.textContent = industryName(o.industry);
      sel.appendChild(opt);
    });
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

async function startGame(overrides) {
  const username = currentUsername();
  try {
    const market = $("market-select").value;
    const aiLevel = $("ai-level-select").value;
    const mode = $("mode-select").value;
    const advanced = $("adv-toggle").checked && (market === "US" || market === "CRYPTO");
    const realRules = $("real-toggle").checked && market === "STOCK";
    const body = { username, aiLevel, mode, advanced, realRules };
    if ($("constraint-select").value) body.maxTrades = parseInt($("constraint-select").value, 10);
    if ($("reason-toggle").checked) body.requireReason = true;
    if (market) body.market = market;
    if ($("industry-select").value) body.industry = $("industry-select").value;
    Object.assign(body, overrides || {}); // 熊市生存等特殊开局覆盖表单值
    const res = await api("/game/start", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await enterGame(res);
    toast(t("toast.gameStart", fmtMoney(res.initialCash), t("unit.money")));
  } catch (e) {
    toast(e.message);
  }
}

/** 用开局响应进入对局界面 (新局与房间/每日挑战接管共用)。 */
async function enterGame(res) {
    state.sessionId = res.sessionId;
    state.resumedSettled = res.status === "SETTLED";
    state.totalTicks = res.totalTicks;
    state.startDate = res.startDate;
    state.settled = false;
    state.lotSize = res.lotSize;
    state.stockName = res.stockName;
    state.stockCode = res.stockCode;
    state.market = res.market;
    state.aiLevel = res.aiLevel;
    state.mode = res.mode || "CLASSIC";
    state.advanced = !!res.advanced;
    state.realRules = !!res.realRules;
    state.maxTrades = res.maxTrades == null ? null : Number(res.maxTrades);
    state.requireReason = !!res.requireReason;
    state.tradesRemaining = state.maxTrades;
    $("trade-reason-wrap").hidden = !state.requireReason;
    $("trade-reason").value = "";
    renderTradesLeft();
    state.stocks = res.stocks || [];
    state.activeStock = res.stockCode;
    state.orders = [];
    state.daysElapsed = 0;
    state.lastStatus = null;
    state.lastSettle = null;
    state.trades = [];
    state.aiMoves = [];
    // 隐藏机制 (hidden.js) 的会话上下文: 道具使用/强平/HIGH 级事件见闻
    state.itemUsed = false;
    state.wasLiquidated = false;
    state.newsHigh = [];
    document.dispatchEvent(new CustomEvent("qs:gameStart"));
    state.autoStrat = null;
    state._autoReason = null;
    renderStratActive();
    renderTradeLog();
    renderRecapFab();
    $("ai-moves-box").hidden = true;
    $("ai-moves").innerHTML = "";
    $("t1-hint").hidden = true;
    $("settle-curve-box").hidden = true;
    // 新对局重置快讯决策门, 否则上一局的拦截记录会让新局同天数时漏弹一次
    newsGateDay = -1;

    switchView("game");
    setHeaderFold(true); // 开局即进入专注模式 (switchView 时 sessionId 可能尚未就位)
    $("game-intro").hidden = true;
    $("game-area").hidden = false;
    // 容器刚从 hidden 解除: 重 refresh 让 qsChart 补画/校正 (懒 init 场景即首画)
    renderChart();
    $("settle-card").hidden = true;
    renderStockLabel();
    updateDayLabel();
    renderAiLevelLabel();
    const reviewBox = $("review-text");
    reviewBox.hidden = true;
    reviewBox.textContent = "";
    $("btn-review").hidden = true;
    $("btn-recap").hidden = true;
    const sharesInput = $("trade-shares");
    sharesInput.step = res.lotSize;
    sharesInput.min = res.lotSize;
    sharesInput.value = res.lotSize;
    const advisorBox = $("advisor-text");
    advisorBox.hidden = true;
    advisorBox.textContent = "";
    if (window.qsResetAdvisorChat) window.qsResetAdvisorChat();
    setTradeEnabled(true);
    renderPfTabs();
    $("orders-card").hidden = false;
    renderOrders();
    $("news-banner").hidden = true;

    await loadHistory();
    await refreshStatus();
    await loadOrders();
    if (state.resumedSettled) {
      // 回看已结算的房间/每日对局: 只读, 不开交易
      state.settled = true;
      setTradeEnabled(false);
      toast(t("toast.resumedSettled"));
    }
}
window.qsEnterGame = enterGame;
// 新手 90 秒浓缩局 (首页首访入口): 短局 + 温和股票 + 简单 AI + 买卖各一次的笔数预算
window.qsStartIntro = () => startGame({ mode: "INTRO", aiLevel: "EASY", maxTrades: 2, market: "" });

async function loadHistory() {
  const q = state.mode === "PORTFOLIO" && state.activeStock
    ? `?stockCode=${encodeURIComponent(state.activeStock)}` : "";
  const res = await api(`/game/${state.sessionId}/history${q}`);
  state.klines = res.klines;
  renderChart();
  updateSessionBar(res.currentTradeDate);
  syncTradeInputs();
}

async function tick() {
  try {
    const res = await api(`/game/${state.sessionId}/tick`, { method: "POST" });
    if (state.mode === "PORTFOLIO") {
      // 组合模式一次推进影响三只标的, 直接整段重载当前标的
      await loadHistory();
    } else {
      sonifyBar(state.klines[state.klines.length - 1], res.newBar); // 听盘: 新 K 线奏一个音
      state.klines.push(res.newBar);
      updateChartData();
    }
    updateSessionBar(res.currentTradeDate, res.daysElapsed);
    syncTradeInputs();
    // 后端已内嵌账户快照, 无需再请求 /status
    renderStatus(res.status);
    // 今日隔夜利息后缀: 让"现金也在工作/杠杆在烧钱"可见 (为 0 或未计息时不加噪音)
    if (res.interestToday != null && Number(res.interestToday) !== 0) {
      const iv = Number(res.interestToday);
      $("st-interest").textContent += " " + t("game.interestToday",
        (iv > 0 ? "+" : "-") + fmtMoney(Math.abs(iv)));
    }
    aiTrashTalk(res.status);
    (res.filledOrders || []).forEach((f) => {
      toast(t("orders.filled", t(ORDER_TYPE_KEY[f.orderType] || f.orderType), f.shares, fmtMoney(f.price)));
      // 挂单成交也计入成交标记/复盘 (成交日 = 刚揭晓的这根 K 线)
      const idx = state.klines.length - 1;
      state.trades.push({
        idx, date: state.klines[idx].tradeDate,
        dir: f.orderType === "LIMIT_BUY" ? "BUY" : "SELL",
        price: Number(f.price), shares: f.shares,
        reason: f.reason || t("gs.fillReason"), // 优先还原下单时写的理由
      });
    });
    recordAiMove(res.daysElapsed, res.aiTradeShares);
    if (state.mode !== "PORTFOLIO") updateChartData();
    if ((res.filledOrders || []).length) playSound("fill");
    if (res.autoCancelledOrders > 0) toast(t("orders.autoCancelled"));
    if ((res.filledOrders || []).length || res.autoCancelledOrders > 0 || state.orders.length) loadOrders();
    if (res.liquidated) { toast(t("adv.liquidated")); flashScreen(); playSound("lose"); state.wasLiquidated = true; }
    if (res.news && res.news.length && window.qsShowNews) window.qsShowNews(res.news, res.daysElapsed);
    // 历史回声印章 (hidden.js): 只记 HIGH 级大事件
    (res.news || []).forEach((n) => {
      if (n.severity === "HIGH") (state.newsHigh = state.newsHigh || []).push({ zh: n.titleZh, en: n.titleEn });
    });
    renderTradeLog();
    if (!res.settled) document.dispatchEvent(new CustomEvent("qs:tick", { detail: { status: res.status } }));
    if (res.settled) {
      showSettle(res.settleResult);
    } else {
      await maybeAutoTrade(); // 导入策略的自动执行: 新 K 线揭晓后判定信号
    }
  } catch (e) {
    toast(e.message);
  }
}

// AI 实时垃圾话: 按领先/落后/胶着三种战况随机冒泡, 3 天冷却防刷屏
let lastTauntDay = -9;
let bubbleTimer = null;
function aiTrashTalk(s) {
  if (!s || !s.ai || state.settled) return;
  if (state.daysElapsed - lastTauntDay < 3 || Math.random() > 0.5) return;
  const you = Number(s.returnRate);
  const ai = Number(s.ai.returnRate);
  const cat = ai - you > 0.02 ? "lead" : you - ai > 0.02 ? "behind" : "flat";
  lastTauntDay = state.daysElapsed;
  const persona = t("ai.persona." + (state.aiLevel || "NORMAL").toLowerCase());
  const bubble = $("ai-bubble");
  bubble.textContent = `${persona}: ${t("ai.live." + cat + "." + Math.floor(Math.random() * 3))}`;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 5000);
}

// AI 操作时间线: 只记有动作的日子 (正=买, 负=卖), 最新在最上
function recordAiMove(day, shares) {
  if (!shares) return;
  state.aiMoves = state.aiMoves || [];
  state.aiMoves.unshift({ day, shares, idx: state.klines.length - 1 });
  if (state.aiMoves.length > 20) state.aiMoves.pop();
  renderAiMoves();
}

function renderAiMoves() {
  const box = $("ai-moves-box");
  const list = $("ai-moves");
  const moves = state.aiMoves || [];
  box.hidden = moves.length === 0;
  list.innerHTML = "";
  moves.forEach((m) => {
    const li = document.createElement("li");
    li.className = m.shares > 0 ? "pos" : "neg";
    li.textContent = t(m.shares > 0 ? "ai.move.buy" : "ai.move.sell", m.day, Math.abs(m.shares));
    list.appendChild(li);
  });
}

/** 限制条件: 剩余可交易笔数提示 (无上限隐藏) */
function renderTradesLeft() {
  const el = $("trades-left");
  if (state.maxTrades == null) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = t("game.tradesLeft", state.tradesRemaining, state.maxTrades);
  el.classList.toggle("neg", Number(state.tradesRemaining) <= 0);
}

async function trade(direction) {
  const price = parseFloat($("trade-price").value);
  const shares = parseInt($("trade-shares").value, 10);
  if (!price || !shares || shares <= 0) {
    toast(t("toast.invalidTrade"));
    return false;
  }
  if (shares % state.lotSize !== 0) {
    toast(t("toast.lotMultiple", state.lotSize));
    return false;
  }
  try {
    const body = { direction, price, shares };
    if (state.requireReason) {
      const reason = $("trade-reason").value.trim();
      if (!reason) {
        toast(t("trade.reason.required"));
        return false;
      }
      body.reason = reason;
    } else if (state._autoReason) {
      body.reason = state._autoReason; // 策略自动单的日志理由
    }
    if (state.mode === "PORTFOLIO" && state.activeStock) body.stockCode = state.activeStock;
    const res = await api(`/game/${state.sessionId}/trade`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    // 复盘报告需要在前端记录每笔成交对应的 K 线位置
    const idx = state.klines.length - 1;
    state.trades.push({ idx, date: state.klines[idx].tradeDate, dir: direction, price, shares,
      reason: body.reason || "" });
    renderTradeLog();
    if (state.mode !== "PORTFOLIO") updateChartData(); // 买卖点即时上图
    playSound(direction === "BUY" ? "buy" : "sell");
    $("trade-reason").value = "";
    if (res.tradesRemaining != null) {
      state.tradesRemaining = Number(res.tradesRemaining);
      renderTradesLeft();
    }
    let msg = t(direction === "BUY" ? "toast.buyOk" : "toast.sellOk", shares);
    if (res.fee && Number(res.fee) > 0) msg += " · " + t("trade.fee", fmtMoney(res.fee));
    toast(msg);
    await refreshStatus();
    return true; // 调用方 (自动策略) 需要知道这单到底成没成
  } catch (e) {
    toast(e.message);
    // 隐藏机制 #9 (排队文化) 监听拒单文案
    document.dispatchEvent(new CustomEvent("qs:tradeRejected", { detail: e.message }));
    return false;
  }
}

// ---------- 从研究所导入策略: 经典策略信号 + 可选自动执行 ----------
// 信号按已揭晓 K 线计算 (收盘价成交, 与手动交易同规则), 不碰未来数据。
const STRATS = {
  golden: {
    signal(k) {
      const n = k.length;
      if (n < 2) return null;
      const [p, c] = [k[n - 2], k[n - 1]];
      if (p.ma5 == null || p.ma20 == null || c.ma5 == null || c.ma20 == null) return null;
      if (Number(p.ma5) <= Number(p.ma20) && Number(c.ma5) > Number(c.ma20)) return "BUY";
      if (Number(p.ma5) >= Number(p.ma20) && Number(c.ma5) < Number(c.ma20)) return "SELL";
      return null;
    },
  },
  momentum: {
    signal(k) {
      const n = k.length;
      if (n < 11) return null;
      const r = Number(k[n - 1].close) / Number(k[n - 11].close) - 1;
      if (r > 0.02) return "BUY";
      if (r < -0.02) return "SELL";
      return null;
    },
  },
  meanrev: {
    signal(k) {
      const c = k[k.length - 1];
      if (c.ma20 == null) return null;
      const ratio = Number(c.close) / Number(c.ma20);
      if (ratio < 0.95) return "BUY";
      if (ratio > 1.05) return "SELL";
      return null;
    },
  },
};

function renderStratActive() {
  const p = $("strat-active");
  if (!state.autoStrat) {
    p.hidden = true;
    return;
  }
  p.hidden = false;
  p.textContent = t("gs.active", t("gs.strat." + state.autoStrat.id),
    t(state.autoStrat.auto ? "gs.autoOn" : "gs.autoOff"));
}

async function maybeAutoTrade() {
  const st = state.autoStrat;
  if (!st || !st.auto || state.settled || state.mode === "PORTFOLIO" || !state.lastStatus) return;
  const dir = STRATS[st.id].signal(state.klines);
  if (!dir) return;
  const s = state.lastStatus;
  const price = Number(state.klines[state.klines.length - 1].close);
  if (!(price > 0)) return; // 零价/异常行情防护: 否则 cash/price 得 Infinity -> shares NaN (后端已防, 前端同守)
  const lot = state.lotSize || 1;
  let shares;
  if (dir === "BUY") {
    // 留 0.5% 现金做手续费余量, 否则满仓单会被后端"现金不足"拒掉
    shares = Math.floor(Number(s.cashBalance) * 0.995 / price / lot) * lot;
  } else {
    // T+1 下只卖可卖部分, 避免整单被拒
    shares = s.sellableShares != null ? Number(s.sellableShares) : s.holdingShares;
  }
  if (shares < lot) return; // 买不起一手 / 没有可卖持仓, 本日信号作罢
  // trade() 读的是表单, 自动单只好借道输入框 —— 先快照用户手填的值, 打完恢复,
  // 否则自动单失败后用户下一次手动点买入会静默带上自动单的数量
  const prevShares = $("trade-shares").value;
  const prevReason = $("trade-reason").value;
  $("trade-shares").value = String(shares);
  state._autoReason = t("gs.autoReason", t("gs.strat." + st.id));
  // 交易日志模式: trade() 的强制理由分支只读输入框, 自动单必须把理由写进去, 否则被"请写理由"拦下
  if (state.requireReason) $("trade-reason").value = state._autoReason;
  try {
    const ok = await trade(dir);
    // trade() 内部吞错并 toast 失败原因, 成功才报"信号触发", 别给用户虚假成交
    if (ok) toast(t("gs.sigFired", t("gs.strat." + st.id), t(dir === "BUY" ? "trade.buy" : "trade.sell")));
  } finally {
    state._autoReason = null;
    $("trade-shares").value = prevShares;
    $("trade-reason").value = prevReason;
  }
}

const stratModal = qsModal("strat-modal", { closeBtnId: "btn-strat-close" });
$("btn-import-strat").addEventListener("click", stratModal.open);
document.querySelectorAll(".strat-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.autoStrat = { id: btn.dataset.strat, auto: $("strat-auto").checked };
    $("strat-modal").hidden = true;
    renderStratActive();
    toast(t("gs.imported", t("gs.strat." + state.autoStrat.id)));
    playSound("fill");
  });
});
$("strat-active").addEventListener("click", () => {
  // 点一下激活提示即停用 (再导入即恢复)
  state.autoStrat = null;
  renderStratActive();
  toast(t("gs.stopped"));
});

// ---------- 右下角悬浮复盘按钮: 结算后出现, 直达本局复盘报告 ----------
function renderRecapFab() {
  $("btn-recap-fab").hidden = !(currentView === "game" && state.settled && state.lastSettle);
}
$("btn-recap-fab").addEventListener("click", () => openRecap());
document.addEventListener("qs:view", renderRecapFab);

async function settle() {
  try {
    const res = await api(`/game/${state.sessionId}/settle`, { method: "POST" });
    showSettle(res);
  } catch (e) {
    toast(e.message);
  }
}

async function askReview() {
  const btn = $("btn-review");
  const box = $("review-text");
  btn.disabled = true;
  box.hidden = false;
  box.textContent = t("review.thinking");
  try {
    const res = await api(`/game/${state.sessionId}/review?lang=${LANG}`, { method: "POST" });
    box.textContent = res.advice;
  } catch (e) {
    box.hidden = true;
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function refreshStatus() {
  renderStatus(await api(`/game/${state.sessionId}/status`));
}

// ---------- 左栏: 账户面板 + 持仓列表 (数据与账户弹窗同源, 常驻展示) ----------
function renderGameLeft(s) {
  $("ga-total").textContent = fmtMoney(s.totalAssets);
  $("ga-cash").textContent = fmtMoney(s.cashBalance);
  $("ga-mv").textContent = fmtMoney(s.marketValue);
  setSigned($("ga-pnl"), Number(s.floatingPnl), fmtMoney(Math.abs(s.floatingPnl)));
  setSigned($("ga-ret"), Number(s.returnRate), fmtPct(Number(s.returnRate)));
  const ul = $("ga-pos");
  ul.innerHTML = "";
  const rows = s.positions && s.positions.length
    ? s.positions.filter((p) => p.shares > 0).map((p) => ({
        name: stockName(p.stockName, p.stockCode), shares: p.shares,
        cost: p.avgCost, price: p.price,
        pnl: (Number(p.price) - Number(p.avgCost)) * p.shares,
      }))
    : (s.holdingShares > 0 ? [{
        name: stockName(state.stockName, state.stockCode), shares: s.holdingShares,
        cost: s.holdingCost, price: s.currentPrice,
        pnl: Number(s.floatingPnl),
      }] : []);
  $("ga-pos-empty").hidden = !!rows.length;
  rows.forEach((r) => {
    const li = document.createElement("li");
    const name = document.createElement("b");
    name.textContent = r.name;
    const meta = document.createElement("span");
    meta.className = "hint";
    meta.textContent = `${r.shares} @ ${fmtMoney(r.cost)} → ${fmtMoney(r.price)}`;
    const pnl = document.createElement("i");
    setSigned(pnl, r.pnl, fmtMoney(Math.abs(r.pnl)));
    li.append(name, meta, pnl);
    ul.appendChild(li);
  });
}

// ---------- 成交明细 (图下) 与交易日志 (右栏, 带理由) ----------
function renderTradeLog() {
  const fills = $("game-trades");
  const journal = $("journal-list");
  fills.innerHTML = "";
  journal.innerHTML = "";
  const list = [...state.trades].slice(-30).reverse();
  $("game-trades-card").hidden = !list.length;
  $("journal-card").hidden = !list.length;
  list.forEach((tr) => {
    const dirTxt = t(tr.dir === "BUY" ? "trade.buy" : "trade.sell");
    const cls = tr.dir === "BUY" ? "pos" : "neg";
    const li = document.createElement("li");
    const d = document.createElement("i");
    d.textContent = tr.date;
    const b = document.createElement("b");
    b.className = cls;
    b.textContent = dirTxt;
    const detail = document.createElement("span");
    detail.textContent = `${tr.shares} @ ${fmtMoney(tr.price)}`;
    li.append(d, b, detail);
    fills.appendChild(li);

    const lj = document.createElement("li");
    const d2 = document.createElement("i");
    d2.textContent = tr.date;
    const b2 = document.createElement("b");
    b2.className = cls;
    b2.textContent = dirTxt;
    const why = document.createElement("span");
    why.textContent = tr.reason || t("gs.noReason");
    lj.append(d2, b2, why);
    journal.appendChild(lj);
  });
}

function renderStatus(s) {
  state.lastStatus = s;
  $("st-cash").textContent = fmtMoney(s.cashBalance);
  $("st-shares").textContent = s.holdingShares;
  $("st-cost").textContent = fmtMoney(s.holdingCost);
  $("st-price").textContent = fmtMoney(s.currentPrice);
  $("st-value").textContent = fmtMoney(s.marketValue);
  $("st-total").textContent = fmtMoney(s.totalAssets);
  setSigned($("st-pnl"), Number(s.floatingPnl), fmtMoney(Math.abs(s.floatingPnl)));
  setSigned($("st-return"), Number(s.returnRate), fmtPct(Number(s.returnRate)));
  // 左上角账户按钮实时显示总资产, 不点开也能瞄一眼
  $("status-pop-label").textContent = fmtMoney(s.totalAssets) + t("unit.money");
  $("st-fees").textContent = fmtMoney(s.feesPaid || 0);
  setSigned($("st-interest"), Number(s.interestTotal || 0), fmtMoney(Math.abs(s.interestTotal || 0)));
  // 剩余笔数以服务端为准: 刷新/续局时本地从满额起算会虚高, 挂单成交也只有服务端知道
  if (s.tradesRemaining != null) {
    state.tradesRemaining = Number(s.tradesRemaining);
    renderTradesLeft();
  }
  renderGameLeft(s);
  // 真实规则: 提示 T+1 今日可卖数, 免得玩家靠报错试探
  const t1 = $("t1-hint");
  if (s.sellableShares != null) {
    t1.hidden = false;
    t1.textContent = t("trade.t1Hint", s.sellableShares);
  } else {
    t1.hidden = true;
  }
  renderPositions(s.positions);
  state.daysElapsed = s.daysElapsed;
  state.totalTicks = s.totalTicks;
  updateDayLabel();
  renderAi(s.prediction, s.ai);
}

function renderAi(pred, ai) {
  const dir = $("ai-pred-dir");
  const fill = $("ai-conf-fill");
  const text = $("ai-conf-text");
  if (pred) {
    const up = pred.direction === "UP";
    const prob = Number(pred.probUp);
    dir.textContent = up ? t("ai.up") : t("ai.down");
    dir.className = up ? "pos" : "neg";
    const conf = up ? prob : 1 - prob;
    fill.style.width = (conf * 100).toFixed(1) + "%";
    fill.style.background = up ? COLORS.up : COLORS.down;
    // 置信度是可点击的名词解释
    text.innerHTML = termSpan("confidence") + t("ai.conf", (conf * 100).toFixed(1), (prob * 100).toFixed(1));
  } else {
    dir.textContent = "--";
    dir.className = "";
    fill.style.width = "0";
    text.textContent = t("ai.noPred");
  }
  if (ai) {
    $("ai-total").textContent = fmtMoney(ai.totalAssets);
    $("ai-shares").textContent = ai.shares;
    setSigned($("ai-return"), Number(ai.returnRate), fmtPct(Number(ai.returnRate)));
  } else {
    $("ai-total").textContent = "--";
    $("ai-shares").textContent = "--";
    const ret = $("ai-return");
    ret.textContent = "--";
    ret.className = "";
  }
}

function setSigned(el, value, text) {
  el.textContent = (value > 0 ? "+" : value < 0 ? "-" : "") + text.replace(/^[+-]/, "");
  el.className = value > 0 ? "pos" : value < 0 ? "neg" : "";
}

function updateSessionBar(currentDate, daysElapsed) {
  $("date-label").textContent = currentDate;
  if (daysElapsed != null) {
    state.daysElapsed = daysElapsed;
    updateDayLabel();
  }
}

function syncTradeInputs() {
  const last = state.klines[state.klines.length - 1];
  if (last) {
    // 手动交易只按当日收盘价成交 (后端强校验, 防低买高卖套利), 输入框只读展示
    $("trade-price").value = last.close;
    $("price-range").textContent = t("trade.range", last.close);
  }
}

// ---------- 组合模式: 标的切换与持仓明细 ----------

function renderPfTabs() {
  const wrap = $("pf-tabs");
  const isPf = state.mode === "PORTFOLIO" && state.stocks.length > 1;
  wrap.hidden = !isPf;
  wrap.innerHTML = "";
  if (!isPf) return;
  state.stocks.forEach((st) => {
    const b = document.createElement("button");
    b.className = "pf-tab" + (st.code === state.activeStock ? " active" : "");
    b.textContent = stockName(st.name, st.code);
    b.addEventListener("click", () => guarded(async () => {
      state.activeStock = st.code;
      renderPfTabs();
      await loadHistory();
    }));
    wrap.appendChild(b);
  });
}

function renderPositions(positions) {
  const box = $("pf-positions");
  if (!positions || !positions.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  // 名称类字符串一律 textContent 后赋 (全站 XSS 纪律), innerHTML 里只留数字/i18n 文案
  const rows = positions.map((p) => {
    const shares = Number(p.shares);
    return `<tr><td></td>
      <td class="${shares < 0 ? "neg" : ""}">${shares}</td>
      <td>${fmtMoney(p.avgCost)}</td><td>${fmtMoney(p.marketValue)}</td></tr>`;
  }).join("");
  box.innerHTML = `<table><thead><tr><th>${t("lb.stock")}</th><th>${t("status.shares")}</th>
    <th>${t("status.cost")}</th><th>${t("status.value")}</th></tr></thead><tbody>${rows}</tbody></table>`;
  box.querySelectorAll("tbody tr").forEach((tr, i) => {
    tr.children[0].textContent = stockName(positions[i].stockName, positions[i].stockCode);
  });
  renderPfPie(positions);
  renderPfCorr(positions);
}

// 组合权重饼图: 看资金有没有押在一个篮子里 (含现金一片)
let lastPfHeld = null; // buildOption 的数据源 (renderPfPie 过滤后的持仓)
const pfPieH = qsChart("pf-pie", () => {
  if (!lastPfHeld || !lastPfHeld.length) return null;
  const cash = state.lastStatus ? Math.max(0, Number(state.lastStatus.cashBalance)) : 0;
  const data = lastPfHeld.map((p) => ({ name: stockName(p.stockName, p.stockCode), value: Number(p.marketValue) }));
  if (cash > 0) data.push({ name: t("status.cash"), value: cash });
  return {
    backgroundColor: "transparent",
    tooltip: { valueFormatter: (v) => fmtMoney(v) + t("unit.money") },
    series: [{ type: "pie", radius: ["38%", "68%"],
      label: { color: COLORS.muted, fontSize: 11, formatter: "{b}\n{d}%" },
      itemStyle: { borderColor: COLORS.panel, borderWidth: 2 },
      color: [COLORS.accent, COLORS.accent2, COLORS.ma5, COLORS.muted, COLORS.ma20],
      data }],
  };
});
function renderPfPie(positions) {
  const el = $("pf-pie");
  const held = positions.filter((p) => Number(p.marketValue) > 0);
  if (!held.length) { el.hidden = true; lastPfHeld = null; return; }
  el.hidden = false;
  lastPfHeld = held;
  pfPieH.refresh();
}

// 两两相关性提示: 三只都涨跌同步 ≈ 只买了一只 (竞技模式组合不开放, 代码可直查 lab 历史)
let pfCorrCache = null;
async function renderPfCorr(positions) {
  const el = $("pf-corr");
  const codes = (state.stocks || []).map((s) => s.code).filter((c) => c && c !== "???");
  if (codes.length < 2) { el.hidden = true; return; }
  try {
    if (!pfCorrCache || pfCorrCache.key !== codes.join(",")) {
      const hists = await Promise.all(codes.map((c) => api("/lab/history/" + encodeURIComponent(c))));
      pfCorrCache = { key: codes.join(","), hists };
    }
    const rets = pfCorrCache.hists.map((h) => {
      const closes = h.close.slice(-60).map(Number);
      return closes.slice(1).map((c, i) => c / closes[i] - 1);
    });
    let maxCorr = -1;
    let pair = ["", ""];
    for (let i = 0; i < rets.length; i++) {
      for (let j = i + 1; j < rets.length; j++) {
        const n = Math.min(rets[i].length, rets[j].length);
        const a = rets[i].slice(-n);
        const b = rets[j].slice(-n);
        const ma = a.reduce((x, y) => x + y, 0) / n;
        const mb = b.reduce((x, y) => x + y, 0) / n;
        let cov = 0, va = 0, vb = 0;
        for (let k = 0; k < n; k++) { cov += (a[k] - ma) * (b[k] - mb); va += (a[k] - ma) ** 2; vb += (b[k] - mb) ** 2; }
        const corr = cov / Math.sqrt(va * vb || 1);
        if (corr > maxCorr) { maxCorr = corr; pair = [codes[i], codes[j]]; }
      }
    }
    el.hidden = false;
    el.textContent = maxCorr > 0.7
      ? t("pf.corrHigh", pair[0], pair[1], maxCorr.toFixed(2))
      : t("pf.corrOk", maxCorr.toFixed(2));
  } catch (e) { el.hidden = true; }
}

// ---------- 挂单面板 ----------

const ORDER_TYPE_KEY = {
  LIMIT_BUY: "orders.limitBuy",
  LIMIT_SELL: "orders.limitSell",
  STOP_LOSS: "orders.stopLoss",
  TAKE_PROFIT: "orders.takeProfit",
  TRAIL_STOP: "orders.trailStop",
};

async function loadOrders() {
  if (!state.sessionId) return;
  try {
    state.orders = await api(`/game/${state.sessionId}/orders`);
    renderOrders();
  } catch (e) { /* 挂单列表失败不打断游戏 */ }
}

function renderOrders() {
  const ul = $("orders-list");
  ul.innerHTML = "";
  const open = state.orders.filter((o) => o.status === "OPEN");
  if (!open.length) {
    const li = document.createElement("li");
    li.textContent = t("orders.empty");
    ul.appendChild(li);
    return;
  }
  open.forEach((o) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${t(ORDER_TYPE_KEY[o.orderType] || o.orderType)} ${o.shares} @ ${fmtMoney(o.triggerPrice)}`
      + (o.trailPct != null ? ` (${Number(o.trailPct)}%)` : "");
    const btn = document.createElement("button");
    btn.className = "ghost order-cancel";
    btn.textContent = t("orders.cancel");
    btn.addEventListener("click", () => guarded(async () => {
      try {
        state.orders = await api(`/game/${state.sessionId}/orders/${o.orderId}/cancel`, { method: "POST" });
        renderOrders();
        toast(t("orders.cancelled"));
      } catch (e) { toast(e.message); }
    }));
    li.appendChild(label);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function placeOrder() {
  const orderType = $("order-type").value;
  const trailing = orderType === "TRAIL_STOP";
  // 移动止损不填触发价 (后端按当日收盘与跟踪距离推出), price 仅占位
  const price = trailing
    ? Number(state.lastStatus?.currentPrice || 1)
    : parseFloat($("order-price").value);
  const shares = parseInt($("order-shares").value, 10);
  const trailPct = parseFloat($("order-trail").value);
  if (!price || !shares || shares <= 0 || (trailing && !(trailPct >= 1 && trailPct <= 30))) {
    toast(t("toast.invalidTrade"));
    return;
  }
  try {
    const body = { orderType, price, shares };
    if (trailing) body.trailPct = trailPct;
    // 交易日志模式: 挂单同样强制写理由 (复用手动交易的理由输入框), 成交时随流水落库
    if (state.requireReason) {
      const reason = $("trade-reason").value.trim();
      if (!reason) {
        toast(t("trade.reason.required"));
        return;
      }
      body.reason = reason;
    }
    if (state.mode === "PORTFOLIO" && state.activeStock) body.stockCode = state.activeStock;
    await api(`/game/${state.sessionId}/orders`, { method: "POST", body: JSON.stringify(body) });
    toast(t("orders.placed"));
    $("order-price").value = "";
    $("trade-reason").value = "";
    await loadOrders();
  } catch (e) {
    toast(e.message);
  }
}

function showSettle(result) {
  state.settled = true;
  setTradeEnabled(false);
  renderRecapFab();
  setHeaderFold(false); // 结算即退出专注模式, 导航回来 (下一步通常是看榜/再来一局)
  if (state.mode !== "PORTFOLIO") updateChartData(); // 幽灵标记 (AI 轨迹) 上图
  renderSettle(result);
  revealMysteryStock(result);
  celebrateSettle(result);
  openSettlePop(result); // 结算卡在右栏底部, 不弹窗玩家经常根本看不到结果
  toast(t("settle.done"));
  loadLeaderboard();
  // 开局配置卡已下沉进对局页: 结算后把它请回来, 否则"再来一局"无门 (之前它常驻页头不存在这个问题)
  $("game-intro").hidden = false;
  // 新手浓缩局打完: 落标记 (首页据此收起 90 秒入口), 弹提示指回茶室全貌
  if (state.mode === "INTRO") {
    try { localStorage.setItem("qs_intro_done", "1"); } catch (e) { /* 隐私模式下忽略 */ }
    toast(t("intro.done"));
    document.dispatchEvent(new CustomEvent("qs:introdone"));
  }
  document.dispatchEvent(new CustomEvent("qs:settled", { detail: result }));
  // 生涯考核判定行: 事件先分发 (career 在 handle 里记录本局判定), 再回读展示 ✓/✗
  if (window.qsCareerSettleExam) {
    const ex = qsCareerSettleExam();
    const el = $("settle-pop-exam");
    el.hidden = !ex;
    if (ex) {
      el.textContent = t(ex.passed ? "career.examPass" : "career.examFail", ex.goal);
      el.classList.toggle("pos", ex.passed);
      el.classList.toggle("neg", !ex.passed);
    }
  }
}

// PWA: 注册极简 Service Worker (网络优先, 不缓存 API), 让站点可安装
// (顶层执行: 之前误嵌在 showSettle 里, 变成"结算过才可安装")
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* 不支持/失败不影响使用 */ });
}

// ---------- 结算总结弹窗: 关键结果即时呈现, 详情/复盘一键直达 ----------

function openSettlePop(result) {
  const ret = Number(result.returnRate);
  const retEl = $("settle-pop-return");
  retEl.textContent = fmtPct(ret);
  retEl.className = ret >= 0 ? "pos" : "neg";
  // 判词复用结算卡的口径 (renderSettle 已先行渲染, 含生存模式覆盖)
  const verdict = $("settle-verdict");
  $("settle-pop-verdict").textContent = verdict.textContent;
  $("settle-pop-verdict").className = verdict.className;
  // 竞技局的悬念时刻: 在这里揭晓神秘标的
  let stockLine = result.stockName
    ? t("settle.pop.stock", result.stockName, result.stockCode) : "";
  if (result.eventReveal) {
    stockLine = (LANG === "en" ? result.eventReveal.nameEn : result.eventReveal.nameZh)
      + (stockLine ? " · " + stockLine : "");
  }
  $("settle-pop-stock").textContent = stockLine;
  const pts = Number(result.pointsEarned || 0);
  $("settle-pop-points").hidden = pts <= 0;
  if (pts > 0) $("settle-pop-points").textContent = t("settle.pop.points", pts);
  $("settle-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

const settleModal = qsModal("settle-modal", {
  closeBtnId: "btn-settle-pop-close",
  onClose: () => { document.body.style.overflow = ""; }, // 弹窗锁滚动, 关时恢复
});
function closeSettlePop() { settleModal.close(); } // Esc 分发与「查看详情」仍走此口
$("btn-settle-pop-detail").addEventListener("click", () => {
  closeSettlePop();
  $("settle-card").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("btn-settle-pop-recap").addEventListener("click", () => {
  closeSettlePop();
  openRecap();
});

function renderSettle(result) {
  state.lastSettle = result;
  $("settle-card").hidden = false;
  $("settle-initial").textContent = fmtMoney(result.initialCash) + t("unit.money");
  $("settle-final").textContent = fmtMoney(result.finalAssets) + t("unit.money");
  // 累计利息为 0 (未开计息或全程满仓) 时不展示, 避免噪音
  const interest = Number(result.interestTotal || 0);
  $("settle-interest").hidden = interest === 0;
  if (interest !== 0) {
    const vEl = $("settle-interest-val");
    vEl.textContent = (interest > 0 ? "+" : "-") + fmtMoney(Math.abs(interest)) + t("unit.money");
    vEl.className = interest > 0 ? "pos" : "neg";
  }
  const el = $("settle-return");
  el.textContent = fmtPct(Number(result.returnRate));
  el.className = Number(result.returnRate) >= 0 ? "pos" : "neg";
  // 择时贡献 = 玩家收益 - 买入持有: 主动操作的独立计分轴 (正负都展示)
  $("settle-timing").hidden = result.timingDelta == null;
  if (result.timingDelta != null) {
    const tv = $("settle-timing-val");
    const d = Number(result.timingDelta);
    tv.textContent = (d >= 0 ? "+" : "") + fmtPct(d);
    tv.className = d >= 0 ? "pos" : "neg";
  }
  renderComparison(result);
  // 熊市生存的胜负口径是「亏得比买入持有少」, 覆盖默认的人机判词
  if (state.mode === "SURVIVAL" && result.holdReturnRate != null) {
    const win = Number(result.returnRate) > Number(result.holdReturnRate);
    const verdict = $("settle-verdict");
    // 零交易取胜的判词微变: 隐藏机制 #2 (以静制动) 的发现线索
    verdict.textContent = t(win && (state.trades || []).length === 0
      ? "survival.winIdle" : win ? "survival.win" : "survival.lose");
    verdict.className = "verdict " + (win ? "win" : "lose");
  }
  // 每日挑战规则判定 (D1~D8): 结算卡上亮当日规则的过/未过
  const dcEl = $("settle-daily-rule");
  dcEl.hidden = !result.dailyChallenge;
  if (result.dailyChallenge) {
    const dc = result.dailyChallenge;
    // 星级 (1~3) 给"压线过"与"大胜"分辨率, 口径见后端 DailyRules.stars
    dcEl.textContent = t(dc.passed ? "dc.passed" : "dc.failed", t("dc." + dc.rule + ".t"))
      + (dc.stars > 0 ? " " + "★".repeat(dc.stars) : "");
    dcEl.className = "hint " + (dc.passed ? "pos" : "neg");
    // 达成给学堂经验 (XP 体系在前端 prog, 与徽章同层); addXp 来自 academy.js
    if (dc.passed && window.addXp) addXp(15);
  }
  // 新手浓缩局: 判词换成趣味称号 (不论盈亏都给正反馈——第一局的任务是留下来)
  if (state.mode === "INTRO") {
    const ret = Number(result.returnRate);
    const verdict = $("settle-verdict");
    verdict.textContent = t(ret >= 0.02 ? "intro.titleStar" : ret >= 0 ? "intro.titleSteady" : "intro.titleTuition");
    verdict.className = "verdict win";
  }
  renderSettleExtras(result);
  renderSettleCurve(result);
}

function renderSettleExtras(result) {
  const styleEl = $("settle-style");
  if (result.styleTag) {
    styleEl.hidden = false;
    styleEl.textContent = t("settle.style", t("style." + result.styleTag));
  } else {
    styleEl.hidden = true;
  }

  const days = result.predictionDays || [];
  const predBox = $("settle-pred");
  if (days.length === 0) {
    predBox.hidden = true;
  } else {
    predBox.hidden = false;
    const hit = days.filter((d) => d.correct).length;
    $("settle-pred-rate").textContent =
      t("settle.predRate", hit, days.length, ((hit / days.length) * 100).toFixed(0));
    const dots = $("settle-pred-dots");
    dots.innerHTML = "";
    days.forEach((d) => {
      const dot = document.createElement("span");
      dot.className = "pred-dot " + (d.correct ? "hit" : "miss");
      dot.title = `${d.date} ${t(d.predictedUp ? "ai.up" : "ai.down")} · ${t(d.correct ? "settle.hit" : "settle.miss")}`;
      dots.appendChild(dot);
    });
  }

  renderRiskPanel(result);
  renderEventReveal(result);
  renderCoach(result);

  $("btn-review").hidden = false;
  $("btn-recap").hidden = false;
  // 同题挑战: 单股非竞技局才可发起 (竞技局禁止套娃, 组合模式房间不支持;
  // EVENT 也是盲局, 服务端 createChallenge 会拒 —— 按钮别留着骗点击)
  $("btn-challenge").hidden = state.mode === "PORTFOLIO" || state.mode === "DAILY"
    || state.mode === "ROOM" || state.mode === "EVENT";
}

/** 事件回放结算揭晓: 场景名 + 真实窗口 + 大事记时间线 (服务端策展文本, 仍走 textContent)。 */
function renderEventReveal(result) {
  const box = $("settle-event");
  const r = result.eventReveal;
  if (!r) { box.hidden = true; return; }
  box.hidden = false;
  $("settle-event-name").textContent =
    t("settle.event.reveal") + ": " + (LANG === "en" ? r.nameEn : r.nameZh);
  $("settle-event-window").textContent =
    t("settle.event.realWindow", r.realStartDate, r.realEndDate);
  const list = $("settle-event-timeline");
  list.innerHTML = "";
  (r.timeline || []).forEach((ti) => {
    const li = document.createElement("li");
    li.className = "event-item sev-" + String(ti.severity || "MED").toLowerCase();
    const head = document.createElement("strong");
    head.textContent = `${ti.date} · ${LANG === "en" ? ti.titleEn : ti.titleZh}`;
    const body = document.createElement("p");
    body.className = "hint";
    body.textContent = LANG === "en" ? ti.bodyEn : ti.bodyZh;
    li.appendChild(head);
    li.appendChild(body);
    list.appendChild(li);
  });
}

async function startChallenge() {
  if (!window.Auth) return;
  // return 让 guarded 等到请求完成 (防双击并发建房)
  return Auth.require(async () => {
    try {
      const view = await api("/rooms/challenge", {
        method: "POST", body: JSON.stringify({ sessionId: state.sessionId }),
      });
      try { await navigator.clipboard.writeText(view.code); } catch (e) { /* 剪贴板不可用忽略 */ }
      toast(t("challenge.created", view.code));
      if (window.qsEnterRoom) qsEnterRoom(view);
      switchView("rooms");
    } catch (e) {
      toast(e.message);
    }
  });
}

// 结算风险指标表: 你 vs 买入持有。回撤/波动率/日胜率是正分数 → 百分比,
// 夏普/索提诺/盈亏比是纯数 → 两位小数; 后端算不出 (样本不足等) 的字段为 null → "--"
// 复盘教练 (首发三卡 C9/C11/C1): 结论卡 + STAT 证据行。
// args 里以 coach. 开头的参数是 i18n 键, 先翻译再插值 (如象限名/基准名);
// TX 锚 v1 只随 payload 保留 (图表定位锚留给教练页签阶段), 不在此渲染。
function renderCoach(result) {
  const box = $("settle-coach");
  const list = $("settle-coach-list");
  const findings = result.coach || [];
  box.hidden = !findings.length;
  if (!findings.length) return;
  list.innerHTML = "";
  findings.forEach((f) => {
    const card = document.createElement("div");
    card.className = "coach-card conf-" + (f.confidence || "WEAK").toLowerCase();
    const head = document.createElement("p");
    const args = (f.args || []).map((a) => (String(a).startsWith("coach.") ? t(a) : a));
    head.textContent = t(f.verdictKey, ...args);
    card.appendChild(head);
    if (f.hindsight) {
      const hb = document.createElement("i");
      hb.className = "coach-hindsight";
      hb.textContent = t("coach.hindsight");
      card.appendChild(hb);
    }
    (f.anchors || []).filter((a) => a.type === "STAT").forEach((a) => {
      const ev = document.createElement("span");
      ev.className = "hint coach-ev";
      ev.textContent = t(a.statKey) + ": " + a.statValue;
      card.appendChild(ev);
    });
    const conf = document.createElement("i");
    conf.className = "coach-conf";
    conf.textContent = t("coach.conf." + (f.confidence || "WEAK"));
    card.appendChild(conf);
    list.appendChild(card);
  });
}

function renderRiskPanel(result) {
  const box = $("settle-risk");
  const risk = result.risk;
  const hold = result.holdRisk;
  if (!risk && !hold) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const pct = (v) => (v == null ? "--" : (Number(v) * 100).toFixed(2) + "%");
  const num = (v) => (v == null ? "--" : Number(v).toFixed(2));
  const fill = (suffix, m) => {
    $("risk-dd-" + suffix).textContent = pct(m && m.maxDrawdown);
    $("risk-vol-" + suffix).textContent = pct(m && m.volatility);
    $("risk-sharpe-" + suffix).textContent = num(m && m.sharpe);
    $("risk-sortino-" + suffix).textContent = num(m && m.sortino);
    $("risk-win-" + suffix).textContent = pct(m && m.winRate);
    $("risk-pl-" + suffix).textContent = num(m && m.profitLossRatio);
  };
  fill("you", risk);
  fill("hold", hold);
}

// 结算资金曲线小图: 你 vs 买入持有, 横轴为对局内第 N 天 (后端已算好, 纯展示)
const settleChartH = qsChart("settle-curve", () => buildSettleCurveOption());
function renderSettleCurve(result) {
  const box = $("settle-curve-box");
  const curve = result.equityCurve;
  if (!curve || curve.length < 2) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  settleChartH.refresh();
}

// 结算资金曲线 option; 数据源 state.lastSettle (toggleTheme 前已缓存)
function buildSettleCurveOption() {
  const result = state.lastSettle;
  const curve = result && result.equityCurve;
  if (!curve || curve.length < 2) return null;
  const days = curve.map((_, i) => "D" + i);
  const series = [
    { name: t("cmp.you"), type: "line", data: curve.map(Number), showSymbol: false,
      lineStyle: { width: 2, color: COLORS.accent }, itemStyle: { color: COLORS.accent },
      areaStyle: { opacity: 0.08, color: COLORS.accent } },
  ];
  if (result.holdEquityCurve && result.holdEquityCurve.length === curve.length) {
    series.push({ name: t("cmp.hold"), type: "line", data: result.holdEquityCurve.map(Number),
      showSymbol: false, lineStyle: { width: 1.5, color: COLORS.muted, type: "dashed" },
      itemStyle: { color: COLORS.muted } });
  }
  return {
    backgroundColor: "transparent",
    animation: false,
    textStyle: { color: COLORS.text },
    tooltip: {
      trigger: "axis",
      backgroundColor: COLORS.panel, borderColor: COLORS.border,
      textStyle: { color: COLORS.text },
      valueFormatter: (v) => fmtMoney(v) + t("unit.money"),
    },
    legend: { data: series.map((s) => s.name), textStyle: { color: COLORS.muted }, top: 0 },
    grid: { left: 56, right: 10, top: 26, bottom: 20 },
    xAxis: { type: "category", data: days,
      axisLine: { lineStyle: { color: COLORS.border } }, axisLabel: { color: COLORS.muted, fontSize: 10 } },
    yAxis: { scale: true,
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.4 } },
      axisLabel: { color: COLORS.muted, fontSize: 10 } },
    series,
  };
}

function renderComparison(result) {
  const setCell = (id, rate) => {
    const cell = $(id);
    if (rate == null) {
      cell.textContent = "--";
      cell.className = "";
    } else {
      const v = Number(rate);
      cell.textContent = fmtPct(v);
      cell.className = v >= 0 ? "pos" : "neg";
    }
  };
  setCell("cmp-you", result.returnRate);
  setCell("cmp-ai", result.aiReturnRate);
  setCell("cmp-hold", result.holdReturnRate);
  setCell("cmp-ma", result.maCrossReturnRate);
  setCell("cmp-dca", result.dcaReturnRate);

  const verdict = $("settle-verdict");
  const taunt = $("settle-taunt");
  if (result.aiReturnRate == null) {
    verdict.textContent = "";
    taunt.hidden = true;
    return;
  }
  const you = Number(result.returnRate);
  const aiR = Number(result.aiReturnRate);
  if (you > aiR) {
    verdict.textContent = t("verdict.win");
    verdict.className = "verdict win";
  } else if (you < aiR) {
    verdict.textContent = t("verdict.lose");
    verdict.className = "verdict lose";
  } else {
    verdict.textContent = t("verdict.tie");
    verdict.className = "verdict";
  }
  // AI 人格按胜负说一句台词 (win 池 = AI 赢)
  const persona = t("ai.persona." + (state.aiLevel || "NORMAL").toLowerCase());
  const tauntKey = you > aiR
    ? "settle.taunt.lose." + Math.floor(Math.random() * 3)
    : you < aiR
      ? "settle.taunt.win." + Math.floor(Math.random() * 3)
      : "settle.taunt.tie.0";
  taunt.textContent = t(tauntKey, persona);
  taunt.hidden = false;
}

// ---------- 结算仪式感 ----------

// 竞技模式结算揭晓真实标的 (进行中全程显示「神秘标的」)
function revealMysteryStock(result) {
  if (state.stockCode !== "???" || !result.stockCode) return;
  state.stockCode = result.stockCode;
  state.stockName = result.stockName;
  state.activeStock = result.stockCode;
  renderStockLabel();
  toast(t("settle.reveal", stockName(result.stockName, result.stockCode), result.stockCode));
}

// 跑赢 AI 撒彩带 + 胜利音效; 输给 AI 低音提示 (动画走 CSS, reduced-motion 下已豁免)
function celebrateSettle(result) {
  if (result.aiReturnRate == null) return;
  const you = Number(result.returnRate);
  const aiR = Number(result.aiReturnRate);
  if (you > aiR) {
    spawnConfetti();
    playSound("win");
  } else if (you < aiR) {
    playSound("lose");
  }
}

/** 数字滚动: 从 0 缓动滚到终值 (ease-out cubic), 尊重 reduced-motion。 */
function qsRollNumber(el, to, suffix) {
  const sfx = suffix || "";
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = to.toLocaleString() + sfx;
    return;
  }
  const start = performance.now();
  const dur = 900;
  function frame(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString() + sfx;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** 彩带 (全站唯一实现, 勿在别处重定义——曾被 academy.js 覆盖导致全屏调用静默失效):
 *  无 host = 全屏彩带层; 传 host = 撒在该容器内 (学堂通关弹窗等)。 */
function spawnConfetti(host) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let target = host;
  let layer = null;
  if (!target) {
    layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
    target = layer;
    setTimeout(() => layer.remove(), 3200);
  }
  const colors = ["--up", "--accent", "--accent-2", "--warn", "--good"];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = cssVar(colors[i % colors.length]);
    piece.style.animationDuration = (1.2 + Math.random() * 1.2) + "s";
    piece.style.animationDelay = (Math.random() * 0.4) + "s";
    target.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

// 强平红闪
function flashScreen() {
  document.body.classList.add("screen-flash");
  setTimeout(() => document.body.classList.remove("screen-flash"), 750);
}

// ---------- 听盘模式: 新 K 线揭晓时奏一个音, 涨跌定音高、振幅定响度 (可闭眼盯盘) ----------
let SONIFY = false;
try { SONIFY = localStorage.getItem("qs_sonify") === "on"; } catch (e) { /* ignore */ }

// C 大调五声音阶两个八度: 跌→低音区, 涨→高音区, 永远不刺耳
const SONIFY_SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];
function sonifyBar(prev, bar) {
  if (!SOUND || !SONIFY || !prev || !bar) return;
  try {
    const chg = (Number(bar.close) - Number(prev.close)) / Number(prev.close);
    // ±3% 映射到 10 个音级; 振幅 (当日高低差) 映射响度 0.06~0.16
    const idx = Math.max(0, Math.min(9, Math.round((chg + 0.03) / 0.06 * 9)));
    const range = (Number(bar.high) - Number(bar.low)) / Number(prev.close);
    const vol = Math.min(0.16, 0.06 + range * 2);
    const ctx = audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = SONIFY_SCALE[idx];
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
  } catch (e) { /* 自动播放策略阻止时静默 */ }
}

function setTradeEnabled(enabled) {
  // 挂单按钮一并禁用: 结算后下单后端会拒, 但按钮可点体验差
  ["btn-buy", "btn-sell", "btn-tick", "btn-settle", "btn-advisor", "btn-order"].forEach((id) => {
    $(id).disabled = !enabled;
  });
}




// 听盘开关 (对局页 K 线工具条): 依赖总音效开关, 关着时提示先开声音
function renderSonifyBtn() {
  $("btn-sonify").classList.toggle("active", SONIFY);
  $("btn-sonify").title = t("sonify.title");
}
$("btn-sonify").addEventListener("click", () => {
  if (!SOUND && !SONIFY) { toast(t("sonify.needSound")); return; }
  SONIFY = !SONIFY;
  try { localStorage.setItem("qs_sonify", SONIFY ? "on" : "off"); } catch (e) { /* ignore */ }
  renderSonifyBtn();
  toast(t(SONIFY ? "sonify.on" : "sonify.off"));
  if (SONIFY) sonifyBar({ close: 100 }, { close: 101, high: 102, low: 100 }); // 示例音
});
renderSonifyBtn();
document.addEventListener("qs:lang", renderSonifyBtn);

// 开局表单行业下拉的启动加载 (原 app.js 启动序列, 随对局业务迁入)
loadIndustries();
