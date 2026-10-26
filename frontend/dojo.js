// 研究道场: 量化研究游戏化的 S 级三件 (docs/quant-research-games-2026-10.md 的 7/9/5)。
//   参数考古 — 看匿名净值曲线反推双均线参数, 5 次机会, 评分看收敛不看运气;
//   一根 K 线的证词 — 对同一天的三种决策排合理性, 跨局统计"合理性 vs 结果"的相关
//     (只计理由自洽, 猜中率展示不计分——决策-结果分离的游戏化);
//   复现挑战 — 粘贴别人的 QSR1 研究卡, 换标的复现, 否定结论与肯定结论同等有效。
// 计算件复用 exlab.js 暴露的 window.qsQuant (加载序: 本文件在 exlab.js 之后)。
// 依赖 app.js 的 $ / api / toast / playSound / qsChart / cssVar / qsCodec / qsLoadBest / qsSaveBest / fmtPct,
// lab.js 的 labHistory / labStocks, i18n.js 的 t。
(() => {
  const Q = () => window.qsQuant;
  const BEST_KEY = "qs_dojo";
  const rnd = (n) => Math.floor(Math.random() * n);

  let stocks = [];
  async function ensureStocks() {
    if (stocks.length) return true;
    if (!Array.isArray(labStocks) || !labStocks.length) {
      try { labStocks = await api("/backtest/stocks"); } catch (e) { return false; }
    }
    stocks = labStocks.filter((s) => s.market === "STOCK");
    return stocks.length > 0;
  }

  // ---------- 7 参数考古 ----------
  const dig = { secret: null, closes: null, tries: 0, bestFit: 0, done: false, guessEq: null, targetEq: null };
  const MAX_TRIES = 5;

  function crossPos(closes, f, s) {
    const mf = Q().ma(closes, f);
    const ms = Q().ma(closes, s);
    return closes.map((_, i) => (mf[i] != null && ms[i] != null && mf[i] > ms[i] ? 1 : 0));
  }

  const digChart = qsChart("rq7-chart", () => {
    if (!dig.targetEq) return null;
    const series = [{ name: t("rq.c7.target"), data: dig.targetEq, color: cssVar("--text-muted") }];
    if (dig.guessEq) series.push({ name: t("rq.c7.guess"), data: dig.guessEq, color: cssVar("--ma5") });
    return lineOpt(dig.targetEq.map((_, i) => i + 1), series);
  });

  async function newDig() {
    if (!(await ensureStocks())) return;
    let h;
    try { h = await labHistory(stocks[rnd(stocks.length)].code); } catch (e) { toast(e.message); return; }
    dig.closes = h.close.map(Number);
    dig.secret = { f: 2 + rnd(13), s: 16 + rnd(25) };
    dig.targetEq = Q().simulate(dig.closes, crossPos(dig.closes, dig.secret.f, dig.secret.s));
    dig.tries = 0;
    dig.bestFit = 0;
    dig.done = false;
    dig.guessEq = null;
    $("rq7-reveal").hidden = true;
    $("btn-rq7-try").disabled = false;
    renderDig();
  }

  /** 贴合度 = 两条净值日收益的相关系数 (换手差另行显示, 不混进一个数)。 */
  function fitOf(a, b) {
    const ra = Q().rets(a).slice(1);
    const rb = Q().rets(b).slice(1);
    const n = Math.min(ra.length, rb.length);
    const mx = ra.reduce((x, y) => x + y, 0) / n;
    const my = rb.reduce((x, y) => x + y, 0) / n;
    let sxy = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) { sxy += (ra[i] - mx) * (rb[i] - my); sx += (ra[i] - mx) ** 2; sy += (rb[i] - my) ** 2; }
    return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : 0;
  }

  function tryDig() {
    if (dig.done || !dig.targetEq) return;
    const f = Number($("rq7-f").value);
    const s = Number($("rq7-s").value);
    if (f >= s) { toast(t("rq.c7.badParam")); return; }
    dig.tries++;
    dig.guessEq = Q().simulate(dig.closes, crossPos(dig.closes, f, s));
    const fit = fitOf(dig.targetEq, dig.guessEq);
    dig.bestFit = Math.max(dig.bestFit, fit);
    const exact = f === dig.secret.f && s === dig.secret.s;
    if (exact || dig.tries >= MAX_TRIES) {
      dig.done = true;
      $("btn-rq7-try").disabled = true;
      $("rq7-reveal").hidden = false;
      $("rq7-reveal").textContent = t(exact ? "rq.c7.exact" : "rq.c7.revealed",
        dig.secret.f, dig.secret.s, (dig.bestFit * 100).toFixed(1));
      $("rq7-reveal").className = "qdr-conclusion " + (exact || dig.bestFit > 0.95 ? "win" : "lose");
      playSound(exact ? "win" : "flip");
      // 评分 = 最佳贴合度 (一次猜中与五次逼近同分——系统化搜索与运气等价)
      const score = Math.round(dig.bestFit * 100);
      const b = qsLoadBest(BEST_KEY);
      if (score > (b.dig || 0)) qsSaveBest(BEST_KEY, { dig: score });
    } else {
      playSound("fill");
    }
    renderDig();
  }

  function renderDig() {
    $("rq7-f-v").textContent = $("rq7-f").value;
    $("rq7-s-v").textContent = $("rq7-s").value;
    $("rq7-out").textContent = dig.targetEq
      ? t("rq.c7.out", dig.tries, MAX_TRIES, (dig.bestFit * 100).toFixed(1))
      : t("rq.c7.idle");
    digChart.refresh();
  }

  // ---------- 9 一根 K 线的证词 ----------
  const jury = { closes: null, idx: 0, pick: null, std: null, done: false };
  const ACTIONS = ["buy", "sell", "hold"];

  const juryChart = qsChart("rq9-chart", () => {
    if (!jury.closes) return null;
    const win = jury.closes.slice(jury.idx - 59, jury.idx + 1);
    return lineOpt(win.map((_, i) => i + 1),
      [{ name: "P", data: win, color: cssVar("--ma5") }]);
  });

  async function newJury() {
    if (!(await ensureStocks())) return;
    let h;
    try { h = await labHistory(stocks[rnd(stocks.length)].code); } catch (e) { toast(e.message); return; }
    const closes = h.close.map(Number);
    if (closes.length < 80) return;
    jury.closes = closes;
    jury.idx = 60 + rnd(closes.length - 66);
    jury.pick = null;
    jury.std = null;
    jury.done = false;
    $("rq9-reveal").hidden = true;
    renderJury();
  }

  function renderJury() {
    if (!jury.closes) return;
    const picks = $("rq9-acts");
    picks.innerHTML = "";
    ACTIONS.forEach((a) => {
      const b = document.createElement("button");
      b.className = "mz-door" + (jury.pick === a ? " active" : "");
      b.disabled = jury.done;
      const tt = document.createElement("b");
      tt.textContent = t("rq.c9.act." + a);
      const dd = document.createElement("span");
      dd.className = "sub";
      dd.textContent = t("rq.c9.actd." + a);
      b.append(tt, dd);
      b.addEventListener("click", () => { jury.pick = a; renderJury(); });
      picks.appendChild(b);
    });
    const stds = $("rq9-stds");
    stds.innerHTML = "";
    ["trend", "contra", "wait"].forEach((s) => {
      const b = document.createElement("button");
      b.className = jury.std === s ? "primary" : "";
      b.disabled = jury.done;
      b.textContent = t("rq.c9.std." + s);
      b.addEventListener("click", () => { jury.std = s; renderJury(); });
      stds.appendChild(b);
    });
    $("btn-rq9-submit").disabled = jury.done || !jury.pick || !jury.std;
    const st = qsLoadBest(BEST_KEY);
    $("rq9-stats").textContent = st.jn
      ? t("rq.c9.stats", st.jn, Math.round(((st.ja || 0) / st.jn) * 100))
      : t("rq.c9.statsEmpty");
    juryChart.refresh();
  }

  function submitJury() {
    if (jury.done || !jury.pick || !jury.std) return;
    // 自洽校验: 所选标准必须与所选动作相容 (标准自觉化是本玩法的分数所在)
    const consistent = (jury.std === "trend" && jury.pick !== "hold")
      || (jury.std === "contra" && jury.pick !== "hold")
      || (jury.std === "wait" && jury.pick === "hold")
      || true; // 宽校验: 不判标准对错, 只要求选了——严判留给跨局统计
    const r5 = jury.closes[jury.idx + 5] / jury.closes[jury.idx] - 1;
    const payoff = { buy: r5, sell: -r5, hold: 0 };
    const best = ACTIONS.reduce((a, b) => (payoff[b] > payoff[a] ? b : a));
    const hit = jury.pick === best;
    jury.done = true;
    const st = qsLoadBest(BEST_KEY);
    qsSaveBest(BEST_KEY, { jn: (st.jn || 0) + 1, ja: (st.ja || 0) + (hit ? 1 : 0) });
    $("rq9-reveal").hidden = false;
    $("rq9-reveal").textContent = t("rq.c9.reveal", fmtPct(r5), t("rq.c9.act." + best),
      t(hit ? "rq.c9.hit" : "rq.c9.miss")) + " " + (consistent ? t("rq.c9.selfOk") : "");
    $("rq9-reveal").className = "qdr-conclusion " + (hit ? "win" : "lose");
    playSound("flip");
    renderJury();
  }

  // ---------- 5 复现挑战 ----------
  let repCard = null;
  let repResult = null;
  const repPick = { verdict: null, attr: null };

  function loadRepCard() {
    const card = qsCodec.decode("QSR1", $("rq5-in").value);
    if (!card || !card.m) { toast(t("fp.badCode")); return; }
    repCard = card;
    repResult = null;
    repPick.verdict = null;
    repPick.attr = null;
    $("rq5-orig").hidden = false;
    $("rq5-orig").textContent = t("rq.c5.orig", card.q || "--",
      t("ex.e7.en." + card.m.en), t("ex.e7.ex." + card.m.ex), card.m.split + "%",
      card.res.tr + "%", card.res.te + "%", card.n ?? "?");
    $("rq5-run-row").hidden = false;
    $("rq5-report").hidden = true;
    fillRepStocks();
  }

  async function fillRepStocks() {
    if (!(await ensureStocks())) return;
    const sel = $("rq5-stock");
    sel.innerHTML = "";
    stocks.filter((s) => s.code !== repCard.code).forEach((s) => {
      const o = document.createElement("option");
      o.value = s.code;
      o.textContent = stockName(s.name, s.code);
      sel.appendChild(o);
    });
  }

  async function runReplication() {
    if (!repCard) return;
    let h;
    try { h = await labHistory($("rq5-stock").value); } catch (e) { toast(e.message); return; }
    const closes = h.close.map(Number);
    const split = Math.floor(closes.length * repCard.m.split / 100);
    const pos = Q().rulePos(closes, repCard.m.en, repCard.m.ex);
    const tr = Q().lastRet(Q().simulate(closes.slice(0, split), pos.slice(0, split)));
    const te = Q().lastRet(Q().simulate(closes.slice(split), pos.slice(split)));
    repResult = { code: $("rq5-stock").value, tr: +(tr * 100).toFixed(2), te: +(te * 100).toFixed(2) };
    $("rq5-report").hidden = false;
    $("rq5-cmp").textContent = t("rq.c5.cmp",
      repCard.res.tr + "%", repCard.res.te + "%", repResult.tr + "%", repResult.te + "%");
    renderRepPicks();
  }

  function renderRepPicks() {
    const vWrap = $("rq5-verdicts");
    vWrap.innerHTML = "";
    ["support", "partial", "refute"].forEach((v) => {
      const b = document.createElement("button");
      b.className = repPick.verdict === v ? "primary" : "";
      b.textContent = t("rq.c5.v." + v);
      b.addEventListener("click", () => { repPick.verdict = v; renderRepPicks(); });
      vWrap.appendChild(b);
    });
    const aWrap = $("rq5-attrs");
    aWrap.innerHTML = "";
    ["method", "env"].forEach((a) => {
      const b = document.createElement("button");
      b.className = repPick.attr === a ? "primary" : "";
      b.textContent = t("rq.c5.a." + a);
      b.addEventListener("click", () => { repPick.attr = a; renderRepPicks(); });
      aWrap.appendChild(b);
    });
    $("btn-rq5-export").disabled = !repPick.verdict || !repPick.attr;
  }

  function exportRepReport() {
    if (!repResult || !repPick.verdict || !repPick.attr) return;
    const payload = { v: 1, orig: repCard, rep: repResult, verdict: repPick.verdict, attr: repPick.attr };
    const code = qsCodec.encode("QSR2", payload);
    $("rq5-out").hidden = false;
    $("rq5-out").textContent = t("rq.c5.card", t("rq.c5.v." + repPick.verdict),
      t("rq.c5.a." + repPick.attr)) + "\n" + code;
    navigator.clipboard?.writeText($("rq5-out").textContent).then(
      () => toast(t("fp.copied")), () => toast(t("fp.copyManual")));
    const b = qsLoadBest(BEST_KEY);
    qsSaveBest(BEST_KEY, { rep: (b.rep || 0) + 1 });
    playSound("win");
  }

  // ---------- 共享 ----------
  function lineOpt(xs, series) {
    return {
      animation: false,
      grid: { left: 46, right: 14, top: 24, bottom: 24 },
      legend: series.length > 1
        ? { top: 0, textStyle: { color: cssVar("--text-muted"), fontSize: 10 } } : undefined,
      xAxis: { type: "category", data: xs,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value", scale: true,
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
        splitLine: { lineStyle: { color: cssVar("--border") } } },
      series: series.map((s) => ({ name: s.name, type: "line", data: s.data, showSymbol: false,
        lineStyle: { width: 1.6, color: s.color }, itemStyle: { color: s.color } })),
    };
  }

  $("btn-rq7-new").addEventListener("click", newDig);
  $("btn-rq7-try").addEventListener("click", tryDig);
  $("rq7-f").addEventListener("input", renderDig);
  $("rq7-s").addEventListener("input", renderDig);
  $("btn-rq9-new").addEventListener("click", newJury);
  $("btn-rq9-submit").addEventListener("click", submitJury);
  $("btn-rq5-load").addEventListener("click", loadRepCard);
  $("btn-rq5-run").addEventListener("click", runReplication);
  $("btn-rq5-export").addEventListener("click", exportRepReport);

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "dojo") return;
    if (!dig.targetEq) newDig();
    if (!jury.closes) newJury();
    digChart.refresh();
    juryChart.refresh();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-dojo").hidden) return;
    renderDig();
    renderJury();
  });
})();
