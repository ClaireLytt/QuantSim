// 平仓迷宫: 执行算法的空间化。你带着 100,000 股超大持仓, 要在收盘铃响前 (8 个时段)
// 走出迷宫——每扇「门」是一个交易通道 (集合竞价/盘中连续/大宗/暗池), 各有容量、
// 价格冲击和脾气: 连续走同一扇门它会「变窄」(冲击加倍), 暗池成交量看缘分,
// 大宗固定折价但不砸盘。你的每一笔卖出都永久压低价格, 改写后面的迷宫。
// 目标: 全部卖完且均价保住开盘价的 96%; 结算对比「开盘无脑全砸」基准。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_maze";
  const ROUNDS = 8;
  const TOTAL = 100000;
  const START = 20;
  const PASS = 0.96; // 均价及格线 (相对开盘价)
  const FORCED = 0.90; // 收盘没卖完的部分按 90% 强制甩卖

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 通道定义: k = 冲击系数 (永久砸价比例 = k * 量 / 1,000,000)
  const CHANNELS = {
    auction: { k: 0.7, cap: 40000 }, // 只在第 1、8 时段开门
    cont: { k: 2.0, cap: 15000 }, // 常开, 连用变窄
    block: { k: 0, cap: 50000, discount: 0.97 }, // 随机两个时段开门, 固定折价
    dark: { k: 0, cap: 0 }, // 容量与成交率看缘分
  };

  const g = {
    rng: null, round: 0, price: START, left: TOTAL,
    sold: [], // {round, ch, vol, price}
    blockRounds: [], darkCap: 0, lastCh: null, streak: 0,
    prices: [START], done: false,
  };

  const chartH = qsChart("mz-chart", () => buildChartOption());
  const fmtMoney = (v) => Math.round(v).toLocaleString();

  function startGame() {
    g.rng = mulberry32(Math.floor(Math.random() * 1e9));
    g.round = 1;
    g.price = START;
    g.left = TOTAL;
    g.sold = [];
    g.lastCh = null;
    g.streak = 0;
    g.prices = [START];
    g.done = false;
    // 大宗门随机开在中段两个时段
    const a = 2 + Math.floor(g.rng() * 5);
    let b = 2 + Math.floor(g.rng() * 5);
    if (b === a) b = b === 6 ? 2 : b + 1;
    g.blockRounds = [a, b];
    rollDark();
    $("mz-select").hidden = true;
    $("mz-report").hidden = true;
    $("mz-room").hidden = false;
    renderRound();
  }

  function rollDark() {
    // 暗池: 本时段容量 5k~20k, 成交率 50%~100%, 下单前只能看到容量
    g.darkCap = (5 + Math.floor(g.rng() * 16)) * 1000;
  }

  const avgPrice = () => {
    const vol = g.sold.reduce((s, x) => s + x.vol, 0);
    return vol === 0 ? 0 : g.sold.reduce((s, x) => s + x.vol * x.price, 0) / vol;
  };

  // 「开盘无脑全砸」基准: 第一时段把 10 万股全塞进连续竞价的均价
  function baselineAvg() {
    const impact = CHANNELS.cont.k * TOTAL / 1e6;
    return START * (1 - impact / 2);
  }

  function openChannels() {
    const list = [];
    if (g.round === 1 || g.round === ROUNDS) list.push("auction");
    list.push("cont");
    if (g.blockRounds.includes(g.round)) list.push("block");
    list.push("dark");
    return list;
  }

  function channelCap(ch) {
    if (ch === "dark") return g.darkCap;
    return CHANNELS[ch].cap;
  }

  function channelK(ch) {
    // 连用变窄: 同一扇门每连走一次, 冲击 ×1.5
    const base = CHANNELS[ch].k;
    return ch === g.lastCh ? base * Math.pow(1.5, g.streak) : base;
  }

  let selectedCh = null;

  function renderRound() {
    $("mz-round").textContent = t("mz.roundNo", g.round, ROUNDS);
    $("mz-left").textContent = g.left.toLocaleString();
    $("mz-price").textContent = g.price.toFixed(2);
    const avg = avgPrice();
    $("mz-avg").textContent = avg ? avg.toFixed(2) + "（" + ((avg / START - 1) * 100).toFixed(1) + "%）" : "--";
    renderDoors();
    renderLedger();
    chartH.refresh();
  }

  function renderDoors() {
    const wrap = $("mz-doors");
    wrap.innerHTML = "";
    openChannels().forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "mz-door" + (selectedCh === ch ? " active" : "");
      btn.disabled = g.done;
      const tt = document.createElement("b");
      const narrowed = ch === g.lastCh && g.streak > 0 && CHANNELS[ch].k > 0;
      tt.textContent = t("mz.ch." + ch) + (narrowed ? " " + t("mz.narrowed") : "");
      const dd = document.createElement("span");
      dd.className = "sub";
      dd.textContent = t("mz.doorInfo", channelCap(ch).toLocaleString(), describeDoor(ch));
      btn.append(tt, dd);
      btn.addEventListener("click", () => {
        selectedCh = ch;
        const cap = channelCap(ch);
        $("mz-vol").max = String(cap);
        if (Number($("mz-vol").value) > cap) $("mz-vol").value = String(cap);
        renderDoors();
      });
      wrap.appendChild(btn);
    });
  }

  function describeDoor(ch) {
    if (ch === "block") return t("mz.doorBlock");
    if (ch === "dark") return t("mz.doorDark");
    const k = channelK(ch);
    return t("mz.doorImpact", (k * 10000 / 1e6 * 100).toFixed(2)); // 每 1 万股的砸价 %
  }

  function sell() {
    if (g.done) return;
    if (!selectedCh) {
      toast(t("mz.pickDoor"));
      return;
    }
    let vol = Math.min(g.left, Math.floor((Number($("mz-vol").value) || 0) / 1000) * 1000);
    const cap = channelCap(selectedCh);
    if (vol <= 0) {
      toast(t("mz.zeroVol"));
      return;
    }
    if (vol > cap) {
      toast(t("mz.overCap", cap.toLocaleString()));
      return;
    }
    let fillPrice;
    if (selectedCh === "block") {
      fillPrice = g.price * CHANNELS.block.discount;
    } else if (selectedCh === "dark") {
      // 暗池: 成交率 50%~100% 当场揭晓
      const ratio = 0.5 + g.rng() * 0.5;
      const filled = Math.floor(vol * ratio / 1000) * 1000;
      if (filled < vol) toast(t("mz.darkPartial", filled.toLocaleString()));
      vol = filled;
      fillPrice = g.price;
    } else {
      const impact = channelK(selectedCh) * vol / 1e6;
      fillPrice = g.price * (1 - impact / 2);
      g.price = +(g.price * (1 - impact)).toFixed(2); // 永久砸价, 改写后面的迷宫
    }
    if (vol > 0) {
      g.sold.push({ round: g.round, ch: selectedCh, vol, price: +fillPrice.toFixed(2) });
      g.left -= vol;
      playSound("fill");
    }
    g.streak = selectedCh === g.lastCh ? g.streak + 1 : 0;
    g.lastCh = selectedCh;
    advance();
  }

  function waitRound() {
    if (g.done) return;
    g.lastCh = null;
    g.streak = 0;
    advance();
  }

  function advance() {
    if (g.left <= 0 || g.round >= ROUNDS) {
      finish();
      return;
    }
    g.round++;
    // 时段间自然漂移 ±1%
    g.price = +(g.price * (1 + 0.02 * (g.rng() - 0.5))).toFixed(2);
    g.prices.push(g.price);
    rollDark();
    selectedCh = null;
    renderRound();
  }

  function finish() {
    g.done = true;
    if (g.left > 0) {
      // 收盘铃响: 没走出迷宫的部分按 90% 强制甩卖
      g.sold.push({ round: ROUNDS, ch: "forced", vol: g.left, price: +(g.price * FORCED).toFixed(2) });
      g.left = 0;
    }
    const avg = avgPrice();
    const base = baselineAvg();
    const ratio = avg / START;
    const win = ratio >= PASS;
    const gain = win ? Math.max(10, Math.round((ratio - 0.9) * 2000)) : 0;
    $("mz-room").hidden = true;
    $("mz-report").hidden = false;
    const concl = $("mzr-conclusion");
    concl.textContent = win ? t("mz.win", gain, avg.toFixed(2)) : t("mz.lose", avg.toFixed(2), (PASS * START).toFixed(2));
    concl.className = "qdr-conclusion " + (win ? "win" : "lose");
    $("mzr-base").textContent = t("mz.baseCompare", base.toFixed(2), avg >= base ? t("mz.beatBase") : t("mz.underBase"));
    $("mzr-why").textContent = t("mz.moral");
    playSound(win ? "win" : "lose");
    if (win) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("mz.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function renderLedger() {
    const ul = $("mz-ledger");
    ul.innerHTML = "";
    $("mz-ledger-empty").hidden = !!g.sold.length;
    g.sold.forEach((x) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("mz.roundShort", x.round) + " " + t("mz.ch." + x.ch);
      const dd = document.createElement("span");
      dd.textContent = x.vol.toLocaleString() + " @ " + x.price.toFixed(2);
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function backToSelect() {
    $("mz-room").hidden = true;
    $("mz-report").hidden = true;
    $("mz-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("mz-best").hidden = !b.best;
    if (b.best) $("mz-best").textContent = t("mz.best", b.best);
  }

  function buildChartOption() {
    if ($("mz-room").hidden || !g.rng) return null;
    const marks = g.sold.filter((x) => x.ch !== "forced").map((x) => ({
      coord: [x.round - 1, x.price],
      symbol: "circle",
      symbolSize: Math.max(6, Math.min(14, x.vol / 4000)),
      itemStyle: { color: cssVar("--down") },
    }));
    return {
      animation: false,
      grid: { left: 44, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: Array.from({ length: ROUNDS }, (_, i) => t("mz.roundShort", i + 1)),
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
        data: g.prices,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        markPoint: { data: marks, label: { show: false } },
        markLine: {
          symbol: "none",
          label: { formatter: t("mz.passLine"), fontSize: 10, color: cssVar("--up") },
          lineStyle: { color: cssVar("--up"), type: "dashed" },
          data: [{ yAxis: START * PASS }],
        },
      }],
    };
  }

  $("btn-mz-start").addEventListener("click", startGame);
  $("btn-mz-sell").addEventListener("click", sell);
  $("btn-mz-wait").addEventListener("click", waitRound);
  $("btn-mz-back").addEventListener("click", backToSelect);
  $("btn-mzr-again").addEventListener("click", startGame);
  $("btn-mzr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "maze") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-maze").hidden) return;
    renderIntroBest();
    if (!$("mz-room").hidden) renderRound();
  });

  renderIntroBest();
})();
