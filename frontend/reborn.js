// 重生逆袭当首富: 文字向重生养成 —— 开局 500 金币的穷小子, 20 年内靠打工/做生意/
// 竞拍资产滚雪球, 结算按身家封称号。重生礼包用积分购买 (闲置积分的消耗口)。
// 玩法要点: 职业晋升链 (且生意规模受职业封顶, 防复利爆炸) / 三行当押行情 (走私会坐牢) /
// 拍卖 NPC 人格与诈价 / 资产突发与转卖止盈 / 开局天命 (达成给积分, 产出-消耗闭环) /
// 人生抉择 / 连锁事件 / 本地存档续玩 + 重生名人堂。
// 数值经 5000 世蒙特卡洛校准: 均衡流最优 (~19% 首富), 纯打工稳但封顶, 走私高风险。
// 依赖 app.js 的 $ / api / toast / playSound, auth.js 的 Auth, i18n.js 的 t / pick。
(() => {
  const START_CASH = 500;
  const BASE_YEARS = 20;
  const AP_PER_YEAR = 2; // 每年行动点: 打工/做生意/竞拍各耗 1, 过年回满

  // 职业链: 底薪随级别涨, 连续打工 3 次触发"老板赏识"晋升。
  // STAKE_CAP 是生意单笔上限 —— 杂工做不动大买卖, 打工升职是为了做大生意 (系统耦合点)
  const CAREER_PAY = [40, 80, 150, 260, 420];
  const STAKE_CAP = [800, 2000, 4000, 8000, 16000];

  // 三行当: 稳/博/暴利带风险; 每年"风声"(hot +0.3 / cold -0.2 乘数), 押行情才是玩点
  const TRADES = [
    { key: "stall", stakePct: 0.3, lo: 0.9, hi: 1.4 },
    { key: "flip", stakePct: 0.4, lo: 0.4, hi: 2.2 },
    { key: "smug", stakePct: 0.5, lo: 1.2, hi: 3.0, bust: 0.25 },
  ];

  // 拍卖对手人格: cap=心理价位区间(估值倍数), bluff=超价诈抬概率 (老狐狸专属)
  const NPCS = [
    { id: "miser", capLo: 0.65, capHi: 0.95, bluff: 0, name: { zh: "钱老抠", en: "Miser Qian" } },
    { id: "rich", capLo: 1.0, capHi: 1.35, bluff: 0, name: { zh: "金灿灿", en: "Flashy Jin" } },
    { id: "fox", capLo: 0.8, capHi: 1.15, bluff: 0.35, name: { zh: "胡千算", en: "Sly Hu" } },
  ];

  // 可竞拍资产池: est=估值, rent=年租金 (回报率 ~11-14%, 校准后上调)
  const ASSETS = [
    { id: "tea", est: 800, rent: 90, name: { zh: "路边奶茶店", en: "Street Tea Stand" } },
    { id: "shop", est: 1200, rent: 140, name: { zh: "老城区杂货铺", en: "Old-Town Grocery" } },
    { id: "dock", est: 2000, rent: 240, name: { zh: "码头仓库", en: "Dock Warehouse" } },
    { id: "store", est: 3500, rent: 450, name: { zh: "市中心门面", en: "Downtown Storefront" } },
    { id: "plant", est: 5000, rent: 680, name: { zh: "小型工厂", en: "Small Factory" } },
    { id: "chain", est: 8000, rent: 1100, name: { zh: "连锁餐馆", en: "Restaurant Chain" } },
    { id: "tower", est: 12000, rent: 1700, name: { zh: "写字楼一层", en: "Office Floor" } },
  ];
  // 传说资产: 第 10 年起 30% 概率现身拍卖行, 后期惊喜
  const LEGENDS = [
    { id: "mine", est: 20000, rent: 3200, legend: true, name: { zh: "城南金矿", en: "South Gold Mine" } },
    { id: "harbor", est: 30000, rent: 5000, legend: true, name: { zh: "跨海港口", en: "Cross-Sea Harbor" } },
  ];
  const ALL_ASSETS = ASSETS.concat(LEGENDS);

  // 开局天命: 随机一条长期目标, 达成给积分奖励 (每日首次, 服务端判重)
  const DESTINIES = [
    { id: "worth", ok: (s, w) => w >= 40000 },
    { id: "assets5", ok: (s) => s.assets.length >= 6 },
    { id: "rent", ok: () => rentPerYear() >= 2500 },
    { id: "nowork", ok: (s, w) => s.workCount === 0 && w >= 12000 },
  ];

  // 过年随机事件: cond 不满足的不进池; fn 返回 {zh,en} 日志 (事件先于收租执行)
  const EVENTS = [
    { w: 3, fn: () => ({ zh: "平平无奇的一年。", en: "An uneventful year." }) },
    { w: 2, fn: (s) => { const d = Math.round(s.cash * 0.1); s.cash -= d; return { zh: `台风掀了你的摊位，损失 ${d} 金币。`, en: `A typhoon wrecked your stall: -${d} gold.` }; } },
    { w: 2, fn: (s) => { const d = Math.round(s.cash * 0.15); s.cash += d; return { zh: `贵人指点生意经，进账 ${d} 金币。`, en: `A mentor's tip earned you ${d} gold.` }; } },
    { w: 2, fn: (s) => { s.rentBoost = 2; return { zh: "市场火热，今年租金翻倍！", en: "Hot market: rents doubled this year!" }; } },
    { w: 1, fn: (s) => { const d = Math.min(100, s.cash); s.cash -= d; return { zh: `遭了小偷，丢了 ${d} 金币。`, en: `A thief got away with ${d} gold.` }; } },
    { w: 1, fn: (s) => { s.cash += 500; return { zh: "彩票中了 500 金币！", en: "Lottery win: +500 gold!" }; } },
    { w: 1, fn: (s) => { s.assetMod = +(s.assetMod * 1.2).toFixed(2); return { zh: "地价上涨，你的资产升值 20%。", en: "Land boom: your assets gained 20%." }; } },
    { w: 1, fn: (s) => { s.assetMod = +(s.assetMod * 0.85).toFixed(2); return { zh: "经济萧条，资产缩水 15%。", en: "Recession: assets shrank 15%." }; } },
    { w: 2, fn: (s) => { s.cash += 150; return { zh: "路边捡到个钱包，失主答谢 150 金币。", en: "Found a wallet; the owner tipped you 150 gold." }; } },
    { w: 2, fn: (s) => { const d = Math.min(200, s.cash); s.cash -= d; return { zh: `生了场病，医药费花了 ${d} 金币。`, en: `Fell ill: ${d} gold in medical bills.` }; } },
    { w: 1, fn: (s) => { const d = Math.round(s.cash * 0.05); s.cash -= d; return { zh: `物价飞涨，存款缩水 ${d} 金币。`, en: `Inflation ate ${d} gold of your savings.` }; } },
    { w: 1, fn: (s) => { s.cash += 800; return { zh: "远房亲戚留了笔 800 金币的遗产给你。", en: "A distant relative left you 800 gold." }; } },
    { w: 1, fn: (s) => { const d = Math.round(s.cash * 0.1); s.cash -= d; return { zh: `接了个骗子电话，被骗走 ${d} 金币。`, en: `A phone scam cost you ${d} gold.` }; } },
    { w: 1, fn: (s) => { s.rentBoost = 1.5; return { zh: "你的铺子成了网红打卡点，今年租金 +50%！", en: "Your shops went viral: rents +50% this year!" }; }, cond: (s) => s.assets.length > 0 },
    { w: 2, fn: (s) => { s.cash += 300; return { zh: "政府发小微企业补贴，+300 金币。", en: "Small-business subsidy: +300 gold." }; }, cond: (s) => s.assets.length > 0 },
    // 连锁: 流浪猫报恩 / 老同学还钱 (由抉择埋下伏笔, 两三年后开花)
    { w: 6, cond: (s) => s.flags.cat && s.year >= s.flags.cat + 2,
      fn: (s) => { s.flags.cat = 0; s.cash += 2000; return { zh: "当年收养的猫竟是富豪家走失的爱宠，主人登门报恩 2000 金币！", en: "That stray cat was a tycoon's lost pet - its owner repaid you 2000 gold!" }; } },
    { w: 6, cond: (s) => s.flags.loan && s.year >= s.flags.loan + 3,
      fn: (s) => { const good = s.flags.loanGood; s.flags.loan = 0; if (good) { s.cash += 1500; return { zh: "三年前借钱的老同学发达了，连本带利还你 1500 金币。", en: "The old classmate struck gold and repaid 1500 with interest." }; } return { zh: "借钱的老同学彻底失联了，那 500 金币打了水漂。", en: "The classmate vanished for good - that 500 gold is gone." }; } },
  ];

  // 资产突发事件 (过年时 30% 概率抽一处): 爆红/停业/拆迁 —— 持有要想止盈时机
  const INCIDENTS = [
    { w: 2, fn: (s, a) => { s.incidentBonus += a.rent * 2; return { zh: `「${a.name.zh}」突然爆红，今年租金三倍！`, en: `"${a.name.en}" went viral: triple rent this year!` }; } },
    { w: 2, fn: (s, a) => { s.incidentBonus -= a.rent; return { zh: `「${a.name.zh}」被查停业整顿，今年颗粒无收。`, en: `"${a.name.en}" was shut for inspection: no rent this year.` }; } },
    { w: 1, fn: (s, a) => { const gain = Math.round(a.est * s.assetMod * 1.3); s.cash += gain; s.assets = s.assets.filter((x) => x.id !== a.id); return { zh: `「${a.name.zh}」划入拆迁范围，补偿 ${gain} 金币强制回收。`, en: `"${a.name.en}" was expropriated for ${gain} gold.` }; } },
  ];

  // 人生抉择 (第 5/10/15 年各一次, 不重复): 二选一, 有代价有伏笔
  const DILEMMAS = [
    { text: { zh: "官府要征用你摆摊的地段，给两条路。", en: "The county wants your corner of the street." },
      a: { label: { zh: "拿补偿走人 (+500)", en: "Take the payout (+500)" }, fn: (s) => { s.cash += 500; return { zh: "你拿了 500 金币补偿，另寻宝地。", en: "You took 500 gold and moved on." }; } },
      b: { label: { zh: "抗争到底 (五五开)", en: "Fight it (coin flip)" }, fn: (s) => { if (Math.random() < 0.5) { s.assetMod = +(s.assetMod * 1.15).toFixed(2); return { zh: "你据理力争保住了地段，名声大噪，资产升值 15%！", en: "You won! Fame boosted your assets 15%." }; } const d = Math.min(400, s.cash); s.cash -= d; return { zh: `官司输了，赔进去 ${d} 金币。`, en: `You lost the case: -${d} gold.` }; } } },
    { text: { zh: "落魄的老同学上门，想借 500 金币东山再起。", en: "A broke old classmate asks to borrow 500 gold." },
      a: { label: { zh: "借 (三年后见分晓)", en: "Lend it (see in 3 years)" }, fn: (s) => { const d = Math.min(500, s.cash); s.cash -= d; s.flags.loan = s.year; s.flags.loanGood = Math.random() < 0.5; return { zh: `你借出 ${d} 金币，他千恩万谢地走了。`, en: `You lent ${d} gold; he left in tears of gratitude.` }; } },
      b: { label: { zh: "婉拒", en: "Decline" }, fn: () => ({ zh: "你婉拒了。朋友归朋友，钱归钱。", en: "You declined. Friends and money don't mix." }) } },
    { text: { zh: "全城都在抢某支「必涨」的原始股。", en: "The whole town is piling into a 'can't-lose' stock." },
      a: { label: { zh: "全仓跟风 (±40%)", en: "All in (±40%)" }, fn: (s) => { const m = 0.6 + Math.random() * 0.8; const before = s.cash; s.cash = Math.round(s.cash * m); const d = s.cash - before; return d >= 0 ? { zh: `赌对了！浮盈 ${d} 金币。`, en: `It popped! +${d} gold.` } : { zh: `接了最后一棒，亏掉 ${-d} 金币。`, en: `You were the exit liquidity: ${d} gold.` }; } },
      b: { label: { zh: "捂紧钱包 (+100)", en: "Sit out (+100)" }, fn: (s) => { s.cash += 100; return { zh: "你没凑热闹，安心收摊多赚 100。", en: "You sat out and quietly made 100." }; } } },
    { text: { zh: "雨夜里一只流浪猫蹲在你家门口不走。", en: "A stray cat won't leave your doorstep on a rainy night." },
      a: { label: { zh: "收养它 (-100)", en: "Adopt it (-100)" }, fn: (s) => { const d = Math.min(100, s.cash); s.cash -= d; s.flags.cat = s.year; return { zh: "你收养了它，家里多了个毛茸茸的伙伴。", en: "You took it in - a furry new companion." }; } },
      b: { label: { zh: "心一横走开", en: "Walk away" }, fn: () => ({ zh: "你狠心走开了，雨声里有几声猫叫。", en: "You walked away; a faint meow in the rain." }) } },
  ];

  // 结算称号档位 (身家阈值从高到低, 蒙特卡洛校准: 均衡流 ~19% 够到首富)
  const TIERS = [
    { min: 35000, id: "tycoon", name: { zh: "🏆 一代首富", en: "🏆 Tycoon of the Age" } },
    { min: 12000, id: "magnate", name: { zh: "💎 富甲一方", en: "💎 Regional Magnate" } },
    { min: 4000, id: "boss", name: { zh: "🏪 小老板", en: "🏪 Small-Business Boss" } },
    { min: 0, id: "leek", name: { zh: "🥬 重开吧，韭菜", en: "🥬 Better Luck Next Life" } },
  ];

  // 结算小传: 按行为计数挑人设
  const PERSONAS = {
    work: { zh: "打工狂魔 —— 一步一个脚印挣来的", en: "Workaholic - earned brick by brick" },
    biz: { zh: "商海赌徒 —— 刀口舔血闯出来的", en: "Market Gambler - lived on the knife's edge" },
    auction: { zh: "收租大亨 —— 睡着觉钱就进账", en: "Rent Baron - money while you sleep" },
    all: { zh: "全能企业家 —— 打工经商置业样样通", en: "All-round Entrepreneur - mastered every path" },
  };

  const rb = { on: false, year: 1, maxYears: BASE_YEARS, ap: AP_PER_YEAR, cash: START_CASH,
    assets: [], assetMod: 1, rentBoost: 1, incidentBonus: 0, eye: false, auction: null,
    career: 0, workStreak: 0, workCount: 0, bizCount: 0, aucCount: 0,
    jail: false, busy: false, destiny: null, dilemma: null, hot: 0, cold: 1,
    usedDilemmas: [], flags: {}, lastWorth: START_CASH,
    peak: null, trough: null };

  // ---------- 本地存档: 中断续玩 + 名人堂 + 生涯最佳 ----------

  let hall = []; // 最近 10 世: {tier, worth, persona, destinyOk}
  let best = null; // {tier, worth}

  function save() {
    const data = { hall, best };
    if (rb.on) {
      data.run = { year: rb.year, maxYears: rb.maxYears, ap: rb.ap, cash: rb.cash,
        assetIds: rb.assets.map((a) => a.id), assetMod: rb.assetMod, eye: rb.eye,
        career: rb.career, workStreak: rb.workStreak, workCount: rb.workCount,
        bizCount: rb.bizCount, aucCount: rb.aucCount, jail: rb.jail,
        destinyId: rb.destiny ? rb.destiny.id : null, hot: rb.hot, cold: rb.cold,
        usedDilemmas: rb.usedDilemmas, flags: rb.flags, lastWorth: rb.lastWorth,
        peak: rb.peak, trough: rb.trough };
    }
    try { localStorage.setItem("qs_reborn", JSON.stringify(data)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function restore() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem("qs_reborn") || "null"); } catch (e) { /* ignore */ }
    if (!data) return;
    hall = Array.isArray(data.hall) ? data.hall.slice(0, 10) : [];
    best = data.best || null;
    const r = data.run;
    if (!r) return;
    // 中断的一世: 静默恢复 (弹窗类瞬态不存, 竞拍/抉择中退出的损失自担)
    Object.assign(rb, { on: true, year: r.year, maxYears: r.maxYears, ap: r.ap, cash: r.cash,
      assets: r.assetIds.map((id) => ALL_ASSETS.find((a) => a.id === id)).filter(Boolean),
      assetMod: r.assetMod, rentBoost: 1, incidentBonus: 0, eye: !!r.eye,
      career: r.career, workStreak: r.workStreak, workCount: r.workCount,
      bizCount: r.bizCount, aucCount: r.aucCount, jail: !!r.jail,
      destiny: DESTINIES.find((d) => d.id === r.destinyId) || null,
      hot: r.hot, cold: r.cold, usedDilemmas: r.usedDilemmas || [], flags: r.flags || {},
      lastWorth: r.lastWorth, peak: r.peak, trough: r.trough });
  }

  // ---------- 渲染 ----------

  function worth() {
    const assetVal = rb.assets.reduce((a, x) => a + x.est, 0) * rb.assetMod;
    return Math.round(rb.cash + assetVal);
  }

  function rentPerYear() {
    return rb.assets.reduce((a, x) => a + x.rent, 0);
  }

  function refreshRb() {
    $("rb-year").textContent = Math.min(rb.year, rb.maxYears) + " / " + rb.maxYears;
    $("rb-ap").textContent = rb.jail ? "⛓️" : String(rb.ap);
    $("rb-cash").textContent = rb.cash.toLocaleString();
    $("rb-rent").textContent = rentPerYear().toLocaleString();
    $("rb-worth").textContent = worth().toLocaleString();
    $("rb-career").textContent = t("rb.career." + rb.career);
    const locked = !rb.on || rb.ap <= 0 || rb.busy;
    ["work", "biz", "auction"].forEach((k) => { $("btn-rb-" + k).disabled = locked; });
    $("btn-rb-next").disabled = !rb.on || rb.busy;
    // 行动点耗尽/坐牢: 高亮「过年」引导下一步
    $("btn-rb-next").classList.toggle("rb-urge", rb.on && rb.ap <= 0 && !rb.busy);
    $("rb-destiny").textContent = rb.destiny ? t("rb.destinyLabel", t("rb.destiny." + rb.destiny.id)) : "";
    $("rb-forecast").textContent = rb.on
      ? t("rb.forecast", t("rb.trade." + TRADES[rb.hot].key), t("rb.trade." + TRADES[rb.cold].key)) : "";
    renderAssets();
    save();
  }

  // 资产胶囊条: 名字·租金 + 转卖按钮 (九折套现, 止盈/回血的口子)
  function renderAssets() {
    const box = $("rb-assets");
    box.innerHTML = "";
    rb.assets.forEach((a) => {
      const chip = document.createElement("span");
      chip.className = "rb-asset" + (a.legend ? " legend" : "");
      const label = document.createElement("span");
      label.textContent = `${a.legend ? "✨" : ""}${pick(a.name)} · ${a.rent}/y`;
      const sellPrice = Math.round(a.est * rb.assetMod * 0.9);
      const btn = document.createElement("button");
      btn.className = "ghost small";
      btn.textContent = t("rb.sell", sellPrice.toLocaleString());
      btn.disabled = !rb.on || rb.busy;
      btn.addEventListener("click", () => {
        if (!rb.on) return;
        rb.cash += sellPrice;
        rb.assets = rb.assets.filter((x) => x.id !== a.id);
        log(t("rb.sold", pick(a.name), sellPrice.toLocaleString()), "pos");
        playSound("sell");
        refreshRb();
      });
      chip.append(label, btn);
      box.appendChild(chip);
    });
  }

  // 开局页: 生涯最佳 + 名人堂 (最近 10 世)
  function renderIntro() {
    $("rb-best").textContent = best
      ? t("rb.best", pick(TIERS.find((x) => x.id === best.tier).name), best.worth.toLocaleString()) : "";
    const box = $("rb-hall");
    box.innerHTML = "";
    if (!hall.length) return;
    const title = document.createElement("p");
    title.className = "hint";
    title.textContent = t("rb.hallTitle");
    box.appendChild(title);
    const ul = document.createElement("ul");
    ul.className = "rb-hall-list";
    hall.forEach((h) => {
      const li = document.createElement("li");
      const tier = TIERS.find((x) => x.id === h.tier);
      const persona = PERSONAS[h.persona] || PERSONAS.all;
      li.textContent = `${pick(tier.name)} · ${h.worth.toLocaleString()} · ${pick(persona)}${h.destinyOk ? " · 🎯" : ""}`;
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function log(text, cls) {
    const li = document.createElement("li");
    li.textContent = `${t("rb.yearTag", Math.min(rb.year, rb.maxYears))} ${text}`;
    if (cls) li.className = cls;
    const box = $("rb-log");
    box.prepend(li);
    while (box.children.length > 60) box.removeChild(box.lastChild);
  }

  // ---------- 开局 / 结算 ----------

  function rollForecast() {
    rb.hot = Math.floor(Math.random() * TRADES.length);
    rb.cold = (rb.hot + 1 + Math.floor(Math.random() * (TRADES.length - 1))) % TRADES.length;
  }

  function startRun() {
    Object.assign(rb, { on: true, year: 1, maxYears: BASE_YEARS + (gift.year ? 5 : 0),
      ap: AP_PER_YEAR, cash: START_CASH * (gift.fund ? 2 : 1), assets: [], assetMod: 1,
      rentBoost: 1, incidentBonus: 0, eye: !!gift.eye, auction: null,
      career: 0, workStreak: 0, workCount: 0, bizCount: 0, aucCount: 0,
      jail: false, busy: false, dilemma: null, usedDilemmas: [], flags: {},
      peak: null, trough: null });
    rb.lastWorth = rb.cash;
    rb.destiny = DESTINIES[Math.floor(Math.random() * DESTINIES.length)];
    rollForecast();
    gift.fund = gift.year = gift.eye = false;
    renderGifts();
    $("rb-log").innerHTML = "";
    $("rb-intro").hidden = true;
    $("rb-game").hidden = false;
    $("btn-rb-restart").hidden = true;
    log(t("rb.born", rb.cash.toLocaleString()));
    refreshRb();
  }

  function settleRun() {
    rb.on = false;
    const w = worth();
    const tier = TIERS.find((x) => w >= x.min);
    // 行为小传: 单项占比过半算偏科, 否则全能
    const counts = { work: rb.workCount, biz: rb.bizCount, auction: rb.aucCount };
    const totalActs = counts.work + counts.biz + counts.auction;
    let personaKey = "all";
    Object.keys(counts).forEach((k) => {
      if (totalActs > 0 && counts[k] / totalActs > 0.5) personaKey = k;
    });
    // 人生年表高光: 最风光/最惨的一年 (按年度身家变动)
    if (rb.peak && rb.peak.amt > 0) log(t("rb.peakYear", rb.peak.year, rb.peak.amt.toLocaleString()), "pos");
    if (rb.trough && rb.trough.amt < 0) log(t("rb.troughYear", rb.trough.year, (-rb.trough.amt).toLocaleString()), "neg");
    log(t("rb.epilogue", pick(PERSONAS[personaKey])));
    log(t("rb.settle", w.toLocaleString(), pick(tier.name)), "pos");
    // 天命结算: 达成走服务端领积分 (每日任务位判重, 刷不了)
    const destinyOk = rb.destiny ? rb.destiny.ok(rb, w) : false;
    if (rb.destiny) {
      if (destinyOk) {
        log(t("rb.destinyDone", t("rb.destiny." + rb.destiny.id)), "pos");
        playSound("win");
        claimDestinyPoints();
      } else {
        log(t("rb.destinyMiss", t("rb.destiny." + rb.destiny.id)));
      }
    }
    // 名人堂与生涯最佳
    hall.unshift({ tier: tier.id, worth: w, persona: personaKey, destinyOk });
    hall = hall.slice(0, 10);
    if (!best || w > best.worth) best = { tier: tier.id, worth: w };
    $("btn-rb-restart").hidden = false;
    document.dispatchEvent(new CustomEvent("qs:rebornTier", { detail: tier.id }));
    renderGifts(); // 本世结束, 礼包重新可买
    refreshRb();
    renderIntro();
    // 爽感: 首富撒彩带, 终局身家滚动定格
    if (tier.id === "tycoon") spawnConfetti();
    qsRollNumber($("rb-worth"), w);
    toast(pick(tier.name));
  }

  async function claimDestinyPoints() {
    if (!window.Auth || !Auth.user) return;
    try {
      const res = await api("/me/points/reborn-claim", { method: "POST", body: "{}" });
      if (res.earned > 0) toast(t("rb.pointsGot", res.earned));
    } catch (e) { /* 当日已领/网络异常不打断结算 */ }
  }

  function spendAp() {
    rb.ap--;
    refreshRb();
  }

  // ---------- 行动: 打工 (职业链) ----------

  function doWork() {
    if (!rb.on || rb.ap <= 0 || rb.busy) return;
    const pay = CAREER_PAY[rb.career] + rb.year * 4 + Math.floor(Math.random() * 40);
    rb.cash += pay;
    rb.workCount++;
    rb.workStreak++;
    spendAp();
    log(t("rb.worked", pay));
    // 连干三回被老板看见: 晋升 (封顶金领)
    if (rb.workStreak >= 3 && rb.career < CAREER_PAY.length - 1) {
      rb.career++;
      rb.workStreak = 0;
      log(t("rb.promoted", t("rb.career." + rb.career)), "pos");
      playSound("win");
      refreshRb();
    }
  }

  // ---------- 行动: 做生意 (三行当押行情, 规模受职业封顶) ----------

  function stakeOf(tr) {
    return Math.min(STAKE_CAP[rb.career], Math.max(50, Math.floor(rb.cash * tr.stakePct)));
  }

  function openBiz() {
    if (!rb.on || rb.ap <= 0 || rb.busy) return;
    $("rb-biz-forecast").textContent =
      t("rb.forecast", t("rb.trade." + TRADES[rb.hot].key), t("rb.trade." + TRADES[rb.cold].key));
    TRADES.forEach((tr, i) => {
      const stake = stakeOf(tr);
      const btn = $("btn-rb-biz" + i);
      const tag = i === rb.hot ? ` <b class="tag-hot">${t("rb.hot")}</b>`
        : i === rb.cold ? ` <b class="tag-cold">${t("rb.cold")}</b>` : "";
      // innerHTML 只插 i18n 文案与数字, 无用户可控内容
      btn.innerHTML = `${t("rb.trade." + tr.key)}${tag}<small>${t("rb.tradeDesc." + tr.key)} · ${t("rb.stakeTag", stake.toLocaleString())}</small>`;
      btn.disabled = rb.cash < stake;
    });
    $("rb-biz-modal").hidden = false;
  }

  function runBiz(i) {
    const tr = TRADES[i];
    const stake = stakeOf(tr);
    if (rb.cash < stake) { toast(t("rb.noCash")); return; }
    $("rb-biz-modal").hidden = true;
    rb.bizCount++;
    rb.workStreak = 0;
    spendAp();
    rb.busy = true; // 悬念间隙锁操作, 防连点
    refreshRb();
    playSound("buy");
    setTimeout(() => {
      rb.busy = false;
      // 走私东窗事发: 罚没本金 + 今年剩余行动清零 + 牢里蹲一年
      if (tr.bust && Math.random() < tr.bust) {
        rb.cash -= stake;
        rb.ap = 0;
        rb.jail = true;
        log(t("rb.caught", stake.toLocaleString()), "neg");
        playSound("lose");
        refreshRb();
        return;
      }
      let mult = tr.lo + Math.random() * (tr.hi - tr.lo);
      if (i === rb.hot) mult += 0.3;
      if (i === rb.cold) mult -= 0.2;
      const back = Math.round(stake * mult);
      rb.cash += back - stake;
      if (back >= stake) {
        log(t("rb.bizWin", stake.toLocaleString(), (back - stake).toLocaleString()), "pos");
        playSound("win");
      } else {
        log(t("rb.bizLose", stake.toLocaleString(), (stake - back).toLocaleString()), "neg");
        playSound("lose");
      }
      refreshRb();
    }, 550);
  }

  // ---------- 过年: 事件 → 资产突发 → 收租 → 抉择 ----------

  function nextYear() {
    if (!rb.on || rb.busy) return;
    // 牢里蹲: 这一年没有收租没有事件, 直接翻篇
    if (rb.jail) {
      rb.jail = false;
      log(t("rb.jailYear"), "neg");
      advanceYear();
      return;
    }
    // 事件先掷再收租: "今年租金翻倍"等事件要对本次收租生效
    const pool = EVENTS.filter((e) => !e.cond || e.cond(rb));
    const total = pool.reduce((a, e) => a + e.w, 0);
    let roll = Math.random() * total;
    const ev = pool.find((e) => (roll -= e.w) < 0) || pool[0];
    log(pick(ev.fn(rb)));
    // 资产突发 (30%): 爆红/停业/拆迁
    if (rb.assets.length && Math.random() < 0.3) {
      const asset = rb.assets[Math.floor(Math.random() * rb.assets.length)];
      const iTotal = INCIDENTS.reduce((a, e) => a + e.w, 0);
      let iRoll = Math.random() * iTotal;
      const inc = INCIDENTS.find((e) => (iRoll -= e.w) < 0) || INCIDENTS[0];
      log(pick(inc.fn(rb, asset)));
    }
    const rent = Math.max(0, Math.round(rentPerYear() * rb.rentBoost + rb.incidentBonus));
    if (rent > 0) {
      rb.cash += rent;
      log(t("rb.rent", rent.toLocaleString()), "pos");
    }
    rb.rentBoost = 1;
    rb.incidentBonus = 0;
    advanceYear();
  }

  function advanceYear() {
    // 年度身家高光: 记录最风光/最惨的一年, 结算时回放
    const w = worth();
    const delta = w - rb.lastWorth;
    if (!rb.peak || delta > rb.peak.amt) rb.peak = { year: rb.year, amt: delta };
    if (!rb.trough || delta < rb.trough.amt) rb.trough = { year: rb.year, amt: delta };
    rb.lastWorth = w;
    rb.year++;
    rb.ap = AP_PER_YEAR;
    rollForecast();
    if (rb.year > rb.maxYears) {
      settleRun();
      return;
    }
    refreshRb();
    // 第 5/10/15 年开年: 人生抉择 (每局每条只出一次)
    if (rb.year === 5 || rb.year === 10 || rb.year === 15) openDilemma();
  }

  function openDilemma() {
    const pool = DILEMMAS.filter((_, i) => !rb.usedDilemmas.includes(i));
    if (!pool.length) return;
    const d = pool[Math.floor(Math.random() * pool.length)];
    rb.usedDilemmas.push(DILEMMAS.indexOf(d));
    rb.dilemma = d;
    $("rb-choice-text").textContent = pick(d.text);
    $("btn-rb-choice0").textContent = pick(d.a.label);
    $("btn-rb-choice1").textContent = pick(d.b.label);
    $("rb-choice-modal").hidden = false;
  }

  function pickChoice(which) {
    const d = rb.dilemma;
    if (!d) return;
    rb.dilemma = null;
    $("rb-choice-modal").hidden = true;
    log(pick((which === 0 ? d.a : d.b).fn(rb)));
    refreshRb();
  }

  // ---------- 拍卖行 (NPC 人格 + 诈价 + 传说资产) ----------

  function openAuction() {
    if (!rb.on || rb.ap <= 0 || rb.busy) return;
    const owned = new Set(rb.assets.map((a) => a.id));
    let pool = ASSETS.filter((a) => !owned.has(a.id));
    // 传说资产: 第 10 年起 30% 概率现身
    if (rb.year >= 10 && Math.random() < 0.3) {
      pool = pool.concat(LEGENDS.filter((a) => !owned.has(a.id)));
    }
    if (!pool.length) { toast(t("rb.allOwned")); return; }
    const lot = pool[Math.floor(Math.random() * pool.length)];
    const npc = NPCS[Math.floor(Math.random() * NPCS.length)];
    rb.auction = {
      lot, npc,
      price: Math.round(lot.est * 0.6),
      npcCap: Math.round(lot.est * (npc.capLo + Math.random() * (npc.capHi - npc.capLo))),
      mine: false,
      bluffed: false,
    };
    rb.aucCount++;
    rb.workStreak = 0;
    spendAp();
    $("rb-lot-name").textContent = `${lot.legend ? "✨" : ""}${pick(lot.name)} — ${t("rb.vs", pick(npc.name), t("rb.npcStyle." + npc.id))}`;
    $("rb-lot-rent").textContent = lot.rent.toLocaleString();
    $("rb-lot-est").textContent = rb.eye
      ? t("rb.estEye", lot.est.toLocaleString(), rb.auction.npcCap.toLocaleString())
      : t("rb.estVague", Math.round(lot.est * 0.7).toLocaleString(), Math.round(lot.est * 1.3).toLocaleString());
    renderAuction();
    $("rb-auction-modal").hidden = false;
  }

  function renderAuction() {
    const a = rb.auction;
    $("rb-lot-price").textContent = a.price.toLocaleString();
    $("rb-lot-holder").textContent = t(a.mine ? "rb.holderYou" : "rb.holderNpc");
    const step = bidStep();
    $("btn-rb-bid").textContent = t("rb.bid", (a.price + step).toLocaleString());
    $("btn-rb-bid").disabled = a.mine || rb.cash < a.price + step;
  }

  function bidStep() {
    return Math.max(50, Math.round(rb.auction.lot.est * 0.08));
  }

  function bid() {
    const a = rb.auction;
    if (!a || a.mine) return;
    const myBid = a.price + bidStep();
    if (rb.cash < myBid) { toast(t("rb.noCash")); return; }
    a.price = myBid;
    a.mine = true;
    renderAuction();
    // NPC 还价: 低于心理价位继续抬; 老狐狸会超价诈一手 (接了就是接盘)
    setTimeout(() => {
      if (!rb.auction) return;
      const counter = a.price + bidStep();
      const withinCap = counter <= a.npcCap;
      const bluffing = !withinCap && !a.bluffed && Math.random() < a.npc.bluff;
      if (withinCap || bluffing) {
        if (bluffing) a.bluffed = true;
        a.price = counter;
        a.mine = false;
        playSound("fill");
        renderAuction();
      } else {
        closeAuction(true); // NPC 放弃, 你拍到了
      }
    }, 450);
  }

  function closeAuction(won) {
    const a = rb.auction;
    if (!a) return;
    rb.auction = null;
    $("rb-auction-modal").hidden = true;
    if (won && a.mine) {
      rb.cash -= a.price;
      rb.assets.push(a.lot);
      log(t("rb.won", pick(a.lot.name), a.price.toLocaleString()), "pos");
      playSound("win");
    } else {
      log(t("rb.passed", pick(a.lot.name)));
    }
    refreshRb();
  }

  // ---------- 重生礼包 (积分消耗口, 需登录) ----------

  const gift = { fund: false, year: false, eye: false };
  const GIFTS = [
    { id: "rb_fund", key: "fund", cost: 300 },
    { id: "rb_year", key: "year", cost: 200 },
    { id: "rb_eye", key: "eye", cost: 150 },
  ];
  // 显式取节点 (静态体检要求字面量 id 引用)
  const giftBtn = { fund: $("btn-rb_fund"), year: $("btn-rb_year"), eye: $("btn-rb_eye") };

  function renderGifts() {
    GIFTS.forEach((g) => {
      const btn = giftBtn[g.key];
      btn.classList.toggle("active", gift[g.key]);
      btn.disabled = gift[g.key] || rb.on;
    });
    $("rb-gift-hint").textContent = (window.Auth && Auth.user) ? t("rb.giftHint") : t("rb.giftLogin");
  }

  async function redeemGift(g) {
    if (!window.Auth || !Auth.user) { toast(t("auth.needLogin")); return; }
    try {
      await api("/me/points/redeem", { method: "POST", body: JSON.stringify({ itemId: g.id }) });
      gift[g.key] = true;
      renderGifts();
      toast(t("rb.giftOk", t("rb.gift." + g.key)));
    } catch (e) { toast(e.message); }
  }
  $("btn-rb_fund").addEventListener("click", () => redeemGift(GIFTS[0]));
  $("btn-rb_year").addEventListener("click", () => redeemGift(GIFTS[1]));
  $("btn-rb_eye").addEventListener("click", () => redeemGift(GIFTS[2]));

  // ---------- 绑定 ----------

  $("btn-rb-start").addEventListener("click", startRun);
  $("btn-rb-restart").addEventListener("click", startRun);
  $("btn-rb-work").addEventListener("click", doWork);
  $("btn-rb-biz").addEventListener("click", openBiz);
  $("btn-rb-auction").addEventListener("click", openAuction);
  $("btn-rb-next").addEventListener("click", nextYear);
  $("btn-rb-bid").addEventListener("click", bid);
  $("btn-rb-pass").addEventListener("click", () => closeAuction(false));
  $("btn-rb-biz0").addEventListener("click", () => runBiz(0));
  $("btn-rb-biz1").addEventListener("click", () => runBiz(1));
  $("btn-rb-biz2").addEventListener("click", () => runBiz(2));
  $("btn-rb-biz-close").addEventListener("click", () => { $("rb-biz-modal").hidden = true; });
  $("btn-rb-choice0").addEventListener("click", () => pickChoice(0));
  $("btn-rb-choice1").addEventListener("click", () => pickChoice(1));

  if (window.Auth) Auth.onChange(renderGifts); // 登录/登出即时刷新礼包提示与可用态
  $("rb-auction-modal").addEventListener("click", (e) => {
    if (e.target === $("rb-auction-modal")) closeAuction(false); // 点遮罩 = 放弃
  });
  $("rb-biz-modal").addEventListener("click", (e) => {
    if (e.target === $("rb-biz-modal")) $("rb-biz-modal").hidden = true; // 反悔不耗行动点
  });
  // 抉择弹窗不做遮罩关闭: 人生没有跳过键

  // 启动: 恢复存档; 有未完的一世则直接回到对局
  restore();
  if (rb.on) {
    $("rb-intro").hidden = true;
    $("rb-game").hidden = false;
    log(t("rb.resumed"));
  }
  renderIntro();

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "reborn") { renderGifts(); renderIntro(); refreshRb(); }
  });
  document.addEventListener("qs:lang", () => { renderGifts(); renderIntro(); refreshRb(); });
})();
