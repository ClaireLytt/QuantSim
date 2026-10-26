// 市场侦探: 首发三案 (docs/market-detective-cases-2026-10.md 的 案1/案6/案12)。
// 核心机制 = 该文档的通用框架落地:
//   调查点数 — 每案 10 点, 调查对象标价 1~3 点, 乱查的人拼不出证据链;
//   证据板钉选 — 提交前必须钉 ≥2 条线索当论据, 钉了误导线索扣分且复盘点名 ("蒙对"可识别);
//   假设检验 — 花 1 点换 "该假设与已揭示线索矛盾 N 条" 的方向性反馈;
//   双证据链 — 每案两条独立链, 任一条钉全 +2, 两条全钉 = 交叉验证再 +2。
// 依赖 app.js 的 $ / toast / playSound / qsLoadBest / qsSaveBest, i18n.js 的 t / pick。
(() => {
  const BEST_KEY = "qs_sleuth";
  const POINTS0 = 10;
  const HYPO_COST = 1;
  const MISLEAD_PENALTY = 2;
  const CHAIN_BONUS = 2;
  const MIN_PINNED = 2;

  // 线索 type: key(链上关键) / support(佐证) / mislead(误导, 钉了扣分)。
  // cost 0 = 开案即公开; probe = 调查对象名 (花点揭示)。bust 指向它拆穿的误导线索 id。
  const CASES = [
    {
      id: "c1", icon: "📈", winAt: 8,
      title: { zh: "案一：谁在悄悄建仓", en: "Case 1: The Quiet Accumulator" },
      brief: { zh: "一只无人问津的小盘股，20 个交易日内换手率悄然翻倍，股价却几乎没动。委托人感觉有人在吸筹——请你确认，并判断吸到哪一步了。", en: "A forgotten small-cap's turnover quietly doubled over 20 sessions while the price barely moved. Your client suspects accumulation - confirm it, and tell them how far along it is." },
      clues: [
        { id: "p1", cost: 0, type: "support", chain: "A", probe: null, text: { zh: "日 K 与成交量：量升价平——买的人不少，价却被按着。", en: "Daily chart: volume up, price flat - plenty of buying, yet the price is being held down." } },
        { id: "p2", cost: 0, type: "support", chain: null, probe: null, text: { zh: "龙虎榜全程缺席：单日量被刻意控制在披露线之下。", en: "Never on the exchange's daily movers list: single-day volume kept just under the disclosure line." } },
        { id: "m1", cost: 0, type: "mislead", chain: null, probe: null, text: { zh: "旧新闻：『公司或有重组』——日期在半年前。", en: "Old news: 'possible restructuring' - dated six months ago." } },
        { id: "m2", cost: 0, type: "mislead", chain: null, probe: null, text: { zh: "第 14 日突然放量 3 倍，像主力动手的日子。", en: "Day 14: volume suddenly tripled - looks like the operator's big move." } },
        { id: "k1", cost: 2, type: "key", chain: "A", probe: { zh: "调取分时明细（2 点）", en: "Intraday detail (2 pts)" }, text: { zh: "分时指纹：连续多日尾盘小单压价——压住收盘价，次日继续低吸。", en: "Intraday fingerprint: small sell orders press the close day after day - keep it cheap, buy again tomorrow." } },
        { id: "k2", cost: 2, type: "key", chain: "B", probe: { zh: "调取大宗交易记录（2 点）", en: "Block-trade records (2 pts)" }, text: { zh: "大宗通道：三笔 92~94 折折价成交，接手方席位相同。", en: "Block desk: three trades at 6-8% discounts, all to the same receiving seat." } },
        { id: "k3", cost: 3, type: "key", chain: "B", probe: { zh: "统计营业部席位（3 点）", en: "Branch-seat statistics (3 pts)" }, text: { zh: "席位统计：同一营业部在 20 日内 11 次出现在买方前列。", en: "Seat stats: one branch shows up on the buy side 11 times in 20 sessions." } },
        { id: "b1", cost: 1, type: "support", chain: null, bust: "m1", probe: { zh: "翻公司公告列表（1 点）", en: "Company filings (1 pt)" }, text: { zh: "公告列表：重组传闻五个月前已被正式澄清否认。", en: "Filings: the restructuring rumor was formally denied five months ago." } },
        { id: "b2", cost: 1, type: "support", chain: null, bust: "m2", probe: { zh: "对照同行当日量能（1 点）", en: "Peer volume comparison (1 pt)" }, text: { zh: "同行对照：第 14 日全市场同涨量——那天是指数调仓日，不是谁的动作。", en: "Peer check: the whole market surged on day 14 - index rebalancing day, nobody's move." } },
      ],
      judgments: [
        { id: "j1", pts: 4, label: { zh: "是否存在单一主力吸筹？", en: "Is a single operator accumulating?" }, answer: "yes",
          options: [ { id: "yes", label: { zh: "是", en: "Yes" } }, { id: "no", label: { zh: "否", en: "No" } } ],
          conflicts: { no: ["k1", "k2", "k3"], yes: [] } },
        { id: "j2", pts: 3, label: { zh: "吸筹进行到哪个阶段？", en: "How far along is the accumulation?" }, answer: "mid",
          options: [ { id: "early", label: { zh: "早期", en: "Early" } }, { id: "mid", label: { zh: "中期", en: "Mid" } }, { id: "late", label: { zh: "接近完成", en: "Nearly done" } } ],
          conflicts: { early: ["k3"], late: ["p1"], mid: [] } },
      ],
      explain: { zh: "吸筹指纹三件套：量升价平（有人持续买但不想抬价）+ 尾盘压价（控制成本）+ 席位/大宗集中（钱来自同一处）。阶段判断靠算术：累计异常换手约为流通盘 15%——仓位在半山腰，早期不会有 11 次席位记录，接近完成则压价会松、价已抬。两条误导都考『查出处』：重组是半年前已澄清的旧闻，放量日是指数调仓的全市场现象。", en: "The accumulation fingerprint: volume-up-price-flat (steady buying without lifting), closes pressed late (cost control), and concentrated seats/blocks (one pocket). The stage is arithmetic: cumulative abnormal turnover is ~15% of float - halfway. Early-stage wouldn't leave 11 seat records; near-done would stop pressing the close. Both red herrings fall to source-checking: the rumor was denied months ago, and the volume spike was a market-wide rebalancing day." },
    },
    {
      id: "c6", icon: "📦", winAt: 9,
      title: { zh: "案六：存货的重量", en: "Case 6: The Weight of Inventory" },
      brief: { zh: "一家农业公司连续三年高增长，审计师刚辞任。做空机构委托你：报表里有没有造假指纹？雷埋在哪个科目？真实利润还剩几成？", en: "An agriculture company posts three straight years of high growth - and its auditor just resigned. A short seller hires you: is there a fraud fingerprint, which line item hides the mine, and how much of the profit is real?" },
      clues: [
        { id: "p1", cost: 0, type: "support", chain: null, probe: null, text: { zh: "审计意见三年轨迹：标准 → 标准 → 保留意见。", en: "Audit opinions over three years: clean, clean, qualified." } },
        { id: "p2", cost: 0, type: "support", chain: "A", probe: null, text: { zh: "存货占总资产比：31% → 44% → 58%，逐年陡升。", en: "Inventory as a share of assets: 31% to 44% to 58%, climbing fast." } },
        { id: "m1", cost: 0, type: "mislead", chain: null, probe: null, text: { zh: "公司高调公告 2 亿元回购，股价应声上涨。", en: "The company trumpets a 200M buyback; the stock pops." } },
        { id: "m2", cost: 0, type: "mislead", chain: null, probe: null, text: { zh: "行业景气度真实上行，同类产品价格一年涨了两成。", en: "The industry genuinely boomed - product prices rose 20% in a year." } },
        { id: "k1", cost: 2, type: "key", chain: "A", probe: { zh: "细读报表附注（2 点）", en: "Read the footnotes (2 pts)" }, text: { zh: "附注小字：『生物资产盘点受自然条件限制，采用抽样估算』——没人数得清水里的货。", en: "Footnote fine print: 'biological assets are sample-estimated due to natural conditions' - nobody can count what's underwater." } },
        { id: "k2", cost: 1, type: "key", chain: "A", probe: { zh: "拉同行对照表（1 点）", en: "Peer comparison table (1 pt)" }, text: { zh: "同行对照：存货周转 310 天 vs 同行均值 75 天，背离 4 倍；经营现金流/净利润连续三年 < 0.3。", en: "Peers: inventory turns in 310 days vs a 75-day average - 4x off; OCF/net income below 0.3 for three straight years." } },
        { id: "k3", cost: 3, type: "key", chain: "B", probe: { zh: "查前五客户工商档案（3 点）", en: "Top-5 customers' registry files (3 pts)" }, text: { zh: "工商档案：前五大客户全部为当年新设公司，其中三家注册地址相同，合计贡献 40% 营收。", en: "Registry: all top-5 customers were incorporated this year, three share one address - together 40% of revenue." } },
        { id: "k4", cost: 2, type: "support", chain: "B", bust: "m1", probe: { zh: "追募集资金流向（2 点）", en: "Trace the raised funds (2 pts)" }, text: { zh: "资金流向：回购的钱来自三个月前的定向增发——左手融资右手回购，净流入是负的。", en: "Fund trail: the buyback cash came from a placement three months earlier - raise with one hand, buy back with the other; net inflow is negative." } },
        { id: "k5", cost: 2, type: "support", chain: null, probe: { zh: "调审计师辞任函（2 点）", en: "The auditor's resignation letter (2 pts)" }, text: { zh: "辞任函措辞：『无法就存货计价获取充分适当的审计证据』。", en: "The letter: 'unable to obtain sufficient appropriate audit evidence over inventory valuation.'" } },
      ],
      judgments: [
        { id: "j1", pts: 4, label: { zh: "报表是否存在系统性造假？", en: "Is the statement systematically fraudulent?" }, answer: "yes",
          options: [ { id: "yes", label: { zh: "是", en: "Yes" } }, { id: "no", label: { zh: "否", en: "No" } } ],
          conflicts: { no: ["k1", "k2", "k3", "k5"], yes: [] } },
        { id: "j2", pts: 3, label: { zh: "雷埋在哪个科目？", en: "Which line item hides the mine?" }, answer: "inv",
          options: [ { id: "inv", label: { zh: "存货", en: "Inventory" } }, { id: "rev", label: { zh: "收入", en: "Revenue" } }, { id: "cash", label: { zh: "货币资金", en: "Cash" } } ],
          conflicts: { cash: ["k1", "k5"], rev: ["k1"], inv: [] } },
        { id: "j3", pts: 2, label: { zh: "真实利润约为报表的几成？", en: "Real profit is roughly what share of reported?" }, answer: "low",
          options: [ { id: "low", label: { zh: "三成以下", en: "Under 30%" } }, { id: "midr", label: { zh: "三到六成", en: "30-60%" } }, { id: "high", label: { zh: "六成以上", en: "Over 60%" } } ],
          conflicts: { high: ["k2"], midr: [], low: [] } },
      ],
      explain: { zh: "经典手法完整链条：利润是编的 → 现金流圆不上（OCF/净利 <0.3 是算术铁证）→ 编出来的利润要有地方放 → 放进『数不清』的存货（抽样估算 + 周转 4 倍背离）。收入端也脏（新设同址客户），但蓄水池在存货——j2 的辨析点。真实利润几成直接读 OCF/净利比率：三成以下。回购是信心表演（钱来自增发），行业景气是真的——真景气更衬得造假难辨，这正是它被选进来的原因。", en: "The classic chain in full: fabricate profit, fail to fake the cash (OCF/NI < 0.3 is arithmetic), then park the fiction somewhere uncountable - inventory (sample-estimated, turns 4x off peers). Revenue is dirty too (same-address shell customers), but the reservoir is inventory - that's the j2 distinction. The real-profit share reads straight off OCF/NI: under 30%. The buyback was theater funded by a placement, and the industry boom was real - genuine tailwinds are exactly what good frauds hide behind." },
    },
    {
      id: "c12", icon: "🗞️", winAt: 9,
      title: { zh: "案十二：谣言解剖课", en: "Case 12: Anatomy of a Rumor" },
      brief: { zh: "午后一张『产品致安全事故』的截图引爆跌停，晚间公司辟谣。但第二天股价没有收复。市场知道些你不知道的事——还是说，所有人都错了？", en: "An afternoon screenshot - 'product caused a safety incident' - crashed the stock to limit-down. The company denied it that evening. Yet the next day the price never recovered. Does the market know something - or is everyone wrong?" },
      clues: [
        { id: "p1", cost: 0, type: "support", chain: null, probe: null, text: { zh: "引爆行情的截图原件：一张聊天记录截屏，来源不明。", en: "The screenshot that lit the fuse: a chat-log capture, origin unknown." } },
        { id: "p2", cost: 0, type: "support", chain: "A", probe: null, text: { zh: "公司辟谣公告全文（当晚 21:04 发布）。", en: "The company's full denial, posted 21:04 that evening." } },
        { id: "p3", cost: 0, type: "support", chain: "B", probe: null, text: { zh: "两日分时与资金流：辟谣次日高开 2%，随后一路阴跌收 -3%。", en: "Two days of tape: the morning after the denial opened +2%, then bled to -3%." } },
        { id: "m2", cost: 0, type: "mislead", chain: null, probe: null, text: { zh: "百万粉大 V 发长文《辟谣实锤》，论据引用公司公告与客服回应。", en: "A million-follower influencer posts 'Rumor Debunked' - sourced entirely from the company's own statements." } },
        { id: "m1", cost: 1, type: "mislead", probe: { zh: "鉴定截图真伪（1 点）", en: "Forensics on the screenshot (1 pt)" }, chain: null, text: { zh: "图片鉴定：截图存在明显拼接痕迹——它是伪造的。", en: "Forensics: the screenshot shows clear splicing - it is fabricated." } },
        { id: "k1", cost: 2, type: "key", chain: "A", probe: { zh: "逐句分析辟谣措辞（2 点）", en: "Parse the denial line by line (2 pts)" }, text: { zh: "措辞分析：公告只否认『该批次产品』与『网传截图』，全程未否认『发生过安全事故』。", en: "Parsing: the denial rejects 'that batch' and 'the circulating screenshot' - it never denies that an incident occurred." } },
        { id: "k2", cost: 3, type: "key", chain: "A", probe: { zh: "检索属地监管网站（3 点）", en: "Search the local regulator's site (3 pts)" }, text: { zh: "监管网站：事故属地市监局三天前挂出对该公司的行政处罚预公示——事情是真的，只是截图是假的。", en: "Regulator's site: a pre-publication penalty notice against the company, posted three days ago - the incident is real; only the screenshot is fake." } },
        { id: "k3", cost: 2, type: "key", chain: "B", probe: { zh: "追踪席位流向（2 点）", en: "Track seat flows (2 pts)" }, text: { zh: "席位流向：某长线风格席位在辟谣公告发布后的次日仍在持续卖出。", en: "Seat flows: a long-horizon seat kept selling the day after the denial went out." } },
        { id: "k4", cost: 1, type: "support", chain: "B", probe: { zh: "翻高管减持记录（1 点）", en: "Executive share-sale records (1 pt)" }, text: { zh: "减持记录：三位高管在事发前一个月内合计减持 1.2% 股份。", en: "Records: three executives sold 1.2% of shares in the month before the incident." } },
      ],
      judgments: [
        { id: "j1", pts: 4, label: { zh: "事件的真实性是？", en: "What is the truth of the event?" }, answer: "fitr",
          options: [ { id: "fake", label: { zh: "谣言全假", en: "Entirely false" } }, { id: "fitr", label: { zh: "假图真事", en: "Fake image, real story" } }, { id: "true", label: { zh: "真图真事", en: "Real image, real story" } } ],
          conflicts: { fake: ["k2", "k3", "k1"], true: ["m1"], fitr: [] } },
        { id: "j2", pts: 3, label: { zh: "辟谣次日阴跌的主因是？", en: "Why did it bleed the day after the denial?" }, answer: "insider",
          options: [ { id: "insider", label: { zh: "知情资金出货", en: "Informed money exiting" } }, { id: "panic", label: { zh: "恐慌未消", en: "Lingering panic" } }, { id: "beta", label: { zh: "大盘拖累", en: "Market drag" } } ],
          conflicts: { panic: ["k3"], beta: ["p3"], insider: [] } },
        { id: "j3", pts: 2, label: { zh: "这份辟谣公告的可信度？", en: "How credible is the denial?" }, answer: "low",
          options: [ { id: "high", label: { zh: "高", en: "High" } }, { id: "midc", label: { zh: "中", en: "Medium" } }, { id: "low", label: { zh: "低（律师式闪避）", en: "Low (lawyered evasion)" } } ],
          conflicts: { high: ["k1", "k2"], midc: ["k2"], low: [] } },
      ],
      explain: { zh: "本案核心反转：证伪载体 ≠ 证伪事实。截图确实是假的——但『假图』恰恰是最便宜的调查（1 点），花完就下结论的人正好掉进坑里。真相藏在两条独立链上：官方链（辟谣只否认『该批次』+ 监管预公示）与行为链（知情席位辟谣后继续卖 + 事前高管减持）。大 V 长文的所有论据都来自公司单方披露——转述不是证据。阴跌主因是知情资金出货：恐慌盘在跌停日已交完筹码，大盘当日是涨的。", en: "The case's twist: debunking the vehicle is not debunking the fact. The screenshot IS fake - and image forensics is deliberately the cheapest probe (1 pt), a trap for whoever stops there. The truth sits on two independent chains: the official chain (a denial that only rejects 'that batch', plus the regulator's pre-publication notice) and the behavioral chain (an informed seat still selling after the denial, executives dumping beforehand). The influencer's 'debunk' cites only the company's own statements - repetition isn't evidence. The bleed was informed money exiting: panic had already sold at the limit-down, and the broad market was up that day." },
    },
  ];

  const g = {
    kase: null, points: 0, revealed: [], pinned: [],
    picks: {}, hypoOpt: null, done: false, result: null,
  };

  function openSelect() {
    $("dtc-room").hidden = true;
    $("dtc-report").hidden = true;
    $("dtc-select").hidden = false;
    renderCaseCards();
  }

  function renderCaseCards() {
    const wrap = $("dtc-cases");
    wrap.innerHTML = "";
    const best = qsLoadBest(BEST_KEY);
    CASES.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "mz-door";
      const tt = document.createElement("b");
      tt.textContent = c.icon + " " + pick(c.title);
      const dd = document.createElement("span");
      dd.className = "sub";
      const b = best[c.id];
      dd.textContent = pick(c.brief).slice(0, 60) + "…" + (b ? " · " + t("dtc.solved", b) : "");
      btn.append(tt, dd);
      btn.addEventListener("click", () => startCase(c));
      wrap.appendChild(btn);
    });
  }

  function startCase(c) {
    g.kase = c;
    g.points = POINTS0;
    g.revealed = c.clues.filter((cl) => cl.cost === 0).map((cl) => cl.id);
    g.pinned = [];
    g.picks = {};
    g.hypoOpt = null;
    g.done = false;
    $("dtc-select").hidden = true;
    $("dtc-report").hidden = true;
    $("dtc-room").hidden = false;
    playSound("flip");
    renderRoom();
  }

  const clueById = (id) => g.kase.clues.find((c) => c.id === id);

  function renderRoom() {
    const c = g.kase;
    $("dtc-title").textContent = c.icon + " " + pick(c.title);
    $("dtc-brief").textContent = pick(c.brief);
    $("dtc-points").textContent = String(g.points);
    renderBoard();
    renderProbes();
    renderJudgments();
    renderHypo();
    $("btn-dtc-submit").disabled = g.done || g.pinned.length < MIN_PINNED
      || c.judgments.some((j) => !g.picks[j.id]);
    $("dtc-pin-hint").textContent = t("dtc.pinHint", g.pinned.length, MIN_PINNED);
  }

  // 证据板: 已揭示线索一卡一张, 点卡 = 钉/取钉 (钉上的就是你的论据链)
  function renderBoard() {
    const wrap = $("dtc-board");
    wrap.innerHTML = "";
    g.revealed.forEach((id) => {
      const cl = clueById(id);
      const card = document.createElement("button");
      card.className = "dtc-clue" + (g.pinned.includes(id) ? " pinned" : "");
      card.disabled = g.done;
      const tag = document.createElement("i");
      tag.textContent = g.pinned.includes(id) ? t("dtc.pinnedTag") : t("dtc.clueTag");
      const txt = document.createElement("span");
      txt.textContent = pick(cl.text);
      card.append(tag, txt);
      card.addEventListener("click", () => {
        if (g.pinned.includes(id)) g.pinned = g.pinned.filter((x) => x !== id);
        else g.pinned.push(id);
        playSound("tap");
        renderRoom();
      });
      wrap.appendChild(card);
    });
  }

  function renderProbes() {
    const wrap = $("dtc-probes");
    wrap.innerHTML = "";
    g.kase.clues.filter((cl) => cl.cost > 0 && !g.revealed.includes(cl.id)).forEach((cl) => {
      const btn = document.createElement("button");
      btn.className = "mz-door";
      btn.disabled = g.done || g.points < cl.cost;
      const tt = document.createElement("b");
      tt.textContent = pick(cl.probe);
      btn.append(tt);
      btn.addEventListener("click", () => {
        g.points -= cl.cost;
        g.revealed.push(cl.id);
        playSound("fill");
        renderRoom();
      });
      wrap.appendChild(btn);
    });
    $("dtc-probes-empty").hidden = !!wrap.children.length;
  }

  function renderJudgments() {
    const wrap = $("dtc-judge");
    wrap.innerHTML = "";
    g.kase.judgments.forEach((j) => {
      const row = document.createElement("div");
      row.className = "dtc-jrow";
      const lab = document.createElement("p");
      lab.className = "hint";
      lab.textContent = pick(j.label) + "（+" + j.pts + "）";
      row.appendChild(lab);
      const opts = document.createElement("div");
      opts.className = "lw-fracs qd-actions";
      j.options.forEach((o) => {
        const b = document.createElement("button");
        b.className = g.picks[j.id] === o.id ? "primary" : "";
        b.disabled = g.done;
        b.textContent = pick(o.label);
        b.addEventListener("click", () => { g.picks[j.id] = o.id; renderRoom(); });
        opts.appendChild(b);
      });
      row.appendChild(opts);
      wrap.appendChild(row);
    });
  }

  // 假设检验: 选主判断的一个选项, 花 1 点换"与已揭示线索矛盾 N 条" (只给数量不给名单)
  function renderHypo() {
    const sel = $("dtc-hypo-opt");
    const j1 = g.kase.judgments[0];
    sel.innerHTML = "";
    j1.options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = pick(o.label);
      if (g.hypoOpt === o.id) opt.selected = true;
      sel.appendChild(opt);
    });
    $("btn-dtc-hypo").disabled = g.done || g.points < HYPO_COST;
    $("btn-dtc-hypo").textContent = t("dtc.hypoBtn", HYPO_COST);
  }

  function testHypo() {
    if (g.done || g.points < HYPO_COST) return;
    const j1 = g.kase.judgments[0];
    const opt = $("dtc-hypo-opt").value;
    g.points -= HYPO_COST;
    g.hypoOpt = opt;
    const n = (j1.conflicts[opt] || []).filter((id) => g.revealed.includes(id)).length;
    playSound("flip");
    toast(t("dtc.hypoResult", n));
    renderRoom();
  }

  function chainStatus(chain) {
    const members = g.kase.clues.filter((cl) => cl.chain === chain && cl.type !== "mislead");
    const keys = members.filter((cl) => cl.type === "key");
    // 链完整 = 该链全部 key 线索都被钉为论据
    return keys.length > 0 && keys.every((cl) => g.pinned.includes(cl.id));
  }

  function submit() {
    const c = g.kase;
    if (g.done || g.pinned.length < MIN_PINNED) return;
    let score = 0;
    const judgeRes = c.judgments.map((j) => {
      const ok = g.picks[j.id] === j.answer;
      if (ok) score += j.pts;
      return { j, ok };
    });
    const misPinned = g.pinned.filter((id) => clueById(id).type === "mislead");
    score -= misPinned.length * MISLEAD_PENALTY;
    const chainA = chainStatus("A");
    const chainB = chainStatus("B");
    if (chainA) score += CHAIN_BONUS;
    if (chainB) score += CHAIN_BONUS;
    const win = score >= c.winAt;
    g.done = true;
    g.result = { score, win, judgeRes, misPinned, chainA, chainB };
    renderReport();
    playSound(win ? "win" : "lose");
    if (win) {
      const best = qsLoadBest(BEST_KEY);
      if (score > (best[c.id] || 0)) {
        qsSaveBest(BEST_KEY, { [c.id]: score });
        toast(t("dtc.newBest", score));
      }
    }
  }

  function renderReport() {
    const c = g.kase;
    const r = g.result;
    $("dtc-room").hidden = true;
    $("dtc-report").hidden = false;
    const concl = $("dtcr-conclusion");
    concl.textContent = r.win ? t("dtc.win", r.score, c.winAt) : t("dtc.lose", r.score, c.winAt);
    concl.className = "qdr-conclusion " + (r.win ? "win" : "lose");
    const ul = $("dtcr-judge");
    ul.innerHTML = "";
    r.judgeRes.forEach(({ j, ok }) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = (ok ? "✓ " : "✗ ") + pick(j.label);
      const dd = document.createElement("span");
      const yours = j.options.find((o) => o.id === g.picks[j.id]);
      const right = j.options.find((o) => o.id === j.answer);
      dd.textContent = ok ? t("dtc.judgeOk", pick(right.label), j.pts)
        : t("dtc.judgeBad", pick(yours.label), pick(right.label));
      li.append(tt, dd);
      ul.appendChild(li);
    });
    // 论据链体检: 钉了误导线索逐条点名 ("蒙对"在这里现形); 链完整/交叉验证加分明示
    const chainLine = r.chainA && r.chainB ? t("dtc.chainBoth", CHAIN_BONUS * 2)
      : r.chainA || r.chainB ? t("dtc.chainOne", CHAIN_BONUS) : t("dtc.chainNone");
    $("dtcr-chain").textContent = chainLine;
    const mis = $("dtcr-mislead");
    mis.innerHTML = "";
    mis.hidden = !r.misPinned.length;
    r.misPinned.forEach((id) => {
      const li = document.createElement("li");
      const tt = document.createElement("b");
      tt.textContent = t("dtc.misTag", MISLEAD_PENALTY);
      const dd = document.createElement("span");
      dd.textContent = pick(clueById(id).text);
      li.append(tt, dd);
      mis.appendChild(li);
    });
    $("dtcr-explain").textContent = pick(c.explain);
  }

  $("btn-dtc-submit").addEventListener("click", submit);
  $("btn-dtc-hypo").addEventListener("click", testHypo);
  $("btn-dtc-abort").addEventListener("click", openSelect);
  $("btn-dtcr-again").addEventListener("click", () => startCase(g.kase));
  $("btn-dtcr-cases").addEventListener("click", openSelect);
  $("btn-dtcr-games").addEventListener("click", () => {
    openSelect();
    switchView("games");
  });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "sleuth") renderCaseCards();
  });
  document.addEventListener("qs:lang", () => {
    if ($("view-sleuth").hidden) return;
    renderCaseCards();
    if (!$("dtc-room").hidden && g.kase && !g.done) renderRoom();
    if (!$("dtc-report").hidden && g.done) renderReport();
  });

  renderCaseCards();
})();
