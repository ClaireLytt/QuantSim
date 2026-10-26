// 好友茶会: 异步好友互动的聚合页 (docs/friend-play-2026-10.md 第一步落地)。
// 本文件 = 玩法 2 成绩拼图卡 + 玩法 3 策略盲猜, 全部纯前端"码交换":
// 码 = qsCodec 的 <TAG>.<base64url>.<crc>, 经微信等任意渠道传递, 无后端无好友表——码就是关系。
// 零奖励设计: 两个玩法都不发积分/成绩, 伪造码只能骗朋友骗不了榜 (作弊收益为零)。
// 依赖 app.js 的 $ / api / toast / qsCodec / qsChart / cssVar / state / fmtPct, i18n.js 的 t / pick。
(() => {
  const PUZZLE_TAG = "QSM1";
  const GUESS_TAG = "QSG1";

  // ---------- 玩法 2: 成绩拼图卡 ----------

  // 导出自己的战绩码: 统计来自服务端 /me/summary (登录可用), 样本量入码——对比卡必须明示
  async function exportPuzzle() {
    if (!window.Auth || !Auth.user) { toast(t("fp.needLogin")); return; }
    try {
      const s = await api("/me/summary");
      if (!s.settledCount) { toast(t("fp.noGames")); return; }
      const payload = {
        v: 1, n: Auth.user.username.slice(0, 12), g: s.settledCount,
        w: Number(s.winRate ?? 0), r: Number(s.cumulativeReturn ?? 0),
        d: Number(s.maxDrawdown ?? 0), t: Math.floor(Date.now() / 86400000),
      };
      const code = qsCodec.encode(PUZZLE_TAG, payload);
      $("fp-puzzle-out").value = code;
      $("fp-puzzle-out").hidden = false;
      navigator.clipboard?.writeText(code).then(
        () => toast(t("fp.copied")), () => toast(t("fp.copyManual")));
    } catch (e) { toast(e.message); }
  }

  function comparePuzzle() {
    const a = qsCodec.decode(PUZZLE_TAG, $("fp-puzzle-a").value);
    const b = qsCodec.decode(PUZZLE_TAG, $("fp-puzzle-b").value);
    const box = $("fp-puzzle-cmp");
    if (!a || !b) { toast(t("fp.badCode")); box.hidden = true; return; }
    box.hidden = false;
    const rows = [
      ["fp.cmp.games", a.g, b.g, null],
      ["fp.cmp.winRate", fmtPct(a.w), fmtPct(b.w), a.w - b.w],
      ["fp.cmp.ret", fmtPct(a.r), fmtPct(b.r), a.r - b.r],
      ["fp.cmp.dd", fmtPct(a.d), fmtPct(b.d), b.d - a.d], // 回撤小者优
    ];
    const tbody = box.querySelector("tbody");
    tbody.innerHTML = "";
    box.querySelector("#fp-cmp-ha").textContent = a.n;
    box.querySelector("#fp-cmp-hb").textContent = b.n;
    rows.forEach(([key, va, vb, diff]) => {
      const tr = document.createElement("tr");
      const cells = [t(key), va, vb].map((v) => {
        const td = document.createElement("td");
        td.textContent = String(v);
        return td;
      });
      // 领先侧着色; 样本量行不比
      if (diff != null && diff !== 0) cells[diff > 0 ? 1 : 2].className = "pos";
      tr.append(...cells);
      tbody.appendChild(tr);
    });
    // 样本量差距过大时明示不可比 (设计要求: 10 局 vs 100 局的收益率没有可比性)
    const warn = $("fp-puzzle-warn");
    warn.hidden = !(Math.max(a.g, b.g) >= Math.min(a.g, b.g) * 3 && Math.max(a.g, b.g) >= 10);
  }

  // ---------- 玩法 3: 策略盲猜 ----------

  // 出题: 用最近一局已结算对局, 导出逐 tick 仓位占比曲线 (抹掉标的与日期),
  // 出题人标注"最大加仓那笔在想什么"的真实动机。答案字段反转混淆 (防肉眼, 非防破解——零奖励)。
  function exportGuess() {
    const r = state.lastSettle;
    if (!r || !r.equityCurve || !state.klines || !state.klines.length) {
      toast(t("fp.guessNeedGame"));
      return;
    }
    const motive = Number($("fp-guess-motive").value);
    // 逐 tick 仓位占比: 持仓市值/净值。由流水重放持股数, 对齐对局窗口的收盘价
    const start = Math.max(0, state.klines.length - (r.equityCurve.length - 1));
    const closes = state.klines.slice(start).map((k) => Number(k.close));
    // state.trades 的 idx 是 kline 下标; 按窗口逐 tick 重放持股数
    const txs = (state.trades || []).slice().sort((x, y) => x.idx - y.idx);
    let shares = 0;
    let ti = 0;
    const pos = [];
    for (let i = 0; i < closes.length; i++) {
      const eq = Number(r.equityCurve[i + 1] ?? r.equityCurve[r.equityCurve.length - 1]);
      while (ti < txs.length && txs[ti].idx <= start + i) {
        shares += (txs[ti].dir === "BUY" ? 1 : -1) * txs[ti].shares;
        ti++;
      }
      pos.push(eq > 0 ? Math.max(0, Math.min(100, Math.round((shares * closes[i]) / eq * 100))) : 0);
    }
    if (!pos.some((p) => p > 0)) { toast(t("fp.guessNeedTrades")); return; }
    // 真实答案: 象限 (重仓 = 峰值 >70; 猎手 = 持仓 tick 占比 <50%), 盈亏, 动机
    const heavy = Math.max(...pos) > 70 ? 1 : 0;
    const hunter = pos.filter((p) => p > 0).length * 2 < pos.length ? 1 : 0;
    const ansJson = JSON.stringify({ q: heavy * 2 + hunter, w: Number(r.returnRate) >= 0 ? 1 : 0, m: motive });
    const payload = { v: 1, pos, a: ansJson.split("").reverse().join("") };
    const code = qsCodec.encode(GUESS_TAG, payload);
    $("fp-guess-out").value = code;
    $("fp-guess-out").hidden = false;
    navigator.clipboard?.writeText(code).then(
      () => toast(t("fp.copied")), () => toast(t("fp.copyManual")));
  }

  let guessData = null;
  const guessPick = { q: null, w: null, m: null };
  const chartH = qsChart("fp-guess-chart", () => buildGuessChart());

  function loadGuess() {
    const data = qsCodec.decode(GUESS_TAG, $("fp-guess-in").value);
    if (!data || !Array.isArray(data.pos) || !data.pos.length) { toast(t("fp.badCode")); return; }
    guessData = data;
    guessPick.q = null;
    guessPick.w = null;
    guessPick.m = null;
    $("fp-guess-quiz").hidden = false;
    $("fp-guess-reveal").hidden = true;
    renderGuessQuiz();
    chartH.refresh();
  }

  function buildGuessChart() {
    if (!guessData || $("view-mates").hidden) return null;
    return {
      animation: false,
      grid: { left: 40, right: 14, top: 14, bottom: 24 },
      xAxis: { type: "category", data: guessData.pos.map((_, i) => "T" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      yAxis: { min: 0, max: 100,
        splitLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10, formatter: "{value}%" } },
      series: [{ type: "line", step: "end", data: guessData.pos, showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--ma5") },
        areaStyle: { color: cssVar("--ma5"), opacity: 0.12 } }],
    };
  }

  const QUADS = ["00", "01", "10", "11"]; // heavy*2+hunter → 文案键 fp.quad.N

  function renderGuessQuiz() {
    const qWrap = $("fp-guess-q");
    qWrap.innerHTML = "";
    QUADS.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = guessPick.q === i ? "primary" : "";
      b.textContent = t("fp.quad." + i);
      b.addEventListener("click", () => { guessPick.q = i; renderGuessQuiz(); });
      qWrap.appendChild(b);
    });
    const wWrap = $("fp-guess-w");
    wWrap.innerHTML = "";
    [1, 0].forEach((v) => {
      const b = document.createElement("button");
      b.className = guessPick.w === v ? "primary" : "";
      b.textContent = t(v ? "fp.win" : "fp.lose");
      b.addEventListener("click", () => { guessPick.w = v; renderGuessQuiz(); });
      wWrap.appendChild(b);
    });
    const mWrap = $("fp-guess-m");
    mWrap.innerHTML = "";
    [0, 1, 2].forEach((v) => {
      const b = document.createElement("button");
      b.className = guessPick.m === v ? "primary" : "";
      b.textContent = t("fp.motive." + v);
      b.addEventListener("click", () => { guessPick.m = v; renderGuessQuiz(); });
      mWrap.appendChild(b);
    });
    $("btn-fp-guess-submit").disabled = guessPick.q == null || guessPick.w == null || guessPick.m == null;
  }

  function submitGuess() {
    if (!guessData) return;
    let ans;
    try { ans = JSON.parse(guessData.a.split("").reverse().join("")); } catch (e) { toast(t("fp.badCode")); return; }
    const hits = (guessPick.q === ans.q ? 1 : 0) + (guessPick.w === ans.w ? 1 : 0) + (guessPick.m === ans.m ? 1 : 0);
    const rv = $("fp-guess-reveal");
    rv.hidden = false;
    rv.textContent = t("fp.guessResult", hits,
      t("fp.quad." + ans.q), t(ans.w ? "fp.win" : "fp.lose"), t("fp.motive." + ans.m));
    rv.className = "qdr-conclusion " + (hits === 3 ? "win" : "lose");
    playSound(hits === 3 ? "win" : "fill");
  }

  // ---------- 玩法 1/8: 同局战书 (服务端, 先交卷后揭晓) ----------

  async function createDuel() {
    if (!window.Auth || !Auth.user) { toast(t("fp.needLogin")); return; }
    if (!state.lastSettle || !state.sessionId) { toast(t("fp.duelNeedGame")); return; }
    try {
      const res = await api("/challenge/create", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      $("fp-duel-out").value = res.code;
      $("fp-duel-out").hidden = false;
      navigator.clipboard?.writeText(res.code).then(
        () => toast(t("fp.copied")), () => toast(t("fp.copyManual")));
    } catch (e) { toast(e.message); }
  }

  async function acceptDuel() {
    const code = $("fp-duel-in").value.trim();
    if (!code) return;
    if (!window.Auth || !Auth.user) { toast(t("fp.needLogin")); return; }
    try {
      const res = await api(`/challenge/${encodeURIComponent(code)}/accept`, {
        method: "POST", body: "{}",
      });
      toast(t("fp.duelStarted"));
      await qsEnterGame(res); // 与每日挑战同一条接管路径
    } catch (e) { toast(e.message); }
  }

  async function loadDuelBoard() {
    const code = $("fp-duel-in").value.trim();
    if (!code) return;
    try {
      const b = await api(`/challenge/${encodeURIComponent(code)}`);
      const box = $("fp-duel-board-box");
      box.hidden = false;
      // ≥4 人 = 小锦标赛 (玩法 8); 揭晓后榜首即擂主
      $("fp-duel-board-title").textContent =
        t(b.players >= 4 ? "fp.duelTourney" : "fp.duelPlayers", b.players);
      $("fp-duel-sealed").hidden = b.revealed;
      const ul = $("fp-duel-board");
      ul.innerHTML = "";
      b.entries.forEach((e, i) => {
        const li = document.createElement("li");
        const tt = document.createElement("b");
        tt.textContent = (b.revealed && i === 0 ? "👑 " : "") + e.username
          + (e.isSelf ? t("fp.duelMe") : "") + (e.isCreator ? t("fp.duelCreator") : "");
        const dd = document.createElement("span");
        dd.textContent = e.returnRate != null ? fmtPct(Number(e.returnRate))
          : t(e.settled ? "fp.duelDone" : "fp.duelPlaying");
        if (e.returnRate != null) dd.className = Number(e.returnRate) >= 0 ? "pos" : "neg";
        li.append(tt, dd);
        ul.appendChild(li);
      });
    } catch (e) { toast(e.message); }
  }

  // ---------- 装配 ----------

  $("btn-fp-duel-create").addEventListener("click", createDuel);
  $("btn-fp-duel-accept").addEventListener("click", acceptDuel);
  $("btn-fp-duel-board").addEventListener("click", loadDuelBoard);

  $("btn-fp-puzzle-export").addEventListener("click", exportPuzzle);
  $("btn-fp-puzzle-cmp").addEventListener("click", comparePuzzle);
  $("btn-fp-guess-export").addEventListener("click", exportGuess);
  $("btn-fp-guess-load").addEventListener("click", loadGuess);
  $("btn-fp-guess-submit").addEventListener("click", submitGuess);

  function renderEntry() {
    // 盲猜出题与立战书都需要"最近一局已结算": 没有就提示先去打一局
    $("fp-guess-export-row").hidden = !state.lastSettle;
    $("fp-guess-noGame").hidden = !!state.lastSettle;
    $("btn-fp-duel-create").disabled = !state.lastSettle;
    $("fp-duel-noGame").hidden = !!state.lastSettle;
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "mates") { renderEntry(); chartH.refresh(); }
  });
  document.addEventListener("qs:settled", renderEntry);
  document.addEventListener("qs:lang", () => {
    if ($("view-mates").hidden) return;
    renderEntry();
    if (guessData && !$("fp-guess-quiz").hidden) renderGuessQuiz();
  });

  renderEntry();
})();
