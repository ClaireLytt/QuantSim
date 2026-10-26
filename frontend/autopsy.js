// 爆仓倒推: 金融验尸官。程序化生成一宗已爆仓账户 (五种死法模板 × 随机行情),
// 玩家看净值曲线 + 交易流水 + 强平快照, 花有限的质询次数调取单笔交易的账目事实,
// 在两次指认机会内指认「致命交易 + 死因类别」。质询剩得越多、一次命中, 得分越高。
// 依赖 app.js 的 $ / toast / playSound / qsChart / cssVar / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_autopsy";
  const CREDITS = 5; // 质询次数 (流水 5~7 笔, 不够全查, 逼你从曲线先缩小范围)
  const ATTEMPTS = 2; // 指认机会
  const DAYS = 120;
  const INIT = 1000000;
  const BLOW = INIT * 0.3; // 风控清算线: 净值跌破 30% 强平结案

  // 确定性随机: 同一案件号可复现 (mulberry32)
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
    { zh: "青云物流", en: "SkyPath Logistics" },
  ];

  // 死因类别: 指认时的下拉选项 (顺序固定, 每案只有一个正确)
  const CAUSES = [
    { id: "lev", t: { zh: "杠杆过度", en: "Over-leverage" } },
    { id: "avg", t: { zh: "逆势加仓摊平", en: "Averaging down" } },
    { id: "conc", t: { zh: "持仓过度集中", en: "Over-concentration" } },
    { id: "chase", t: { zh: "情绪化追高", en: "FOMO chasing the top" } },
    { id: "disp", t: { zh: "卖盈留亏（处置效应）", en: "Selling winners, keeping losers" } },
  ];

  // 死法模板: 行情形状 (分段漂移) + 交易剧本 (plan 返回致命交易下标) + 结案陈词
  // sev 是严重度系数: 生成后若没死透 (净值未破清算线) 就加深崩段重生成
  const TEMPLATES = {
    lev: {
      segsA: (sev) => [{ len: 60, drift: 0.008, vol: 0.01 }, { len: 60, drift: -0.016 * sev, vol: 0.015 }],
      segsB: () => [{ len: 120, drift: 0.0005, vol: 0.008 }],
      plan(b) {
        b.buy("B", 5, 0.35);
        b.buy("A", 10, 0.3);
        b.buy("A", 58, 1.1, true); // 致命: 顶部附近融资加仓, 总敞口拉到净值的 ~1.8 倍
        return 2;
      },
      why: {
        zh: "死者不是死于看错方向——他前 58 天都是赚钱的。他死于在浮盈最得意的一天把敞口加到净值的近两倍：之后一段普通的下跌，被杠杆放大成了穿仓。杠杆不改变胜率，只把「亏得起」改成「亏不起」。",
        en: "He didn't die of a wrong call - he was profitable for 58 days. He died the day he levered exposure to nearly twice his equity at peak confidence: an ordinary decline, amplified into ruin. Leverage never changes your odds - it only turns 'affordable loss' into 'fatal loss'.",
      },
    },
    avg: {
      segsA: (sev) => [{ len: 30, drift: 0.004, vol: 0.009 }, { len: 90, drift: -0.011 * sev, vol: 0.013 }],
      segsB: () => [{ len: 120, drift: 0.0008, vol: 0.007 }],
      plan(b) {
        b.buy("B", 5, 0.3);
        b.buy("A", 10, 0.2);
        b.buy("A", 40, 0.15);
        b.buy("A", 60, 0.2);
        b.sellAll("B", 75);
        b.buy("A", 80, 0.6); // 致命: 第四次、也是最重的一次逆势加仓 (弹药已见底)
        b.buy("A", 95, 0.3);
        return 5;
      },
      why: {
        zh: "每一次加仓单看都「摊低了成本」，但第四次加仓时他已卖掉唯一的对冲、把剩余弹药全部押进同一条下行通道。摊平唯一确定的效果：把小亏的可能换成大亏的确定。致命的不是第一笔抄底，是弹药见底的那一笔。",
        en: "Each add 'lowered the average' in isolation. But by the fourth add he had sold his only hedge and shoved the last of his ammo into the same downtrend. The one sure effect of averaging down: trading a possible small loss for a certain big one. The fatal trade isn't the first dip-buy - it's the one that spent the last bullet.",
      },
    },
    conc: {
      segsA: (sev) => [{ len: 60, drift: 0.001, vol: 0.008 }, { len: 40, drift: -0.02 * sev, vol: 0.016 }, { len: 20, drift: -0.002, vol: 0.01 }],
      segsB: () => [{ len: 120, drift: 0.001, vol: 0.007 }],
      plan(b) {
        b.buy("B", 5, 0.45);
        b.buy("A", 10, 0.3);
        b.sellAll("B", 55);
        b.buy("A", 56, 0.95); // 致命: 清掉分散持仓, 全仓押进单票
        return 3;
      },
      why: {
        zh: "分散持仓时他经得起任何一只股票出事。致命一笔发生在全仓换入单票的那天——此后账户的生死不再取决于他的判断力，而取决于一只股票的脾气。集中度是把双刃剑里唯一没有刀柄的那把。",
        en: "Diversified, he could survive any single blow-up. The fatal trade was the day he swapped everything into one name - from then on the account's fate no longer depended on his judgment, only on one stock's temper. Concentration is the one double-edged sword with no handle.",
      },
    },
    chase: {
      segsA: (sev) => [{ len: 40, drift: 0.0005, vol: 0.008 }, { len: 18, drift: 0.03, vol: 0.012 }, { len: 62, drift: -0.024 * sev, vol: 0.02 }],
      segsB: () => [{ len: 120, drift: 0.001, vol: 0.007 }],
      plan(b) {
        b.buy("B", 5, 0.4);
        b.buy("A", 10, 0.1);
        b.sellAll("B", 54);
        b.buy("A", 57, 0.92); // 致命: 急涨末端重仓追入, 买在喷发顶
        return 3;
      },
      why: {
        zh: "他看着这只票涨了 18 天，终于在「再不上车就没了」的那一天把全部身家拍了进去——距离最高点只差一步。追高的数学很残酷：涨幅越诱人，留给你的安全边际越薄。他买的不是股票，是别人的利润兑现单。",
        en: "He watched it climb for 18 days and finally went all-in on the day 'the train was leaving' - one step from the top. The math of chasing is brutal: the more seductive the run-up, the thinner your margin of safety. He wasn't buying a stock - he was buying someone else's exit ticket.",
      },
    },
    disp: {
      segsA: (sev) => [{ len: 20, drift: 0.001, vol: 0.008 }, { len: 100, drift: -0.0105 * sev, vol: 0.011 }],
      segsB: () => [{ len: 120, drift: 0.005, vol: 0.008 }],
      plan(b) {
        b.buy("A", 5, 0.45);
        b.buy("B", 8, 0.45);
        b.sellAll("B", 40); // 致命: 卖掉一直在涨的赢家「落袋为安」, 留下阴跌的输家
        b.buy("A", 55, 0.3);
        b.buy("A", 75, 0.25);
        return 2;
      },
      why: {
        zh: "最隐蔽的死法：致命一笔是一次「盈利」。他卖掉了组合里唯一在涨的股票落袋为安，留下阴跌的那只「等回本」——此后账户里只剩失血的腿，还往上面加了两次仓。处置效应的本质：把花园里的花拔掉，给杂草浇水。",
        en: "The stealthiest death: the fatal trade was a 'profit'. He sold the only rising stock to lock in gains and kept the bleeding one 'until it comes back' - leaving the account with nothing but the losing leg, then adding to it twice. The disposition effect in one line: pulling the flowers and watering the weeds.",
      },
    },
  };

  // ---------- 案件生成 ----------

  function genPath(rng, start, segs) {
    const closes = [start];
    segs.forEach((seg) => {
      for (let i = 0; i < seg.len; i++) {
        const prev = closes[closes.length - 1];
        closes.push(+(prev * Math.exp(seg.drift + seg.vol * (rng() * 2 - 1))).toFixed(2));
      }
    });
    return closes.slice(0, DAYS);
  }

  // 账目引擎: 买入超出现金自动转融资负债, 卖出先还债; 净值 = 现金 - 负债 + 市值
  function makeBuilder(closes) {
    const st = { cash: INIT, debt: 0, pos: { A: 0, B: 0 }, trades: [] };
    const eq = (d) => st.cash - st.debt + st.pos.A * closes.A[d] + st.pos.B * closes.B[d];
    function buy(s, d, frac, margin) {
      let budget = eq(d) * frac;
      if (!margin) budget = Math.min(budget, st.cash);
      const p = closes[s][d];
      const shares = Math.max(100, Math.floor(budget / p / 100) * 100);
      const cost = shares * p;
      if (cost <= st.cash) st.cash -= cost;
      else {
        st.debt += cost - st.cash;
        st.cash = 0;
      }
      st.pos[s] += shares;
      st.trades.push({ day: d, stock: s, side: "buy", shares, price: p });
    }
    function sellAll(s, d) {
      const p = closes[s][d];
      const proceeds = st.pos[s] * p;
      const repay = Math.min(st.debt, proceeds);
      st.debt -= repay;
      st.cash += proceeds - repay;
      st.trades.push({ day: d, stock: s, side: "sell", shares: st.pos[s], price: p });
      st.pos[s] = 0;
    }
    return { st, buy, sellAll };
  }

  // 独立复盘: 从流水重放每天净值 (与 builder 同一套账目规则, 曲线和线索都从这里来)
  function replay(trades, closes) {
    const st = { cash: INIT, debt: 0, pos: { A: 0, B: 0 } };
    const daily = [];
    for (let d = 0; d < DAYS; d++) {
      trades.filter((tr) => tr.day === d).forEach((tr) => {
        const amt = tr.shares * tr.price;
        if (tr.side === "buy") {
          if (amt <= st.cash) st.cash -= amt;
          else {
            st.debt += amt - st.cash;
            st.cash = 0;
          }
          st.pos[tr.stock] += tr.shares;
        } else {
          const repay = Math.min(st.debt, amt);
          st.debt -= repay;
          st.cash += amt - repay;
          st.pos[tr.stock] -= tr.shares;
        }
      });
      daily.push({
        eq: st.cash - st.debt + st.pos.A * closes.A[d] + st.pos.B * closes.B[d],
        cash: st.cash,
        debt: st.debt,
        posA: st.pos.A,
        posB: st.pos.B,
      });
    }
    return daily;
  }

  function buildCase(seed) {
    const rng = mulberry32(seed);
    const tplId = Object.keys(TEMPLATES)[Math.floor(rng() * 5)];
    const tpl = TEMPLATES[tplId];
    const ni = Math.floor(rng() * NAMES.length);
    const names = { A: NAMES[ni], B: NAMES[(ni + 1 + Math.floor(rng() * (NAMES.length - 1))) % NAMES.length] };
    // 严重度递增重试: 保证案件必然死透 (净值破清算线)
    for (let attempt = 0; attempt < 8; attempt++) {
      const sev = Math.pow(1.3, attempt);
      const prng = mulberry32(seed + attempt * 7919);
      const closes = {
        A: genPath(prng, 20 + prng() * 40, tpl.segsA(sev)),
        B: genPath(prng, 20 + prng() * 40, tpl.segsB(sev)),
      };
      const b = makeBuilder(closes);
      const fatalIdx = tpl.plan(b);
      const daily = replay(b.st.trades, closes);
      const lastDay = b.st.trades[b.st.trades.length - 1].day;
      const blowDay = daily.findIndex((row, d) => d > lastDay && row.eq <= BLOW);
      if (blowDay < 0) continue;
      return { seed, tplId, names, closes, trades: b.st.trades, fatalIdx, blowDay, daily };
    }
    return buildCase(seed + 1); // 极端兜底: 换个案件号
  }

  // 单笔交易的账目事实 (质询时亮出): 成交后敞口 / 单票集中度 / 距高点 / 此后到爆仓的走势
  function tradeFacts(c, i) {
    const tr = c.trades[i];
    const row = c.daily[tr.day];
    const eq = row.eq;
    const gross = row.posA * c.closes.A[tr.day] + row.posB * c.closes.B[tr.day];
    const own = (tr.stock === "A" ? row.posA * c.closes.A[tr.day] : row.posB * c.closes.B[tr.day]);
    const hist = c.closes[tr.stock].slice(Math.max(0, tr.day - 60), tr.day + 1);
    const high = Math.max(...hist);
    const future = c.closes[tr.stock][c.blowDay] / tr.price - 1;
    return {
      expos: Math.round((gross / eq) * 100),
      conc: Math.round((own / eq) * 100),
      dist: (tr.price / high - 1) * 100,
      future: future * 100,
    };
  }

  // ---------- 游戏状态 ----------

  const g = { c: null, credits: 0, asked: [], selected: null, attempts: 0, done: false, lastGain: 0, lastRight: false };

  const chartH = qsChart("au-chart", () => buildChartOption());

  const fmtPct = (x) => (x > 0 ? "+" : "") + x.toFixed(0) + "%";
  const fmtMoney = (v) => Math.round(v).toLocaleString();
  const stockName = (s) => pick(g.c.names[s]);
  const tradeLabel = (i) => {
    const tr = g.c.trades[i];
    return "#" + (i + 1) + " " + t("au.tradeLine", tr.day + 1, t(tr.side === "buy" ? "au.buy" : "au.sell"), stockName(tr.stock), tr.shares.toLocaleString(), tr.price.toFixed(2));
  };

  function startCase() {
    g.c = buildCase(Math.floor(Math.random() * 1e9));
    g.credits = CREDITS;
    g.asked = [];
    g.selected = null;
    g.attempts = 0;
    g.done = false;
    $("au-select").hidden = true;
    $("au-report").hidden = true;
    $("au-room").hidden = false;
    $("au-case-title").textContent = t("au.caseNo", String(g.c.seed % 100000).padStart(5, "0"));
    renderBrief();
    renderSnapshot();
    renderCauseSelect();
    renderRoom();
    chartH.refresh();
  }

  function renderBrief() {
    const blowEq = g.c.daily[g.c.blowDay].eq;
    $("au-brief").textContent = t("au.brief", fmtMoney(INIT), g.c.blowDay + 1, fmtMoney(blowEq), fmtMoney(BLOW));
  }

  function renderSnapshot() {
    const row = g.c.daily[g.c.blowDay];
    const dl = $("au-snapshot");
    dl.innerHTML = "";
    const add = (k, v, neg) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      if (neg) dd.className = "neg";
      dl.append(dt, dd);
    };
    add(t("au.snapCash"), fmtMoney(row.cash));
    add(t("au.snapDebt"), fmtMoney(row.debt), row.debt > 0);
    ["A", "B"].forEach((s) => {
      const shares = s === "A" ? row.posA : row.posB;
      if (shares <= 0) return;
      const px = g.c.closes[s][g.c.blowDay];
      add(stockName(s), shares.toLocaleString() + " × " + px.toFixed(2) + " = " + fmtMoney(shares * px));
    });
    add(t("au.snapEq"), fmtMoney(row.eq), true);
  }

  function renderRoom() {
    $("au-credits").textContent = String(g.credits);
    $("au-attempts").textContent = String(ATTEMPTS - g.attempts);
    renderLedger();
    renderNotes();
  }

  function renderLedger() {
    const wrap = $("au-ledger");
    wrap.innerHTML = "";
    g.c.trades.forEach((tr, i) => {
      const btn = document.createElement("button");
      const askedMark = g.asked.includes(i) ? " ✓" : "";
      btn.className = "au-trade" + (g.selected === i ? " active" : "") + (g.asked.includes(i) ? " done" : "");
      btn.disabled = g.done;
      btn.textContent = tradeLabel(i) + askedMark;
      btn.addEventListener("click", () => {
        g.selected = i;
        renderLedger();
      });
      wrap.appendChild(btn);
    });
  }

  function renderNotes() {
    const ul = $("au-notes");
    ul.innerHTML = "";
    $("au-notes-empty").hidden = !!g.asked.length;
    g.asked.forEach((i) => {
      const f = tradeFacts(g.c, i);
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = tradeLabel(i);
      const dd = document.createElement("span");
      dd.textContent = t("au.clueExpos", f.expos) + " " + t("au.clueConc", stockName(g.c.trades[i].stock), f.conc) + " " + t("au.clueDist", fmtPct(f.dist)) + " " + t("au.clueFuture", fmtPct(f.future));
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function renderCauseSelect() {
    const sel = $("au-cause");
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = t("au.causePh");
    sel.appendChild(ph);
    CAUSES.forEach((cz) => {
      const o = document.createElement("option");
      o.value = cz.id;
      o.textContent = pick(cz.t);
      sel.appendChild(o);
    });
  }

  function interrogate() {
    if (g.done) return;
    if (g.selected == null) {
      toast(t("au.pickTrade"));
      return;
    }
    if (g.asked.includes(g.selected)) {
      toast(t("au.alreadyAsked"));
      return;
    }
    if (g.credits <= 0) {
      toast(t("au.noCredits"));
      return;
    }
    g.credits--;
    g.asked.push(g.selected);
    playSound("fill");
    renderRoom();
  }

  function accuse() {
    if (g.done) return;
    if (g.selected == null) {
      toast(t("au.pickTrade"));
      return;
    }
    const cause = $("au-cause").value;
    if (!cause) {
      toast(t("au.pickCause"));
      return;
    }
    const tradeRight = g.selected === g.c.fatalIdx;
    const causeRight = cause === g.c.tplId;
    g.attempts++;
    if (tradeRight && causeRight) {
      g.done = true;
      const gain = Math.max(0, 100 + g.credits * 40 - (g.attempts - 1) * 60);
      playSound("win");
      finish(true, gain);
      return;
    }
    playSound("lose");
    if (g.attempts >= ATTEMPTS) {
      g.done = true;
      finish(false, 0);
      return;
    }
    // 指认未通过质证: 透露是人指错了还是死因说错了, 换来的第二次机会更有推理味
    toast(tradeRight ? t("au.wrongCause") : causeRight ? t("au.wrongTrade") : t("au.wrongBoth"));
    renderRoom();
  }

  function finish(right, gain) {
    g.lastRight = right;
    g.lastGain = gain;
    const c = g.c;
    $("au-room").hidden = true;
    $("au-report").hidden = false;
    const concl = $("aur-conclusion");
    concl.textContent = right ? t("au.right", gain) : t("au.wrong");
    concl.className = "qdr-conclusion " + (right ? "win" : "lose");
    const causeName = pick(CAUSES.find((cz) => cz.id === c.tplId).t);
    $("aur-fatal").textContent = t("au.fatalReveal", tradeLabel(c.fatalIdx), causeName);
    $("aur-why").textContent = pick(TEMPLATES[c.tplId].why);
    if (right) {
      const b = qsLoadBest(BEST_KEY);
      if (gain > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: gain });
        toast(t("au.newBest", gain));
      }
    }
    renderIntroBest();
  }

  function backToSelect() {
    $("au-room").hidden = true;
    $("au-report").hidden = true;
    $("au-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("au-best").hidden = !b.best;
    if (b.best) $("au-best").textContent = t("au.best", b.best);
  }

  // ---------- 净值曲线: 流水编号标在曲线上, 清算线用 markLine ----------

  function buildChartOption() {
    const c = g.c;
    if (!c || $("au-room").hidden) return null;
    const data = c.daily.slice(0, c.blowDay + 1).map((row) => Math.round(row.eq));
    const points = c.trades.map((tr, i) => ({
      coord: [tr.day, Math.round(c.daily[tr.day].eq)],
      value: i + 1,
      itemStyle: { color: cssVar(tr.side === "buy" ? "--up" : "--down") },
    }));
    return {
      animation: false,
      grid: { left: 64, right: 14, top: 20, bottom: 24 },
      xAxis: {
        type: "category",
        data: data.map((_, i) => "D" + (i + 1)),
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
        data,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        areaStyle: { opacity: 0.08, color: cssVar("--lab-blue") },
        markPoint: {
          symbol: "pin",
          symbolSize: 28,
          label: { color: "#fff", fontSize: 10 },
          data: points,
        },
        markLine: {
          symbol: "none",
          label: { formatter: t("au.blowLine"), color: cssVar("--down"), fontSize: 10 },
          lineStyle: { color: cssVar("--down"), type: "dashed" },
          data: [{ yAxis: BLOW }],
        },
      }],
    };
  }

  // ---------- 接线 ----------

  $("btn-au-start").addEventListener("click", startCase);
  $("btn-au-ask").addEventListener("click", interrogate);
  $("btn-au-accuse").addEventListener("click", accuse);
  $("btn-au-back").addEventListener("click", backToSelect);
  $("btn-aur-again").addEventListener("click", startCase);
  $("btn-aur-games").addEventListener("click", () => switchView("games"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "autopsy") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-autopsy").hidden) return;
    renderIntroBest();
    if (g.c && !$("au-room").hidden) {
      renderBrief();
      renderSnapshot();
      renderRoom();
      if (!g.done) renderCauseSelect();
      chartH.refresh();
    }
    if (g.c && !$("au-report").hidden) finish(g.lastRight, g.lastGain);
  });

  renderIntroBest();
})();
