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

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "dojo") return;
    if (!dig.targetEq) newDig();
    if (!jury.closes) newJury();
    renderBrief();
    digChart.refresh();
    juryChart.refresh();
    radarChart.refresh();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-dojo").hidden) return;
    renderDig();
    renderJury();
  });
})();
