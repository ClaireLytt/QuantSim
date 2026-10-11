// 新闻多空小游戏: 读一条公告/新闻, 判断对股价是利好/利空/中性。
// 每轮 10 题随机抽取, 答对 +10, 三连对起每题额外 +5; 判完即讲解背后的财务常识。
// 依赖 app.js 的 $ / toast / playSound, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_newsjudge";
  const ROUNDS = 10;

  // 题库: ans = bull(利好) / bear(利空) / flat(中性)。why 是判后讲解 (教育点)。
  const NEWS = [
    {
      text: { zh: "央行宣布下调基准利率 25 个基点。", en: "The central bank cuts the benchmark rate by 25 basis points." },
      ans: "bull",
      why: { zh: "降息降低企业融资成本、提升估值分母，通常是整体性利好。", en: "Lower rates cut funding costs and lift valuations - broadly bullish." },
    },
    {
      text: { zh: "公司控股股东宣布计划减持不超过总股本 2% 的股份。", en: "The controlling shareholder plans to sell up to 2% of total shares." },
      ans: "bear",
      why: { zh: "大股东减持直接增加卖压，且传递「内部人不看好当前价格」的信号。", en: "Insider selling adds supply and signals insiders doubt the current price." },
    },
    {
      text: { zh: "公司推出「每 10 股转增 8 股」的高送转方案。", en: "The company announces an 8-for-10 bonus share issue." },
      ans: "flat",
      why: { zh: "送转只是把一张饼切成更多块，公司价值不变——典型的数字游戏。", en: "Splitting shares cuts the pie into more slices; firm value is unchanged." },
    },
    {
      text: { zh: "公司宣布回购股份并全部注销。", en: "The company announces a buyback with full share cancellation." },
      ans: "bull",
      why: { zh: "回购注销减少总股本，每股权益实打实增厚，是最硬的回报方式之一。", en: "Cancelling bought-back shares shrinks share count and lifts per-share value." },
    },
    {
      text: { zh: "公司发布业绩预告：预计全年亏损，并计提大额商誉减值。", en: "Profit warning: a full-year loss is expected, with a large goodwill write-down." },
      ans: "bear",
      why: { zh: "预亏叠加商誉减值，说明过去的并购在还债——基本面恶化的明确信号。", en: "A loss plus goodwill impairment means past acquisitions are souring - clearly negative." },
    },
    {
      text: { zh: "公司营收同比增长 30%，但经营性现金流连续三个季度为负。", en: "Revenue grows 30% YoY, but operating cash flow has been negative for three quarters." },
      ans: "flat",
      why: { zh: "增收不增现，可能是赊销堆出来的增长——别急着欢呼，先看应收账款。", en: "Growth without cash may be built on receivables - check before cheering." },
    },
    {
      text: { zh: "公司获得政府补贴，金额占本年度净利润的 80%。", en: "The company receives a subsidy equal to 80% of this year's net profit." },
      ans: "flat",
      why: { zh: "补贴是非经常性损益，撑得起一年利润，撑不起估值——主业成色才是关键。", en: "Subsidies are one-off items; they prop up one year's profit, not the valuation." },
    },
    {
      text: { zh: "公司与某巨头签署战略合作意向书，未披露具体金额与期限。", en: "The company signs a strategic letter of intent with a giant - no amounts or terms disclosed." },
      ans: "flat",
      why: { zh: "没有金额的「意向书」离真订单还有十万八千里，常被用来配合拉抬股价。", en: "An LOI with no numbers is far from a real order - and a classic pump prop." },
    },
    {
      text: { zh: "公司实际控制人股权质押比例升至 90%。", en: "The controlling shareholder's share pledge ratio rises to 90%." },
      ans: "bear",
      why: { zh: "高比例质押意味着股价下跌可能触发强平——跌起来会自我加速。", en: "A high pledge ratio risks forced liquidation - declines can feed on themselves." },
    },
    {
      text: { zh: "公司中标大型项目，合同金额约占去年全年营收的 40%。", en: "The company wins a contract worth about 40% of last year's revenue." },
      ans: "bull",
      why: { zh: "大额订单直接增厚未来收入，确定性强于任何「战略合作」。", en: "A large order adds real future revenue - far more concrete than any 'partnership'." },
    },
    {
      text: { zh: "公司实际控制人因涉嫌信息披露违规被立案调查。", en: "The controlling shareholder is under formal investigation for disclosure violations." },
      ans: "bear",
      why: { zh: "立案调查带来治理与退市风险，机构通常「先卖出后研究」。", en: "Investigations bring governance and delisting risk - institutions sell first, ask later." },
    },
    {
      text: { zh: "行业龙头宣布全线提价 10%，公司作为第二梯队宣布跟随提价。", en: "The industry leader raises prices 10%; the company follows suit." },
      ans: "bull",
      why: { zh: "跟随提价说明行业供需紧张、公司有定价权，毛利率有望改善。", en: "Following a price hike signals pricing power and improving margins." },
    },
    {
      text: { zh: "公司下月将有限售股解禁，规模约为当前流通盘的 3 倍。", en: "Locked-up shares equal to 3x the current float unlock next month." },
      ans: "bear",
      why: { zh: "解禁不等于必卖，但 3 倍流通盘的潜在供给悬在头上，压制估值。", en: "Unlocks aren't automatic selling, but 3x the float overhangs the price." },
    },
    {
      text: { zh: "公司公告将证券简称变更为「XX 元宇宙」。", en: "The company renames itself 'XX Metaverse'." },
      ans: "flat",
      why: { zh: "改名不改基本面。历史上蹭热点改名的公司，多数一地鸡毛。", en: "A new name changes no fundamentals - hot-theme renames usually end badly." },
    },
    {
      text: { zh: "公司将股息率提升至 6%，并承诺未来三年分红比例不低于 60%。", en: "Dividend yield is raised to 6%, with a 60% payout promised for three years." },
      ans: "bull",
      why: { zh: "高分红承诺要求真金白银的现金流背书，是对盈利质量的自信。", en: "A multi-year payout pledge must be backed by real cash flow - a sign of confidence." },
    },
    {
      text: { zh: "某券商发布研报将公司目标价上调 50%——该券商正是公司再融资的主承销商。", en: "A broker lifts its target price 50% - the same broker is lead underwriter of the company's refinancing." },
      ans: "flat",
      why: { zh: "研报要先看立场再看结论：承销商吹自家项目，利益关联大打折扣。", en: "Check the analyst's incentives first - an underwriter touting its own deal is conflicted." },
    },
  ];

  const g = { deck: [], idx: 0, score: 0, hit: 0, streak: 0, answered: false, playing: false };

  const loadBest = () => qsLoadBest(BEST_KEY); // 共享实现在 app.js

  function renderIntroBest() {
    const b = loadBest();
    $("nj-best").hidden = !b.best;
    if (b.best) $("nj-best").textContent = t("nj.best", b.best);
  }

  function start() {
    // 洗牌抽 ROUNDS 条, 一轮内不重复
    g.deck = qsShuffle(NEWS).slice(0, ROUNDS);
    g.idx = 0;
    g.score = 0;
    g.hit = 0;
    g.streak = 0;
    g.playing = true;
    $("nj-intro").hidden = true;
    $("nj-end").hidden = true;
    $("nj-play").hidden = false;
    showRound();
  }

  function showRound() {
    g.answered = false;
    const item = g.deck[g.idx];
    $("nj-text").textContent = pick(item.text);
    $("nj-verdict").hidden = true;
    $("btn-nj-next").hidden = true;
    ["bull", "bear", "flat"].forEach((k) => {
      const btn = $("btn-nj-" + k);
      btn.disabled = false;
      btn.classList.remove("nj-right", "nj-wrong");
    });
    renderStats();
  }

  function renderStats() {
    $("nj-score").textContent = String(g.score);
    $("nj-round").textContent = `${Math.min(g.idx + 1, ROUNDS)} / ${ROUNDS}`;
    $("nj-streak").textContent = String(g.streak);
  }

  function answer(choice) {
    if (!g.playing || g.answered) return;
    g.answered = true;
    const item = g.deck[g.idx];
    const right = choice === item.ans;
    let gain = 0;
    if (right) {
      g.hit++;
      g.streak++;
      gain = 10 + (g.streak >= 3 ? 5 : 0); // 三连对起吃热手加成
      g.score += gain;
      playSound("win");
    } else {
      g.streak = 0;
      playSound("lose");
    }
    ["bull", "bear", "flat"].forEach((k) => {
      const btn = $("btn-nj-" + k);
      btn.disabled = true;
      if (k === item.ans) btn.classList.add("nj-right");
      else if (k === choice) btn.classList.add("nj-wrong");
    });
    const v = $("nj-verdict");
    v.textContent = (right ? t("nj.right", gain) : t("nj.wrong", t("nj." + item.ans))) + " " + pick(item.why);
    v.hidden = false;
    const last = g.idx >= ROUNDS - 1;
    $("btn-nj-next").textContent = t(last ? "nj.finish" : "nj.next");
    $("btn-nj-next").hidden = false;
    renderStats();
  }

  function next() {
    if (g.idx >= ROUNDS - 1) {
      finish();
      return;
    }
    g.idx++;
    showRound();
  }

  function finish() {
    g.playing = false;
    const b = loadBest();
    const newBest = g.score > (b.best || 0);
    if (newBest) {
      try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: g.score })); } catch (e) { /* 忽略 */ }
    }
    $("nj-play").hidden = true;
    $("nj-end").hidden = false;
    $("nj-end-title").textContent = t("nj.endTitle") + (newBest ? " " + t("nj.newBest") : "");
    $("nj-end-stats").textContent = t("nj.endStats", g.score, g.hit, ROUNDS);
    if (newBest) playSound("win");
    // 完成信号: 供任务线/生涯模式等订阅 (与 qs:bubbleEnd 同款惯例)
    document.dispatchEvent(new CustomEvent("qs:newsEnd", { detail: { score: g.score, hit: g.hit, total: ROUNDS } }));
  }

  $("btn-nj-start").addEventListener("click", start);
  $("btn-nj-again").addEventListener("click", start);
  $("btn-nj-next").addEventListener("click", next);
  $("btn-nj-bull").addEventListener("click", () => answer("bull"));
  $("btn-nj-bear").addEventListener("click", () => answer("bear"));
  $("btn-nj-flat").addEventListener("click", () => answer("flat"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "newsjudge") renderIntroBest();
  });
  renderIntroBest();
})();
