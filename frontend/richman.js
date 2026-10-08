// 财富环游: 迷你金融大富翁。环形 16 格棋盘, 掷骰前进, 格子触发行情涨跌/新闻事件/财商答题/奖惩;
// 18 次掷骰后按总资产结算。纯本地, 最佳成绩存 qs_richman。
// 依赖 app.js 的 $ / toast / playSound / qsFmtInt, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_richman";
  const START_CASH = 10000;
  const TOTAL_ROLLS = 18;
  const PASS_GO = 1000;

  // 16 格环形棋盘 (顺时针): type 决定落地效果, pct 为行情格涨跌幅
  const TILES = [
    { type: "go", icon: "🚩" },
    { type: "up", icon: "📈", pct: 0.08 },
    { type: "quiz", icon: "❓" },
    { type: "news", icon: "📰" },
    { type: "down", icon: "📉", pct: -0.08 },
    { type: "chance", icon: "🎲" },
    { type: "quiz", icon: "❓" },
    { type: "up", icon: "📈", pct: 0.06 },
    { type: "fee", icon: "💸" },
    { type: "news", icon: "📰" },
    { type: "quiz", icon: "❓" },
    { type: "down", icon: "📉", pct: -0.06 },
    { type: "bonus", icon: "💰" },
    { type: "news", icon: "📰" },
    { type: "chance", icon: "🎲" },
    { type: "rest", icon: "☕" },
  ];

  // 新闻池: 随机抽取, 按百分比影响资产
  const RM_NEWS = [
    { t: { zh: "央行降息，流动性宽松", en: "Rate cut - liquidity flows" }, pct: 0.1 },
    { t: { zh: "黑天鹅突袭，市场恐慌", en: "Black swan - market panic" }, pct: -0.12 },
    { t: { zh: "财报大超预期", en: "Earnings smash estimates" }, pct: 0.08 },
    { t: { zh: "遭遇匿名做空报告", en: "Hit by an anonymous short report" }, pct: -0.09 },
    { t: { zh: "被纳入核心指数", en: "Added to the core index" }, pct: 0.07 },
    { t: { zh: "大股东宣布减持", en: "Major holder announces selling" }, pct: -0.06 },
    { t: { zh: "公司回购并注销股份", en: "Buyback with cancellation" }, pct: 0.06 },
    { t: { zh: "收到监管罚单", en: "Regulatory fine lands" }, pct: -0.08 },
  ];

  // 机会池: 金额型随机大事件
  const RM_CHANCE = [
    { t: { zh: "押中涨停板！", en: "Caught a limit-up!" }, amt: 2000 },
    { t: { zh: "追高被套割肉……", en: "Chased the top, cut the loss..." }, amt: -1800 },
    { t: { zh: "打新中签", en: "Won an IPO allotment" }, amt: 1500 },
    { t: { zh: "踩中业绩地雷", en: "Stepped on an earnings landmine" }, amt: -1500 },
  ];

  // 财商答题池: 答对 +1500, 答错 -800
  const RM_QUIZ = [
    {
      q: { zh: "长期来看，吃掉收益最多的往往是？", en: "Over the long run, what eats most of your returns?" },
      opts: [
        { t: { zh: "频繁交易的手续费", en: "Fees from overtrading" }, ok: true },
        { t: { zh: "偶尔的大跌", en: "Occasional crashes" } },
        { t: { zh: "没抓住牛股", en: "Missing hot stocks" } },
      ],
    },
    {
      q: { zh: "「10 转 8」高送转后，公司价值会？", en: "After an 8-for-10 bonus issue, firm value...?" },
      opts: [
        { t: { zh: "不变", en: "Unchanged" }, ok: true },
        { t: { zh: "增加 80%", en: "Up 80%" } },
        { t: { zh: "翻倍", en: "Doubles" } },
      ],
    },
    {
      q: { zh: "最大回撤衡量的是？", en: "Max drawdown measures...?" },
      opts: [
        { t: { zh: "从峰值跌下来的最深幅度", en: "The deepest fall from a peak" }, ok: true },
        { t: { zh: "一年亏损的总和", en: "Total yearly losses" } },
        { t: { zh: "最差一天的跌幅", en: "The worst single day" } },
      ],
    },
    {
      q: { zh: "分散投资主要是为了？", en: "Diversification mainly serves to...?" },
      opts: [
        { t: { zh: "降低单一标的的风险", en: "Reduce single-name risk" }, ok: true },
        { t: { zh: "保证更高收益", en: "Guarantee higher returns" } },
        { t: { zh: "少交手续费", en: "Pay less in fees" } },
      ],
    },
    {
      q: { zh: "「存贷双高」的公司财报最该警惕什么？", en: "High cash AND high debt on one balance sheet - the red flag is?" },
      opts: [
        { t: { zh: "账上的现金可能是假的", en: "The cash may not be real" }, ok: true },
        { t: { zh: "利润率太低", en: "Margins are too low" } },
        { t: { zh: "分红太少", en: "Dividends are too small" } },
      ],
    },
    {
      q: { zh: "止损单的核心作用是？", en: "A stop-loss order primarily...?" },
      opts: [
        { t: { zh: "提前锁定可承受的最大亏损", en: "Caps your loss at a pre-set level" }, ok: true },
        { t: { zh: "保证买在最低点", en: "Guarantees buying the bottom" } },
        { t: { zh: "提高胜率", en: "Raises your win rate" } },
      ],
    },
    {
      q: { zh: "牛市里人人都赚钱时，最该做的是？", en: "When everyone is making money in a bull market, you should...?" },
      opts: [
        { t: { zh: "检查仓位与退出计划", en: "Review exposure and exit plan" }, ok: true },
        { t: { zh: "加杠杆放大收益", en: "Add leverage" } },
        { t: { zh: "全仓最热的板块", en: "Go all-in on the hottest sector" } },
      ],
    },
    {
      q: { zh: "夏普比率衡量的是？", en: "The Sharpe ratio measures...?" },
      opts: [
        { t: { zh: "每承担一分风险换到多少收益", en: "Return earned per unit of risk" }, ok: true },
        { t: { zh: "总收益的高低", en: "Total return" } },
        { t: { zh: "交易的频率", en: "Trading frequency" } },
      ],
    },
  ];

  const g = { cash: 0, pos: 0, rolls: 0, lap: 0, playing: false, busy: false, quiz: null, quizBag: [] };

  const loadBest = () => qsLoadBest(BEST_KEY); // 共享实现在 app.js

  // ---------- 棋盘渲染: 5x5 网格的外圈 16 格, 中央 3x3 是事件/骰子区 ----------
  // 顺时针格序 -> 网格坐标 (row, col)
  const RING_POS = [
    [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 5], [3, 5], [4, 5],
    [5, 5], [5, 4], [5, 3], [5, 2], [5, 1],
    [4, 1], [3, 1], [2, 1],
  ];

  function buildBoard() {
    const board = $("rm-board");
    board.querySelectorAll(".rm-tile").forEach((el) => el.remove());
    TILES.forEach((tile, i) => {
      const cell = document.createElement("div");
      cell.className = "rm-tile rm-" + tile.type;
      cell.id = "rm-tile-" + i;
      cell.style.gridRow = RING_POS[i][0];
      cell.style.gridColumn = RING_POS[i][1];
      const ico = document.createElement("span");
      ico.textContent = tile.icon;
      const token = document.createElement("span");
      token.className = "rm-token";
      token.textContent = "🧑‍💼";
      cell.append(ico, token);
      board.appendChild(cell);
    });
  }

  function renderToken() {
    document.querySelectorAll(".rm-tile").forEach((el, i) => el.classList.toggle("here", i === g.pos));
  }

  function renderStats() {
    $("rm-cash").textContent = qsFmtInt(g.cash);
    $("rm-lap").textContent = String(g.lap + 1);
    $("rm-rolls").textContent = `${TOTAL_ROLLS - g.rolls}`;
    $("btn-rm-roll").disabled = !g.playing || g.busy;
  }

  function centerSay(text, cls) {
    const box = $("rm-center-msg");
    box.textContent = text;
    box.className = "rm-center-msg" + (cls ? " " + cls : "");
  }

  function gain(amt, label) {
    g.cash = Math.max(0, Math.round(g.cash + amt));
    const sign = amt >= 0 ? "+" : "";
    centerSay(`${label} ${sign}${qsFmtInt(amt)}`, amt >= 0 ? "pos" : "neg");
    playSound(amt >= 0 ? "buy" : "sell");
    renderStats();
  }

  // ---------- 掷骰与移动 ----------

  function start() {
    g.cash = START_CASH;
    g.pos = 0;
    g.rolls = 0;
    g.lap = 0;
    g.playing = true;
    g.busy = false;
    g.quiz = null;
    g.quizBag = [];
    $("rm-intro").hidden = true;
    $("rm-end").hidden = true;
    $("rm-play").hidden = false;
    buildBoard();
    renderToken();
    renderStats();
    $("rm-dice").textContent = "🎲";
    $("rm-quiz").hidden = true;
    centerSay(t("rm.go"));
  }

  function roll() {
    if (!g.playing || g.busy) return;
    g.busy = true;
    renderStats();
    const steps = 1 + Math.floor(Math.random() * 6);
    $("rm-dice").textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][steps - 1];
    playSound("fill");
    let moved = 0;
    const hop = setInterval(() => {
      g.pos = (g.pos + 1) % TILES.length;
      if (g.pos === 0) {
        g.lap++;
        gain(PASS_GO, t("rm.passGo"));
      }
      renderToken();
      moved++;
      if (moved >= steps) {
        clearInterval(hop);
        land();
      }
    }, 180);
  }

  function land() {
    const tile = TILES[g.pos];
    switch (tile.type) {
      case "go":
        gain(500, t("rm.landGo"));
        break;
      case "up":
      case "down":
        gain(Math.round(g.cash * tile.pct), t(tile.type === "up" ? "rm.mktUp" : "rm.mktDown", Math.round(Math.abs(tile.pct) * 100)));
        break;
      case "news": {
        const n = RM_NEWS[Math.floor(Math.random() * RM_NEWS.length)];
        gain(Math.round(g.cash * n.pct), "📰 " + pick(n.t));
        break;
      }
      case "chance": {
        const c = RM_CHANCE[Math.floor(Math.random() * RM_CHANCE.length)];
        gain(c.amt, "🎲 " + pick(c.t));
        break;
      }
      case "fee":
        gain(-1000, t("rm.fee"));
        break;
      case "bonus":
        gain(1200, t("rm.bonus"));
        break;
      case "rest":
        centerSay(t("rm.rest"));
        break;
      case "quiz":
        askQuiz();
        return; // 答完题再结束回合
    }
    endTurn();
  }

  function endTurn() {
    g.rolls++;
    g.busy = false;
    renderStats();
    if (g.rolls >= TOTAL_ROLLS) finish();
  }

  // ---------- 答题格: 不重复抽题, 答对 +1500 / 答错 -800 ----------

  function askQuiz() {
    if (!g.quizBag.length) g.quizBag = qsShuffle(RM_QUIZ);
    g.quiz = g.quizBag.pop();
    $("rm-quiz-q").textContent = pick(g.quiz.q);
    const wrap = $("rm-quiz-opts");
    wrap.innerHTML = "";
    // 选项洗牌, 正确项位置不固定
    qsShuffle(g.quiz.opts).forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "small";
      btn.textContent = pick(opt.t);
      btn.addEventListener("click", () => {
        $("rm-quiz").hidden = true;
        gain(opt.ok ? 1500 : -800, t(opt.ok ? "rm.quizRight" : "rm.quizWrong"));
        endTurn();
      });
      wrap.appendChild(btn);
    });
    $("rm-quiz").hidden = false;
    centerSay(t("rm.quizTitle"));
  }

  // ---------- 结算 ----------

  function finish() {
    g.playing = false;
    const b = loadBest();
    const newBest = g.cash > (b.best || 0);
    if (newBest) {
      try { localStorage.setItem(BEST_KEY, JSON.stringify({ best: g.cash })); } catch (e) { /* 忽略 */ }
    }
    $("rm-play").hidden = true;
    $("rm-end").hidden = false;
    $("rm-end-title").textContent = t("rm.endTitle") + (newBest ? " " + t("rm.newBest") : "");
    const ret = (g.cash / START_CASH - 1) * 100;
    $("rm-end-stats").textContent = t("rm.endStats", qsFmtInt(g.cash), (ret >= 0 ? "+" : "") + ret.toFixed(0) + "%", g.lap + 1);
    playSound(g.cash >= START_CASH ? "win" : "lose");
    document.dispatchEvent(new CustomEvent("qs:richmanEnd", { detail: { cash: g.cash } }));
  }

  function renderIntroBest() {
    const b = loadBest();
    $("rm-best").hidden = !b.best;
    if (b.best) $("rm-best").textContent = t("rm.best", qsFmtInt(b.best));
  }

  $("btn-rm-start").addEventListener("click", start);
  $("btn-rm-again").addEventListener("click", start);
  $("btn-rm-roll").addEventListener("click", roll);

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "richman") renderIntroBest();
  });
  renderIntroBest();
})();
