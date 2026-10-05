// 泡沫大亨: 庄家视角模拟 —— 吸筹/拉抬/发利好/出货/观望, 对手是情绪化散户群 + 监管。
// 反向教学: 玩过庄家才懂散户为什么亏钱。纯前端, 不接后端。
// 核心数学: 价格冲击 = 下单量/当日流动性 × 冲击系数; 流动性随散户热度涨;
// 热度驱动散户次日追涨, 泡沫率(价格/锚定价)越高崩盘概率越大; 嫌疑驱动监管立案。
// 依赖 app.js 的 $ / toast / playSound / cssVar, i18n.js 的 t / pick。
(() => {
  const START_CASH = 10000000;
  const MAX_DAYS = 60;
  const FAIR = 10; // 价值锚: 偏离越远, 崩盘与监管压力越大

  const bb = { on: false, day: 1, cash: START_CASH, shares: 0, costSum: 0,
    price: FAIR, heat: 5, susp: 0, panic: 0, hist: [], acts: [] };

  let best = null; // {pct, title}
  try { best = JSON.parse(localStorage.getItem("qs_bubble") || "null"); } catch (e) { /* ignore */ }

  let chart = null;

  // ---------- 渲染 ----------

  function total() { return Math.round(bb.cash + bb.shares * bb.price); }

  function refresh() {
    $("bb-day").textContent = Math.min(bb.day, MAX_DAYS) + " / " + MAX_DAYS;
    $("bb-cash").textContent = Math.round(bb.cash).toLocaleString();
    $("bb-pos").textContent = bb.shares.toLocaleString();
    $("bb-cost").textContent = bb.shares > 0 ? (bb.costSum / bb.shares).toFixed(2) : "--";
    $("bb-price").textContent = bb.price.toFixed(2);
    const pnl = total() - START_CASH;
    const el = $("bb-pnl");
    const pnlPct = (pnl / START_CASH * 100).toFixed(1);
    el.textContent = `${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()} (${pnl >= 0 ? "+" : ""}${pnlPct}%)`;
    el.style.color = pnl >= 0 ? cssVar("--up") : cssVar("--down");
    $("bb-heat-bar").style.width = Math.min(100, bb.heat) + "%";
    $("bb-susp-bar").style.width = Math.min(100, bb.susp) + "%";
    $("bb-heat-val").textContent = Math.round(Math.min(100, bb.heat));
    $("bb-susp-val").textContent = Math.round(Math.min(100, bb.susp));
    $("bb-susp-bar").classList.toggle("danger", bb.susp > 60);
    // 做不了的动作直接置灰, 不等点击后 toast
    $("btn-bb-accum").disabled = !bb.on || bb.cash < bb.price;
    $("btn-bb-pump").disabled = !bb.on || bb.cash < bb.price;
    $("btn-bb-news").disabled = !bb.on || bb.cash < 200000;
    $("btn-bb-dump").disabled = !bb.on || bb.shares <= 0;
    $("btn-bb-wait").disabled = !bb.on;
    renderChart();
  }

  function renderChart() {
    if (!chart) return;
    chart.setOption({
      grid: { left: 48, right: 12, top: 12, bottom: 24 },
      xAxis: { type: "category", data: bb.hist.map((_, i) => i + 1),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted") } },
      yAxis: { type: "value", scale: true,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted") } },
      series: [{
        type: "line", data: bb.hist, showSymbol: false,
        lineStyle: { color: cssVar("--accent"), width: 2 },
        areaStyle: { opacity: 0.08, color: cssVar("--accent") },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: cssVar("--text-muted"), type: "dashed", opacity: 0.6 },
          label: { formatter: t("bb.fairLine"), color: cssVar("--text-muted"), fontSize: 10, position: "insideStartTop" },
          data: [{ yAxis: FAIR }],
        },
        markPoint: {
          symbolSize: 26,
          label: { fontSize: 10, color: "#fff" },
          data: bb.acts.map((a) => ({
            coord: [a.day - 1, bb.hist[a.day - 1]],
            value: a.tag,
            itemStyle: { color: cssVar(a.colorVar) },
          })),
        },
      }],
    });
  }

  function log(text, cls) {
    const li = document.createElement("li");
    li.textContent = `${t("bb.dayTag", Math.min(bb.day, MAX_DAYS))} ${text}`;
    if (cls) li.className = cls;
    const box = $("bb-log");
    box.prepend(li);
    while (box.children.length > 60) box.removeChild(box.lastChild);
  }

  function renderIntro() {
    $("bb-best").textContent = best ? t("bb.best", best.pct, t("bb.endTitle." + best.title)) : "";
  }

  // ---------- 市场数学 ----------

  // 当日可成交量: 散户越热, 对手盘越厚
  function liquidity() { return 40000 + bb.heat * 11000; }

  // 下单冲击: 量/流动性 × 系数, 单日限幅 ±20%
  function impact(qty, k) {
    const pct = Math.max(-0.2, Math.min(0.2, (qty / liquidity()) * k));
    bb.price = Math.max(1, bb.price * (1 + pct));
  }

  function mark(tag, colorVar) {
    // 存变量名而不是解析值: 换主题重绘时颜色才跟得上
    bb.acts.push({ day: bb.day, tag, colorVar });
  }

  // 每个动作 = 一个交易日; 动作后市场自己走一步 (散户跟风/崩盘/监管)
  function endDay() {
    // 散户自发驱动: 热度推涨 + 动量追涨 + 噪声 - 价值回归引力
    const momentum = bb.hist.length >= 3
      ? (bb.price - bb.hist[bb.hist.length - 3]) / bb.hist[bb.hist.length - 3] : 0;
    const ratio = bb.price / FAIR;
    let drift = Math.min(100, bb.heat) * 0.0009 + momentum * 0.25 + (Math.random() - 0.5) * 0.03
      - Math.max(0, ratio - 1) * 0.004;
    if (bb.panic > 0) {
      drift -= 0.06 + Math.random() * 0.06;
      bb.panic--;
      log(t("bb.panicLog"), "neg");
    }
    bb.price = Math.max(1, bb.price * (1 + drift));
    // 泡沫崩盘: 偏离锚定越远越悬, 热度冷却时最脆
    const crashP = Math.max(0, (ratio - 2) * 0.04) + (ratio > 1.8 && bb.heat < 20 ? 0.06 : 0);
    if (crashP > 0 && Math.random() < crashP) {
      const dump = 0.15 + Math.random() * 0.15;
      bb.price = Math.max(1, bb.price * (1 - dump));
      bb.heat = Math.max(0, bb.heat - 40);
      bb.panic = 2;
      log(t("bb.crashLog", Math.round(dump * 100)), "neg");
      playSound("lose");
    } else if (bb.heat >= 60 && Math.random() < 0.3) {
      log(t("bb.retailIn"));
    }
    // 热度自然冷却; 嫌疑随泡沫被动上涨
    bb.heat = Math.max(0, bb.heat * 0.92);
    bb.susp += Math.max(0, ratio - 1.5) * 2;
    // 监管立案: 嫌疑 60 起每天抽签, 100 必查
    if (bb.susp >= 100 || (bb.susp > 60 && Math.random() < (bb.susp - 60) / 180)) {
      busted();
      return;
    }
    bb.hist.push(+bb.price.toFixed(2));
    bb.day++;
    if (bb.day > MAX_DAYS) {
      forceSettle();
      return;
    }
    refresh();
  }

  // ---------- 动作 ----------

  function doAccum() {
    if (!bb.on) return;
    const spend = Math.min(bb.cash, START_CASH * 0.12);
    if (spend < bb.price) { toast(t("bb.noCash")); return; }
    const qty = Math.floor(spend / bb.price);
    bb.cash -= qty * bb.price;
    bb.shares += qty;
    bb.costSum += qty * bb.price;
    impact(qty, 0.03);
    bb.heat += 2;
    bb.susp += 1;
    mark("B", "--accent");
    log(t("bb.accumLog", qty.toLocaleString(), bb.price.toFixed(2)));
    playSound("buy");
    endDay();
  }

  function doPump() {
    if (!bb.on) return;
    const spend = Math.min(bb.cash, START_CASH * 0.2);
    if (spend < bb.price) { toast(t("bb.noCash")); return; }
    const qty = Math.floor(spend / bb.price);
    bb.cash -= qty * bb.price;
    bb.shares += qty;
    bb.costSum += qty * bb.price;
    impact(qty, 0.1);
    bb.heat += 16;
    bb.susp += 10;
    mark("P", "--warn");
    log(t("bb.pumpLog", qty.toLocaleString(), bb.price.toFixed(2)));
    playSound("buy");
    endDay();
  }

  function doNews() {
    if (!bb.on) return;
    const cost = 200000;
    if (bb.cash < cost) { toast(t("bb.noCash")); return; }
    bb.cash -= cost;
    bb.heat += 26;
    bb.susp += 15;
    mark("N", "--bad");
    log(t("bb.newsLog", cost.toLocaleString()));
    endDay();
  }

  function doDump() {
    if (!bb.on) return;
    if (bb.shares <= 0) { toast(t("bb.noShares")); return; }
    // 只能卖给当日对手盘: 热度高才出得动货
    const qty = Math.min(bb.shares, Math.floor(liquidity() * 0.5));
    const got = qty * bb.price;
    bb.cash += got;
    bb.costSum = bb.shares > 0 ? bb.costSum * (1 - qty / bb.shares) : 0;
    bb.shares -= qty;
    impact(-qty, 0.12);
    bb.heat = Math.max(0, bb.heat - 10);
    bb.susp += 4;
    mark("S", "--good");
    log(t("bb.dumpLog", qty.toLocaleString(), bb.price.toFixed(2), Math.round(got).toLocaleString()), "pos");
    playSound("sell");
    if (bb.shares === 0 && bb.cash > START_CASH) {
      settle(); // 全身而退
      return;
    }
    endDay();
  }

  function doWait() {
    if (!bb.on) return;
    bb.heat = Math.max(0, bb.heat - 4);
    bb.susp = Math.max(0, bb.susp - 5);
    log(t("bb.waitLog"));
    endDay();
  }

  // ---------- 结局 ----------

  function busted() {
    bb.on = false;
    // 罚没浮盈 + 罚金 20% 本金
    const fine = Math.round(START_CASH * 0.2);
    bb.cash = Math.min(bb.cash, START_CASH) - fine;
    bb.shares = 0;
    bb.costSum = 0;
    log(t("bb.caught", fine.toLocaleString()), "neg");
    playSound("lose");
    finish("jail");
  }

  function forceSettle() {
    // 期限到: 剩余筹码连续砸盘出清 (每天流动性上限 + 向下冲击), 体验"出不完货"的恐惧
    log(t("bb.forced"), "neg");
    while (bb.shares > 0) {
      const qty = Math.min(bb.shares, Math.floor(liquidity() * 0.5));
      bb.cash += qty * bb.price;
      bb.shares -= qty;
      impact(-qty, 0.12);
      bb.heat = Math.max(0, bb.heat * 0.8);
      if (qty <= 0) { bb.shares = 0; break; }
    }
    bb.on = false;
    finish(null);
  }

  function settle() {
    bb.on = false;
    finish(null);
  }

  function finish(forcedTitle) {
    const end = Math.round(bb.cash);
    const pct = Math.round((end - START_CASH) / START_CASH * 100);
    const title = forcedTitle
      || (pct >= 100 ? "harvest" : pct >= 30 ? "pro" : pct >= 0 ? "fish" : "cut");
    log(t("bb.settle", START_CASH.toLocaleString(), end.toLocaleString(), (pct >= 0 ? "+" : "") + pct, t("bb.endTitle." + title)), pct >= 0 && forcedTitle !== "jail" ? "pos" : "neg");
    log(t("bb.lesson"));
    toast(t("bb.endTitle." + title));
    if (forcedTitle !== "jail" && pct > 0) playSound("win");
    if (!best || pct > best.pct) {
      best = { pct, title };
      try { localStorage.setItem("qs_bubble", JSON.stringify(best)); } catch (e) { /* ignore */ }
    }
    $("bb-result-title").textContent = t("bb.endTitle." + title);
    const pctEl = $("bb-result-pct");
    pctEl.textContent = "";
    pctEl.append(document.createTextNode(START_CASH.toLocaleString() + " → "));
    const endEl = document.createElement("b");
    pctEl.appendChild(endEl);
    pctEl.append(document.createTextNode(` (${pct >= 0 ? "+" : ""}${pct}%)`));
    qsRollNumber(endEl, end); // 终值滚动定格 (爽感)
    pctEl.style.color = pct >= 0 && forcedTitle !== "jail" ? cssVar("--up") : cssVar("--down");
    if (title === "harvest") spawnConfetti();
    $("bb-result").hidden = false;
    $("btn-bb-restart").hidden = false;
    renderIntro();
    refresh();
  }

  // ---------- 开局 ----------

  function startRun() {
    Object.assign(bb, { on: true, day: 1, cash: START_CASH, shares: 0, costSum: 0,
      price: FAIR * (0.9 + Math.random() * 0.2), heat: 5, susp: 0, panic: 0,
      hist: [], acts: [] });
    bb.hist.push(+bb.price.toFixed(2));
    $("bb-log").innerHTML = "";
    $("bb-result").hidden = true;
    $("bb-intro").hidden = true;
    $("bb-game").hidden = false;
    $("btn-bb-restart").hidden = true;
    // 图表在容器可见后再初始化, 否则 ECharts 量到 0 宽 (全站已知坑)
    if (!chart) chart = echarts.init($("bb-chart"));
    chart.resize();
    log(t("bb.started", bb.price.toFixed(2)));
    refresh();
  }

  // ---------- 绑定 ----------

  $("btn-bb-start").addEventListener("click", startRun);
  $("btn-bb-restart").addEventListener("click", startRun);
  $("btn-bb-accum").addEventListener("click", doAccum);
  $("btn-bb-pump").addEventListener("click", doPump);
  $("btn-bb-news").addEventListener("click", doNews);
  $("btn-bb-dump").addEventListener("click", doDump);
  $("btn-bb-wait").addEventListener("click", doWait);

  renderIntro();

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "bubble") {
      renderIntro();
      if (bb.on || bb.hist.length) refresh();
      if (chart) chart.resize();
    }
  });
  document.addEventListener("qs:lang", () => { renderIntro(); if (bb.hist.length) refresh(); });
  document.addEventListener("qs:theme", () => { if (bb.hist.length) refresh(); });
  window.addEventListener("resize", () => {
    if (chart && !$("view-bubble").hidden) chart.resize();
  });
})();
