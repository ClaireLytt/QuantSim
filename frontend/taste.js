// 财报盲品会: 像盲品葡萄酒一样读财报。一张抹掉公司名/行业的报表 12 项核心指标,
// 你可以花分买线索 (其中混着粉饰性干扰), 然后下两个判断: 行业四选一 + 次年方向。
// 揭晓时给出"鉴别点"——每次失败都变成一条可复用的鉴别知识。题库里埋着舞弊财报,
// 防止玩家形成机械套路。纸面原型 B 的数字化 (docs/gameplay-core-loops-2026-10.md)。
// 依赖 app.js 的 $ / toast / playSound / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_taste";
  const CARDS_PER_GAME = 4;
  const CLUE_COST = 2;
  const TARGET = 16; // 胜利线: 满分 28 (4 卡 × 7), 允许买 6 条线索的误差

  // 指标行顺序固定, 标签走 i18n; 值是带单位的字符串 (盲品的"酒液"本体)
  const METRIC_KEYS = ["rev", "gm", "nm", "rd", "inv", "ar", "lev", "ocf", "adv", "roe", "fa", "sell"];

  // 题库: 基于典型行业/案例特征改编的匿名档案 (数据为教学虚构, 非真实财报)。
  // ind = 正确行业, dir = 次年方向, clues 固定 3 条且恰有 1 条 fake (粉饰性干扰)。
  const DECK = [
    {
      id: "liquor", ind: "liquor", dir: "up",
      m: ["12%", "91%", "52%", "1%", "1260天", "3天", "22%", "1.3", "18%", "31%", "8%", "9%"],
      clues: [
        { zh: "管理层讨论：直销渠道占比持续提升，提价顺利落地。", en: "MD&A: direct-sales mix keeps rising; price hikes landed smoothly.", fake: false },
        { zh: "同行对比：可比公司平均毛利率 78%，本公司显著更高。", en: "Peers: comparable firms average 78% gross margin; this one is far higher.", fake: false },
        { zh: "管理层讨论：公司正大力投入芯片级酿造数字化，科技属性凸显。", en: "MD&A: heavy investment in chip-grade digital brewing shows our tech DNA.", fake: true },
      ],
      name: { zh: "高端白酒龙头（档案改编）", en: "Premium liquor leader (adapted)" },
      explain: { zh: "鉴别点：毛利率 90%+ 且研发费用率仅 1%，存货周转 3 年以上（基酒陈放）——只有白酒同时满足；\"科技属性\"线索是粉饰。", en: "Tell: 90%+ gross margin with only 1% R&D and 3-year inventory turns (aging base spirits) - only liquor fits all three; the 'tech DNA' clue was window dressing." },
    },
    {
      id: "airline", ind: "airline", dir: "down",
      m: ["18%", "9%", "-4%", "0.3%", "9天", "15天", "83%", "—（净利为负）", "5%", "-12%", "71%", "4%"],
      clues: [
        { zh: "管理层讨论：机队规模扩张计划不变，新订 40 架宽体机。", en: "MD&A: fleet expansion unchanged; 40 new wide-bodies ordered.", fake: false },
        { zh: "上下游：航油均价同比上涨 23%。", en: "Upstream: jet fuel average price up 23% YoY.", fake: false },
        { zh: "管理层讨论：公司轻资产转型成效显著，盈利质量大幅改善。", en: "MD&A: asset-light transformation delivering markedly better earnings quality.", fake: true },
      ],
      name: { zh: "全服务航空公司（档案改编）", en: "Full-service airline (adapted)" },
      explain: { zh: "鉴别点：固定资产占比 71% + 资产负债率 83% + 毛利率个位数——重资产强周期；油价升 + 继续扩张机队 = 次年利润继续承压。\"轻资产转型\"与报表直接矛盾。", en: "Tell: 71% fixed assets + 83% leverage + single-digit margin = heavy-asset cyclical; rising fuel plus fleet expansion keeps earnings pressured. 'Asset-light' contradicts the balance sheet." },
    },
    {
      id: "chip", ind: "chip", dir: "up",
      m: ["45%", "38%", "12%", "24%", "92天", "68天", "31%", "0.8", "2%", "14%", "6%", "7%"],
      clues: [
        { zh: "管理层讨论：先进制程产品流片成功，已送样头部客户。", en: "MD&A: advanced-node chip taped out; samples with top customers.", fake: false },
        { zh: "上下游：晶圆代工产能紧张，交期延长到 26 周。", en: "Upstream: foundry capacity tight; lead times stretched to 26 weeks.", fake: false },
        { zh: "同行对比：公司渠道库存远低于同行，几乎无压货风险。", en: "Peers: channel inventory far below peers - almost no stuffing risk.", fake: true },
      ],
      name: { zh: "无晶圆厂芯片设计公司（档案改编）", en: "Fabless chip designer (adapted)" },
      explain: { zh: "鉴别点：研发费用率 24% + 固定资产占比仅 6%（fabless 不建厂）+ 高营收增速——芯片设计的指纹；存货 92 天在缺货周期里反而是蓄水。", en: "Tell: 24% R&D with only 6% fixed assets (fabless owns no fabs) plus fast growth - a chip designer's fingerprint; 92-day inventory is a buffer in a shortage cycle." },
    },
    {
      id: "bank", ind: "bank", dir: "flat",
      m: ["6%", "—（利差业务）", "38%", "2%", "—", "—", "92%", "1.1", "—", "11%", "1%", "3%"],
      clues: [
        { zh: "管理层讨论：净息差同比收窄 18 个基点。", en: "MD&A: net interest margin narrowed 18bps YoY.", fake: false },
        { zh: "监管动态：拨备覆盖率要求维持不变。", en: "Regulator: provision coverage requirements unchanged.", fake: false },
        { zh: "管理层讨论：零售转型带来爆发式增长拐点。", en: "MD&A: retail pivot has reached an explosive growth inflection.", fake: true },
      ],
      name: { zh: "全国性商业银行（档案改编）", en: "National commercial bank (adapted)" },
      explain: { zh: "鉴别点：资产负债率 92% 不是危险而是行业属性（存款即负债），毛利率/存货两栏干脆没有——金融报表长相和实业完全不同；息差收窄压住弹性，次年大概率平。", en: "Tell: 92% leverage is the business model (deposits are liabilities), and gross margin/inventory simply don't exist - financial statements look nothing like industrials. Narrowing NIM caps upside: flat year." },
    },
    {
      id: "panel", ind: "panel", dir: "up",
      m: ["-21%", "2%", "-15%", "6%", "48天", "52天", "61%", "—（净利为负）", "3%", "-18%", "64%", "3%"],
      clues: [
        { zh: "上下游：面板报价连续两个月环比回升。", en: "Downstream: panel quotes rising month-over-month for two months.", fake: false },
        { zh: "行业动态：两家二线厂宣布减产 30%。", en: "Industry: two second-tier makers announced 30% output cuts.", fake: false },
        { zh: "管理层讨论：公司已彻底摆脱行业周期，进入稳定盈利区间。", en: "MD&A: we have fully escaped the industry cycle into stable profitability.", fake: true },
      ],
      name: { zh: "显示面板制造商（档案改编）", en: "Display panel maker (adapted)" },
      explain: { zh: "鉴别点：巨亏 + 重资产 + 报价回升 + 同行减产 = 周期底部的经典组合——最难的反直觉题：亏得最惨的时点恰是周期股的买点。\"摆脱周期\"永远是粉饰。", en: "Tell: huge losses + heavy assets + rising quotes + peer output cuts = classic cycle bottom. The counterintuitive lesson: peak losses often mark the buy point. 'Escaped the cycle' is always dressing." },
    },
    {
      id: "ecom", ind: "ecom", dir: "down",
      m: ["64%", "18%", "-8%", "9%", "21天", "8天", "44%", "—（净利为负）", "12%", "-22%", "5%", "31%"],
      clues: [
        { zh: "管理层讨论：获客成本同比上升 47%。", en: "MD&A: customer acquisition cost up 47% YoY.", fake: false },
        { zh: "同行对比：头部平台开始全面压缩补贴。", en: "Peers: leading platforms are cutting subsidies across the board.", fake: false },
        { zh: "管理层讨论：用户心智护城河已经不可逾越。", en: "MD&A: our user mindshare moat is now insurmountable.", fake: true },
      ],
      name: { zh: "烧钱扩张期电商平台（档案改编）", en: "Burn-to-grow e-commerce platform (adapted)" },
      explain: { zh: "鉴别点：销售费用率 31% 吃掉全部毛利 + 高增速 + 负净利——烧钱换规模的指纹；获客成本飙升说明增长引擎失速，补贴退潮后次年更难看。", en: "Tell: 31% selling expense swallows the whole gross margin + fast growth + losses = burn-for-scale. Soaring CAC means the growth engine is stalling; with subsidies fading, next year looks worse." },
    },
    {
      id: "pharma", ind: "pharma", dir: "up",
      m: ["—（无营收）", "—", "—", "营收缺失", "—", "—", "12%", "—（净利为负）", "—", "-9%", "4%", "—"],
      clues: [
        { zh: "管理层讨论：核心管线 III 期临床达到主要终点。", en: "MD&A: lead pipeline asset hit its Phase III primary endpoint.", fake: false },
        { zh: "行业动态：同靶点海外药企刚以高溢价被收购。", en: "Industry: an overseas peer with the same target was just acquired at a premium.", fake: false },
        { zh: "管理层讨论：公司现金储备可支撑三十年研发投入。", en: "MD&A: cash reserves can fund thirty years of R&D.", fake: true },
      ],
      name: { zh: "未盈利创新药企（档案改编）", en: "Pre-revenue biotech (adapted)" },
      explain: { zh: "鉴别点：整张报表大面积\"—\"——没有营收的公司只剩现金和管线两个变量，估值全押在临床数据上；III 期达标是二元事件的好一侧。\"三十年现金\"数学上即假。", en: "Tell: a statement full of dashes - a pre-revenue company has only cash and pipeline; valuation rides on binary trial readouts, and a Phase III hit is the good side. 'Thirty years of cash' fails basic arithmetic." },
    },
    {
      id: "fraud", ind: "agri", dir: "down",
      m: ["28%", "35%", "19%", "0.5%", "310天", "160天", "38%", "0.2", "1%", "17%", "42%", "5%"],
      clues: [
        { zh: "管理层讨论：生物资产盘点受自然条件限制，采用抽样估算。", en: "MD&A: biological-asset counts are sample-based estimates due to natural conditions.", fake: false },
        { zh: "审计意见：对存货计价出具保留意见。", en: "Audit: qualified opinion on inventory valuation.", fake: false },
        { zh: "管理层讨论：公司盈利能力连续五年行业第一，经营稳健。", en: "MD&A: industry-leading profitability five years running; operations rock solid.", fake: true },
      ],
      name: { zh: "水产养殖公司（舞弊案例改编）", en: "Aquaculture firm (fraud case, adapted)" },
      explain: { zh: "鉴别点：净利率 19% 却经营现金流/净利润只有 0.2 + 存货 310 天且\"盘点靠抽样\"——利润是账面的，现金和存货是编的；审计保留意见就是最后的警报。这类报表方向永远向下。", en: "Tell: 19% net margin yet OCF/NI of 0.2, with 310-day inventory that can only be 'sample counted' - paper profits, fabricated stock. The qualified audit opinion is the final alarm. These only go one way: down." },
    },
  ];

  // 行业选项池: 每题 = 正确行业 + 3 个干扰项
  const INDUSTRIES = ["liquor", "airline", "chip", "bank", "panel", "ecom", "pharma", "agri"];

  const g = {
    rng: null, cards: [], idx: 0, score: 0,
    cluesBought: 0, picked: { ind: null, dir: null }, options: [],
    results: [], done: false, revealed: false,
  };

  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function startGame() {
    g.rng = mulberry32(Math.floor(Math.random() * 1e9));
    g.cards = [...DECK].sort(() => g.rng() - 0.5).slice(0, CARDS_PER_GAME);
    g.idx = 0;
    g.score = 0;
    g.results = [];
    g.done = false;
    $("fbt-select").hidden = true;
    $("fbt-report").hidden = true;
    $("fbt-room").hidden = false;
    setupCard();
  }

  function setupCard() {
    const card = g.cards[g.idx];
    g.cluesBought = 0;
    g.picked = { ind: null, dir: null };
    g.revealed = false;
    // 行业四选一: 正确项 + 3 干扰, 打乱
    const distract = INDUSTRIES.filter((i) => i !== card.ind).sort(() => g.rng() - 0.5).slice(0, 3);
    g.options = [card.ind, ...distract].sort(() => g.rng() - 0.5);
    $("fbt-reveal").hidden = true;
    $("fbt-quiz").hidden = false;
    renderCard();
  }

  function renderCard() {
    const card = g.cards[g.idx];
    $("fbt-no").textContent = t("fbt.cardNo", g.idx + 1, CARDS_PER_GAME);
    $("fbt-score").textContent = String(g.score);
    const grid = $("fbt-metrics");
    grid.innerHTML = "";
    METRIC_KEYS.forEach((k, i) => {
      const cell = document.createElement("div");
      cell.className = "fbt-cell";
      const lab = document.createElement("i");
      lab.textContent = t("fbt.m." + k);
      const val = document.createElement("b");
      val.textContent = card.m[i];
      cell.append(lab, val);
      grid.appendChild(cell);
    });
    renderClues();
    renderChoices();
  }

  function renderClues() {
    const card = g.cards[g.idx];
    const wrap = $("fbt-clues");
    wrap.innerHTML = "";
    card.clues.forEach((c, i) => {
      if (i < g.cluesBought) {
        const p = document.createElement("p");
        p.className = "qd-claim";
        p.textContent = t("fbt.clueGot", i + 1) + " " + pick(c);
        wrap.appendChild(p);
      }
    });
    const btn = $("btn-fbt-clue");
    btn.disabled = g.revealed || g.cluesBought >= card.clues.length;
    btn.textContent = g.cluesBought >= card.clues.length
      ? t("fbt.cluesOut")
      : t("fbt.buyClue", CLUE_COST, card.clues.length - g.cluesBought);
  }

  function buyClue() {
    const card = g.cards[g.idx];
    if (g.revealed || g.cluesBought >= card.clues.length) return;
    g.cluesBought++;
    g.score -= CLUE_COST;
    playSound("flip");
    $("fbt-score").textContent = String(g.score);
    renderClues();
  }

  function renderChoices() {
    const indWrap = $("fbt-inds");
    indWrap.innerHTML = "";
    g.options.forEach((ind) => {
      const b = document.createElement("button");
      b.className = "mz-door" + (g.picked.ind === ind ? " active" : "");
      b.disabled = g.revealed;
      const tt = document.createElement("b");
      tt.textContent = t("fbt.ind." + ind);
      b.append(tt);
      b.addEventListener("click", () => { g.picked.ind = ind; renderChoices(); });
      indWrap.appendChild(b);
    });
    const dirWrap = $("fbt-dirs");
    dirWrap.innerHTML = "";
    ["up", "flat", "down"].forEach((d) => {
      const b = document.createElement("button");
      b.className = g.picked.dir === d ? "primary" : "";
      b.disabled = g.revealed;
      b.textContent = t("fbt.dir." + d);
      b.addEventListener("click", () => { g.picked.dir = d; renderChoices(); });
      dirWrap.appendChild(b);
    });
    $("btn-fbt-submit").disabled = g.revealed || !g.picked.ind || !g.picked.dir;
  }

  function submit() {
    if (g.revealed || !g.picked.ind || !g.picked.dir) return;
    const card = g.cards[g.idx];
    const indOk = g.picked.ind === card.ind;
    const dirOk = g.picked.dir === card.dir;
    let pts = (indOk ? 3 : 0) + (dirOk ? 2 : 0) + (indOk && dirOk ? 2 : 0);
    g.score += pts;
    g.results.push({ card, indOk, dirOk, pts, clues: g.cluesBought });
    g.revealed = true;
    playSound(indOk && dirOk ? "win" : indOk || dirOk ? "fill" : "lose");
    // 揭晓: 公司真身 + 鉴别点 + 干扰线索点名
    $("fbt-quiz").hidden = true;
    const rv = $("fbt-reveal");
    rv.hidden = false;
    $("fbt-rv-name").textContent = pick(card.name);
    $("fbt-rv-verdict").textContent = t("fbt.verdict",
      t(indOk ? "fbt.hit" : "fbt.miss"), t("fbt.ind." + card.ind),
      t(dirOk ? "fbt.hit" : "fbt.miss"), t("fbt.dir." + card.dir), pts);
    $("fbt-rv-verdict").className = "qdr-conclusion " + (indOk && dirOk ? "win" : "lose");
    $("fbt-rv-explain").textContent = pick(card.explain);
    const fakeIdx = card.clues.findIndex((c) => c.fake);
    $("fbt-rv-fake").textContent = g.cluesBought > fakeIdx
      ? t("fbt.fakeSeen", fakeIdx + 1)
      : t("fbt.fakeUnseen");
    $("btn-fbt-next").textContent = t(g.idx + 1 >= g.cards.length ? "fbt.toReport" : "fbt.nextCard");
    $("fbt-score").textContent = String(g.score);
  }

  function nextCard() {
    if (g.idx + 1 >= g.cards.length) { finish(); return; }
    g.idx++;
    setupCard();
  }

  function finish() {
    g.done = true;
    const win = g.score >= TARGET;
    $("fbt-room").hidden = true;
    $("fbt-report").hidden = false;
    const concl = $("fbtr-conclusion");
    concl.textContent = win ? t("fbt.win", g.score, TARGET) : t("fbt.lose", g.score, TARGET);
    concl.className = "qdr-conclusion " + (win ? "win" : "lose");
    const ul = $("fbtr-log");
    ul.innerHTML = "";
    g.results.forEach((r, i) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = `#${i + 1} ` + pick(r.card.name);
      const dd = document.createElement("span");
      dd.textContent = t("fbt.logLine",
        t(r.indOk ? "fbt.hit" : "fbt.miss"), t(r.dirOk ? "fbt.hit" : "fbt.miss"), r.clues, r.pts);
      li.append(tt, dd);
      ul.appendChild(li);
    });
    $("fbtr-why").textContent = t("fbt.moral");
    playSound(win ? "win" : "lose");
    if (win) {
      const b = qsLoadBest(BEST_KEY);
      if (g.score > (b.best || 0)) {
        qsSaveBest(BEST_KEY, { best: g.score });
        toast(t("fbt.newBest", g.score));
      }
    }
    renderIntroBest();
  }

  function backToSelect() {
    $("fbt-room").hidden = true;
    $("fbt-report").hidden = true;
    $("fbt-select").hidden = false;
    renderIntroBest();
  }

  function renderIntroBest() {
    const b = qsLoadBest(BEST_KEY);
    $("fbt-best").hidden = !b.best;
    if (b.best) $("fbt-best").textContent = t("fbt.best", b.best);
  }

  $("btn-fbt-start").addEventListener("click", startGame);
  $("btn-fbt-clue").addEventListener("click", buyClue);
  $("btn-fbt-submit").addEventListener("click", submit);
  $("btn-fbt-next").addEventListener("click", nextCard);
  $("btn-fbt-back").addEventListener("click", backToSelect);
  $("btn-fbtr-again").addEventListener("click", startGame);
  $("btn-fbtr-games").addEventListener("click", () => {
    backToSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "taste") renderIntroBest();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-taste").hidden) return;
    renderIntroBest();
    if (!$("fbt-room").hidden && g.rng && !g.done) {
      renderCard();
      if (g.revealed) {
        // 揭晓面板的文案也要跟语言走
        const card = g.cards[g.idx];
        $("fbt-rv-name").textContent = pick(card.name);
        $("fbt-rv-explain").textContent = pick(card.explain);
      }
    }
  });

  renderIntroBest();
})();
