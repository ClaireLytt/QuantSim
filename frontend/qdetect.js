// 量化侦探: 调查「市场收益背后的真相」。每案一句诱人话术, 左栏证据工具箱里选工具、
// 花有限的取证次数调取证据进侦探笔录, 右栏下拉选结论提交结案。
// 剩余取证次数越多、结论越准, 得分越高。三关对应三大量化陷阱。
// 依赖 app.js 的 $ / toast / playSound / qsLoadBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_qdetect";
  const CREDITS = 3; // 每案取证次数 (4 件证据只允许调 3 件, 逼你推断)

  // 关卡: claim 话术; evidence 证据工具 (icon + 标题 + 调取后内容); options 结论; why 结案陈词
  const CASES = [
    {
      id: "golden",
      icon: "📐",
      title: { zh: "关卡 1 · 金叉真的能稳定赚钱吗？", en: "Case 1 · Does the golden cross really print money?" },
      claim: {
        zh: "检验「金叉策略」是否具备稳定超额收益——某百万粉大 V 宣称：金叉买入，十年回测年化 40%。",
        en: "Examine whether the golden-cross strategy holds a stable edge - a million-follower guru claims 40% annualized over ten years.",
      },
      evidence: [
        {
          icon: "📊",
          t: { zh: "收益统计面板", en: "Return statistics" },
          d: { zh: "全部历史上金叉后 5 日胜率 54%，平均收益 +0.8%——有优势，但非常微弱。", en: "Across all history, the 5-day win rate after a golden cross is 54%, average +0.8% - an edge, but a thin one." },
        },
        {
          icon: "📈",
          t: { zh: "K线分段走势图", en: "Regime-split chart" },
          d: { zh: "分市场看：牛市里金叉胜率 68%，震荡市里只有 41%——信号成色跟着行情走。", en: "Split by regime: 68% win rate in bulls, only 41% in ranges - the signal's quality follows the market." },
        },
        {
          icon: "🗓️",
          t: { zh: "回测区间核查", en: "Test-window audit" },
          d: { zh: "那份「年化 40%」的回测只取了某三年大牛市——区间是精心挑选的。", en: "The '40% annualized' backtest covers only a three-year bull run - a hand-picked window." },
        },
        {
          icon: "💸",
          t: { zh: "费后收益测算", en: "After-cost recompute" },
          d: { zh: "按真实手续费与滑点重算，同一策略年化从 40% 掉到 12%。", en: "With real fees and slippage, the same strategy drops from 40% to 12% annualized." },
        },
      ],
      options: [
        { t: { zh: "策略有效：金叉稳赚，可以满仓跟", en: "The strategy works - follow the cross all-in" } },
        { t: { zh: "策略仅在牛市有效，「年化 40%」靠精选区间", en: "It only works in bulls - the '40%' comes from a cherry-picked window" }, ok: true },
        { t: { zh: "只是随机运气，金叉毫无信号价值", en: "Pure luck - the cross carries zero signal" } },
      ],
      why: {
        zh: "结案：金叉在全样本上有统计优势但很微弱，且高度依赖市场状态；「年化 40%」是牛市区间 + 忽略费用炮制的神话。信号可以参考，神话不能当饭吃。",
        en: "Verdict: the cross has a thin, regime-dependent edge across the full sample; the '40%' legend was built from a bull-only window with costs ignored. Signals can inform - legends can't feed you.",
      },
    },
    {
      id: "drawdown",
      icon: "📉",
      title: { zh: "关卡 2 · 这份高收益，埋着多大的回撤？", en: "Case 2 · How deep is the drawdown under this return?" },
      claim: {
        zh: "检验一份「年化 35%、三年净值翻倍」的策略宣传页是否暗藏风险——顾问说名额有限。",
        en: "Examine a one-pager boasting '35% annualized, NAV doubled in three years' - the adviser says slots are limited.",
      },
      evidence: [
        {
          icon: "📈",
          t: { zh: "完整净值曲线", en: "Full NAV curve" },
          d: { zh: "宣传页只画了起点和终点。完整曲线显示中途净值一度从 1.8 跌到 0.75。", en: "The one-pager shows only start and end. The full curve once fell from 1.8 to 0.75 mid-way." },
        },
        {
          icon: "🕳️",
          t: { zh: "最大回撤图表", en: "Max-drawdown chart" },
          d: { zh: "最大回撤 58%，且曾连续 14 个月在水下——多数投资者会在最深处割肉离场。", en: "Max drawdown 58%, with 14 straight months underwater - most investors capitulate at the bottom." },
        },
        {
          icon: "📊",
          t: { zh: "收益结构分析", en: "Return decomposition" },
          d: { zh: "三年收益的 80% 来自其中两个月的行情；夏普只有 0.6。", en: "80% of the three-year gain came from two months; the Sharpe is just 0.6." },
        },
        {
          icon: "⚠️",
          t: { zh: "杠杆条款核查", en: "Leverage clause audit" },
          d: { zh: "附录第 7 页小字：策略常态使用 3 倍杠杆——收益和回撤都是放大后的。", en: "Appendix page 7, fine print: the strategy routinely runs 3x leverage - gains and drawdowns both amplified." },
        },
      ],
      options: [
        { t: { zh: "策略有效：年化 35% 值得立刻认购", en: "The strategy works - subscribe for the 35% now" } },
        { t: { zh: "收益靠杠杆+深回撤换来，普通人拿不住", en: "The return is bought with leverage and brutal drawdowns most can't sit through" }, ok: true },
        { t: { zh: "只是随机运气，净值一定是造假的", en: "Pure luck - the NAV must be fabricated" } },
      ],
      why: {
        zh: "结案：收益从不单独存在——问完「赚多少」必须问「中途最多亏多少、亏多久」。58% 回撤 + 3 倍杠杆的 35%，和稳稳的 35% 是两种完全不同的东西。",
        en: "Verdict: returns never exist alone - after 'how much' always ask 'how deep and how long underwater'. A 35% built on 58% drawdowns and 3x leverage is a different animal from a steady 35%.",
      },
    },
    {
      id: "survivor",
      icon: "🏆",
      title: { zh: "关卡 3 · 大牛股的高收益，是幸存者偏差吗？", en: "Case 3 · Are those superstocks just survivorship bias?" },
      claim: {
        zh: "检验热帖「过去十年拿住这 10 只大牛股，20 倍」的结论是否成立——长期持有真是真理吗？",
        en: "Examine the viral claim 'hold these 10 superstocks for a decade - 20x'. Is long-term holding really the whole truth?",
      },
      evidence: [
        {
          icon: "📋",
          t: { zh: "名单来源核查", en: "List-origin audit" },
          d: { zh: "这 10 只是按「过去十年涨幅」倒序筛出来的——先看答案，再出题。", en: "The 10 names were screened by trailing ten-year returns - the answer was looked up before the question was set." },
        },
        {
          icon: "🪦",
          t: { zh: "退市股统计面板", en: "Delisted-stock statistics" },
          d: { zh: "同期有 200 多只曾经的「明星股」退市、腰斩或无人问津——它们被从故事里剔除了。", en: "Over the same decade, 200+ one-time 'star stocks' delisted, halved, or faded - all edited out of the story." },
        },
        {
          icon: "🧪",
          t: { zh: "事前视角回测", en: "Ex-ante backtest" },
          d: { zh: "用十年前真实的热门股名单买入持有到今天：总收益 +30%，跑输指数。", en: "Buy-and-hold the stocks actually hot ten years ago: +30% total, behind the index." },
        },
        {
          icon: "🎢",
          t: { zh: "持有回撤图表", en: "Holding-drawdown chart" },
          d: { zh: "就算押中了：这 10 只里有 8 只中途腰斩过——多数人撑不到 20 倍那天。", en: "Even picking right: 8 of the 10 halved along the way - most holders never see the 20x." },
        },
      ],
      options: [
        { t: { zh: "策略有效：照名单买下一个十年", en: "It works - buy the list for the next decade" } },
        { t: { zh: "名单是事后筛的幸存者，事前根本无法锁定", en: "The list is survivorship bias - impossible to pick ex ante" }, ok: true },
        { t: { zh: "只是随机运气，长期持有什么都能 20 倍", en: "Pure luck - hold anything long enough and it 20x-es" } },
      ],
      why: {
        zh: "结案：你看到的每一份「长期大牛股」名单都是幸存者名单——墓地里的股票不会发帖。事前选股难、持有过程更难，这才是收益背后的真相。",
        en: "Verdict: every 'decade superstock' list is a survivors' list - the graveyard doesn't post. Picking ex ante is hard and holding is harder. That's the truth behind the returns.",
      },
    },
  ];

  // 结案报告素材: 每案的回测曲线形状 (确定性生成) / 指标标注 / 知识点卡牌
  const REPORTS = {
    golden: {
      stats: { win: "54%", dd: "-18%", ann: "12%" },
      // 牛市段顺风顺水, 之后震荡段锯齿回吐 —— 「区间魔术」的形状
      curve: (i) => (i < 50 ? 100 * Math.pow(1.009, i) : 100 * Math.pow(1.009, 50) * (1 + 0.04 * Math.sin((i - 50) / 4) - (i - 50) * 0.0022)),
      card: { icon: "🗓️", name: { zh: "区间魔术", en: "Window Magic" }, line: { zh: "任何策略都能用精选区间画成神话。", en: "Any strategy becomes a legend inside a hand-picked window." } },
    },
    drawdown: {
      stats: { win: "52%", dd: "-58%", ann: "35%" },
      // 冲高 → 深坑 → 再创新高: 终点漂亮, 过程杀人
      curve: (i) => (i < 40 ? 100 * Math.pow(1.015, i) : i < 70 ? 100 * Math.pow(1.015, 40) * (1 - (i - 40) * 0.019) : 100 * Math.pow(1.015, 40) * (1 - 30 * 0.019) * Math.pow(1.025, i - 70)),
      card: { icon: "🕳️", name: { zh: "回撤之眼", en: "Eye of Drawdown" }, line: { zh: "问完赚多少，必问亏多深、亏多久。", en: "After 'how much', always ask 'how deep and how long underwater'." } },
    },
    survivor: {
      stats: { win: "48%", dd: "-45%", ann: "2.7%" },
      // 事前视角组合: 十年横着爬 —— 幸存者名单之外的真实世界
      curve: (i) => 100 * (1 + 0.003 * i + 0.08 * Math.sin(i / 9) - 0.05 * Math.sin(i / 23)),
      card: { icon: "🪦", name: { zh: "幸存者名单", en: "The Survivors' List" }, line: { zh: "墓地里的股票不会发帖。", en: "The graveyard doesn't post." } },
    },
  };
  const REPORT_DAYS = 100;

  const g = { idx: -1, score: 0, solved: [], credits: 0, revealed: [], selectedTool: null, done: false };
  let reportChart = null;

  const loadBest = () => qsLoadBest(BEST_KEY); // 共享实现在 app.js (cards 字段存已解锁知识点卡)

  function unlockCard(caseId) {
    const b = loadBest();
    const cards = Array.isArray(b.cards) ? b.cards : [];
    if (!cards.includes(caseId)) cards.push(caseId);
    qsSaveBest(BEST_KEY, { cards }); // 共享实现在 app.js
  }

  const hasCard = (caseId) => (loadBest().cards || []).includes(caseId);

  function renderPanel() {
    $("qd-progress").textContent = `${g.solved.length} / ${CASES.length}`;
    $("qd-score").textContent = String(g.score);
  }

  // ---------- 关卡选择 ----------
  let selected = 0;

  function renderCaseCards() {
    const wrap = $("qd-cases");
    wrap.innerHTML = "";
    CASES.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "qd-case" + (i === selected ? " active" : "");
      const solvedMark = g.solved.includes(c.id) ? " ✓" : "";
      const title = document.createElement("strong");
      title.textContent = c.icon + " " + pick(c.title) + solvedMark;
      const claim = document.createElement("span");
      claim.className = "sub";
      claim.textContent = pick(c.claim);
      btn.append(title, claim);
      btn.addEventListener("click", () => {
        selected = i;
        renderCaseCards();
      });
      wrap.appendChild(btn);
    });
  }

  // ---------- 办案室 ----------
  function enterCase() {
    g.idx = selected;
    g.credits = CREDITS;
    g.revealed = [];
    g.selectedTool = null;
    g.done = false;
    const c = CASES[g.idx];
    $("qd-select").hidden = true;
    $("qd-room").hidden = false;
    $("qd-room-title").textContent = c.icon + " " + pick(c.title);
    $("qd-claim").textContent = t("qd.casePrefix") + pick(c.claim);
    $("btn-qd-fetch").disabled = false;
    $("btn-qd-conclude").disabled = false;
    renderVerdictSelect();
    renderRoom();
  }

  function renderRoom() {
    renderCredits();
    renderToolbox();
    renderNotes();
    renderPanel();
  }

  function renderCredits() {
    $("qd-credits").textContent = String(g.credits);
  }

  function renderToolbox() {
    const c = CASES[g.idx];
    const wrap = $("qd-toolbox");
    wrap.innerHTML = "";
    c.evidence.forEach((ev, i) => {
      const btn = document.createElement("button");
      const revealed = g.revealed.includes(i);
      btn.className = "qd-tool" + (revealed ? " done" : "") + (g.selectedTool === i ? " active" : "");
      btn.disabled = revealed || g.done;
      btn.textContent = ev.icon + " " + pick(ev.t) + (revealed ? " ✓" : "");
      btn.addEventListener("click", () => {
        g.selectedTool = i;
        renderToolbox();
      });
      wrap.appendChild(btn);
    });
  }

  function renderNotes() {
    const c = CASES[g.idx];
    const ul = $("qd-notes");
    ul.innerHTML = "";
    $("qd-notes-empty").hidden = !!g.revealed.length;
    g.revealed.forEach((i) => {
      const ev = c.evidence[i];
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = ev.icon + " " + pick(ev.t);
      const dd = document.createElement("span");
      dd.textContent = pick(ev.d);
      li.append(tt, dd);
      ul.appendChild(li);
    });
  }

  function renderVerdictSelect() {
    const c = CASES[g.idx];
    const sel = $("qd-verdict");
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = t("qd.verdictPh");
    sel.appendChild(ph);
    c.options.forEach((opt, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = pick(opt.t);
      sel.appendChild(o);
    });
  }

  function fetchEvidence() {
    if (g.done) return;
    if (g.selectedTool == null || g.revealed.includes(g.selectedTool)) {
      toast(t("qd.pickTool"));
      return;
    }
    if (g.credits <= 0) {
      toast(t("qd.noCredits"));
      return;
    }
    g.credits--;
    g.revealed.push(g.selectedTool);
    g.selectedTool = null;
    playSound("fill");
    if (g.credits <= 0) $("btn-qd-fetch").disabled = true;
    renderRoom();
  }

  function conclude() {
    if (g.done) return;
    const val = $("qd-verdict").value;
    if (val === "") {
      toast(t("qd.pickVerdict"));
      return;
    }
    if (!g.revealed.length) {
      toast(t("qd.notesEmpty"));
      return;
    }
    g.done = true;
    const c = CASES[g.idx];
    const opt = c.options[Number(val)];
    const right = !!opt.ok;
    let gain = 0;
    if (right) {
      gain = 100 + g.credits * 50; // 剩余取证次数越多, 推断越漂亮
      g.score += gain;
      if (!g.solved.includes(c.id)) g.solved.push(c.id);
      unlockCard(c.id);
    }
    playSound(right ? "win" : "lose");
    if (g.solved.length >= CASES.length) {
      const b = loadBest();
      if (g.score > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: g.score }); // 共享实现在 app.js
        toast(t("qd.newBest", g.score));
      }
      document.dispatchEvent(new CustomEvent("qs:qdetectEnd", { detail: { score: g.score } }));
    }
    g.lastRight = right;
    g.lastGain = gain;
    showReport(right, gain);
  }

  // ---------- 结案报告页: 回测可视化 + 结论科普 + 知识点卡牌 ----------

  function showReport(right, gain) {
    const c = CASES[g.idx];
    const rep = REPORTS[c.id];
    $("qd-room").hidden = true;
    $("qd-report").hidden = false;
    $("qdr-case").textContent = c.icon + " " + pick(c.title);
    // 中间结论文本: 对错 + 结案陈词 (量化知识点科普)
    const concl = $("qdr-conclusion");
    concl.textContent = (right ? t("qd.right", gain) : t("qd.wrong")) + " " + pick(c.why);
    concl.className = "qdr-conclusion " + (right ? "win" : "lose");
    // 指标标注
    $("qdr-win").textContent = rep.stats.win;
    $("qdr-dd").textContent = rep.stats.dd;
    $("qdr-ann").textContent = rep.stats.ann;
    // 知识点卡牌: 答对解锁, 答错上锁提示
    const cardBox = $("qdr-card");
    const unlocked = hasCard(c.id);
    cardBox.classList.toggle("locked", !unlocked);
    $("qdr-card-ico").textContent = unlocked ? rep.card.icon : "🔒";
    $("qdr-card-name").textContent = unlocked ? pick(rep.card.name) : t("qd.cardLocked");
    $("qdr-card-line").textContent = unlocked ? pick(rep.card.line) : t("qd.cardLockedHint");
    $("qdr-cards-count").textContent = t("qd.cardsCount", (loadBest().cards || []).length, CASES.length);
    renderReportChart(rep);
  }

  function renderReportChart(rep) {
    if (!reportChart) reportChart = echarts.init($("qdr-chart"));
    const data = Array.from({ length: REPORT_DAYS }, (_, i) => +rep.curve(i).toFixed(2));
    reportChart.setOption({
      animation: false,
      grid: { left: 48, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        data: data.map((_, i) => "D" + (i + 1)),
        axisLine: { lineStyle: { color: cssVar("--border") } },
        axisLabel: { color: cssVar("--text-muted"), fontSize: 10 },
      },
      yAxis: { scale: true, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
      series: [{
        type: "line",
        data,
        showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--lab-blue") },
        areaStyle: { opacity: 0.1, color: cssVar("--lab-blue") },
        markPoint: {
          data: [
            { type: "max", symbol: "pin", symbolSize: 30, label: { color: "#fff", fontSize: 10, formatter: "H" }, itemStyle: { color: cssVar("--up") } },
            { type: "min", symbol: "pin", symbolSize: 30, label: { color: "#fff", fontSize: 10, formatter: "L" }, itemStyle: { color: cssVar("--down") } },
          ],
        },
      }],
    }, true);
    reportChart.resize();
  }

  function nextCase() {
    $("qd-report").hidden = true;
    // 跳到下一个未破的案子; 全破则回案件列表
    const next = CASES.findIndex((c) => !g.solved.includes(c.id));
    if (next >= 0) {
      selected = next;
      enterCase();
    } else {
      backToSelect();
      toast(t("qd.allDone"));
    }
  }

  function backToSelect() {
    g.idx = -1;
    $("qd-room").hidden = true;
    $("qd-report").hidden = true;
    $("qd-select").hidden = false;
    renderCaseCards();
    renderPanel();
  }

  function renderIntroBest() {
    const b = loadBest();
    $("qd-best").hidden = !b.best;
    if (b.best) $("qd-best").textContent = t("qd.best", b.best);
  }

  $("btn-qd-enter").addEventListener("click", enterCase);
  $("btn-qd-back").addEventListener("click", backToSelect);
  $("btn-qd-fetch").addEventListener("click", fetchEvidence);
  $("btn-qd-conclude").addEventListener("click", conclude);
  $("btn-qdr-next").addEventListener("click", nextCase);
  $("btn-qdr-lab").addEventListener("click", () => switchView("lab")); // 结案报告直通研究所, 把疑点亲手再验一遍
  window.addEventListener("resize", () => {
    if (reportChart) reportChart.resize();
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "qdetect") {
      renderIntroBest();
      renderCaseCards();
      renderPanel();
    }
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-qdetect").hidden) {
      renderCaseCards();
      if (g.idx >= 0 && !$("qd-room").hidden) {
        renderRoom();
        if (!g.done) renderVerdictSelect();
      }
      if (g.idx >= 0 && !$("qd-report").hidden) showReport(g.lastRight, g.lastGain);
    }
  });
  document.addEventListener("qs:theme", () => {
    if (reportChart && !$("qd-report").hidden) renderReportChart(REPORTS[CASES[g.idx].id]);
  });
  // 深链: 小游戏专区的「幸存者陷阱」等入口直达指定案件
  window.qsOpenCase = (id) => {
    const i = CASES.findIndex((c) => c.id === id);
    if (i >= 0) {
      selected = i;
      backToSelect();
    }
  };

  renderCaseCards();
  renderPanel();
  renderIntroBest();
})();
