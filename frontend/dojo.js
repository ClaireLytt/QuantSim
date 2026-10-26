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

  // ---------- 8 鲁棒性保险箱 ----------
  const vault = { attempts: 0, opened: false, bestBase: null, givenUp: null };

  function vaultRun(closes, f, s, frMul, shift) {
    const c = shift ? closes.slice(shift) : closes;
    const fr0 = Q().frictionDefault();
    const frx = { on: true, comm: fr0.comm * frMul, stamp: fr0.stamp, slip: fr0.slip * frMul };
    return Q().lastRet(Q().simulate(c, crossPos(c, f, s), frx));
  }

  function jitter(closes, seed) {
    // 数据抖动: 固定种子 ±0.3% 噪声 (结论可复现)
    let a = seed | 0;
    return closes.map((v) => {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      return v * (1 + ((a / 0x7fffffff) * 2 - 1) * 0.003);
    });
  }

  async function tryVault() {
    if (!closes7()) { toast(t("rq.c7.idle")); return; }
    const f = Number($("rq8-f").value);
    const s = Number($("rq8-s").value);
    if (f >= s) { toast(t("rq.c7.badParam")); return; }
    vault.attempts++;
    const c = dig.closes;
    const base = vaultRun(c, f, s, 1, 0);
    if (vault.bestBase == null || base > vault.bestBase) vault.bestBase = base;
    // 五重扰动: 参数±20% 取最差 / 窗口平移 20 根 / 费率×2 / 数据抖动 / 换标的
    let other = null;
    if (await ensureStocks()) {
      try {
        const h = await labHistory(stocks[(f + s + vault.attempts) % stocks.length].code);
        other = h.close.map(Number);
      } catch (e) { /* 换标的项取不到数据时记为未测 */ }
    }
    const pf = (v) => v != null && v > 0;
    const items = [
      { k: "param", v: Math.min(
        vaultRun(c, Math.max(2, Math.round(f * 0.8)), Math.round(s * 0.8), 1, 0),
        vaultRun(c, Math.round(f * 1.2), Math.round(s * 1.2), 1, 0)) },
      { k: "shift", v: vaultRun(c, f, s, 1, 20) },
      { k: "fee", v: vaultRun(c, f, s, 2, 0) },
      { k: "noise", v: Q().lastRet(Q().simulate(jitter(c, f * 100 + s), crossPos(jitter(c, f * 100 + s), f, s), Q().frictionDefault())) },
      { k: "stock", v: other ? Q().lastRet(Q().simulate(other, crossPos(other, f, s), Q().frictionDefault())) : null },
    ];
    const passed = items.every((i) => pf(i.v));
    const ul = $("rq8-items");
    ul.innerHTML = "";
    items.forEach((i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = (pf(i.v) ? "✓ " : "✗ ") + t("rq.c8.i." + i.k);
      const dd = document.createElement("span");
      dd.textContent = i.v == null ? t("rq.c8.na") : fmtPct(i.v);
      if (i.v != null) dd.className = pf(i.v) ? "pos" : "neg";
      li.append(tt, dd);
      ul.appendChild(li);
    });
    const out = $("rq8-out");
    if (passed) {
      vault.opened = true;
      vault.givenUp = vault.bestBase - base;
      out.textContent = t("rq.c8.opened", vault.attempts, fmtPct(base), fmtPct(Math.max(0, vault.givenUp)));
      out.className = "qdr-conclusion win";
      playSound("win");
      const b = qsLoadBest(BEST_KEY);
      if (!b.vault || vault.attempts < b.vault) qsSaveBest(BEST_KEY, { vault: vault.attempts });
    } else {
      out.textContent = t("rq.c8.failed", vault.attempts, fmtPct(base));
      out.className = "qdr-conclusion lose";
      playSound("fill");
    }
  }

  const closes7 = () => dig.closes && dig.closes.length > 100;

  // ---------- 4 研究委托书 ----------
  const BRIEFS = [
    { id: "breakout", hope: 1 }, { id: "dca", hope: 1 },
    { id: "cross", hope: 1 }, { id: "chase", hope: 0 },
  ];
  function renderBrief() {
    const b = BRIEFS[Math.abs(Math.floor(Date.now() / 86400000)) % BRIEFS.length];
    $("rq4-brief").textContent = t("rq.c4.b." + b.id);
    $("rq4-hope").textContent = t("rq.c4.hope", t(b.hope ? "rq.c4.hopeYes" : "rq.c4.hopeNo"));
    return b;
  }

  function acceptBrief() {
    const card = qsCodec.decode("QSR1", $("rq4-in").value);
    const box = $("rq4-review");
    if (!card || !card.m) { toast(t("fp.badCode")); return; }
    const b = renderBrief();
    // 验收清单 (规则引擎): 分区声明 / 摩擦口径 / 至少做过比较 / 结论非空
    const checks = [
      { k: "split", ok: Number(card.m.split) >= 60 },
      { k: "friction", ok: card.fr === true },
      { k: "explored", ok: Number(card.n) >= 2 },
      { k: "concl", ok: !!(card.c && card.c.length >= 5) },
    ];
    const allOk = checks.every((c) => c.ok);
    // 风骨: 测试段结果与委托人期望相悖仍如实交付 (数字由 E19 诚实计算, 伪造无门)
    const contradicts = b.hope ? Number(card.res.te) <= 0 : Number(card.res.te) > 0;
    box.hidden = false;
    const ul = $("rq4-checks");
    ul.innerHTML = "";
    checks.forEach((c) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = (c.ok ? "✓ " : "✗ ") + t("rq.c4.k." + c.k);
      li.appendChild(tt);
      ul.appendChild(li);
    });
    $("rq4-verdict").textContent = allOk
      ? (contradicts ? t("rq.c4.passSpine") : t("rq.c4.pass"))
      : t("rq.c4.fail");
    $("rq4-verdict").className = "qdr-conclusion " + (allOk ? "win" : "lose");
    playSound(allOk ? "win" : "lose");
    if (allOk) {
      const st = qsLoadBest(BEST_KEY);
      qsSaveBest(BEST_KEY, { briefs: (st.briefs || 0) + 1, spine: (st.spine || 0) + (contradicts ? 1 : 0) });
    }
  }

  // ---------- 14 市况轮盘压力测试 ----------
  const ARCHETYPES = ["trend", "chop", "crash", "bleed", "fakeout", "squeeze"];
  const wheel = { last: null };

  /** 六种市况原型 (参数即假设, 文案明示); seed 每次旋转随机但局内固定。 */
  function synth14(kind, seed) {
    let a = seed | 0;
    const rng = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const c = [100];
    for (let i = 1; i < 220; i++) {
      let drift = 0;
      let vol = 0.015;
      if (kind === "trend") drift = 0.0012;
      else if (kind === "chop") { drift = (100 - c[i - 1]) * 0.0004; vol = 0.02; }
      else if (kind === "crash") { drift = i >= 70 && i < 100 ? -0.014 : 0.001; vol = i >= 70 && i < 100 ? 0.03 : 0.012; }
      else if (kind === "bleed") { drift = -0.0025; vol = 0.009; }
      else if (kind === "fakeout") { drift = (i % 30 < 8 ? 0.004 : -0.0015); vol = 0.018; }
      else { drift = 0; vol = 0.032; } // squeeze: 横盘高波
      c.push(Math.max(5, c[i - 1] * (1 + drift + (rng() * 2 - 1) * vol)));
    }
    return c;
  }

  function wheelPos(c, entry, exit, defense) {
    let pos = Q().rulePos(c, entry, exit);
    if (defense === "cap") pos = pos.map((p) => p * 0.6);
    if (defense === "volfilter") {
      const vol = [];
      const r = Q().rets(c);
      for (let i = 0; i < c.length; i++) {
        if (i < 10) { vol.push(0); continue; }
        const seg = r.slice(i - 9, i + 1);
        const m = seg.reduce((x, y) => x + y, 0) / 10;
        vol.push(Math.sqrt(seg.reduce((x, y) => x + (y - m) ** 2, 0) / 10) * Math.sqrt(250));
      }
      pos = pos.map((p, i) => (vol[i] > 0.45 ? 0 : p)); // 年化波动 >45% 离场
    }
    return pos;
  }

  function spinWheel() {
    const entry = $("rq14-entry").value;
    const exit = $("rq14-exit").value;
    const defense = $("rq14-def").value;
    const picked = [...ARCHETYPES].sort(() => Math.random() - 0.5).slice(0, 3);
    const rows = picked.map((k) => {
      const c = synth14(k, Math.floor(Math.random() * 1e9));
      const fr0 = Q().frictionDefault();
      const eq = Q().simulate(c, wheelPos(c, entry, exit, defense), fr0);
      const eqBare = Q().simulate(c, wheelPos(c, entry, exit, "none"), fr0);
      const dd = Q().maxDD(eq);
      return { k, ret: Q().lastRet(eq), dd, survived: dd < 0.25, bareRet: Q().lastRet(eqBare) };
    });
    const ul = $("rq14-rows");
    ul.innerHTML = "";
    rows.forEach((r) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = (r.survived ? "✓ " : "✗ ") + t("rq.c14.a." + r.k);
      const dd = document.createElement("span");
      dd.textContent = t("rq.c14.row", fmtPct(r.ret), fmtPct(r.dd),
        defense === "none" ? "--" : fmtPct(r.ret - r.bareRet));
      li.append(tt, dd);
      ul.appendChild(li);
    });
    // 适应谱累计: 某原型存活过一次即点亮 (跨次旋转积累, 集齐 6 原型发徽记)
    const st = qsLoadBest(BEST_KEY);
    const spectrum = st.spectrum || {};
    rows.forEach((r) => { if (r.survived) spectrum[r.k] = 1; });
    qsSaveBest(BEST_KEY, { spectrum });
    const lit = ARCHETYPES.filter((k) => spectrum[k]).length;
    if (lit === ARCHETYPES.length && !st.wheelBadge) {
      qsSaveBest(BEST_KEY, { wheelBadge: 1 });
      toast(t("rq.c14.badge"));
      playSound("win");
    }
    wheel.last = rows;
    $("rq14-out").textContent = t("rq.c14.out", rows.filter((r) => r.survived).length, lit, ARCHETYPES.length);
    radarChart.refresh();
  }

  const radarChart = qsChart("rq14-radar", () => {
    const spectrum = (qsLoadBest(BEST_KEY).spectrum) || {};
    return {
      animation: false,
      radar: {
        indicator: ARCHETYPES.map((k) => ({ name: t("rq.c14.a." + k), max: 1 })),
        radius: "65%",
        axisName: { color: cssVar("--text-muted"), fontSize: 10 },
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLine: { lineStyle: { color: cssVar("--border") } },
        splitArea: { show: false },
      },
      series: [{ type: "radar",
        data: [{ value: ARCHETYPES.map((k) => (spectrum[k] ? 1 : 0)) }],
        areaStyle: { color: cssVar("--ma5"), opacity: 0.25 },
        lineStyle: { color: cssVar("--ma5") },
        itemStyle: { color: cssVar("--ma5") } }],
    };
  });

  // ---------- 2 残卡修复所 ----------
  // 残卡模板: truth = 病根 (noexit 缺出场 / badparam 参数损坏 / noise 入场即噪声);
  // fixable=false 的卡正确答案是"放弃修复"——识别没救的点子是研究者的核心能力。
  const BROKEN_CARDS = [
    { id: "b1", entry: "cross", exitKind: "none", truth: "noexit", fixable: true, goodFixes: ["death", "trail"] },
    { id: "b2", entry: "breakout", exitKind: "tightTrail", truth: "badparam", fixable: true, goodFixes: ["trail", "fixed"] },
    { id: "b3", entry: "pullback", exitKind: "oneDay", truth: "badparam", fixable: true, goodFixes: ["fixed", "death"] },
    { id: "b4", entry: "random", exitKind: "death", truth: "noise", fixable: false, goodFixes: [] },
  ];
  const repair = { card: null, closes: null, diag: null, fix: null, done: false };

  /** 残卡/修复后的仓位: 残缺形态本地实现 (qsQuant.rulePos 只有健康件)。 */
  function repairPos(c, entry, exitKind) {
    const m5 = Q().ma(c, 5);
    const m20 = Q().ma(c, 20);
    let seed = 777;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pos = [];
    let holding = false;
    let entryIdx = -1;
    let peak = 0;
    for (let i = 0; i < c.length; i++) {
      if (m20[i] == null) { pos.push(0); rng(); continue; }
      if (!holding) {
        const hi20 = i >= 20 ? Math.max(...c.slice(i - 20, i)) : Infinity;
        const enter = entry === "cross" ? (m5[i] > m20[i] && m5[i - 1] != null && m5[i - 1] <= m20[i - 1])
          : entry === "breakout" ? c[i] > hi20
            : entry === "pullback" ? (c[i] > m20[i] && m5[i] != null && c[i] < m5[i])
              : rng() < 0.08; // random: 噪声入场
        if (enter) { holding = true; entryIdx = i; peak = c[i]; }
      } else {
        peak = Math.max(peak, c[i]);
        const leave = exitKind === "none" ? false
          : exitKind === "tightTrail" ? c[i] <= peak * 0.995
            : exitKind === "oneDay" ? i - entryIdx >= 1
              : exitKind === "death" ? c[i] < m20[i]
                : exitKind === "fixed" ? i - entryIdx >= 10
                  : c[i] <= peak * 0.92; // trail 8%
        if (leave) holding = false;
      }
      pos.push(holding ? 1 : 0);
    }
    return pos;
  }

  const repairChart = qsChart("rq2-chart", () => {
    if (!repair.card || !repair.closes) return null;
    const c = repair.closes;
    const split = Math.floor(c.length * 0.7);
    const broken = Q().simulate(c.slice(0, split),
      repairPos(c.slice(0, split), repair.card.entry, repair.card.exitKind), Q().frictionDefault());
    const series = [{ name: t("rq.c2.broken"), data: broken, color: cssVar("--bad") }];
    if (repair.done && repair.fix && repair.fix !== "abandon") {
      const fixed = Q().simulate(c.slice(split),
        repairPos(c.slice(split), repair.card.entry, repair.fix), Q().frictionDefault());
      series.push({ name: t("rq.c2.fixed"), data: fixed, color: cssVar("--ma5") });
    }
    return lineOpt(series[0].data.map((_, i) => i + 1), series);
  });

  async function newRepair() {
    if (!(await ensureStocks())) return;
    let h;
    try { h = await labHistory(stocks[rnd(stocks.length)].code); } catch (e) { toast(e.message); return; }
    repair.closes = h.close.map(Number);
    repair.card = BROKEN_CARDS[rnd(BROKEN_CARDS.length)];
    repair.diag = null;
    repair.fix = null;
    repair.done = false;
    $("rq2-reveal").hidden = true;
    renderRepair();
  }

  function renderRepair() {
    if (!repair.card) return;
    $("rq2-card").textContent = t("rq.c2.card", t("ex.e7.en." + (repair.card.entry === "random" ? "cross" : repair.card.entry))
      + (repair.card.entry === "random" ? t("rq.c2.entrySuspect") : ""),
      t("rq.c2.ex." + repair.card.exitKind));
    const dWrap = $("rq2-diags");
    dWrap.innerHTML = "";
    ["noexit", "badparam", "noise"].forEach((d) => {
      const b = document.createElement("button");
      b.className = repair.diag === d ? "primary" : "";
      b.disabled = repair.done;
      b.textContent = t("rq.c2.d." + d);
      b.addEventListener("click", () => { repair.diag = d; renderRepair(); });
      dWrap.appendChild(b);
    });
    const fWrap = $("rq2-fixes");
    fWrap.innerHTML = "";
    ["death", "fixed", "trail", "abandon"].forEach((f) => {
      const b = document.createElement("button");
      b.className = repair.fix === f ? "primary" : "";
      b.disabled = repair.done;
      b.textContent = t("rq.c2.f." + f);
      b.addEventListener("click", () => { repair.fix = f; renderRepair(); });
      fWrap.appendChild(b);
    });
    $("btn-rq2-submit").disabled = repair.done || !repair.diag || !repair.fix;
    repairChart.refresh();
  }

  function submitRepair() {
    const card = repair.card;
    if (!card || repair.done || !repair.diag || !repair.fix) return;
    repair.done = true;
    const diagOk = repair.diag === card.truth;
    const fixOk = card.fixable ? card.goodFixes.includes(repair.fix) : repair.fix === "abandon";
    const knowStop = !card.fixable && repair.fix === "abandon" && diagOk;
    const rv = $("rq2-reveal");
    rv.hidden = false;
    rv.textContent = t("rq.c2.reveal", t(diagOk ? "fbt.hit" : "fbt.miss"), t("rq.c2.d." + card.truth),
      t(fixOk ? "fbt.hit" : "fbt.miss"))
      + (knowStop ? " " + t("rq.c2.knowStop") : "")
      + (!card.fixable && repair.fix !== "abandon" ? " " + t("rq.c2.unfixable") : "");
    rv.className = "qdr-conclusion " + (diagOk && fixOk ? "win" : "lose");
    playSound(diagOk && fixOk ? "win" : "lose");
    const st = qsLoadBest(BEST_KEY);
    qsSaveBest(BEST_KEY, { repN: (st.repN || 0) + 1, repOk: (st.repOk || 0) + (diagOk && fixOk ? 1 : 0) });
    renderRepair();
  }

  // ---------- 13 历史爆仓重演 ----------
  // 任务不是赚钱, 是比原主少死一点: 单日减仓限速 20% (流动性约束), 原主死扛到强平线 (净值 60%) 全抛。
  const rescue = { path: null, day: 0, shares: 0, cash: 0, entryEq: 0, done: false, hist: [], ownerEq: null };
  const RESCUE_DAYS = 20;

  const rescueChart = qsChart("rq13-chart", () => {
    if (!rescue.path) return null;
    const shown = rescue.path.slice(0, 11 + rescue.day);
    const series = [{ name: "P", data: shown, color: cssVar("--text-muted") }];
    if (rescue.done) {
      series.push({ name: t("rq.c13.you"), data: rescue.hist, color: cssVar("--ma5") });
      series.push({ name: t("rq.c13.owner"), data: rescue.ownerEq, color: cssVar("--bad") });
    }
    return lineOpt(shown.map((_, i) => i + 1), series);
  });

  function newRescue() {
    // 案例行情: 前 10 日下跌铺垫(你接手时已浮亏), 后 20 日继续下杀再弱反弹 (随机种子)
    const seed = Math.floor(Math.random() * 1e9);
    let a = seed | 0;
    const rng = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const p = [100];
    for (let i = 1; i < 11 + RESCUE_DAYS; i++) {
      const drift = i < 11 ? -0.012 : i < 23 ? -0.02 : 0.008;
      p.push(Math.max(10, p[i - 1] * (1 + drift + (rng() * 2 - 1) * 0.022)));
    }
    rescue.path = p;
    rescue.day = 0;
    rescue.shares = 1000;
    rescue.cash = 0;
    rescue.entryEq = 1000 * p[10]; // 接手时点净值 (已距成本 -10%+)
    rescue.done = false;
    rescue.hist = [normEq()];
    $("rq13-reveal").hidden = true;
    renderRescue();
  }

  const normEq = () => (rescue.cash + rescue.shares * rescue.path[10 + rescue.day]) / rescue.entryEq;

  function rescueStep(sellPct) {
    if (!rescue.path || rescue.done) return;
    const price = rescue.path[10 + rescue.day];
    const sellShares = Math.floor(rescue.shares * sellPct);
    if (sellShares > 0) {
      const fr0 = Q().frictionDefault();
      rescue.cash += sellShares * price * (1 - (fr0.comm + fr0.slip + fr0.stamp) / 10000);
      rescue.shares -= sellShares;
    }
    rescue.day++;
    rescue.hist.push(normEq());
    playSound("tap");
    if (rescue.day >= RESCUE_DAYS) finishRescue();
    else renderRescue();
  }

  function finishRescue() {
    rescue.done = true;
    // 原主路径: 死扛, 净值跌破 60% 当日全抛 (强平), 之后持现金
    let oShares = 1000;
    let oCash = 0;
    const ownerEq = [1];
    for (let d = 1; d <= RESCUE_DAYS; d++) {
      const price = rescue.path[10 + d];
      const eq = (oCash + oShares * price) / rescue.entryEq;
      if (oShares > 0 && eq < 0.6) { oCash += oShares * price * 0.995; oShares = 0; }
      ownerEq.push((oCash + oShares * price) / rescue.entryEq);
    }
    // 曲线对齐到图表 x 轴 (前 10 根铺垫期无净值, 补 null)
    rescue.ownerEq = Array(11).fill(null).concat(ownerEq);
    rescue.hist = Array(11).fill(null).concat(rescue.hist);
    const mine = rescue.hist[rescue.hist.length - 1];
    const owner = rescue.ownerEq[rescue.ownerEq.length - 1];
    const rv = $("rq13-reveal");
    rv.hidden = false;
    rv.textContent = t("rq.c13.reveal", fmtPct(mine - 1), fmtPct(owner - 1), fmtPct(mine - owner));
    rv.className = "qdr-conclusion " + (mine > owner ? "win" : "lose");
    playSound(mine > owner ? "win" : "lose");
    const st = qsLoadBest(BEST_KEY);
    const gain = Math.round((mine - owner) * 1000) / 10;
    if (mine > owner && gain > (st.rescue || 0)) qsSaveBest(BEST_KEY, { rescue: gain });
    renderRescue();
  }

  function renderRescue() {
    if (!rescue.path) return;
    $("rq13-day").textContent = t("rq.c13.day", rescue.day, RESCUE_DAYS);
    $("rq13-state").textContent = t("rq.c13.state",
      rescue.shares, fmtPct(normEq() - 1), Math.round(rescue.cash));
    ["btn-rq13-hold", "btn-rq13-s10", "btn-rq13-s20"].forEach((id) => { $(id).disabled = rescue.done; });
    rescueChart.refresh();
  }

  // ---------- 6 异常侦查令 ----------
  const hunt = { closes: null, from: 0, to: 0, type: null, done: false, pickType: null };

  const huntChart = qsChart("rq6-chart", () => {
    if (!hunt.closes) return null;
    const w = Number($("rq6-win").value);
    const r = Q().rets(hunt.closes);
    const rollMean = r.map((_, i) => (i < w ? null : +(r.slice(i - w + 1, i + 1).reduce((x, y) => x + y, 0) / w * 10000).toFixed(1)));
    const rollVolArr = r.map((_, i) => {
      if (i < w) return null;
      const seg = r.slice(i - w + 1, i + 1);
      const m = seg.reduce((x, y) => x + y, 0) / w;
      return +(Math.sqrt(seg.reduce((x, y) => x + (y - m) ** 2, 0) / w) * 10000).toFixed(1);
    });
    const opt = lineOpt(hunt.closes.map((_, i) => i + 1), [
      { name: t("rq.c6.mean"), data: rollMean, color: cssVar("--ma5") },
      { name: t("rq.c6.vol"), data: rollVolArr, color: cssVar("--ma20") },
    ]);
    // 嫌疑区间标记 (玩家圈定); 揭晓后叠加真值区间
    opt.series[0].markArea = { silent: true, itemStyle: { color: cssVar("--mask") },
      data: [[{ xAxis: Number($("rq6-from").value) }, { xAxis: Number($("rq6-to").value) }]] };
    if (hunt.done) {
      opt.series[1].markArea = { silent: true,
        itemStyle: { color: cssVar("--warn"), opacity: 0.18 },
        data: [[{ xAxis: hunt.from }, { xAxis: hunt.to }]] };
    }
    return opt;
  });

  async function newHunt() {
    if (!(await ensureStocks())) return;
    let h;
    try { h = await labHistory(stocks[rnd(stocks.length)].code); } catch (e) { toast(e.message); return; }
    const c = h.close.map(Number).slice(0, 250);
    if (c.length < 120) return;
    const types = ["drift", "volx", "saw"];
    hunt.type = types[rnd(3)];
    hunt.from = 30 + rnd(c.length - 90);
    hunt.to = hunt.from + 25;
    // 注入: 漂移 +0.4%/日 / 波动×2.2 / 锯齿 ±1.5% 交替
    let seed = 31337;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const mod = c.slice();
    let drift = 1;
    for (let i = hunt.from; i <= hunt.to; i++) {
      if (hunt.type === "drift") { drift *= 1.004; mod[i] = c[i] * drift; }
      else if (hunt.type === "volx") mod[i] = c[i] * (1 + (rng() * 2 - 1) * 0.035);
      else mod[i] = c[i] * (1 + (i % 2 ? 0.015 : -0.015));
    }
    if (hunt.type === "drift") for (let i = hunt.to + 1; i < mod.length; i++) mod[i] = c[i] * drift; // 漂移不回撤, 防"断崖"泄题
    hunt.closes = mod;
    hunt.done = false;
    hunt.pickType = null;
    $("rq6-from").max = String(mod.length - 1);
    $("rq6-to").max = String(mod.length - 1);
    $("rq6-reveal").hidden = true;
    renderHunt();
  }

  function renderHunt() {
    if (!hunt.closes) return;
    $("rq6-range-v").textContent = $("rq6-from").value + " ~ " + $("rq6-to").value;
    const wrap = $("rq6-types");
    wrap.innerHTML = "";
    ["drift", "volx", "saw"].forEach((ty) => {
      const b = document.createElement("button");
      b.className = hunt.pickType === ty ? "primary" : "";
      b.disabled = hunt.done;
      b.textContent = t("rq.c6.ty." + ty);
      b.addEventListener("click", () => { hunt.pickType = ty; renderHunt(); });
      wrap.appendChild(b);
    });
    $("btn-rq6-submit").disabled = hunt.done || !hunt.pickType;
    huntChart.refresh();
  }

  function submitHunt() {
    if (!hunt.closes || hunt.done || !hunt.pickType) return;
    const f = Number($("rq6-from").value);
    const to = Number($("rq6-to").value);
    if (to <= f) { toast(t("rq.c6.badRange")); return; }
    hunt.done = true;
    const span = to - f;
    // 乱枪打鸟判无效: 圈定超过全长 40% 直接零分 (精确性是硬要求)
    const shotgun = span > hunt.closes.length * 0.4;
    const overlap = Math.max(0, Math.min(to, hunt.to) - Math.max(f, hunt.from));
    const truthLen = hunt.to - hunt.from;
    const iou = overlap / (span + truthLen - overlap);
    const typeOk = hunt.pickType === hunt.type;
    const score = shotgun ? 0 : Math.round(iou * 70 + (typeOk ? 30 : 0));
    const rv = $("rq6-reveal");
    rv.hidden = false;
    rv.textContent = (shotgun ? t("rq.c6.shotgun") + " " : "")
      + t("rq.c6.reveal", hunt.from, hunt.to, t("rq.c6.ty." + hunt.type),
        Math.round(iou * 100), t(typeOk ? "fbt.hit" : "fbt.miss"), score);
    rv.className = "qdr-conclusion " + (score >= 60 ? "win" : "lose");
    playSound(score >= 60 ? "win" : "lose");
    const st = qsLoadBest(BEST_KEY);
    if (score > (st.hunt || 0)) qsSaveBest(BEST_KEY, { hunt: score });
    renderHunt();
  }

  // ---------- 10 擂台盲测赛 (服务端: 报名锁死 / 过去周才揭晓) ----------
  async function blindSubmit() {
    if (!window.Auth || !Auth.user) { toast(t("fp.needLogin")); return; }
    const p = qsCodec.decode("QS1", $("rq10-in").value);
    if (!p || !p.s) { toast(t("rq.c10.badCode")); return; }
    // QS1 策略码 → RunRequest 形配置 (sharecode 的字段即 RunRequest 字段)
    const config = { ...(p.p || {}), strategy: p.s, positionPct: p.pos };
    if (p.buy) config.buyConditions = p.buy;
    if (p.sell) config.sellConditions = p.sell;
    try {
      const r = await api("/blind/submit", { method: "POST", body: JSON.stringify(config) });
      toast(t("rq.c10.locked", r.week, r.players));
      playSound("win");
      loadBlindBoard(null);
    } catch (e) { toast(e.message); }
  }

  let blindWeek = null;
  async function loadBlindBoard(week) {
    try {
      const b = await api("/blind/board" + (week != null ? "?week=" + week : ""));
      blindWeek = b.week;
      $("rq10-board").hidden = false;
      $("rq10-status").textContent = b.revealed
        ? t("rq.c10.revealed", b.week, b.players)
        : t("rq.c10.sealed", b.week, b.players, t(b.joined ? "rq.c10.joined" : "rq.c10.notJoined"));
      const ul = $("rq10-rows");
      ul.innerHTML = "";
      (b.rows || []).forEach((r, i) => {
        const li = document.createElement("li");
        const tt = document.createElement("b");
        tt.textContent = `#${i + 1} ` + r.username + (r.isSelf ? t("fp.duelMe") : "");
        const dd = document.createElement("span");
        dd.textContent = t("rq.c10.row", fmtPct(Number(r.score)), fmtPct(Number(r.worst)), fmtPct(Number(r.mean)));
        li.append(tt, dd);
        ul.appendChild(li);
      });
    } catch (e) { toast(e.message); }
  }

  // ---------- 11 接力调参 (QSL1 码接力, 三旋钮每人只动一个) ----------
  const KNOBS = ["entry", "exit", "defense"];
  const RELAY_BASE = { entry: "cross", exit: "death", defense: "none" };
  const KNOB_VALUES = {
    entry: ["cross", "breakout", "pullback"],
    exit: ["death", "fixed", "trail"],
    defense: ["none", "cap", "volfilter"],
  };
  let relay = null; // {code, steps:[{k,v,why,who}]}

  async function relayStart() {
    if (!(await ensureStocks())) return;
    relay = { code: stocks[rnd(stocks.length)].code, steps: [] };
    $("rq11-stage").hidden = false;
    renderRelay();
  }

  function relayLoad() {
    const p = qsCodec.decode("QSL1", $("rq11-in").value);
    if (!p || !p.code || !Array.isArray(p.steps)) { toast(t("fp.badCode")); return; }
    relay = p;
    $("rq11-stage").hidden = false;
    if (relay.steps.length >= 3) revealRelay();
    else renderRelay();
  }

  function relayKnobsLeft() {
    const used = new Set(relay.steps.map((s) => s.k));
    return KNOBS.filter((k) => !used.has(k));
  }

  function renderRelay() {
    if (!relay) return;
    $("rq11-head").textContent = t("rq.c11.head", relay.steps.length + 1, 3, relay.code);
    const log = $("rq11-log");
    log.innerHTML = "";
    relay.steps.forEach((s, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("rq.c11.stepLine", i + 1, s.who || "?", t("rq.c11.k." + s.k),
        t("rq.c11.v." + s.k + "." + s.v));
      const dd = document.createElement("span");
      dd.textContent = "「" + s.why + "」";
      li.append(tt, dd);
      log.appendChild(li);
    });
    const kSel = $("rq11-knob");
    kSel.innerHTML = "";
    relayKnobsLeft().forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = t("rq.c11.k." + k);
      kSel.appendChild(o);
    });
    renderRelayValues();
    $("rq11-form").hidden = false;
    $("rq11-result").hidden = true;
  }

  function renderRelayValues() {
    const k = $("rq11-knob").value;
    const vSel = $("rq11-val");
    vSel.innerHTML = "";
    (KNOB_VALUES[k] || []).forEach((v) => {
      if (v === RELAY_BASE[k]) return; // 动旋钮必须真的动 (基线值不可选)
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t("rq.c11.v." + k + "." + v);
      vSel.appendChild(o);
    });
  }

  function relayCommit() {
    if (!relay) return;
    const why = $("rq11-why").value.trim();
    if (why.length < 10 || why.length > 30) { toast(t("rq.c11.whyLen")); return; }
    const who = (window.Auth && Auth.user ? Auth.user.username : t("rq.c11.anon")).slice(0, 10);
    relay.steps.push({ k: $("rq11-knob").value, v: $("rq11-val").value, why, who });
    $("rq11-why").value = "";
    if (relay.steps.length >= 3) { revealRelay(); return; }
    const code = qsCodec.encode("QSL1", relay);
    $("rq11-out").hidden = false;
    $("rq11-out").value = code;
    $("rq11-form").hidden = true;
    navigator.clipboard?.writeText(code).then(
      () => toast(t("rq.c11.pass")), () => toast(t("fp.copyManual")));
    renderRelay2();
  }

  function renderRelay2() { // 交棒后只展示日志, 不再给表单
    $("rq11-head").textContent = t("rq.c11.handed", relay.steps.length, 3);
    $("rq11-form").hidden = true;
  }

  const relayChart = qsChart("rq11-chart", () => {
    if (!relay || !relay.blind) return null;
    return lineOpt(relay.blind.curves[0].data.map((_, i) => i + 1), relay.blind.curves);
  });

  async function revealRelay() {
    // 盲测段 = 该标的后 30% (接力期间 UI 从不展示这段的任何数字)
    let h;
    try { h = await labHistory(relay.code); } catch (e) { toast(e.message); return; }
    const c = h.close.map(Number);
    const split = Math.floor(c.length * 0.7);
    const blind = c.slice(split);
    const cfgs = [{ ...RELAY_BASE }];
    relay.steps.forEach((s, i) => { cfgs.push({ ...cfgs[i], [s.k]: s.v }); });
    const rets = cfgs.map((cfg) => Q().lastRet(
      Q().simulate(blind, wheelPos(blind, cfg.entry, cfg.exit, cfg.defense), Q().frictionDefault())));
    const ul = $("rq11-log");
    ul.innerHTML = "";
    relay.steps.forEach((s, i) => {
      const li = document.createElement("li");
      const delta = rets[i + 1] - rets[i];
      const tt = document.createElement("b");
      tt.textContent = t("rq.c11.stepLine", i + 1, s.who || "?", t("rq.c11.k." + s.k),
        t("rq.c11.v." + s.k + "." + s.v));
      const dd = document.createElement("span");
      dd.textContent = "「" + s.why + "」 " + t("rq.c11.delta", (delta >= 0 ? "+" : "") + fmtPct(delta));
      dd.className = delta >= 0 ? "pos" : "neg";
      li.append(tt, dd);
      ul.appendChild(li);
    });
    relay.blind = { curves: [
      { name: t("rq.c11.base"), data: Q().simulate(blind, wheelPos(blind, RELAY_BASE.entry, RELAY_BASE.exit, RELAY_BASE.defense), Q().frictionDefault()), color: cssVar("--text-muted") },
      { name: t("rq.c11.final"), data: Q().simulate(blind, wheelPos(blind, cfgs[3].entry, cfgs[3].exit, cfgs[3].defense), Q().frictionDefault()), color: cssVar("--ma5") },
    ] };
    $("rq11-form").hidden = true;
    $("rq11-result").hidden = false;
    $("rq11-result").textContent = t("rq.c11.result", fmtPct(rets[0]), fmtPct(rets[3]));
    $("rq11-result").className = "qdr-conclusion " + (rets[3] > rets[0] ? "win" : "lose");
    $("rq11-head").textContent = t("rq.c11.done", relay.code);
    playSound(rets[3] > rets[0] ? "win" : "lose");
    relayChart.refresh();
  }

  // ---------- 12 失败博物馆 (QSM2 展品 / QSM3 受教回执, 全码交换) ----------
  const FAIL_TAGS = ["chase", "noStop", "overtrade", "allin", "fomo", "stubborn"];

  function curateExhibit() {
    const r = state.lastSettle;
    if (!r) { toast(t("fp.guessNeedGame")); return; }
    const cap = $("rq12-cap").value.trim();
    if (cap.length < 20) { toast(t("rq.c12.capLen")); return; }
    const exhibit = {
      v: 1, ret: +Number(r.returnRate).toFixed(4),
      dd: r.risk ? +Number(r.risk.maxDrawdown).toFixed(4) : null,
      tag: $("rq12-tag").value, cap: cap.slice(0, 60),
      who: (window.Auth && Auth.user ? Auth.user.username : t("rq.c11.anon")).slice(0, 10),
    };
    const code = qsCodec.encode("QSM2", exhibit);
    const st = qsLoadBest(BEST_KEY);
    const mine = (st.museum || []).slice(-2); // 最多陈列 3 件
    mine.push({ code, acks: [] });
    qsSaveBest(BEST_KEY, { museum: mine });
    $("rq12-out").hidden = false;
    $("rq12-out").value = code;
    navigator.clipboard?.writeText(code).then(
      () => toast(t("fp.copied")), () => toast(t("fp.copyManual")));
    renderMuseum();
  }

  function viewExhibit() {
    const raw = $("rq12-in").value.trim();
    // 受教回执直接记账 (策展人粘贴朋友发回的 QSM3)
    const ack = qsCodec.decode("QSM3", raw);
    if (ack && ack.h) {
      const st = qsLoadBest(BEST_KEY);
      const mine = st.museum || [];
      const hit = mine.find((m) => m.code.endsWith(ack.h));
      if (!hit) { toast(t("rq.c12.ackOrphan")); return; }
      const key = ack.h + "|" + (ack.by || "?");
      if (!hit.acks.includes(key)) hit.acks.push(key);
      qsSaveBest(BEST_KEY, { museum: mine });
      toast(t("rq.c12.ackIn"));
      renderMuseum();
      return;
    }
    const ex = qsCodec.decode("QSM2", raw);
    if (!ex) { toast(t("fp.badCode")); return; }
    const box = $("rq12-view");
    box.hidden = false;
    $("rq12-plaque").textContent = t("rq.c12.plaque", ex.who || "?",
      fmtPct(Number(ex.ret)), ex.dd != null ? fmtPct(Number(ex.dd)) : "--",
      t("rq.c12.tag." + ex.tag), ex.cap);
    $("btn-rq12-ack").onclick = () => {
      const by = (window.Auth && Auth.user ? Auth.user.username : t("rq.c11.anon")).slice(0, 10);
      const code = qsCodec.encode("QSM3", { v: 1, h: raw.slice(-8), by });
      navigator.clipboard?.writeText(code).then(
        () => toast(t("rq.c12.ackOut")), () => toast(t("fp.copyManual")));
    };
  }

  function renderMuseum() {
    const mine = qsLoadBest(BEST_KEY).museum || [];
    const ul = $("rq12-mine");
    ul.innerHTML = "";
    mine.forEach((m, i) => {
      const ex = qsCodec.decode("QSM2", m.code);
      if (!ex) return;
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = `#${i + 1} ` + t("rq.c12.tag." + ex.tag) + " · " + fmtPct(Number(ex.ret));
      const dd = document.createElement("span");
      dd.textContent = t("rq.c12.ackCount", m.acks.length);
      li.append(tt, dd);
      ul.appendChild(li);
    });
    $("rq12-mine-empty").hidden = !!mine.length;
  }

  // ---------- 15 假设法庭 (单人版: 规则引擎当对方) ----------
  const MOTIONS = ["crossweek", "monday", "lowvol"];
  const OPP_FLAWS = ["insample", "nofee", "smalln"]; // 对方三件证据各埋一个破绽
  const court = { motion: null, side: null, closes: null, dates: null, slots: [], exams: [], done: false };

  /** 动议统计 (真算): 返回 {dir: 数据支持动议的方向 +1/-1, text}。 */
  function motionStat(motion, closes, dates, half) {
    const r = Q().rets(closes);
    const lo = half === 2 ? Math.floor(closes.length / 2) : 0;
    const hi = half === 1 ? Math.floor(closes.length / 2) : closes.length;
    const m5 = Q().ma(closes, 5);
    const m20 = Q().ma(closes, 20);
    const picks = [];
    const base = [];
    for (let i = Math.max(21, lo); i < Math.min(hi, closes.length - 5); i++) {
      base.push(r[i]);
      if (motion === "crossweek" && m5[i] > m20[i] && m5[i - 1] <= m20[i - 1]) {
        picks.push(closes[i + 5] / closes[i] - 1);
      } else if (motion === "monday" && new Date(dates[i]).getDay() === 1) {
        picks.push(r[i]);
      } else if (motion === "lowvol" && i > 10) {
        const seg = r.slice(i - 9, i + 1);
        const mu = seg.reduce((x, y) => x + y, 0) / 10;
        const vol = Math.sqrt(seg.reduce((x, y) => x + (y - mu) ** 2, 0) / 10);
        if (vol < 0.012) picks.push(r[i + 1]);
      }
    }
    const mean = picks.length ? picks.reduce((x, y) => x + y, 0) / picks.length : 0;
    const uncond = base.length ? base.reduce((x, y) => x + y, 0) / base.length : 0;
    return { dir: mean > uncond ? 1 : -1, n: picks.length,
      text: t("rq.c15.stat", (mean * 100).toFixed(3), (uncond * 100).toFixed(3), picks.length) };
  }

  async function newCourt() {
    if (!(await ensureStocks())) return;
    let h;
    try { h = await labHistory(stocks[rnd(stocks.length)].code); } catch (e) { toast(e.message); return; }
    court.closes = h.close.map(Number);
    court.dates = h.dates;
    court.motion = MOTIONS[rnd(MOTIONS.length)];
    court.side = Math.random() < 0.5 ? 1 : -1; // +1 辩方(支持动议) / -1 控方(反对)
    court.slots = [null, null, null];
    court.exams = [null, null, null];
    court.done = false;
    $("rq15-verdict").hidden = true;
    renderCourt();
  }

  function renderCourt() {
    if (!court.motion) return;
    $("rq15-case").textContent = t("rq.c15.case", t("rq.c15.m." + court.motion),
      t(court.side === 1 ? "rq.c15.defend" : "rq.c15.oppose"));
    const wrap = $("rq15-slots");
    wrap.innerHTML = "";
    court.slots.forEach((slot, i) => {
      const row = document.createElement("div");
      row.className = "dtc-jrow";
      const lab = document.createElement("p");
      lab.className = "hint";
      lab.textContent = t("rq.c15.slot", i + 1) + (slot
        ? " " + slot.stat.text + t(slot.stat.dir === court.side ? "rq.c15.favors" : "rq.c15.hurts")
        : "");
      row.appendChild(lab);
      if (!slot && !court.done) {
        const opts = document.createElement("div");
        opts.className = "lw-fracs qd-actions";
        [["full", 0], ["splitA", 1], ["splitB", 2]].forEach(([key, half]) => {
          const b = document.createElement("button");
          b.textContent = t("rq.c15.ev." + key);
          b.addEventListener("click", () => {
            const stat = motionStat(court.motion, court.closes, court.dates, half);
            // 证据质量: 分区证据 +2 (方法学硬通货), 样本 ≥30 +1, 基础 1
            court.slots[i] = { stat, q: 1 + (half ? 2 : 0) + (stat.n >= 30 ? 1 : 0) };
            playSound("fill");
            renderCourt();
          });
          opts.appendChild(b);
        });
        row.appendChild(opts);
      }
      wrap.appendChild(row);
    });
    // 对方证据与质询
    const oppWrap = $("rq15-opp");
    oppWrap.innerHTML = "";
    OPP_FLAWS.forEach((flaw, i) => {
      const row = document.createElement("div");
      row.className = "dtc-jrow";
      const lab = document.createElement("p");
      lab.className = "hint";
      lab.textContent = t("rq.c15.oppEv." + flaw)
        + (court.exams[i] ? " → " + t("rq.c15.x." + court.exams[i])
          + t(court.exams[i] === flaw ? "rq.c15.xHit" : "rq.c15.xMiss") : "");
      row.appendChild(lab);
      if (!court.exams[i] && !court.done) {
        const opts = document.createElement("div");
        opts.className = "lw-fracs qd-actions";
        ["insample", "nofee", "smalln", "surv"].forEach((x) => {
          const b = document.createElement("button");
          b.className = "small";
          b.textContent = t("rq.c15.x." + x);
          b.addEventListener("click", () => { court.exams[i] = x; playSound("tap"); renderCourt(); });
          opts.appendChild(b);
        });
        row.appendChild(opts);
      }
      oppWrap.appendChild(row);
    });
    $("btn-rq15-verdict").disabled = court.done
      || court.slots.some((s) => !s) || court.exams.some((x) => !x);
  }

  function courtVerdict() {
    if (court.done) return;
    court.done = true;
    const quality = court.slots.reduce((a, s) => a + s.q, 0); // ≤12
    const hits = court.exams.filter((x, i) => x === OPP_FLAWS[i]).length;
    const mine = quality + hits * 2; // 方法学质量是大头
    const opp = 10; // 规则引擎对手的固定火力
    const dataDir = motionStat(court.motion, court.closes, court.dates, 0).dir;
    const devil = dataDir !== court.side && mine > opp; // 为数据不站边的立场打出高质量辩护
    const win = mine > opp;
    const v = $("rq15-verdict");
    v.hidden = false;
    v.textContent = t("rq.c15.verdict", mine, opp, t(win ? "rq.c15.win" : "rq.c15.lose"), hits)
      + (devil ? " " + t("rq.c15.devil") : "") + " " + t("rq.c15.lit." + court.motion);
    v.className = "qdr-conclusion " + (win ? "win" : "lose");
    playSound(win ? "win" : "lose");
    const st = qsLoadBest(BEST_KEY);
    if (win) qsSaveBest(BEST_KEY, { court: (st.court || 0) + 1, devil: (st.devil || 0) + (devil ? 1 : 0) });
    renderCourt();
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
  $("btn-rq8-vault").addEventListener("click", tryVault);
  $("btn-rq4-review").addEventListener("click", acceptBrief);
  $("btn-rq14-spin").addEventListener("click", spinWheel);
  $("btn-rq2-new").addEventListener("click", newRepair);
  $("btn-rq2-submit").addEventListener("click", submitRepair);
  $("btn-rq13-new").addEventListener("click", newRescue);
  $("btn-rq13-hold").addEventListener("click", () => rescueStep(0));
  $("btn-rq13-s10").addEventListener("click", () => rescueStep(0.1));
  $("btn-rq13-s20").addEventListener("click", () => rescueStep(0.2));
  $("btn-rq6-new").addEventListener("click", newHunt);
  $("btn-rq6-submit").addEventListener("click", submitHunt);
  $("rq6-win").addEventListener("input", renderHunt);
  $("rq6-from").addEventListener("input", renderHunt);
  $("rq6-to").addEventListener("input", renderHunt);
  $("btn-rq10-submit").addEventListener("click", blindSubmit);
  $("btn-rq10-board").addEventListener("click", () => loadBlindBoard(null));
  $("btn-rq10-last").addEventListener("click", () => loadBlindBoard(blindWeek != null ? blindWeek - 1 : null));
  $("btn-rq11-start").addEventListener("click", relayStart);
  $("btn-rq11-load").addEventListener("click", relayLoad);
  $("btn-rq11-commit").addEventListener("click", relayCommit);
  $("rq11-knob").addEventListener("change", renderRelayValues);
  $("btn-rq12-curate").addEventListener("click", curateExhibit);
  $("btn-rq12-view").addEventListener("click", viewExhibit);
  $("btn-rq15-new").addEventListener("click", newCourt);
  $("btn-rq15-verdict").addEventListener("click", courtVerdict);

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "dojo") return;
    if (!dig.targetEq) newDig();
    if (!jury.closes) newJury();
    if (!repair.card) newRepair();
    if (!rescue.path) newRescue();
    if (!hunt.closes) newHunt();
    if (!court.motion) newCourt();
    renderBrief();
    renderMuseum();
    loadBlindBoard(null);
    digChart.refresh();
    juryChart.refresh();
    radarChart.refresh();
    repairChart.refresh();
    rescueChart.refresh();
    huntChart.refresh();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-dojo").hidden) return;
    renderDig();
    renderJury();
  });
})();
