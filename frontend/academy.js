// 量化学堂玩法: 实战教学关卡 / K线猜涨跌 / 名场面挑战 / 成就与等级
// 依赖 app.js 的全局 $ / toast / cssVar / fmtPct, i18n.js 的 t / pick

// ---------- 成长进度存储 ----------

const PROG_KEY = "qs_progress";

function loadProg() {
  const def = { xp: 0, badges: [], titles: [], teach: [], famous: [], bestStreak: 0, guessTotal: 0, guessHit: 0, daily: { date: "", score: 0, best: 0 }, dailyCount: 0, gear: [], equipped: [], cases: [] };
  try {
    const p = JSON.parse(localStorage.getItem(PROG_KEY));
    return p && typeof p === "object" ? Object.assign(def, p) : def;
  } catch (e) {
    return def;
  }
}

let prog = loadProg();

function saveProg() {
  try { localStorage.setItem(PROG_KEY, JSON.stringify(prog)); } catch (e) { /* 隐私模式下忽略 */ }
}

// ---------- 动效工具 ----------

const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function replayAnim(el, cls) {
  if (!el || REDUCED_MOTION) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function spawnFloat(host, className, text) {
  if (!host || REDUCED_MOTION) return;
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  host.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function spawnConfetti(host) {
  if (!host || REDUCED_MOTION) return;
  const colors = ["--up", "--ma5", "--accent", "--good", "--ma20"].map(cssVar);
  for (let i = 0; i < 36; i++) {
    const p = document.createElement("span");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = (1.1 + Math.random() * 1.2) + "s";
    p.style.animationDelay = (Math.random() * 0.4) + "s";
    host.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

function showRankUp(name) {
  if (REDUCED_MOTION) return;
  const overlay = document.createElement("div");
  overlay.className = "rankup-overlay";
  const box = document.createElement("div");
  box.className = "rankup-text";
  const label = document.createElement("div");
  label.className = "rankup-label";
  label.textContent = t("profile.rankUpLabel");
  const big = document.createElement("div");
  big.className = "rankup-name";
  big.textContent = name;
  box.append(label, big);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener("animationend", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

const RANKS = [
  { xp: 0, name: { zh: "韭菜", en: "Fresh Leek" } },
  { xp: 300, name: { zh: "散户", en: "Retail Trader" } },
  { xp: 900, name: { zh: "操盘手", en: "Pro Trader" } },
  { xp: 2000, name: { zh: "股神", en: "Market Legend" } },
];

const BADGES = [
  { id: "first_trade", name: { zh: "第一桶金", en: "First Trade" }, desc: { zh: "完成人生第一笔买入", en: "Make your very first buy" } },
  { id: "teach_1", name: { zh: "初出茅庐", en: "First Steps" }, desc: { zh: "通过第一个教学关卡", en: "Clear teaching level 1" } },
  { id: "teach_all", name: { zh: "学堂毕业", en: "Academy Graduate" }, desc: { zh: "通过全部教学关卡", en: "Clear all teaching levels" } },
  { id: "streak_3", name: { zh: "三连击", en: "3-Streak" }, desc: { zh: "猜涨跌连对 3 次", en: "3 correct guesses in a row" } },
  { id: "streak_10", name: { zh: "十连击", en: "10-Streak" }, desc: { zh: "猜涨跌连对 10 次", en: "10 correct guesses in a row" } },
  { id: "guess_50", name: { zh: "盘感初成", en: "Chart Sense" }, desc: { zh: "累计猜对 50 次涨跌", en: "50 correct guesses in total" } },
  { id: "famous_1", name: { zh: "历史见证者", en: "History Witness" }, desc: { zh: "通过任意一个名场面挑战", en: "Clear any famous-moment challenge" } },
  { id: "famous_all", name: { zh: "传奇操盘手", en: "Living Legend" }, desc: { zh: "通过全部名场面挑战", en: "Clear all famous-moment challenges" } },
  { id: "daily_first", name: { zh: "每日打卡", en: "Daily Debut" }, desc: { zh: "完成一次每日挑战", en: "Complete a daily challenge" } },
  { id: "daily_150", name: { zh: "手感火热", en: "On Fire" }, desc: { zh: "单次每日挑战得分 ≥ 150", en: "Score 150+ in one daily challenge" } },
  { id: "settle_1", name: { zh: "实盘首秀", en: "Debut Settled" }, desc: { zh: "在模拟对局中完成一次结算", en: "Settle a full trading game" } },
  { id: "beat_ai", name: { zh: "人机对决", en: "AI Slayer" }, desc: { zh: "结算收益率跑赢 AI 操盘手", en: "Beat the AI trader at settlement" } },
  { id: "case_1", name: { zh: "初勘现场", en: "First on Scene" }, desc: { zh: "破解第一个市场悬案", en: "Solve your first market mystery" } },
  { id: "case_all", name: { zh: "真相只有一个", en: "One Truth Prevails" }, desc: { zh: "破解全部市场悬案", en: "Solve every market mystery" } },
  { id: "egg_curious", hidden: true, name: { zh: "好奇宝宝", en: "Curious Cat" }, desc: { zh: "对着标题连点 7 次发现的彩蛋", en: "Found by clicking the title 7 times" } },
  { id: "egg_konami", hidden: true, name: { zh: "秘籍玩家", en: "Cheat Coder" }, desc: { zh: "输入了传说中的神秘按键序列", en: "Entered the legendary secret key sequence" } },
];

// 未解锁徽章的进度提示 [当前, 目标]
const BADGE_PROGRESS = {
  streak_3: () => [Math.min(prog.bestStreak, 3), 3],
  streak_10: () => [Math.min(prog.bestStreak, 10), 10],
  guess_50: () => [Math.min(prog.guessHit, 50), 50],
  teach_all: () => [prog.teach.length, TEACH_LEVELS.length],
  famous_all: () => [prog.famous.length, FAMOUS_LEVELS.length],
  daily_150: () => [Math.min(prog.daily.best || 0, 150), 150],
  case_all: () => [prog.cases.length, CASES.length],
};

function rankOf(xp) {
  let r = RANKS[0];
  for (const item of RANKS) if (xp >= item.xp) r = item;
  return r;
}

function addXp(amount) {
  if (hasGear("glasses")) amount = Math.round(amount * 1.2);
  const before = rankOf(prog.xp);
  prog.xp += amount;
  const after = rankOf(prog.xp);
  saveProg();
  renderProfile();
  replayAnim(document.querySelector(".xp-track"), "gain");
  if (after !== before) {
    toast(t("profile.rankUp", pick(after.name)));
    showRankUp(pick(after.name));
  }
}

function awardBadge(id) {
  if (prog.badges.includes(id)) return;
  prog.badges.push(id);
  saveProg();
  const b = BADGES.find((x) => x.id === id);
  if (b) toast(t("profile.badgeGot", pick(b.name)));
  renderProfile();
  const el = $("badge-list").children[BADGES.findIndex((x) => x.id === id)];
  if (el) el.classList.add("just-got");
}

function awardTitle(title) {
  const key = title.zh;
  if (prog.titles.includes(key)) return;
  prog.titles.push(key);
  saveProg();
  toast(t("profile.titleGot", pick(title)));
  renderProfile();
}

// ---------- 游戏装备 ----------

const GEAR = [
  { id: "glasses", name: { zh: "复利眼镜", en: "Compound Glasses" }, desc: { zh: "学堂获得的经验值 +20%", en: "Academy XP +20%" }, cond: { zh: "通过教学第 2 关解锁", en: "Clear teaching level 2 to unlock" }, check: () => prog.teach.includes(1) },
  { id: "amulet", name: { zh: "护身玉佩", en: "Jade Amulet" }, desc: { zh: "猜涨跌每局第一次猜错不清零连击", en: "First miss each round keeps your streak" }, cond: { zh: "最佳连击达到 5 解锁", en: "Reach a 5-guess streak to unlock" }, check: () => prog.bestStreak >= 5 },
  { id: "finger", name: { zh: "黄金手指", en: "Golden Finger" }, desc: { zh: "猜涨跌每次答对额外 +5 分", en: "+5 points per correct guess" }, cond: { zh: "累计猜对 30 次解锁", en: "30 correct guesses in total to unlock" }, check: () => prog.guessHit >= 30 },
  { id: "coin", name: { zh: "幸运硬币", en: "Lucky Coin" }, desc: { zh: "每日挑战多 2 次机会", en: "+2 guesses in the daily challenge" }, cond: { zh: "完成 3 次每日挑战解锁", en: "Complete 3 daily challenges to unlock" }, check: () => (prog.dailyCount || 0) >= 3 },
  { id: "fan", name: { zh: "军师羽扇", en: "Strategist's Fan" }, desc: { zh: "实战关卡开局多看 3 天走势", en: "See 3 extra days at level start" }, cond: { zh: "通过任意名场面解锁", en: "Clear any famous moment to unlock" }, check: () => prog.famous.length >= 1 },
  { id: "watch", name: { zh: "老K的怀表", en: "Master K's Pocket Watch" }, desc: { zh: "通关时额外 +30 经验", en: "+30 XP on every level clear" }, cond: { zh: "通过全部教学关解锁", en: "Clear all teaching levels to unlock" }, check: () => prog.teach.length >= TEACH_LEVELS.length },
];

const hasGear = (id) => prog.equipped.includes(id);

function checkGearUnlocks() {
  let changed = false;
  for (const g of GEAR) {
    if (!prog.gear.includes(g.id) && g.check()) {
      prog.gear.push(g.id);
      toast(t("gear.unlock", pick(g.name)));
      changed = true;
    }
  }
  if (changed) {
    saveProg();
    renderGear();
  }
}

function toggleGear(id) {
  const i = prog.equipped.indexOf(id);
  if (i >= 0) {
    prog.equipped.splice(i, 1);
  } else if (prog.equipped.length >= 2) {
    toast(t("gear.max"));
    return;
  } else {
    prog.equipped.push(id);
  }
  saveProg();
  renderGear();
}

function renderGear() {
  const list = $("gear-list");
  list.innerHTML = "";
  GEAR.forEach((g) => {
    const owned = prog.gear.includes(g.id);
    const on = hasGear(g.id);
    const el = document.createElement("span");
    el.className = "gear-item" + (owned ? " owned" : " locked") + (on ? " on" : "");
    el.textContent = pick(g.name);
    el.title = pick(g.desc) + " · " + (owned ? (on ? t("gear.equipped") : t("gear.hint")) : t("gear.locked", pick(g.cond)));
    if (owned) el.addEventListener("click", () => toggleGear(g.id));
    list.appendChild(el);
  });
}

// ---------- K 线生成器 (带种子, 关卡走势可复现) ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// segments: [{days, drift, vol}] 逐段拼接, 起始价 100
function genCandles(seed, segments) {
  const rnd = mulberry32(seed);
  const out = [];
  let price = 100;
  let day = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.days; i++) {
      const open = price;
      const ret = seg.drift + (rnd() - 0.5) * 2 * seg.vol;
      const close = Math.max(1, open * (1 + ret));
      const hi = Math.max(open, close) * (1 + rnd() * seg.vol * 0.6);
      const lo = Math.min(open, close) * (1 - rnd() * seg.vol * 0.6);
      out.push({
        day: ++day,
        open: +open.toFixed(2),
        close: +close.toFixed(2),
        high: +hi.toFixed(2),
        low: +lo.toFixed(2),
      });
      price = close;
    }
  }
  return out;
}

function maAt(candles, n, idx) {
  if (idx + 1 < n) return null;
  let s = 0;
  for (let i = idx - n + 1; i <= idx; i++) s += candles[i].close;
  return +(s / n).toFixed(2);
}

// ---------- 实战教学关卡 ----------
// goal: minReturn(小数) / beatHold / maxDrawdown 可组合; hints 按 K 线序号(从1起)触发

const TEACH_LEVELS = [
  {
    seed: 20101,
    title: { zh: "第一关 · 买入你的第一手", en: "Level 1 · Your First Trade" },
    desc: { zh: "在缓慢上涨的行情里完成一买一卖，赚到第一笔钱", en: "Buy once, sell once in a gentle uptrend and bank your first profit" },
    story: {
      zh: "红色空心 K 线是上涨，绿色实心是下跌。这段行情整体向上——找个位置全仓买入，涨了以后卖出落袋。目标：收益率 > 0%。",
      en: "Hollow red candles mean up, solid green means down. This market drifts upward — buy in, then sell to lock the gain. Goal: return > 0%.",
    },
    segments: [{ days: 30, drift: 0.006, vol: 0.018 }],
    startVisible: 8,
    goal: { minReturn: 0.0001 },
    hints: {
      9: { zh: "现在就可以点「全仓买入」——买入后每天点「下一天」看行情揭晓。", en: "Hit \"Buy All\" now — then click \"Next Day\" to reveal each day's move." },
      22: { zh: "已经有浮盈了吗？涨势后期随时可以「全部卖出」锁定利润。", en: "In profit? Late in a rally you can \"Sell All\" anytime to lock it in." },
    },
  },
  {
    seed: 20202,
    title: { zh: "第二关 · 等一个金叉", en: "Level 2 · Wait for the Golden Cross" },
    desc: { zh: "看着 MA5 上穿 MA20 再动手，体验趋势信号", en: "Act only when MA5 crosses above MA20 — feel a real trend signal" },
    story: {
      zh: "图上多了两条均线：黄色 MA5（短期）、蓝色 MA20（长期）。行情先跌后涨——别急着抄底，等 MA5 上穿 MA20（金叉）再买。目标：收益率 ≥ 5%。",
      en: "Two moving averages now: yellow MA5 (short) and blue MA20 (long). The market falls first, then turns — don't catch the knife; buy when MA5 crosses above MA20. Goal: return ≥ 5%.",
    },
    segments: [
      { days: 18, drift: -0.008, vol: 0.015 },
      { days: 6, drift: 0.002, vol: 0.012 },
      { days: 26, drift: 0.011, vol: 0.016 },
    ],
    startVisible: 22,
    showMa: true,
    goal: { minReturn: 0.05 },
    hints: {
      23: { zh: "下跌里 MA5 一直压在 MA20 下方——空仓等待就是最好的操作。", en: "In the decline MA5 stays below MA20 — staying out IS the trade." },
      30: { zh: "注意看：MA5 正在拐头向上逼近 MA20，金叉快出现了。", en: "Watch: MA5 is turning up toward MA20 — the golden cross is near." },
      34: { zh: "金叉确认！短期均线上穿长期均线，趋势转多，可以买入了。", en: "Golden cross confirmed! Short MA above long MA — trend is up, time to buy." },
    },
  },
  {
    seed: 20303,
    title: { zh: "第三关 · 别追高", en: "Level 3 · Don't Chase the Spike" },
    desc: { zh: "亲身体会「追高一时爽」的代价，跑赢无脑持有", en: "Feel the cost of chasing a spike — and beat buy & hold" },
    story: {
      zh: "开局就是一波急拉，人人都喊「要起飞」。但价格远超 MA20 时往往会回归。忍住别在山顶买——等回调企稳再进场。目标：跑赢「开局就满仓拿到最后」的买入持有。",
      en: "It opens with a vertical spike — everyone screams \"moon\". But price stretched far above MA20 tends to snap back. Don't buy the top; wait for the pullback to settle. Goal: beat buy & hold.",
    },
    segments: [
      { days: 8, drift: 0.03, vol: 0.02 },
      { days: 14, drift: -0.018, vol: 0.022 },
      { days: 22, drift: 0.008, vol: 0.014 },
    ],
    startVisible: 6,
    showMa: true,
    goal: { beatHold: true },
    hints: {
      7: { zh: "价格已经比 MA20 高出一大截——均值回归警告，现在追高风险很大。", en: "Price is way above MA20 — mean-reversion alert: chasing here is risky." },
      16: { zh: "急涨之后的急跌。空仓的你毫发无伤——这就是不追高的意义。", en: "The spike is unwinding. Flat position, zero damage — that's why you didn't chase." },
      25: { zh: "跌势放缓、价格回到均线附近，现在进场比在山顶买便宜多了。", en: "The fall is slowing and price is back near the MAs — far cheaper than the top." },
    },
  },
  {
    seed: 20404,
    title: { zh: "第四关 · 崩盘中活下来", en: "Level 4 · Survive the Crash" },
    desc: { zh: "学会止损：控制回撤比赚钱更重要", en: "Learn to cut losses: controlling drawdown beats chasing gains" },
    story: {
      zh: "先给你一段舒服的上涨——但好日子会突然结束。你的任务不是赚最多，而是活下来：全程最大回撤不超过 15%，且最终不亏超过 3%。记住：感觉不对就先卖，止损永远不丢人。",
      en: "You get a comfortable rally first — then the good times end abruptly. Your job isn't to earn the most, it's to survive: keep max drawdown within 15% and finish no worse than -3%. When it feels wrong, sell first — stopping out is never shameful.",
    },
    segments: [
      { days: 20, drift: 0.009, vol: 0.014 },
      { days: 12, drift: -0.035, vol: 0.03 },
      { days: 12, drift: 0.002, vol: 0.018 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: -0.03, maxDrawdown: 0.15 },
    hints: {
      18: { zh: "涨了这么久，问自己一句：如果明天开始跌，我打算在哪里止损？", en: "After this long a rally, ask yourself: if it turns tomorrow, where is my stop?" },
      22: { zh: "连续放量大跌、跌破均线——这不是回调，是趋势反转，先卖出保命！", en: "Heavy consecutive drops through the MAs — not a dip, a reversal. Sell and survive!" },
    },
  },
  {
    seed: 20505,
    title: { zh: "第五关 · 箱体里的高抛低吸", en: "Level 5 · Trade the Range" },
    desc: { zh: "行情不涨不跌来回晃——学会赚波动的钱", en: "A market going nowhere — learn to milk the swings" },
    story: {
      zh: "不是所有行情都有趋势。这一段价格会在一个「箱体」里来回震荡：跌到下沿就有人接、涨到上沿就有人卖。傻拿不动只能白坐过山车——在下沿买、上沿卖，来回做几趟。目标：收益率 ≥ 6% 且跑赢买入持有。",
      en: "Not every market trends. This one oscillates inside a 'box': buyers appear at the floor, sellers at the ceiling. Holding through it is a rollercoaster to nowhere — buy the floor, sell the ceiling, and repeat. Goal: return ≥ 6% AND beat buy & hold.",
    },
    segments: [
      { days: 9, drift: 0.009, vol: 0.013 },
      { days: 9, drift: -0.009, vol: 0.013 },
      { days: 10, drift: 0.009, vol: 0.013 },
      { days: 10, drift: -0.01, vol: 0.014 },
      { days: 8, drift: 0.006, vol: 0.012 },
    ],
    startVisible: 12,
    showMa: true,
    goal: { minReturn: 0.06, beatHold: true },
    hints: {
      14: { zh: "看出来了吗？价格涨到前高附近就掉头——上沿和下沿画出来了，等它回到下沿。", en: "See it? Price keeps turning back near the prior high — the box is drawn. Wait for the floor." },
      19: { zh: "回到箱体下沿了，前两次都在这里止跌——低吸的位置到了。", en: "Back at the box floor — the last two dips stopped right here. That's your entry." },
      28: { zh: "又到上沿了。箱体行情里别幻想突破，涨到上沿就卖，落袋为安。", en: "Ceiling again. In a range, don't dream of breakouts — sell at the top of the box and bank it." },
    },
  },
  {
    seed: 20606,
    title: { zh: "第六关 · 看见死叉就撤", en: "Level 6 · Run at the Death Cross" },
    desc: { zh: "金叉买入你会了——这次学会用死叉离场", en: "You know the golden cross — now learn to exit on the death cross" },
    story: {
      zh: "会买的是徒弟，会卖的才是师父。金叉之后放心持有——但顶部不会敲锣打鼓，MA5 下穿 MA20（死叉）就是行情给你的最后通牒。这一关既要赚到钱，也要走得干净。目标：收益率 ≥ 8% 且最大回撤 ≤ 12%。",
      en: "Buying is the apprentice's skill; selling is the master's. Hold with confidence after the golden cross — but tops don't ring a bell. When MA5 crosses below MA20 (the death cross), that's the market's final notice. Earn the money AND leave clean. Goal: return ≥ 8% with max drawdown ≤ 12%.",
    },
    segments: [
      { days: 6, drift: -0.004, vol: 0.012 },
      { days: 22, drift: 0.012, vol: 0.015 },
      { days: 6, drift: -0.002, vol: 0.018 },
      { days: 16, drift: -0.02, vol: 0.022 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: 0.08, maxDrawdown: 0.12 },
    hints: {
      11: { zh: "MA5 上穿 MA20，金叉确认——第二关学的东西，现在用上。", en: "MA5 just crossed above MA20 — the golden cross from Level 2. Put it to work." },
      29: { zh: "涨不动了：K线在均线附近来回穿、MA5 开始走平。这不是休息，可能是告别。", en: "The rally is stalling: candles whipping around the MAs, MA5 flattening. This may not be a rest — it may be goodbye." },
      35: { zh: "死叉！MA5 下穿 MA20，趋势转空。还记得这一关的名字吗——撤！", en: "Death cross! MA5 below MA20 — the trend has flipped. Remember this level's name: RUN!" },
    },
  },
];

// ---------- 名场面挑战 ----------

const FAMOUS_LEVELS = [
  {
    seed: 31501,
    title: { zh: "2015 · A股杠杆疯牛", en: "2015 · China's Leveraged Bull" },
    desc: { zh: "千股涨停到千股跌停，你能逃顶吗", en: "From limit-up frenzy to limit-down panic — can you escape the top?" },
    story: {
      zh: "2015 年上半年，场外配资推着 A 股一路狂飙，人人都是股神；6 月风向突变，千股跌停连环上演。你带着 10 万穿越回牛市中段——吃到主升浪，并在崩盘前逃顶。目标：收益率 ≥ 10% 且跑赢买入持有。",
      en: "In early 2015, leveraged money sent Chinese stocks vertical — everyone was a genius. Then June came, and thousands of stocks slammed limit-down day after day. You arrive mid-bull with 100k — ride the main wave and escape before the collapse. Goal: return ≥ 10% AND beat buy & hold.",
    },
    segments: [
      { days: 26, drift: 0.014, vol: 0.018 },
      { days: 6, drift: 0.02, vol: 0.03 },
      { days: 16, drift: -0.045, vol: 0.035 },
      { days: 10, drift: -0.005, vol: 0.025 },
    ],
    startVisible: 10,
    showMa: true,
    goal: { minReturn: 0.1, beatHold: true },
    award: { zh: "逃顶大师", en: "Top Escaper" },
    hints: {
      28: { zh: "成交越来越疯、波动越来越大——顶部往往就藏在最亢奋的日子里。", en: "Wilder swings, wilder euphoria — tops hide inside the most excited days." },
      34: { zh: "跌停潮开始了。还满仓的话，每犹豫一天都是真金白银。", en: "The limit-down cascade has begun. Every day of hesitation costs real money." },
    },
  },
  {
    seed: 32101,
    title: { zh: "2021 · 比特币疯牛", en: "2021 · The Bitcoin Mania" },
    desc: { zh: "翻倍的诱惑与腰斩的深渊", en: "The lure of doubling and the abyss of halving" },
    story: {
      zh: "2021 年，比特币从 3 万美元一路冲向 6 万，随后又在几周内近乎腰斩。币圈没有涨跌停、7×24 交易，波动是 A 股的数倍。你能在过山车上赚到 30% 再全身而退吗？目标：收益率 ≥ 30%。",
      en: "In 2021 Bitcoin ran from $30k toward $60k — then nearly halved within weeks. Crypto has no limit bands and trades 24/7; volatility dwarfs stocks. Can you take 30% off this rollercoaster and walk away? Goal: return ≥ 30%.",
    },
    segments: [
      { days: 22, drift: 0.022, vol: 0.035 },
      { days: 8, drift: 0.03, vol: 0.05 },
      { days: 14, drift: -0.05, vol: 0.055 },
      { days: 12, drift: 0.01, vol: 0.04 },
    ],
    startVisible: 8,
    goal: { minReturn: 0.3 },
    award: { zh: "币圈老炮", en: "Crypto Veteran" },
    hints: {
      24: { zh: "币圈的单日波动能顶 A 股一个月——收益目标达到就别贪。", en: "One crypto day can move like a month of stocks — hit your target, don't get greedy." },
      31: { zh: "瀑布来了。没有跌停板兜底，下跌可以深不见底。", en: "The waterfall is here. No limit-down floor — this can go much deeper." },
    },
  },
  {
    seed: 33301,
    title: { zh: "2021 · 世纪轧空大战", en: "2021 · The Great Short Squeeze" },
    desc: { zh: "散户抱团把股价推上天，然后呢", en: "Retail traders squeezed a stock to the sky — then what?" },
    story: {
      zh: "一只无人问津的股票被论坛散户抱团买爆，几天内暴涨数倍，做空机构被轧到爆仓；随后限制买入、股价雪崩。你恰好在起爆前入场——吃到暴涨，别把利润还回去。目标：收益率 ≥ 20% 且跑赢买入持有。",
      en: "A forgotten stock got mobbed by forum traders and multiplied within days, blowing up short sellers; then buying was restricted and the price avalanched. You arrive just before ignition — catch the surge, and don't give the profit back. Goal: return ≥ 20% AND beat buy & hold.",
    },
    segments: [
      { days: 16, drift: 0.001, vol: 0.012 },
      { days: 7, drift: 0.12, vol: 0.08 },
      { days: 9, drift: -0.09, vol: 0.07 },
      { days: 10, drift: -0.01, vol: 0.03 },
    ],
    startVisible: 12,
    goal: { minReturn: 0.2, beatHold: true },
    award: { zh: "轧空幸存者", en: "Squeeze Survivor" },
    hints: {
      17: { zh: "成交异动，有大事要发生。这种票要么不动，要么惊天动地。", en: "Something is stirring. Stocks like this either sleep — or explode." },
      21: { zh: "垂直拉升没有基本面支撑，全靠情绪。情绪退潮比涨起来更快。", en: "A vertical ramp with no fundamentals runs on pure emotion — and emotion drains faster than it fills." },
    },
  },
  {
    seed: 34001,
    title: { zh: "2008 · 金融海啸", en: "2008 · The Financial Tsunami" },
    desc: { zh: "百年投行一夜倒下，你能带着本金活下来吗", en: "A century-old bank fell overnight — can you survive with your capital?" },
    story: {
      zh: "2008 年，次贷危机从华尔街蔓延到全世界，百年投行雷曼兄弟轰然倒塌，全球股市腰斩。这一关没有暴富机会——瀑布中途的反弹全是陷阱。你的任务只有一个：活下来。目标：不亏钱且跑赢买入持有。",
      en: "In 2008 the subprime crisis spread from Wall Street to the world. Lehman Brothers — a century-old bank — collapsed overnight, and global markets were cut in half. There is no jackpot in this level: every bounce inside the waterfall is a trap. Your only mission is survival. Goal: don't lose money AND beat buy & hold.",
    },
    segments: [
      { days: 10, drift: 0.004, vol: 0.015 },
      { days: 14, drift: -0.03, vol: 0.03 },
      { days: 6, drift: 0.018, vol: 0.025 },
      { days: 18, drift: -0.042, vol: 0.045 },
      { days: 8, drift: 0.005, vol: 0.03 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: 0, beatHold: true },
    award: { zh: "危机幸存者", en: "Crisis Survivor" },
    hints: {
      14: { zh: "坏消息一个接一个，均线全部拐头向下。危机里，现金就是最好的仓位。", en: "Bad news keeps landing and every MA is turning down. In a crisis, cash IS a position." },
      27: { zh: "跌了这么多，反弹很诱人？危机中的反弹叫「逃命波」——是给你出货的，不是给你抄底的。", en: "Tempted by this bounce? In a crisis a rally is an exit ramp, not an entry." },
      36: { zh: "雷曼倒了。系统性危机没有底，别用「已经跌了很多」当买入理由。", en: "Lehman is gone. A systemic crisis has no floor — 'it already fell a lot' is not a reason to buy." },
    },
  },
  {
    seed: 35001,
    title: { zh: "2020 · 疫情熔断", en: "2020 · The Pandemic Meltdown" },
    desc: { zh: "十天四次熔断，恐慌的尽头是黄金坑", en: "Four circuit breakers in ten days — at the bottom of panic lies gold" },
    story: {
      zh: "2020 年 3 月，疫情席卷全球，美股十天内四次熔断，连股神都说「活久见」。但无限量放水随后而至，市场走出教科书级的 V 型反转。恐慌抛售的最深处，恰恰是十年一遇的抄底机会——你敢在别人恐惧时贪婪吗？目标：收益率 ≥ 15%。",
      en: "March 2020: the pandemic swept the globe and US stocks hit four circuit breakers in ten days — even Buffett said he'd never seen it. Then came unlimited QE, and the market carved a textbook V-shaped recovery. The deepest point of panic was the buying chance of a decade. Dare to be greedy when others are fearful? Goal: return ≥ 15%.",
    },
    segments: [
      { days: 12, drift: 0.003, vol: 0.012 },
      { days: 14, drift: -0.05, vol: 0.05 },
      { days: 20, drift: 0.024, vol: 0.03 },
      { days: 8, drift: 0.008, vol: 0.02 },
    ],
    startVisible: 10,
    goal: { minReturn: 0.15 },
    award: { zh: "抄底之王", en: "Dip Master" },
    hints: {
      16: { zh: "熔断潮开始了。恐慌时别急着接飞刀——等跌势放缓、恐慌见顶再动手。", en: "The circuit breakers have begun. Don't catch the falling knife — wait for the panic to peak." },
      28: { zh: "央行开闸放水，恐慌盘卖光了。历史大底往往就在「所有人都不敢买」的那几天。", en: "The central bank opened the floodgates and the panic sellers are done. Historic bottoms form on the days nobody dares to buy." },
    },
  },
  {
    seed: 36001,
    title: { zh: "2000 · 互联网泡沫", en: "2000 · The Dot-com Bubble" },
    desc: { zh: "市梦率的狂欢，与漫长的偿还", en: "A party priced on dreams — and the long hangover" },
    story: {
      zh: "1999 年，公司名字里加个「.com」股价就能翻倍，没人谈市盈率，大家谈「市梦率」。2000 年 3 月泡沫破裂，纳斯达克用两年半跌掉 78%，无数明星公司归零。你穿越回泡沫后期——赚泡沫的钱，但别陪泡沫殉葬。目标：收益率 ≥ 15% 且跑赢买入持有。",
      en: "In 1999, adding '.com' to a company name doubled its stock. Nobody talked P/E — they talked 'price-to-dream'. In March 2000 the bubble burst, and the Nasdaq spent two and a half years losing 78%. You arrive late in the bubble: take the bubble's money, but don't die with it. Goal: return ≥ 15% AND beat buy & hold.",
    },
    segments: [
      { days: 18, drift: 0.017, vol: 0.022 },
      { days: 6, drift: 0.032, vol: 0.035 },
      { days: 22, drift: -0.026, vol: 0.03 },
      { days: 8, drift: -0.006, vol: 0.02 },
    ],
    startVisible: 10,
    showMa: true,
    goal: { minReturn: 0.15, beatHold: true },
    award: { zh: "泡沫清醒者", en: "Bubble Sober" },
    hints: {
      20: { zh: "涨得越急，泡沫越薄。别问「还能涨多少」，问「破了我跑得掉吗」。", en: "The steeper the ramp, the thinner the bubble. Don't ask 'how much higher' — ask 'can I get out when it pops'." },
      30: { zh: "泡沫破裂不是 V 型反转——它是漫长的阴跌。别在半山腰抄底。", en: "A burst bubble doesn't V back up — it grinds down for years. Don't buy the halfway ledge." },
    },
  },
  {
    seed: 37001,
    title: { zh: "1987 · 黑色星期一", en: "1987 · Black Monday" },
    desc: { zh: "一天跌掉 22%，史上最黑的一个交易日", en: "Down 22% in a single day — the darkest session in history" },
    story: {
      zh: "1987 年 10 月 19 日，道琼斯指数单日暴跌 22.6%，至今无人打破。没有战争、没有加息、没有坏消息——程序化交易的止损单互相踩踏，把下跌变成了自由落体。但很少有人记得后半段：市场两年内收复了全部失地。目标：收益率 ≥ 5% 且跑赢买入持有。",
      en: "October 19th, 1987: the Dow fell 22.6% in one session — a record that still stands. No war, no rate hike, no headline — program-trading stop orders trampled each other and turned a dip into free fall. Few remember the second half of the story: the market recovered everything within two years. Goal: return ≥ 5% AND beat buy & hold.",
    },
    segments: [
      { days: 16, drift: 0.012, vol: 0.015 },
      { days: 4, drift: -0.02, vol: 0.03 },
      { days: 2, drift: -0.11, vol: 0.06 },
      { days: 14, drift: 0.009, vol: 0.035 },
      { days: 8, drift: 0.006, vol: 0.02 },
    ],
    startVisible: 10,
    showMa: true,
    goal: { minReturn: 0.05, beatHold: true },
    award: { zh: "星期一幸存者", en: "Monday Survivor" },
    hints: {
      18: { zh: "连续放量下跌，周五收在最低点——周末的恐慌会在周一开盘集中释放。", en: "Heavy selling into a Friday low — weekend fear gets unleashed all at once on Monday's open." },
      23: { zh: "单日暴跌 20% 是机器踩踏，不是世界末日。恐慌盘卖完之后，地上全是带血的筹码。", en: "A 20% one-day crash is machines trampling machines, not the end of the world. When the panic sellers finish, the floor is covered in bloody chips." },
    },
  },
  {
    seed: 38001,
    title: { zh: "1990 · 日经泡沫之巅", en: "1990 · The Nikkei's Last Summit" },
    desc: { zh: "把美国买下来的狂想，与失落的三十年", en: "The dream of buying America — and the three lost decades" },
    story: {
      zh: "1989 年末，日经指数站上 38957 点，东京银座一平米地价超过 30 万美元，账面上「卖掉东京就能买下整个美国」。所有人都相信股价永远涨——然后是长达三十多年的漫长偿还，日经直到 2024 年才重新站上那个高点。你穿越回泡沫的最后一段：赚完最后的疯狂，在梦醒前离场。目标：收益率 ≥ 10% 且跑赢买入持有。",
      en: "At the end of 1989 the Nikkei stood at 38,957. A square meter in Ginza cost over $300,000 — on paper, 'selling Tokyo could buy all of America'. Everyone believed prices only rose. Then came thirty-plus years of repayment: the Nikkei didn't reclaim that peak until 2024. You arrive in the bubble's final stretch — take the last of the madness and leave before the dream ends. Goal: return ≥ 10% AND beat buy & hold.",
    },
    segments: [
      { days: 14, drift: 0.015, vol: 0.015 },
      { days: 6, drift: 0.022, vol: 0.02 },
      { days: 20, drift: -0.02, vol: 0.022 },
      { days: 12, drift: -0.012, vol: 0.018 },
    ],
    startVisible: 10,
    showMa: true,
    goal: { minReturn: 0.1, beatHold: true },
    award: { zh: "东京梦醒人", en: "Tokyo Awakener" },
    hints: {
      16: { zh: "地价、股价、高尔夫会员证——什么都在涨。当「买什么都赚」成为常识，常识就快要失效了。", en: "Land, stocks, golf memberships — everything is rising. When 'everything makes money' becomes common sense, common sense is about to expire." },
      26: { zh: "顶部不是一天形成的：一次比一次弱的反弹，就是市场在跟你告别。", en: "Tops aren't built in a day: each bounce weaker than the last is the market waving goodbye." },
    },
  },
  {
    seed: 39001,
    title: { zh: "2007 · 6124 之巅", en: "2007 · The 6124 Summit" },
    desc: { zh: "A股史上最高峰，全民买基金的黄金年代", en: "The A-share market's all-time summit, when the whole nation bought funds" },
    story: {
      zh: "2007 年，上证指数从 998 点一路涨到 6124 点，银行门口排队买基金的队伍比春运还长，「你不理财、财不理你」成了全民口号。随后一年，指数跌到 1664 点，跌幅 73%。6124 这个数字，A股至今没有回去过。目标：收益率 ≥ 15% 且跑赢买入持有。",
      en: "In 2007 the Shanghai index ran from 998 to 6124. The queues outside banks to buy mutual funds were longer than holiday train lines. Within a year, the index fell to 1664 — down 73%. The A-share market has never seen 6124 again. Goal: return ≥ 15% AND beat buy & hold.",
    },
    segments: [
      { days: 20, drift: 0.016, vol: 0.02 },
      { days: 6, drift: 0.025, vol: 0.028 },
      { days: 18, drift: -0.035, vol: 0.035 },
      { days: 8, drift: -0.01, vol: 0.025 },
    ],
    startVisible: 10,
    showMa: true,
    goal: { minReturn: 0.15, beatHold: true },
    award: { zh: "6124 亲历者", en: "6124 Witness" },
    hints: {
      22: { zh: "基金一天卖出四百亿、新股民一天开户三十万——最后一棒的钱进场了，行情还能靠谁推？", en: "Funds selling 40 billion a day, 300,000 new accounts daily — the last money has arrived. Who's left to push the price?" },
      32: { zh: "跌破 60 日线还带量，别再听「价值投资拿十年」——先离场，活着才能谈十年。", en: "Breaking the 60-day MA on volume — stop repeating 'value investors hold ten years'. Leave first; you need to survive to talk decades." },
    },
  },
  {
    seed: 40001,
    title: { zh: "2016 · A股熔断惨案", en: "2016 · The A-share Breaker Disaster" },
    desc: { zh: "四天两次熔断，一项只活了七天的制度", en: "Two meltdowns in four days — a mechanism that lived seven days" },
    story: {
      zh: "2016 年 1 月 1 日，A股熔断机制正式上线：跌 5% 暂停 15 分钟，跌 7% 直接休市。1 月 4 日，新制度首个交易日就触发熔断；1 月 7 日更夸张，开盘 29 分钟即收市，创下史上最短交易日。1 月 8 日起熔断机制被紧急叫停，寿命七天。磁吸效应之下，越接近阈值跌得越快。你的任务：在这场制度实验里保住本金。目标：不亏钱且跑赢买入持有。",
      en: "January 1st, 2016: China launched its circuit breaker — a 15-minute halt at -5%, full closure at -7%. On January 4th, the very first trading day, it tripped. On January 7th the market closed 29 minutes after opening — the shortest session in history. On January 8th the mechanism was suspended, seven days old. Under the magnet effect, the closer the threshold, the faster the fall. Your mission: keep your capital through the experiment. Goal: don't lose money AND beat buy & hold.",
    },
    segments: [
      { days: 8, drift: 0.002, vol: 0.015 },
      { days: 5, drift: -0.055, vol: 0.045 },
      { days: 6, drift: -0.012, vol: 0.03 },
      { days: 14, drift: 0.012, vol: 0.02 },
      { days: 8, drift: 0.004, vol: 0.015 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: 0, beatHold: true },
    award: { zh: "熔断七日生还者", en: "Seven-Day Survivor" },
    hints: {
      10: { zh: "新制度上线，人人都想「跌 5% 之前先跑」——所有人同时抢跑，5% 反而来得更快。", en: "New rules, and everyone plans to 'sell before -5%'. When everyone front-runs the halt, -5% arrives faster." },
      20: { zh: "熔断取消了，恐慌盘也卖干净了。制度实验的残骸里，往往躺着错杀的好票。", en: "The breaker is gone and the panic sellers are spent. In the wreckage of a failed experiment lie wrongly punished stocks." },
    },
  },
  {
    seed: 41001,
    title: { zh: "1929 · 华尔街大崩盘", en: "1929 · The Wall Street Crash" },
    desc: { zh: "「永久性高地」之后，是大萧条的十年", en: "After the 'permanently high plateau' came a decade of Depression" },
    story: {
      zh: "1929 年 10 月，经济学家欧文·费雪宣称「股价已经站上永久性的高地」。几天后，黑色星期四来临，随后是更惨烈的黑色星期一与黑色星期二。银行家们凑钱护盘，只换来一次短暂的「死猫跳」——反弹诱多之后，道指用三年时间跌去 89%。这是现代金融史上最著名的崩盘，也是无数「抄底者」的坟场。你的任务：识破反弹陷阱，别在半山腰接飞刀。目标：不亏钱且跑赢买入持有。",
      en: "October 1929. Economist Irving Fisher declared stocks had reached 'a permanently high plateau.' Days later came Black Thursday, then the even bloodier Black Monday and Black Tuesday. Bankers pooled money to prop up the market — buying only a brief dead-cat bounce. After that bull trap, the Dow spent three years falling 89%. The most famous crash in modern finance, and a graveyard for dip-buyers. Your mission: see through the bounce and don't catch the falling knife. Goal: don't lose money AND beat buy & hold.",
    },
    segments: [
      { days: 10, drift: 0.01, vol: 0.014 },
      { days: 3, drift: -0.09, vol: 0.05 },
      { days: 5, drift: 0.025, vol: 0.035 },
      { days: 18, drift: -0.02, vol: 0.025 },
      { days: 6, drift: -0.008, vol: 0.018 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: 0, beatHold: true },
    award: { zh: "大萧条见证者", en: "Depression Witness" },
    hints: {
      11: { zh: "「永久性高地」——历史上每次有人说这句话，都值得你摸一摸口袋里的止损单。", en: "'A permanently high plateau' — every time in history someone says this, check that your stop order is ready." },
      15: { zh: "银行家护盘带来了反弹，但成交量在萎缩。没有量的反弹，是逃命的门，不是上车的梯。", en: "The bankers' pool bought a bounce, but volume is shrinking. A bounce without volume is an exit door, not a ladder up." },
    },
  },
  {
    seed: 42001,
    title: { zh: "1997 · 亚洲金融风暴", en: "1997 · The Asian Financial Crisis" },
    desc: { zh: "从泰铢失守到香港的联系汇率保卫战", en: "From the baht's fall to Hong Kong's defense of the peg" },
    story: {
      zh: "1997 年 7 月，泰铢在国际炒家的狙击下放弃固定汇率，一夜贬值 17%。风暴迅速席卷东南亚：马来西亚、印尼、韩国接连失守。10 月，炒家把矛头对准香港——一边做空港币逼迫加息，一边做空恒指坐收渔利。港府史无前例地入市迎战，用外汇储备硬接卖盘。恐慌抛售之后，守住联系汇率的市场迎来报复性反弹。你的任务：在风暴中活下来，并抓住守卫战胜利后的转机。目标：收益率 ≥ 10% 且跑赢买入持有。",
      en: "July 1997. Under speculative attack, Thailand abandoned its currency peg and the baht fell 17% overnight. The storm swept Southeast Asia: Malaysia, Indonesia, Korea fell one after another. In October the speculators turned on Hong Kong — shorting the HK dollar to force rates up while shorting the Hang Seng to collect the profit. In an unprecedented move, the government entered the market and absorbed the selling with its reserves. After the panic, the market that held its peg staged a furious rebound. Your mission: survive the storm and catch the turn after the defense holds. Goal: return ≥ 10% AND beat buy & hold.",
    },
    segments: [
      { days: 8, drift: 0.004, vol: 0.015 },
      { days: 6, drift: -0.045, vol: 0.04 },
      { days: 8, drift: -0.02, vol: 0.035 },
      { days: 5, drift: -0.05, vol: 0.05 },
      { days: 15, drift: 0.03, vol: 0.03 },
    ],
    startVisible: 8,
    showMa: true,
    goal: { minReturn: 0.1, beatHold: true },
    award: { zh: "港币守卫者", en: "Peg Defender" },
    hints: {
      10: { zh: "泰铢失守只是第一张多米诺。危机会传染，别用「跌这么多了」当买入理由。", en: "The baht was only the first domino. Crises are contagious — 'it's fallen so much' is not a buy signal." },
      23: { zh: "利率被逼到天上，卖盘却开始被人稳稳接走——有一只看不见的大手在护盘。", en: "Rates are sky-high, yet every wave of selling is being quietly absorbed. An unseen hand is holding the line." },
      29: { zh: "空头弹尽粮绝，守卫战赢了。被恐慌错杀的筹码，正在等第一批敢回来的人。", en: "The shorts are out of ammunition — the defense has won. Panic-stricken shares are waiting for the first buyers brave enough to return." },
    },
  },
  {
    seed: 43001,
    title: { zh: "2022 · 加密寒冬", en: "2022 · The Crypto Winter" },
    desc: { zh: "LUNA 归零、FTX 崩塌——每次反弹都是陷阱", en: "LUNA to zero, FTX collapses — every bounce a trap" },
    story: {
      zh: "2022 年 5 月，「算法稳定币」LUNA 在一周内从 80 美元跌到不足 0.0001 美元，400 亿美元灰飞烟灭。市场刚喘口气，6 月三箭资本爆仓清算；11 月，全球第二大交易所 FTX 被曝挪用客户资产，三天内破产。比特币从 6.9 万美元的高点一路跌到 1.6 万。这一年里每次像样的反弹，最后都被证明是逃命机会。你的任务：在连环暴雷中守住本金。目标：不亏钱且跑赢买入持有。提示：币圈没有均线护体，7×24 小时交易，波动加倍。",
      en: "May 2022: 'algorithmic stablecoin' LUNA fell from $80 to under $0.0001 in a week — $40 billion gone. Barely a breath later, Three Arrows Capital was liquidated in June; in November, FTX — the world's second-largest exchange — was exposed for misusing customer funds and went bankrupt within three days. Bitcoin slid from its $69k high all the way to $16k. Every decent bounce that year turned out to be an exit ramp. Your mission: protect your capital through the chain reaction. Goal: don't lose money AND beat buy & hold. Note: no moving averages in crypto — 24/7 trading, double the volatility.",
    },
    segments: [
      { days: 6, drift: -0.01, vol: 0.04 },
      { days: 4, drift: -0.08, vol: 0.06 },
      { days: 8, drift: 0.02, vol: 0.045 },
      { days: 5, drift: -0.055, vol: 0.055 },
      { days: 9, drift: 0.012, vol: 0.04 },
      { days: 6, drift: -0.04, vol: 0.05 },
    ],
    startVisible: 8,
    goal: { minReturn: 0, beatHold: true },
    award: { zh: "币圈守夜人", en: "Crypto Nightwatch" },
    hints: {
      8: { zh: "「稳定币」三个字不代表稳定。锚一旦松动，挤兑就是光速的。", en: "The word 'stablecoin' does not mean stable. Once the peg wobbles, the bank run happens at light speed." },
      15: { zh: "反弹了？先问一句：上一轮爆仓的连环债清完了吗？没清完，反弹就是给人跑路用的。", en: "A bounce? First ask: has the chain of liquidations finished unwinding? If not, this bounce exists for others to exit into." },
      27: { zh: "交易所本身也会倒。资产放在别人口袋里，「不是你的钥匙，就不是你的币」。", en: "Exchanges themselves can fall. When assets sit in someone else's pocket: not your keys, not your coins." },
    },
  },
];

// ---------- 剧情过场: 导师老K ----------

const MENTOR = {
  name: { zh: "老K", en: "Master K" },
  win: {
    zh: ["干得漂亮！你比我当年强多了。", "有点操盘手的样子了，稳住心态。", "利润落袋才是真的赚——你做到了。"],
    en: ["Well played — better than I was at your age.", "You're starting to trade like a pro. Stay calm.", "Profit isn't real until it's booked — and you booked it."],
  },
  lose: {
    zh: ["亏钱不可怕，可怕的是不复盘。想想哪一步错了。", "我当年爆仓三次才悟出这个道理，你只是输了个模拟盘。", "市场明天还在，先想清楚再来。"],
    en: ["Losing money isn't scary — not reviewing why is. Think it through.", "I blew up three accounts learning this lesson. You only lost play money.", "The market will still be here tomorrow. Come back with a plan."],
  },
};

// 按关卡种子索引的开场对白
const LEVEL_DIALOGS = {
  20101: {
    zh: ["我是老K，在这市场里摸爬滚打了三十年。", "第一笔交易我陪你做——记住，低买高卖，落袋为安。"],
    en: ["I'm Master K — thirty years of scars from this market.", "I'll walk you through your first trade. Buy low, sell high, take the money."],
  },
  20202: {
    zh: ["新手死于抄底，老手死于追高，高手死于杠杆。", "这一关只练一件事：金叉不出现，手就别动。"],
    en: ["Rookies die catching knives, veterans die chasing tops.", "One lesson this level: no golden cross, no trade."],
  },
  20303: {
    zh: ["看到暴涨就手痒？这一关专治手痒。", "记住我的话：山顶上，只有站岗的人。"],
    en: ["Itchy fingers when you see a spike? This level is the cure.", "Mark my words: the only people at the summit are the ones left holding the bag."],
  },
  20404: {
    zh: ["行情好的时候，人人都以为自己是天才。", "这一关我只教你一件事——活下来，比什么都重要。"],
    en: ["In a bull market everyone thinks they're a genius.", "This level teaches one thing only: survival beats everything."],
  },
  31501: {
    zh: [
      "2015 年春天，营业部门口排队开户的人绕了整整一条街。卖菜的大妈都在聊涨停板。",
      "场外配资把杠杆加到十倍，赚的时候是十倍的甜——没人想过，亏也是十倍的快。",
      "6 月 12 日，5178 点。那天之后，我看着千股跌停连演了一个月，楼塌的声音我到现在还记得。",
      "现在，你回到楼塌之前。吃到主升浪，然后——活着出来。",
    ],
    en: [
      "In the spring of 2015, the queue to open brokerage accounts wrapped around the block. Grandmothers at the market talked limit-ups.",
      "Off-book financing levered people ten to one. Ten times the sweetness on the way up — nobody did the math for the way down.",
      "June 12th, 5178 points. After that day I watched a thousand stocks slam limit-down, day after day, for a month. I can still hear the tower falling.",
      "Now you return to the moment before the fall. Ride the main wave — then get out alive.",
    ],
  },
  32101: {
    zh: [
      "2021 年，我一个开出租的朋友把车卖了买币。他说：币圈一天，人间一年。",
      "没有涨跌停，没有休市，7×24 小时——贪婪和恐惧在这里都不睡觉。",
      "他在 6 万美元的山顶上笑过，也在腰斩的瀑布里哭过。",
      "系好安全带。这趟过山车，没有刹车。",
    ],
    en: [
      "In 2021 a cab-driver friend of mine sold his car to buy coins. 'One day in crypto,' he said, 'is a year anywhere else.'",
      "No limit bands, no closing bell, 24/7 — greed and fear never sleep here.",
      "He laughed at the $60k summit, and he cried in the 50% waterfall.",
      "Buckle up. This rollercoaster has no brakes.",
    ],
  },
  33301: {
    zh: [
      "2021 年 1 月，一群论坛散户盯上了一只被做空机构判了死刑的游戏股。",
      "他们喊着「拿住不卖」，把股价从几美元推到四百多——空头爆仓，华尔街第一次对散户低了头。",
      "然后券商拔了网线：限制买入。雪崩，比拉升更快。",
      "你恰好在起爆点之前入场。记住：轧空的尽头，是雪崩。",
    ],
    en: [
      "January 2021: forum traders locked onto a dying game retailer that short sellers had left for dead.",
      "'Hold the line,' they chanted, pushing it from a few dollars past $400 — shorts blew up, and Wall Street blinked at retail for the first time.",
      "Then the brokers pulled the plug: buying restricted. The avalanche came faster than the ramp.",
      "You arrive just before ignition. Remember: at the end of every squeeze waits an avalanche.",
    ],
  },
  34001: {
    zh: [
      "2008 年 9 月 15 日凌晨，我在交易室看着新闻弹出来：雷曼兄弟，破产。",
      "一家活过两次世界大战和大萧条的百年投行，一夜之间没了。",
      "那年很多人问我「跌了这么多能不能抄底」。我说：系统性危机里，第一目标不是赚钱——",
      "是活下来。带着你的本金，去 2008 走一趟吧。",
    ],
    en: [
      "3 a.m., September 15th, 2008. I was on the trading floor when the headline flashed: Lehman Brothers, bankrupt.",
      "A bank that survived two world wars and the Great Depression — gone overnight.",
      "That year everyone asked me, 'It's fallen so much, can I buy the dip?' I told them: in a systemic crisis, the first goal isn't profit —",
      "it's survival. Take your capital and walk through 2008.",
    ],
  },
  35001: {
    zh: [
      "2020 年 3 月，美股十天熔断四次。活了九十岁的巴菲特说，他也只见过五次——其中四次在那十天里。",
      "所有人都在夺路而逃。电视里是坏消息，账户里是绿色瀑布。",
      "但你要记住一句老话：别人恐惧我贪婪。恐慌的最深处，往往是十年一遇的黄金坑。",
      "问题是——瀑布还没停的时候，你敢伸手吗？",
    ],
    en: [
      "March 2020: four circuit breakers in ten days. Ninety-year-old Buffett said he'd seen five in his life — four of them that fortnight.",
      "Everyone was running for the exits. Bad news on every screen, a waterfall in every account.",
      "But remember the old line: be greedy when others are fearful. The deepest panic often hides the buy of a decade.",
      "The question is — while the waterfall is still falling, do you dare reach in?",
    ],
  },
  36001: {
    zh: [
      "1999 年，我见过一家公司把名字后面加上「.com」，股价一周翻倍。它原本是卖地毯的。",
      "没人谈市盈率了，大家发明了新词：市梦率。梦有多大，价就有多高。",
      "2000 年 3 月，梦醒了。纳斯达克跌了两年半，78% 的市值蒸发，明星公司一个个归零。",
      "泡沫里不是不能赚钱——但你得记住自己是在泡沫里。去吧。",
    ],
    en: [
      "In 1999 I watched a company add '.com' to its name and double in a week. It sold carpets.",
      "Nobody quoted P/E anymore. They invented a new metric: price-to-dream. The bigger the dream, the higher the price.",
      "In March 2000 the dream ended. The Nasdaq fell for two and a half years — 78% of its value gone, star companies zeroed out one by one.",
      "You CAN make money inside a bubble — as long as you never forget you're in one. Go.",
    ],
  },
  37001: {
    zh: [
      "1987 年 10 月 19 日，我师父在纽约的交易大厅里。他说那天的报价机吐纸的速度，跟不上价格下跌的速度。",
      "没有战争，没有加息，甚至没有一条像样的坏消息——只有程序化交易的止损单，一张接一张地互相踩踏。",
      "一天，22.6%。电话打爆了，有人当场瘫在椅子上。",
      "但师父说，那天他学到的最重要的事发生在之后：市场花了两年，把跌掉的全涨了回来。去经历一次吧。",
    ],
    en: [
      "October 19th, 1987. My mentor was on a New York trading floor. He said the ticker tape couldn't print as fast as prices fell.",
      "No war, no rate hike, not even a proper headline — just program-trading stop orders trampling each other, one after another.",
      "One day. 22.6%. Phones melted. A man collapsed into his chair.",
      "But the most important lesson, he said, came after: the market spent two years winning it all back. Go live through it once.",
    ],
  },
  38001: {
    zh: [
      "1989 年我去过一次东京。出租车司机在炒股，寿司师傅在炒地，人人都觉得日本要买下全世界。",
      "日经 38957 点那天，没有任何人觉得那是顶。顶部从来不敲锣。",
      "然后梦碎了。不是崩盘那种碎法——是一年又一年、一代人又一代人的阴跌。",
      "三十五年后它才涨回那个数字。这一关，教你识别「一辈子只有一次」的顶。",
    ],
    en: [
      "I visited Tokyo in 1989. The cab driver traded stocks, the sushi chef flipped land, and everyone believed Japan would buy the world.",
      "The day the Nikkei touched 38,957, not one person called it the top. Tops never ring a bell.",
      "Then the dream broke — not with a crash, but with a grind: year after year, a generation's worth of decline.",
      "It took thirty-five years to see that number again. This level teaches you to recognize a once-in-a-lifetime top.",
    ],
  },
  39001: {
    zh: [
      "2007 年，我家楼下的银行门口天天排长队——不是取钱，是抢着买基金。",
      "指数从 998 涨到 6124，酒桌上人人都是巴菲特，「你不理财、财不理你」贴满了大街小巷。",
      "我劝一个亲戚少买点，他反问我：国家会让股市跌吗？一年后，指数 1664。",
      "6124，A股至今没有回去过。去看看那座山顶长什么样。",
    ],
    en: [
      "In 2007 the bank below my flat had a queue every morning — not to withdraw money, but to fight for mutual funds.",
      "The index ran from 998 to 6124. Every dinner table had a Buffett, and 'if you don't manage money, money won't manage you' hung on every street.",
      "I told a relative to trim his position. He asked me: 'would the state ever let stocks fall?' A year later the index printed 1664.",
      "6124 — the A-share market has never been back. Go see what that summit looks like.",
    ],
  },
  40001: {
    zh: [
      "2016 年元旦，A股给自己装了个「保险丝」：跌 5% 停一刻钟，跌 7% 直接放假。",
      "设计者以为它能给恐慌降温。结果 1 月 4 日第一个交易日，保险丝就烧了。",
      "1 月 7 日更绝：开盘 29 分钟，全天收市。我泡好的茶还烫着，市场就没了。",
      "七天后这个制度被连夜叫停。这一关你要学的是「磁吸效应」——以及在制度试错时怎么保住自己。",
    ],
    en: [
      "New Year's Day 2016: the A-share market installed a 'fuse' — a 15-minute halt at -5%, early closure at -7%.",
      "Its designers thought it would cool panic. On January 4th, the first trading day, the fuse blew.",
      "January 7th topped it: 29 minutes after the open, done for the day. My tea was still hot when the market ceased to exist.",
      "Seven days in, the mechanism was scrapped overnight. This level teaches the magnet effect — and how to protect yourself while the rules themselves are being debugged.",
    ],
  },
};

// 名场面通关后的历史结局过场
const LEVEL_EPILOGUES = {
  31501: {
    zh: [
      "你逃出来了。现实里，大多数人没有——5178 点之后，两市市值蒸发超过 20 万亿。",
      "监管随后清理了场外配资，「去杠杆」写进了之后很多年的政策里。",
      "记住这一课：牛市里最贵的三个字，叫「再等等」。",
    ],
    en: [
      "You made it out. In reality, most didn't — after 5178, more than 20 trillion yuan of market value evaporated.",
      "Regulators went on to dismantle off-book financing; 'deleveraging' shaped policy for years after.",
      "Remember the lesson: the most expensive words in a bull market are 'just a little longer'.",
    ],
  },
  32101: {
    zh: [
      "你带着利润下车了。现实里，2021 年那波腰斩只是预演——2022 年比特币从 6.9 万美元跌到 1.6 万。",
      "我那个卖车买币的朋友？他后来又买回了一辆出租车，说踏实。",
      "波动不是收益，落袋才是。",
    ],
    en: [
      "You stepped off with your profit. In reality, 2021's halving was only the rehearsal — in 2022 Bitcoin fell from $69k to $16k.",
      "My cab-driver friend? He eventually bought another cab. Said it felt solid.",
      "Volatility isn't profit. Booked profit is.",
    ],
  },
  33301: {
    zh: [
      "你在雪崩前落袋了。现实里，那只游戏股从 483 美元跌回 40 美元只用了两周。",
      "做空机构确实爆仓了，但接最后一棒的，还是冲在最高点的散户。",
      "散户赢了那场战役，但战场上从来没有永远的赢家——只有先走的人。",
    ],
    en: [
      "You booked it before the avalanche. In reality, that game stock fell from $483 back to $40 in two weeks.",
      "The short sellers did blow up — but the final bag was still held by the retail traders who charged in at the top.",
      "Retail won that battle. But markets have no permanent winners — only the ones who leave first.",
    ],
  },
  34001: {
    zh: [
      "你活下来了——2008 年，这就是胜利。现实里，全球股市那年平均跌了四成以上。",
      "危机之后，各国央行开启了长达十年的量化宽松，世界从此不同。",
      "顺便说一句：在废墟里坚持定投的人，五年后都赚回来了。危机毁灭财富，也重新分配财富。",
    ],
    en: [
      "You survived — and in 2008, survival WAS victory. Global markets lost over 40% that year.",
      "Afterward, central banks launched a decade of quantitative easing. The world was never the same.",
      "One more thing: those who kept steadily buying in the rubble were whole again within five years. A crisis destroys wealth — and redistributes it.",
    ],
  },
  35001: {
    zh: [
      "你在恐慌里伸了手，而且活着回来了。现实里，2020 年 3 月 23 日就是大底——之后美股用五个月收复全部失地。",
      "那次 V 型反转教科书都写不出来：跌得最凶的那周，恰恰是十年里最好的买点。",
      "但别把运气当能力——不是每次瀑布下面都有黄金坑，2008 年的瀑布下面就只有更深的瀑布。",
    ],
    en: [
      "You reached into the panic and came back alive. In reality, March 23rd, 2020 WAS the bottom — stocks reclaimed everything within five months.",
      "No textbook could have written that V: the ugliest week of the decade was also its best buying day.",
      "But don't confuse luck with skill — not every waterfall hides gold. Under 2008's waterfall there was only more waterfall.",
    ],
  },
  36001: {
    zh: [
      "你带着泡沫的钱清醒地走了。现实里，纳斯达克直到 2015 年——整整十五年后——才重新站上 2000 年的高点。",
      "那家卖地毯的「.com」公司？泡沫破裂后退市了，没人记得它的名字。",
      "但泡沫里也埋着真金：亚马逊跌了 94% 没有死，后来涨了几百倍。泡沫会清零估值，清不掉真价值。",
    ],
    en: [
      "You left the party sober, with the bubble's money. In reality, the Nasdaq didn't reclaim its 2000 peak until 2015 — fifteen years later.",
      "That carpet-selling '.com' company? Delisted after the burst. Nobody remembers its name.",
      "Yet real gold was buried in that bubble: Amazon fell 94% and lived — then rose a few hundredfold. A bubble resets prices. It can't erase real value.",
    ],
  },
  37001: {
    zh: [
      "你挺过了史上最黑的星期一。现实里，那天之后交易所引入了熔断机制——就是为了不让机器再互相踩踏。",
      "道指两年内收复全部失地，当天割肉的人，把史上最好的抄底机会卖在了地板上。",
      "记住这一课：暴跌分两种——世界真的变了，和价格暂时疯了。分清它们，值一辈子的钱。",
    ],
    en: [
      "You survived the darkest Monday in history. In reality, that day gave birth to the circuit breaker — built to stop machines trampling machines again.",
      "The Dow won everything back within two years. Those who sold that day dumped the greatest dip-buy in history on the floor.",
      "Remember the lesson: crashes come in two kinds — the world truly changed, or prices briefly went mad. Telling them apart is worth a lifetime.",
    ],
  },
  38001: {
    zh: [
      "你在梦醒前离场了。现实里，日经从 38957 跌到 2003 年的 7607，整整跌了十四年。",
      "那一代日本股民有个说法：不是我们不会投资，是我们把一生一次的运气，用在了入场的时机上。",
      "泡沫顶部买入的代价不是腰斩，是「用余生等回本」。宁可错过，不站山顶。",
    ],
    en: [
      "You left before the dream ended. In reality, the Nikkei fell from 38,957 to 7,607 by 2003 — fourteen straight years of decline.",
      "That generation of Japanese investors had a saying: it wasn't that we couldn't invest — we spent our once-in-a-lifetime luck on our entry date.",
      "The price of buying a bubble top isn't a 50% loss. It's spending the rest of your life waiting to break even. Better to miss out than to hold the summit.",
    ],
  },
  39001: {
    zh: [
      "你从 6124 全身而退了。现实里，指数一年后跌到 1664，排队买基金的人套了整整一代。",
      "有人 2007 年买的基金，拿到 2021 年才回本——十四年，孩子都上初中了。",
      "全民狂热是最响亮的顶部信号：当买股票不再需要理由，卖股票就有了最好的理由。",
    ],
    en: [
      "You walked away from 6124 intact. In reality the index hit 1664 within a year, and the fund-queue crowd stayed trapped for a generation.",
      "Some funds bought in 2007 didn't break even until 2021 — fourteen years. Long enough to raise a child into middle school.",
      "Mass euphoria is the loudest top signal there is: when buying needs no reason, you have the best reason to sell.",
    ],
  },
  40001: {
    zh: [
      "你在七天的制度实验里活了下来。现实里，那两次熔断蒸发的市值，以万亿计。",
      "熔断机制本身没错——美国用了三十年。错的是阈值太近：5% 和 7% 之间只隔一步，磁吸效应让恐慌自我实现。",
      "这一课记住：规则也会犯错。当规则本身在试错时，你的第一要务是别当实验品。",
    ],
    en: [
      "You survived the seven-day experiment. In reality, those two meltdowns erased trillions in market value.",
      "The circuit breaker itself wasn't wrong — America has used one for decades. The thresholds were: with only one step between -5% and -7%, the magnet effect made panic self-fulfilling.",
      "Take this lesson: rules can be wrong too. While the rules themselves are being debugged, your first job is not to be the lab rat.",
    ],
  },
};

const cut = { lines: [], idx: 0, timer: null, onDone: null };

// 打字机: holder.timer 持有计时器, 过场与剧本杀共用
function typeInto(el, text, holder) {
  clearInterval(holder.timer);
  if (REDUCED_MOTION) {
    el.innerHTML = linkifyTerms(text);
    return;
  }
  el.textContent = "";
  let i = 0;
  holder.timer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(holder.timer);
      el.innerHTML = linkifyTerms(text);
    }
  }, 28);
}

function cutsceneType(text) {
  typeInto($("cutscene-text"), text, cut);
}

function cutsceneShowLine() {
  cutsceneType(cut.lines[cut.idx]);
  $("cutscene-next").textContent = t(cut.idx >= cut.lines.length - 1 ? "cutscene.start" : "cutscene.next");
}

function endCutscene() {
  clearInterval(cut.timer);
  $("cutscene").hidden = true;
  const fn = cut.onDone;
  cut.onDone = null;
  if (fn) fn();
}

function playCutscene(lines, onDone) {
  if (!lines || !lines.length) {
    onDone();
    return;
  }
  cut.lines = lines;
  cut.idx = 0;
  cut.onDone = onDone;
  $("cutscene-name").textContent = pick(MENTOR.name);
  $("cutscene").hidden = false;
  cutsceneShowLine();
}

$("cutscene-next").addEventListener("click", () => {
  const full = cut.lines[cut.idx];
  // 打字未完时先补全整句, 再点才翻页
  if ($("cutscene-text").textContent.length < full.length) {
    clearInterval(cut.timer);
    $("cutscene-text").innerHTML = linkifyTerms(full);
    return;
  }
  if (cut.idx >= cut.lines.length - 1) {
    endCutscene();
    return;
  }
  cut.idx++;
  cutsceneShowLine();
});
$("cutscene-skip").addEventListener("click", endCutscene);

// ---------- 剧本杀: 市场悬案 ----------

const CASES = [
  {
    id: "flashcrash",
    title: { zh: "第一案 · 闪崩疑云", en: "Case 1 · The Flash Crash" },
    desc: { zh: "龙腾科技 30 分钟暴跌 30%，四个嫌疑人各执一词——谁点的火？", en: "Longteng Tech lost 30% in 30 minutes. Four suspects, four stories — who lit the fuse?" },
    award: { zh: "金牌侦探", en: "Ace Detective" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhang: { name: { zh: "张小散", en: "Retail Zhang" }, color: "--ma5" },
      wang: { name: { zh: "王总", en: "Boss Wang" }, color: "--up" },
      li: { name: { zh: "李研究", en: "Analyst Li" }, color: "--down" },
      zhao: { name: { zh: "赵主播", en: "Streamer Zhao" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "龙腾科技今天上午突然闪崩，30 分钟暴跌 30%，几万散户被闷在里面。", en: "Longteng Tech flash-crashed this morning — down 30% in half an hour, tens of thousands of retail traders trapped inside." } },
      { who: "k", text: { zh: "交易所调了四个人来问话——每个人都有嫌疑，每个人都说自己冤枉。", en: "The exchange pulled in four people for questioning. Everyone's a suspect, and everyone swears they're innocent." } },
      { who: "k", text: { zh: "把他们挨个问一遍，收集线索，然后告诉我：这场闪崩，是谁点的火。", en: "Question them all, gather the clues, then tell me: who lit the fuse?" } },
    ],
    suspects: [
      {
        id: "zhang",
        dialog: [
          { who: "zhang", text: { zh: "跟我没关系啊！我就 5 万块钱，全仓套在里面了！", en: "It wasn't me! I had 50 grand — all-in, and now it's buried!" } },
          { who: "zhang", text: { zh: "早上我看赵主播直播说「今天必有大事」，我还加仓了……结果十点就崩了。", en: "Streamer Zhao said 'something big today' on the morning stream, so I even added more... then it collapsed at ten." } },
        ],
        clue: { zh: "张小散只有 5 万本金，砸不出这种跌幅；但他提到赵主播盘前喊过「必有大事」。", en: "Zhang's 50k can't move a stock like that — but he says Zhao teased 'something big' before the open." },
      },
      {
        id: "wang",
        dialog: [
          { who: "wang", text: { zh: "我们王氏资本一股都没卖！去查我的交易记录啊！", en: "Wang Capital didn't sell a single share! Go check my trading records!" } },
          { who: "wang", text: { zh: "……质押的事你们也知道了？那是正常融资！跌破平仓线是券商强平的，不是我卖的！", en: "...You know about the pledge too? That was normal financing! When the price broke the liquidation line, the BROKER force-sold — not me!" } },
        ],
        clue: { zh: "王总把大量持股质押给券商换钱。跌破平仓线后券商会自动强制卖出——他「没卖」，但他的仓位在自己砸盘。", en: "Boss Wang pledged a huge block of shares for loans. Below the liquidation line the broker auto-sells — he 'didn't sell', but his position was dumping itself." },
      },
      {
        id: "li",
        dialog: [
          { who: "li", text: { zh: "我昨晚把龙腾的评级从「买入」下调到「中性」，报告凌晨发的，合规流程齐全。", en: "I downgraded Longteng from Buy to Neutral last night. The report went out pre-dawn, full compliance." } },
          { who: "li", text: { zh: "下调理由写得清清楚楚：大股东质押比例 78%，随时可能被强平。我只是提示风险。", en: "The reason is written plainly: the major shareholder has 78% of his stake pledged — forced liquidation could hit any time. I merely flagged the risk." } },
        ],
        clue: { zh: "李研究的报告揭了盖子：大股东质押率 78%。报告本身合法，但它成了导火索。", en: "Li's report lifted the lid: 78% of the major stake was pledged. The report was legal — but it was the spark." },
      },
      {
        id: "zhao",
        dialog: [
          { who: "zhao", text: { zh: "我喊「今天必有大事」怎么了？我天天都这么喊，节目效果嘛！", en: "So what if I said 'something big today'? I say that every day — it's called showbiz!" } },
          { who: "zhao", text: { zh: "再说我盘前就清仓了龙腾……咳，我是说，我风控意识强。", en: "Besides, I dumped my Longteng before the open... ahem, I mean, I have strong risk discipline." } },
        ],
        clue: { zh: "赵主播盘前清仓了自己的龙腾持股，还引导粉丝「关注大事」——他提前知道报告的事？", en: "Zhao cleared his own Longteng position before the open and steered fans toward 'big news' — did he know about the report in advance?" },
      },
    ],
    finale: [
      { who: "k", text: { zh: "线索齐了。报告是导火索，喊单是助燃剂，质押盘是炸药——但把下跌变成雪崩的，只有一个人。", en: "All clues are in. The report was the spark, the stream was the accelerant, the pledged shares were the dynamite — but only one person turned a dip into an avalanche." } },
      { who: "k", text: { zh: "记住：闪崩要问的不是「谁卖得多」，而是「谁的卖单停不下来」。指认吧。", en: "Remember: a flash crash isn't about who sold the most. It's about whose selling CANNOT STOP. Make the call." } },
    ],
    culprit: "wang",
    win: [
      { who: "k", text: { zh: "没错。报告点破质押风险，开盘抛压击穿平仓线，券商开始强平王总的质押股——强平砸出更低的价格，更低的价格触发更多强平。", en: "Correct. The report exposed the pledge risk, the opening sell-off broke the liquidation line, and the broker began force-selling Boss Wang's pledged shares — each forced sale pushed the price lower, triggering more forced sales." } },
      { who: "k", text: { zh: "这就是「质押爆仓螺旋」。真凶不是某一笔卖单，而是那台停不下来的自动清算机器——机器的主人，是王总。", en: "That's the pledge liquidation spiral. The culprit isn't any single sell order — it's the automatic selling machine that can't stop. And the machine belonged to Boss Wang." } },
      { who: "k", text: { zh: "至于赵主播提前清仓？内幕交易的事，监管会请他喝茶的。", en: "As for Zhao's early exit? The regulator will be inviting him to tea about insider trading." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。再想想：谁的卖单是「停不下来」的？回去把每个人的话再读一遍。", en: "Wrong. Think again: whose selling was IMPOSSIBLE to stop? Go back and reread what everyone said." } },
    ],
  },
  {
    id: "insider",
    title: { zh: "第二案 · 消失的内幕", en: "Case 2 · The Leaked Deal" },
    desc: { zh: "停牌前三天股价先涨了 20%——并购消息是谁漏出去的？", en: "The stock ran 20% in the three days before the halt. Who leaked the merger?" },
    award: { zh: "内幕猎手", en: "Insider Hunter" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhou: { name: { zh: "周董秘", en: "Secretary Zhou" }, color: "--down" },
      lin: { name: { zh: "小林", en: "Intern Lin" }, color: "--ma5" },
      liu: { name: { zh: "刘大户", en: "Whale Liu" }, color: "--up" },
      gao: { name: { zh: "高经理", en: "Manager Gao" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "恒宇集团停牌前三天，股价莫名其妙涨了 20%，成交量翻了五倍。", en: "Three days before Hengyu Group's trading halt, the stock inexplicably rose 20% on five times the volume." } },
      { who: "k", text: { zh: "复牌公告一出——重大并购。监管的问题很简单：消息是谁提前漏出去的？", en: "Then the announcement dropped — a major merger. The regulator's question is simple: who leaked it early?" } },
      { who: "k", text: { zh: "四个人，每个人都碰过那份并购文件的边。开始问吧。", en: "Four people, and every one of them touched the edge of that merger file. Start asking." } },
    ],
    suspects: [
      {
        id: "zhou",
        dialog: [
          { who: "zhou", text: { zh: "并购文件全程加密，接触名单上只有七个人。我的嘴，比保险柜还严。", en: "The merger file was encrypted end to end — only seven people on the access list. My lips are tighter than a vault." } },
          { who: "zhou", text: { zh: "不过……上周五投行来核数据，带了个实习生，文件在会议室摊了一下午。", en: "Although... last Friday the investment bank came to verify numbers. They brought an intern, and the file lay open in the meeting room all afternoon." } },
        ],
        clue: { zh: "接触名单只有 7 人，但上周五文件在会议室敞开了一下午，在场还有个投行实习生。", en: "Only 7 people on the access list — but the file lay open all Friday afternoon, with a bank intern in the room." },
      },
      {
        id: "lin",
        dialog: [
          { who: "lin", text: { zh: "我就……发了条朋友圈，配图是恒宇楼下，文案是「见证历史的一周」……定位忘了关。", en: "I just... made one social post. A photo outside Hengyu HQ, caption 'a week that makes history'... and I forgot to turn off the geotag." } },
          { who: "lin", text: { zh: "然后我舅问我在忙什么大项目，我什么都没说！我就回了句「你懂的」。", en: "Then my uncle asked what big project I was on. I said NOTHING! I just replied 'you know what I mean'." } },
        ],
        clue: { zh: "小林的朋友圈定位暴露了投行驻场，还给舅舅回了句「你懂的」——他舅舅是谁？", en: "Lin's geotag exposed the bank's presence at Hengyu, and he told his uncle 'you know what I mean' — who is this uncle?" },
      },
      {
        id: "liu",
        dialog: [
          { who: "liu", text: { zh: "我做了二十年价值投资，看量价就知道有事，不需要谁给我递消息。", en: "Twenty years of value investing — I read volume and price. I don't need anyone feeding me tips." } },
          { who: "liu", text: { zh: "小林是我外甥怎么了？我们家饭桌上从不聊股票！那 8000 万是我自己的判断！", en: "So what if Lin is my nephew? We never talk stocks at dinner! That 80 million position was my own judgment!" } },
        ],
        clue: { zh: "刘大户是小林的舅舅，停牌前三天重仓买入 8000 万——他说「从不聊股票」。", en: "Whale Liu is Lin's uncle — and he piled 80 million into Hengyu three days before the halt. He says they 'never talk stocks'." },
      },
      {
        id: "gao",
        dialog: [
          { who: "gao", text: { zh: "我们基金停牌前确实加了恒宇，但那是季度调仓，投决会流程完备，纪要都能调出来。", en: "Yes, our fund added Hengyu before the halt — quarterly rebalancing, full committee process, minutes on file." } },
          { who: "gao", text: { zh: "加了多少？总仓位的 2% 而已，研究报告几个月前就覆盖这只票了。", en: "How much? Just 2% of the book. Our research had covered the name for months." } },
        ],
        clue: { zh: "高经理只加仓 2%，且有投决会纪要背书——更像正常调仓。", en: "Manager Gao's add was only 2%, backed by committee minutes — looks like routine rebalancing." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "链条拼齐了：敞开的文件、暴露的定位、一句「你懂的」、停牌前的 8000 万。", en: "The chain is complete: an open file, a geotag, one 'you know what I mean', and 80 million placed before the halt." } },
      { who: "k", text: { zh: "内幕交易的认定只有两条：知悉消息，利用消息交易。谁两条全占？指认吧。", en: "Insider trading needs exactly two things: knowing the information, and trading on it. Who checks both boxes? Make the call." } },
    ],
    culprit: "liu",
    win: [
      { who: "k", text: { zh: "没错。小林是泄密源头——蠢，但他没交易；把消息变成 8000 万仓位的，是他舅舅刘大户。", en: "Correct. Intern Lin was the source of the leak — foolish, but he never traded. The man who turned the whisper into an 80-million position was his uncle, Whale Liu." } },
      { who: "k", text: { zh: "知悉加交易，两条全占，罚没加市场禁入跑不掉。小林也逃不了处分——嘴不严，害人害己。", en: "Knowledge plus trading — both boxes checked. Fines, disgorgement and a market ban are coming. And Lin won't escape discipline either — loose lips hurt everyone." } },
      { who: "k", text: { zh: "记住这一课：在市场里，「你懂的」三个字，可以贵到八千万。", en: "Remember this lesson: in the market, 'you know what I mean' can cost eighty million." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。光知道消息不算，光买了股票也不算——要「既知道、又交易」。再想想谁两条都占。", en: "Wrong. Knowing alone isn't the crime, and buying alone isn't either — it takes BOTH. Think: who checks both boxes?" } },
    ],
  },
  {
    id: "rattrade",
    title: { zh: "第三案 · 抢跑的账户", en: "Case 3 · The Front-Running Account" },
    desc: { zh: "基金建仓前一周，一个账户精准潜伏，获利三千万——钱是谁的？", en: "A week before the fund bought in, one account quietly loaded up and made 30 million. Whose money is it?" },
    award: { zh: "鼠仓克星", en: "Rat Catcher" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      chen: { name: { zh: "陈经理", en: "Manager Chen" }, color: "--down" },
      sun: { name: { zh: "孙交易员", en: "Trader Sun" }, color: "--ma5" },
      ma: { name: { zh: "马阿姨", en: "Auntie Ma" }, color: "--ma20" },
      qian: { name: { zh: "钱研究员", en: "Researcher Qian" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "鑫达基金上个月重仓买入一只冷门小盘股，股价一个月拉了 60%。", en: "Last month Xinda Fund piled into an obscure small-cap, and the price ran 60% in a month." } },
      { who: "k", text: { zh: "蹊跷的是：基金建仓前整整一周，一个名叫「马秀兰」的个人账户先潜伏了进去，基金拉升途中精准清仓，获利三千万。", en: "The catch: a full week before the fund started buying, a personal account under 'Ma Xiulan' quietly loaded up — then sold precisely into the fund's ramp, pocketing 30 million." } },
      { who: "k", text: { zh: "用别人的账户，抢在自己管理的基金前面买，再让基民的钱给自己抬轿——这叫老鼠仓。", en: "Using someone else's account to buy ahead of the fund you manage, letting your investors' money carry you up — that's called rat trading." } },
      { who: "k", text: { zh: "四个人和这只票有关。把老鼠找出来。", en: "Four people touched this stock. Find me the rat." } },
    ],
    suspects: [
      {
        id: "chen",
        dialog: [
          { who: "chen", text: { zh: "我是基金经理，建仓是投委会集体决策，流程你们随便查。", en: "I'm the fund manager. The position was approved by the investment committee — audit the process all you like." } },
          { who: "chen", text: { zh: "马秀兰？不认识。同名同姓的人多了去了。", en: "Ma Xiulan? Never heard of her. Plenty of people share a name." } },
          { who: "chen", text: { zh: "……我丈母娘也叫马秀兰？巧合，纯属巧合。她一个跳广场舞的，懂什么股票。", en: "...My mother-in-law is ALSO named Ma Xiulan? Coincidence. Pure coincidence. She's a square-dancing granny — what would she know about stocks." } },
        ],
        clue: { zh: "陈经理是唯一能决定「买哪只、何时建仓」的人——而潜伏账户的户主马秀兰，正是他的丈母娘。", en: "Manager Chen alone decided WHAT to buy and WHEN — and the lurking account belongs to Ma Xiulan, his mother-in-law." },
      },
      {
        id: "sun",
        dialog: [
          { who: "sun", text: { zh: "我只是执行下单的。指令当天早上才到我手里，之前我连票的名字都不知道。", en: "I just execute orders. The ticket reached me the morning of — before that I didn't even know the name." } },
          { who: "sun", text: { zh: "交易室手机统一上交、通话全程录音，你们要查我随便查。", en: "Phones are surrendered in the dealing room and every call is recorded. Check whatever you want." } },
          { who: "sun", text: { zh: "不过有件事很怪：那个账户开在城西营业部——我记得陈经理家就住那一片。", en: "One odd thing though: that account was opened at the West City branch — and I remember Manager Chen lives right around there." } },
        ],
        clue: { zh: "孙交易员建仓当天才知道股票名字，时间上不可能提前一周潜伏——排除。他还提到：潜伏账户开在陈经理家附近的营业部。", en: "Trader Sun learned the name only on execution day — he couldn't have front-run by a week. He also notes: the account was opened at a branch near Chen's home." },
      },
      {
        id: "ma",
        dialog: [
          { who: "ma", text: { zh: "股票？我不懂呀。账户是女婿说帮我「理财」开的，身份证也是他拿去办的。", en: "Stocks? I don't understand them. My son-in-law opened the account to 'manage my savings' — he took my ID to do the paperwork." } },
          { who: "ma", text: { zh: "密码我从来不知道，我连那个什么交易软件都没下载过。", en: "I never knew the password. I've never even downloaded that trading app thing." } },
          { who: "ma", text: { zh: "赚了三千万？哎哟，那我是不是能换个大点的房子了？", en: "It made 30 million? Oh my — does that mean I can buy a bigger flat?" } },
        ],
        clue: { zh: "马阿姨连交易密码都不知道——账户是她的名字，操作的手却是别人的。下单 IP 经查与陈经理家的宽带一致。", en: "Auntie Ma doesn't even know the password — the account wears her name, but another hand placed the orders. The order IP traces to Chen's home broadband." },
      },
      {
        id: "qian",
        dialog: [
          { who: "qian", text: { zh: "这只票是我三个月前挖掘的，深度报告只发在公司内部系统里。", en: "I found this stock three months ago. The deep-dive report went only to the firm's internal system." } },
          { who: "qian", text: { zh: "报告谁看过后台都有记录：陈经理打开过十一次，还下载了一次。", en: "The system logs every reader: Manager Chen opened it eleven times and downloaded it once." } },
          { who: "qian", text: { zh: "我自己？研究员买自己覆盖的票要提前报备，我一股都没碰——不信查我账户。", en: "Me? Analysts must pre-clear trades in names they cover. I never touched a share — check my account." } },
        ],
        clue: { zh: "钱研究员的报告只在内部系统，且他本人账户干净。后台记录显示：陈经理反复阅读并下载过该报告。", en: "Qian's report never left the internal system and his own account is clean. The logs show Manager Chen read it repeatedly — and downloaded it." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "捋一遍：报告在内部系统里，只有基金经理能定建仓时点；账户开在他家小区对面，下单 IP 是他家宽带，户主是他丈母娘。", en: "Line it up: the report lived in the internal system; only the fund manager set the buying schedule; the account sits across from his home, the order IP is his broadband, the holder is his mother-in-law." } },
      { who: "k", text: { zh: "老鼠仓的要害是「先于基金买入、用基民的钱抬轿」。谁做得到？指认吧。", en: "Rat trading means buying BEFORE your own fund and letting investors' money lift you. Who could do that? Make the call." } },
    ],
    culprit: "chen",
    win: [
      { who: "k", text: { zh: "没错。陈经理先用丈母娘的账户潜伏，再动用基金几十亿建仓拉升，最后让「马秀兰」精准下车——基民买单，他数钱。", en: "Correct. Chen lurked first with his mother-in-law's account, then deployed billions of fund money to ramp the price, and let 'Ma Xiulan' step off at the top — investors paid, he counted." } },
      { who: "k", text: { zh: "这就是老鼠仓：管理人把本该属于基民的收益，先装进了自己的口袋。判罚从来不轻——没收违法所得，市场禁入，还可能坐牢。", en: "That's rat trading: a manager pocketing gains that belonged to his investors. The penalty is never light — disgorgement, market ban, possibly prison." } },
      { who: "k", text: { zh: "记住这一课：买基金不只看业绩，还要看人品。净值曲线可以画得很漂亮，鼠洞是藏在曲线底下的。", en: "Remember the lesson: when you buy a fund, you buy the manager's character. A NAV curve can look beautiful — the rat hole hides beneath it." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。想想老鼠仓的定义：谁既能决定基金「何时买什么」，又和那个潜伏账户脱不了干系？", en: "Wrong. Think about the definition: who both controlled WHEN the fund bought WHAT, and can't be separated from that lurking account?" } },
    ],
  },
  {
    id: "pumpdump",
    title: { zh: "第四案 · 妖股风云", en: "Case 4 · Anatomy of a Meme Stock" },
    desc: { zh: "十二连板后连续跌停，龙虎榜上全是同一个席位——庄家是谁？", en: "Twelve straight limit-ups, then a cliff. The exchange's top-trader list shows one branch over and over. Who ran the pump?" },
    award: { zh: "屠庄英雄", en: "Whale Hunter" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      tu: { name: { zh: "屠老板", en: "Boss Tu" }, color: "--down" },
      dai: { name: { zh: "戴老师", en: "Teacher Dai" }, color: "--ma20" },
      shi: { name: { zh: "施董", en: "Chairman Shi" }, color: "--up" },
      niu: { name: { zh: "牛小妹", en: "Little Niu" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "ST 宏图，一只常年无人问津的壳股，一个月里十二个涨停，改名叫「宏图元宇宙」之后又来了五个。", en: "ST Hongtu — a shell company nobody touched for years — hit twelve limit-ups in a month, then five more after renaming itself 'Hongtu Metaverse'." } },
      { who: "k", text: { zh: "上周它开始连续一字跌停，几万追高的散户被封在里面，一秒都跑不掉。", en: "Last week it flipped to one-way limit-downs. Tens of thousands of chasers are sealed inside, unable to sell a single share." } },
      { who: "k", text: { zh: "龙虎榜上，同一家营业部的席位反复出现在买一和卖一——有人在坐庄。", en: "On the exchange's top-trader list, the same brokerage branch keeps appearing as both top buyer and top seller — someone was running the book." } },
      { who: "k", text: { zh: "四个人卷在这只妖股里。找出庄家。", en: "Four people are tangled in this meme stock. Find me the operator." } },
    ],
    suspects: [
      {
        id: "tu",
        dialog: [
          { who: "tu", text: { zh: "我就是个做短线的，看到强势股加入而已，这叫「打板」，合法的市场行为。", en: "I'm just a momentum trader. I join strong stocks — it's called limit-up chasing, perfectly legal." } },
          { who: "tu", text: { zh: "龙虎榜那个席位是我常用的营业部没错，但一个营业部几千个客户，凭什么说是我？", en: "Yes, that branch on the list is where I trade. But a branch has thousands of clients — why me?" } },
          { who: "tu", text: { zh: "自己买自己卖？你说的是「对倒」吧。呵，那得有几十个账户配合才做得到——我哪来那么多账户。", en: "Buying from myself? You mean wash trading. Ha — you'd need dozens of coordinated accounts for that. Where would I get so many." } },
        ],
        clue: { zh: "屠老板对「对倒」的手法脱口而出、门儿清。监控发现该席位下有 47 个不同身份证的账户，开户时间集中在拉升前一个月，资金同源。", en: "Boss Tu explained wash trading a little too fluently. Surveillance found 47 accounts under different IDs at that branch — all opened within a month before the ramp, all funded from the same source." },
      },
      {
        id: "dai",
        dialog: [
          { who: "dai", text: { zh: "我是知识付费！会员群 998 一个季度，我分享的是「盘面情绪学」，从不保证收益。", en: "I sell knowledge! Membership is 998 a quarter. I teach 'market sentiment studies' — no returns ever promised." } },
          { who: "dai", text: { zh: "宏图元宇宙是我喊的没错，但我喊的时候它已经涨起来了，我这叫顺势而为。", en: "Yes I called Hongtu Metaverse — but it was already flying when I called it. That's called riding the trend." } },
          { who: "dai", text: { zh: "屠老板?……认识，一起吃过几顿饭。他偶尔会「提示」我哪只票有资金关照，朋友之间聊聊天而已嘛。", en: "Boss Tu? ...We've shared a few dinners. He'd occasionally 'hint' which stock had money behind it. Just friends talking." } },
        ],
        clue: { zh: "戴老师每次喊单都在涨停板封死之后——散户第二天追进去，正好接屠老板的货。他承认屠老板会提前「提示」他。", en: "Teacher Dai's calls always came AFTER the limit-up sealed — his followers piled in next morning, right into Boss Tu's exits. He admits Tu 'hinted' stocks to him in advance." },
      },
      {
        id: "shi",
        dialog: [
          { who: "shi", text: { zh: "公司改名「元宇宙」怎么了？我们确实在探索战略转型，董事会决议齐全。", en: "So we renamed to 'Metaverse' — we ARE exploring a strategic pivot. Full board resolutions on file." } },
          { who: "shi", text: { zh: "那三份公告？「签署合作意向书」都是真实事件。意向嘛……后来没谈成，商业世界很正常。", en: "Those three announcements? Every 'letter of intent' was a real event. Intent... that later fell through. Business is like that." } },
          { who: "shi", text: { zh: "有人建议我「这段时间多发点利好」？我不记得了。就算有，发公告也是信披义务！", en: "Did someone suggest I 'release more good news around then'? I don't recall. And even so — announcements are my DISCLOSURE DUTY!" } },
        ],
        clue: { zh: "施董的三个「利好」全是无实质的意向书，且发布时点精准踩在拉升关键日。他暗示有人「建议」过他发公告——配合坐庄，但不是操盘的手。", en: "Chairman Shi's three 'good news' items were substance-free letters of intent, timed precisely to key ramp days. He hints someone 'suggested' the announcements — a collaborator, but not the hand on the wheel." },
      },
      {
        id: "niu",
        dialog: [
          { who: "niu", text: { zh: "我第八个板追进去的，三天赚了 40%！我当时觉得自己是天才。", en: "I chased in on the eighth limit-up and made 40% in three days! I thought I was a genius." } },
          { who: "niu", text: { zh: "戴老师群里说「主力锁仓，目标翻倍」，我就把赚的加本金全押回去了……", en: "Teacher Dai's group said 'the whale is locked in, target: double'. So I pushed my winnings AND my savings back in..." } },
          { who: "niu", text: { zh: "然后就是连续跌停。卖单排在两百万手后面，根本轮不到我。你们一定要抓住庄家啊！", en: "Then the limit-downs came. My sell order sat behind two million lots — it never got filled. Please, catch whoever did this!" } },
        ],
        clue: { zh: "牛小妹是纯受害者：追高、听喊单加仓、跌停里逃不出来——教科书式的接盘全过程。", en: "Little Niu is purely a victim: chased the ramp, doubled down on the guru's call, trapped in the limit-downs — a textbook bag-holding arc." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "看清这台机器了吗：47 个同源账户对倒拉板制造赚钱假象，董事长按时点配合放「利好」，大V封板后喊单送来接盘的人。", en: "See the machine now? 47 same-source accounts wash-trading the price up to fake a gold rush; a chairman releasing 'good news' on cue; a guru calling buys after each seal to deliver fresh bags." } },
      { who: "k", text: { zh: "喊单的、发公告的都有罪责，但坐庄要有三样东西：钱、账户、控盘的手。三样都在谁手里？指认吧。", en: "The caller and the chairman share the guilt. But running a pump needs three things: the money, the accounts, and the hand on the wheel. Who held all three? Make the call." } },
    ],
    culprit: "tu",
    win: [
      { who: "k", text: { zh: "没错。屠老板用 47 个账户先吸筹、再对倒拉出十二连板，让施董的「利好」和戴老师的喊单把散户接进来，自己在最高那几个板悄悄出货。", en: "Correct. Boss Tu accumulated quietly with 47 accounts, wash-traded twelve straight limit-ups, let Shi's 'news' and Dai's calls funnel retail money in — and unloaded silently into the highest boards." } },
      { who: "k", text: { zh: "操纵股价是证券市场最重的罪之一：没收所得、天价罚款、刑责一样不少。施董和戴老师，一个信披违规，一个非法荐股，也都跑不掉。", en: "Price manipulation is among the gravest market crimes: disgorgement, massive fines, criminal charges — all of it. Shi and Dai face their own reckonings for disclosure fraud and illegal touting." } },
      { who: "k", text: { zh: "记住这一课：妖股拉升时，龙虎榜比 K 线诚实。你看到的连板是画出来的，你听到的目标价是喊给你听的。", en: "Remember the lesson: when a meme stock flies, the top-trader list is more honest than the chart. The limit-ups you see were painted; the price target you heard was shouted FOR you." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。喊单的和发公告的都只是零件。坐庄需要钱、账户和控盘的手——三样齐的只有一个人。", en: "Wrong. The caller and the announcer are just parts of the machine. A pump needs money, accounts, and the hand on the wheel — only one person held all three." } },
    ],
  },
  {
    id: "scallop",
    title: { zh: "第五案 · 跑路的扇贝", en: "Case 5 · The Scallops That Swam Away" },
    desc: { zh: "账上 300 亿现金的公司，扇贝连续两年「跑了」——钱和扇贝，到底谁跑了？", en: "A company with 30 billion in cash says its scallops 'swam away' — twice. So who really ran: the scallops, or the money?" },
    award: { zh: "财报照妖镜", en: "Book Buster" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      he: { name: { zh: "贺董", en: "Chairman He" }, color: "--down" },
      feng: { name: { zh: "冯总监", en: "CFO Feng" }, color: "--ma20" },
      zheng: { name: { zh: "郑会计师", en: "Auditor Zheng" }, color: "--up" },
      bai: { name: { zh: "白研究员", en: "Analyst Bai" }, color: "--ma5" },
    },
    intro: [
      { who: "k", text: { zh: "海珍岛，一家养扇贝的上市公司。前年年报：扇贝跑了，减值 8 个亿。去年年报：扇贝又跑了，再减 11 个亿。", en: "Haizhen Island, a listed scallop farmer. Two years ago: 'the scallops swam away' — an 800 million write-down. Last year: they 'swam away' again — 1.1 billion more." } },
      { who: "k", text: { zh: "蹊跷的是，这家公司账上躺着 300 亿「货币资金」，却同时借着利率 8% 的高息债——有钱人会去借高利贷吗？", en: "The strange part: the books show 30 billion in 'cash' — yet the company keeps borrowing at 8% interest. Do the rich take out payday loans?" } },
      { who: "k", text: { zh: "上周股价闪崩跌停，监管进场核查。扇贝不会说话，但账本会。", en: "Last week the stock crashed limit-down and the regulator moved in. Scallops can't talk — but ledgers can." } },
      { who: "k", text: { zh: "四个人围着这本账。查出钱去了哪。", en: "Four people circle this ledger. Find out where the money went." } },
    ],
    suspects: [
      {
        id: "he",
        dialog: [
          { who: "he", text: { zh: "天灾！海水温度异常，扇贝大面积死亡洄游，我们渔民靠天吃饭，你们城里人不懂。", en: "An act of nature! Abnormal water temperatures — the scallops died and migrated en masse. We farmers live at the sea's mercy. City people wouldn't understand." } },
          { who: "he", text: { zh: "账上 300 亿是真金白银，银行函证都盖了章的。借高息债？那是……维持经营性现金流的正常安排。", en: "The 30 billion is real money — the bank confirmations are stamped. The high-interest debt? That's... normal working-capital arrangement." } },
          { who: "he", text: { zh: "我质押 96% 的持股套现 40 亿？企业家个人资金安排，与上市公司无关！", en: "I pledged 96% of my shares and cashed out 4 billion? An entrepreneur's personal finances — nothing to do with the listed company!" } },
        ],
        clue: { zh: "贺董质押了 96% 持股提前套现 40 亿——扇贝「跑路」的每个年份，恰好都是他质押到期要补钱的年份。存贷双高的账，只有做账的人和授意做账的人知道真相。", en: "Chairman He pledged 96% of his shares and cashed out 4 billion early — and each 'scallop escape' landed exactly in a year his pledges came due. Only the bookkeeper and the man who ordered the books know the truth behind cash-rich-yet-borrowing." },
      },
      {
        id: "feng",
        dialog: [
          { who: "feng", text: { zh: "报表是我编的，但每一笔调整都有贺董的批示。你们要看原始凭证吗？我……我留了备份。", en: "I prepared the statements — but every adjustment carries Chairman He's sign-off. Want the original vouchers? I... kept copies." } },
          { who: "feng", text: { zh: "那 300 亿「货币资金」，大部分年初转出去、审计前一周转回来，走的是海外子公司账户。", en: "Most of that 30 billion 'cash' leaves in January and returns the week before the audit — through the offshore subsidiary's accounts." } },
          { who: "feng", text: { zh: "每次扇贝盘点的前一夜，贺董都亲自安排船队「巡海」。巡完之后，盘点区域的扇贝就总是特别少。", en: "The night before every scallop count, Chairman He personally sent the fleet out 'on patrol'. After each patrol, the survey zones were always mysteriously empty." } },
        ],
        clue: { zh: "冯总监交出了底账：300 亿现金审计前一周才「回账」，盘点前夜船队总在「巡海」。他是执行者，也是留了后手的证人。", en: "CFO Feng surrendered the shadow books: the 30 billion 'returns' one week before each audit, and the fleet always 'patrols' the night before each count. He executed the scheme — and kept the receipts." },
      },
      {
        id: "zheng",
        dialog: [
          { who: "zheng", text: { zh: "我们连续三年出具标准无保留意见，程序上完全合规——函证、盘点、抽样，一样不少。", en: "We issued clean opinions three years running, fully by the book — confirmations, counts, sampling, all of it." } },
          { who: "zheng", text: { zh: "扇贝在海底怎么盘点？我们只能坐船抽样看海面……你别笑，行业惯例就这样。", en: "How do you count scallops on the seabed? We sample by boat and look at the water... don't laugh, that's industry practice." } },
          { who: "zheng", text: { zh: "今年我们辞任了。为什么？函证回函的银行网点，查无此址。我只能说到这了。", en: "This year we resigned the engagement. Why? The bank branch that answered our confirmation letters — the address doesn't exist. That's all I can say." } },
        ],
        clue: { zh: "郑会计师事务所连出三年干净意见后突然辞任——因为银行函证的回函网点根本不存在。函证是伪造的，审计被系统性欺骗。", en: "Auditor Zheng's firm quit abruptly after three clean opinions — because the bank branch replying to their confirmations doesn't exist. The confirmations were forged; the audit was systematically deceived." },
      },
      {
        id: "bai",
        dialog: [
          { who: "bai", text: { zh: "我承认我连续五篇「强烈推荐」，目标价还翻着倍上调。研究嘛，观点有对有错。", en: "Yes, I published five 'Strong Buy' notes in a row and kept doubling the target price. Research has hits and misses." } },
          { who: "bai", text: { zh: "去公司调研？去过，贺董带我们坐游艇看了海面，吃了顿扇贝宴，帆船上签的合作课题，经费 200 万。", en: "Site visits? Sure. Chairman He took us out on the yacht to view the sea, hosted a scallop banquet, and we signed a 2-million research grant on the sailboat." } },
          { who: "bai", text: { zh: "扇贝在不在海底，我一个写报告的怎么知道？我又不会潜水。", en: "Whether the scallops are down there — how would a report writer know? I can't dive." } },
        ],
        clue: { zh: "白研究员拿了 200 万「课题经费」后连发五篇强推——吹票有责，但他没碰过账本，不是造假的手。", en: "Analyst Bai took a 2-million 'research grant' and published five Strong Buys — guilty of touting, but he never touched the ledgers. Not the forging hand." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "拼起来了：现金审计前回账、函证网点不存在、盘点前夜「巡海」、减值年份对准质押到期——这是一台精密的造假机器。", en: "Assemble it: cash that returns just before audits, confirmation branches that don't exist, 'sea patrols' before every count, write-downs timed to pledge deadlines — a precision-built fraud machine." } },
      { who: "k", text: { zh: "CFO 做账、审计被骗、研究员吹票——但机器要有一个按开关的人：既有权力指挥船队和资金，又有质押爆仓的动机。指认吧。", en: "The CFO cooked, the auditor was deceived, the analyst touted — but every machine has one hand on the switch: someone with the power to command fleets and funds, and a pledge about to blow. Make the call." } },
    ],
    culprit: "he",
    win: [
      { who: "k", text: { zh: "没错。扇贝从来没跑——跑的是钱。贺董把上市公司资金通过海外子公司抽走填自己的质押窟窿，再用「扇贝死了」的减值把亏空洗成天灾。", en: "Correct. The scallops never ran — the money did. Chairman He siphoned company cash through the offshore subsidiary to plug his pledge holes, then laundered the shortfall into 'dead scallops' — an act of nature." } },
      { who: "k", text: { zh: "「存贷双高」就是照妖镜：真有 300 亿现金的公司，不会去借 8% 的高息债。财务造假、违规担保、掏空上市公司——退市加刑责，一样都少不了。", en: "'High cash, high debt' is the mirror that reveals the demon: a company truly holding 30 billion doesn't borrow at 8%. Fraud, illegal guarantees, tunneling — delisting and prison, the full menu." } },
      { who: "k", text: { zh: "记住这一课：看财报先看现金流。利润可以「编」，扇贝可以「跑」，但利息支出从来不会说谎。", en: "Remember the lesson: read the cash flow before the profit. Earnings can be authored and scallops can 'swim away' — but interest expense never lies." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。做账的、被骗的、吹票的都不是开关。想想：谁最需要那 300 亿「存在」，又最有权力让扇贝「消失」？", en: "Wrong. The bookkeeper, the deceived, the tout — none held the switch. Think: who NEEDED the 30 billion to 'exist', and had the power to make scallops 'vanish'?" } },
    ],
  },
  {
    id: "pigplate",
    title: { zh: "第六案 · 完美导师", en: "Case 6 · The Perfect Guru" },
    desc: { zh: "退休教师的 80 万养老钱，充进「国际盘」后再也提不出来——谁在杀猪？", en: "A retired teacher's 800k pension vanished into an 'international platform' that won't pay out. Who's butchering the pig?" },
    award: { zh: "反诈先锋", en: "Scam Slayer" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      tang: { name: { zh: "唐导师", en: "Guru Tang" }, color: "--down" },
      tian: { name: { zh: "甜甜", en: "Tiantian" }, color: "--ma5" },
      hao: { name: { zh: "阿豪", en: "Ah Hao" }, color: "--ma20" },
      jin: { name: { zh: "金链子", en: "Gold Chain" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "老周，退休中学教师，三个月里把 80 万养老钱分七次充进了一个叫「环球金汇」的交易平台。", en: "Old Zhou, a retired schoolteacher, wired his 800k pension into a platform called 'Global GoldFX' — seven deposits over three months." } },
      { who: "k", text: { zh: "前两个月他「赚」了 30%，提现秒到账。第三个月他加满仓位，账户一夜「爆仓」，平台连夜关停跑路。", en: "The first two months he 'earned' 30%, withdrawals instant. The third month he went all-in — his account 'blew up' overnight, and the platform vanished by morning." } },
      { who: "k", text: { zh: "这种局有个名字：杀猪盘。先养、再喂、后杀。警方顺着资金链抓回来四个人。", en: "This scheme has a name: pig butchering. Raise the pig, fatten the pig, kill the pig. Police followed the money and brought back four people." } },
      { who: "k", text: { zh: "把盘主找出来。老周的养老钱，就指望这个了。", en: "Find the one running the plate. Old Zhou's pension depends on it." } },
    ],
    suspects: [
      {
        id: "tang",
        dialog: [
          { who: "tang", text: { zh: "我是受害者！我自己在平台里也有 200 万提不出来！我们是「战友」啊！", en: "I'm a victim too! I have 2 million stuck on that platform myself! We were comrades-in-arms!" } },
          { who: "tang", text: { zh: "直播喊单怎么了？我分享的是「缠论战法」，学员自愿跟单。收益截图？那是……教学示意图。", en: "So I called trades on stream — I teach 'entanglement theory tactics', students follow of their own will. The profit screenshots? Those were... teaching illustrations." } },
          { who: "tang", text: { zh: "平台管理后台的注册邮箱是我的？不可能！那是有人盗用……我要请律师！", en: "The platform's admin account is registered to MY email? Impossible! Identity theft! I want my lawyer!" } },
        ],
        clue: { zh: "唐导师自称受害者，但平台管理后台的注册邮箱是他的，服务器租金从他控制的公司账户支付——「自己也被套」是杀猪盘标准剧本的最后一页。", en: "Guru Tang claims victimhood — but the platform's admin account uses his email, and the server rent flows from a company he controls. 'I'm trapped too' is the standard script's final page." },
      },
      {
        id: "tian",
        dialog: [
          { who: "tian", text: { zh: "我就是个聊天的。公司发我话术本，每天跟 40 个「叔叔」说早安晚安，聊孙子聊广场舞。", en: "I just chat. The company hands me a script book — every day I say good morning and good night to forty 'uncles', talk grandkids and square dancing." } },
          { who: "tian", text: { zh: "话术本第三章：处熟三个月才能提「我跟着唐老师赚了钱」。第四章：对方犹豫时发一张自己「盈利截图」。", en: "Script chapter three: only after three months of warmth may you mention 'I made money following Teacher Tang'. Chapter four: when they hesitate, send your own 'profit screenshot'." } },
          { who: "tian", text: { zh: "「甜甜」有 26 个，都用同一套照片。我提成千分之五……我也知道不对，我在攒钱退出的。", en: "There are 26 'Tiantians', all using the same photo set. My cut is 0.5%... I knew it was wrong. I was saving up to quit." } },
        ],
        clue: { zh: "「甜甜」是 26 人共用的人设，按话术本养熟目标再引向唐导师——诈骗链条的「养猪」环节，但她接触不到平台和资金。", en: "'Tiantian' is a persona shared by 26 operators, warming targets by script before steering them to Guru Tang — the 'pig raising' link, with no access to platform or funds." },
      },
      {
        id: "hao",
        dialog: [
          { who: "hao", text: { zh: "我管客服组。规矩很简单：前两个月提现「秒批」，客户加满仓后，提现按钮就要「系统维护」。", en: "I run customer service. The rules are simple: first two months, withdrawals approved instantly. Once a client is fully loaded, the withdraw button goes 'under maintenance'." } },
          { who: "hao", text: { zh: "行情？平台根本没接真实市场，K线是后台画的。让谁赚、让谁爆，一个参数的事。", en: "The market feed? The platform never connected to any real market. The candles are drawn by the back office — who wins, who blows up, it's one parameter." } },
          { who: "hao", text: { zh: "参数谁调？我没权限。全平台只有一个「总控」账号能碰,我只见过它半夜上线。", en: "Who sets the parameter? Above my clearance. Only one 'master control' account can touch it — I've only ever seen it log in past midnight." } },
        ],
        clue: { zh: "阿豪证实平台是「画 K线」的假盘，输赢由一个「总控」账号的参数决定——他执行话术，但碰不到总控。", en: "Ah Hao confirms the platform is a painted-candle fake — wins and losses set by one 'master control' account's parameters. He runs the scripts but can't touch the control." },
      },
      {
        id: "jin",
        dialog: [
          { who: "jin", text: { zh: "我就是「卡商」。收来的银行卡一张租金八百，钱进来我负责分散转出去，抽水 3 个点。", en: "I'm just the 'card man'. I rent bank cards at 800 apiece; money comes in, I scatter it out, and skim 3 points." } },
          { who: "jin", text: { zh: "钱最后去哪？换成 U 出境。上家是谁我真不知道，单线联系,对方代号「老师」。", en: "Where does it end up? Converted to crypto, moved offshore. My upstream? Single-line contact only — codename 'Teacher'." } },
          { who: "jin", text: { zh: "不过有一次「老师」发错了收款码——那个码，我在唐导师直播间的打赏链接里见过。", en: "But once, 'Teacher' sent the wrong payment code — and I'd seen that exact code before, in the tip jar of Guru Tang's livestream." } },
        ],
        clue: { zh: "金链子是洗钱的「卡商」，上家代号「老师」——一次发错的收款码，和唐导师直播间的打赏码是同一个。", en: "Gold Chain launders through rented cards for an upstream codenamed 'Teacher' — who once slipped and sent a payment code identical to the tip jar in Guru Tang's livestream." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "链条闭合了：26 个「甜甜」养猪，假盘画 K线喂猪，提现「维护」杀猪,卡商洗钱出境。", en: "The chain closes: 26 'Tiantians' raise the pigs, painted candles fatten them, 'maintenance' kills them, and rented cards wash the money offshore." } },
      { who: "k", text: { zh: "管理后台的邮箱、付服务器租金的公司、半夜上线的总控、发错的收款码——四条线指向同一个人。指认吧。", en: "The admin email, the company paying the servers, the midnight master control, the slipped payment code — four threads, one knot. Make the call." } },
    ],
    culprit: "tang",
    win: [
      { who: "k", text: { zh: "没错。唐导师就是盘主：白天直播喊单当「导师」，半夜登录总控当「屠夫」，让老周先赚 30% 养足信任，再一个参数收走全部。", en: "Correct. Guru Tang ran the plate: 'mentor' on stream by day, butcher at the master control by night — letting Old Zhou win 30% to fatten his trust, then harvesting everything with one parameter." } },
      { who: "k", text: { zh: "杀猪盘三步：养（小赚快提）、喂（加大投入）、杀（无法提现）。而它的破绽从第一天就在：真正的交易软件，不需要「甜甜」来教你下载。", en: "Pig butchering in three steps: raise (small wins, fast payouts), fatten (bigger deposits), kill (withdrawals frozen). And the tell was there from day one: real trading software never needs a 'Tiantian' to teach you how to install it." } },
      { who: "k", text: { zh: "记住这一课，也讲给家里人听：凡是「稳赚不赔」「导师带单」「内部通道」，一律是诈骗。收益越确定，骗局越确定。", en: "Remember this lesson — and teach it to your family: 'guaranteed profit', 'guru-led trades', 'insider channels' — every one of them is fraud. The more certain the return, the more certain the scam." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。聊天的、客服的、洗钱的都是刀，不是握刀的手。想想：管理后台、服务器租金、总控账号、收款码——都指向谁？", en: "Wrong. The chatters, the support desk, the launderers are blades — not the hand that holds them. Think: the admin email, the server rent, the master control, the payment code — where do they all point?" } },
    ],
  },
  {
    id: "fatfinger",
    title: { zh: "第七案 · 234亿的手滑", en: "Case 7 · The 23.4 Billion Slip" },
    desc: { zh: "套利系统 2 秒打出 234 亿买单，大盘瞬间拉升——乌龙是事故，但之后发生的事是犯罪。", en: "An arbitrage system fired 23.4 billion of buy orders in 2 seconds and the index spiked. The fat finger was an accident — what happened next was a crime." },
    award: { zh: "真相守门人", en: "Truth Keeper" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      gong: { name: { zh: "龚总裁", en: "President Gong" }, color: "--down" },
      qu: { name: { zh: "屈总监", en: "Director Qu" }, color: "--ma20" },
      guo: { name: { zh: "程序员小郭", en: "Coder Guo" }, color: "--ma5" },
      leng: { name: { zh: "冷风控", en: "Risk Chief Leng" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "8 月 16 日上午 11:05，某大型券商的程序化交易套利系统突然失控，2 秒内打出 234 亿元买单。", en: "August 16, 11:05 AM. A major broker's program-trading arbitrage system went rogue, firing 23.4 billion yuan of buy orders in two seconds." } },
      { who: "k", text: { zh: "权重股瞬间集体涨停，大盘一分钟拉升 5%。全市场都在问：发生了什么？是重大利好吗？", en: "Blue chips slammed limit-up in unison; the index spiked 5% in a minute. The whole market asked: what happened? Is this huge news?" } },
      { who: "k", text: { zh: "11:59，公司对媒体声明：「系统没有问题。」而下午开盘后，这家公司悄悄卖空了大量股指期货和 ETF。", en: "At 11:59 the firm told the press: 'Our systems are fine.' Yet right after the afternoon open, the same firm quietly shorted index futures and ETFs in size." } },
      { who: "k", text: { zh: "乌龙指是事故，不是罪。可有人把事故变成了犯罪。四个人，找出那只手。", en: "A fat finger is an accident, not a crime. But someone turned this accident into one. Four people — find the hand." } },
    ],
    suspects: [
      {
        id: "guo",
        dialog: [
          { who: "guo", text: { zh: "是我写的订单生成模块……重下单机制少了个状态检查，失败的单子会无限重试。测试环境里从来没触发过。", en: "I wrote the order-generation module... the retry logic was missing a state check, so failed orders retried forever. It never triggered in testing." } },
          { who: "guo", text: { zh: "那天系统直连交易所，230 亿的单子没经过任何资金校验就出去了。我看到成交回报的时候手都是抖的。", en: "That day the system was wired straight to the exchange — 23 billion went out without a single capital check. My hands were shaking when I saw the fills." } },
          { who: "guo", text: { zh: "我 11:10 就把事故报告发给了屈总监和龚总。之后他们开会，没让我参加。", en: "I sent the incident report to Director Qu and President Gong at 11:10. Then they held a meeting. I wasn't invited." } },
        ],
        clue: { zh: "小郭的 bug 是事故的起点，但他 11:10 就如实上报了。写错代码是过失，不是犯罪——之后的决定与他无关。", en: "Guo's bug started the accident, but he reported it honestly at 11:10. Bad code is negligence, not crime — the decisions that followed were not his." },
      },
      {
        id: "qu",
        dialog: [
          { who: "qu", text: { zh: "11:40 我开始下令卖空股指期货对冲敞口。234 亿的多头风险摆在那里，止损是交易员的本能！", en: "At 11:40 I started shorting index futures to hedge the exposure. We were sitting on 23.4 billion of unwanted longs — cutting risk is a trader's instinct!" } },
          { who: "qu", text: { zh: "我知道公司还没公告。但我问过上面：「现在对冲合规吗？」上面的原话是——「先把窟窿堵上，公告的事下午再说。」", en: "I knew we hadn't disclosed yet. But I asked upstairs: 'Is hedging now compliant?' The exact answer was — 'Plug the hole first. Disclosure can wait till afternoon.'" } },
          { who: "qu", text: { zh: "那句话是谁说的？会议纪要上有名字。我只是执行。", en: "Who said it? The name is in the meeting minutes. I only executed." } },
        ],
        clue: { zh: "屈总监在公告前执行了对冲，但会议纪要显示「先对冲后公告」的决定来自更高层——他是执行的手，不是拍板的人。", en: "Director Qu hedged before disclosure — but the minutes show 'hedge first, disclose later' was decided above him. He was the executing hand, not the deciding one." },
      },
      {
        id: "leng",
        dialog: [
          { who: "leng", text: { zh: "风控额度？系统里设了的。但套利系统走的是独立通道，直连交易所，我的阀门根本不在它的路径上。", en: "Risk limits? They were configured. But the arbitrage system ran its own channel, straight to the exchange — my valves weren't even on its path." } },
          { who: "leng", text: { zh: "我半年前就打过报告：程序化交易必须接入统一风控，否则出事就是天大的事。报告批复写着「成本过高，暂缓」。", en: "Six months ago I filed a report: program trading must route through unified risk control, or any failure would be catastrophic. The reply read: 'Too costly. Postponed.'" } },
          { who: "leng", text: { zh: "签「暂缓」的人，和中午拍板「先对冲」的，是同一支笔。", en: "The pen that signed 'Postponed' and the pen that ruled 'hedge first' at noon — same pen." } },
        ],
        clue: { zh: "冷风控的接入方案半年前被批「暂缓」——签字人与中午拍板对冲的是同一人。她有失察之责，但两次关键决定都不在她手里。", en: "Risk Chief Leng's integration plan was stamped 'Postponed' six months ago — by the same signature that ruled 'hedge first' at noon. Oversight failure, yes; but neither key decision was hers." },
      },
      {
        id: "gong",
        dialog: [
          { who: "gong", text: { zh: "11:59 我对媒体说「系统没有问题」，那是……为了避免市场恐慌！维稳！你懂吗？", en: "At 11:59 I told the press 'our systems are fine' — to avoid market panic! Stability! You understand?" } },
          { who: "gong", text: { zh: "对冲是正常的风险管理。全世界的交易台都会这么做。我不明白这有什么可查的。", en: "Hedging is normal risk management. Every trading desk in the world does it. I don't see what there is to investigate." } },
          { who: "gong", text: { zh: "会议纪要？内部文件也能当证据？……那句话不是那个意思。「先把窟窿堵上」是一种……管理学表达。", en: "The minutes? Internal documents as evidence? ...That's not what the words meant. 'Plug the hole first' is a... managerial figure of speech." } },
        ],
        clue: { zh: "龚总裁 11:59 对公众否认事故，同一时间在内部拍板「先对冲后公告」——用只有自己知道的重大信息反向交易，这正是内幕交易的定义。", en: "President Gong publicly denied the incident at 11:59 while internally ruling 'hedge first, disclose later' — trading on material information only he possessed. That is the textbook definition of insider trading." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "理清了：bug 是过失，执行对冲的是奉命，风控失守是被「暂缓」的。真正的罪发生在 11:59——对市场说「没有问题」的同时，下令反向交易。", en: "Clear now: the bug was negligence, the hedger followed orders, risk control was 'postponed' away. The real crime happened at 11:59 — telling the market 'all fine' while ordering the opposite trade." } },
      { who: "k", text: { zh: "乌龙指发生的那一刻，「我们出了 234 亿的事故」就成了内幕信息。在公告前利用它交易的人，就是罪人。指认吧。", en: "The moment the fat finger fired, 'we just had a 23.4 billion accident' became inside information. Whoever traded on it before disclosure is the criminal. Make the call." } },
    ],
    culprit: "gong",
    win: [
      { who: "k", text: { zh: "没错。乌龙指本身不是犯罪——把事故当成只有自己知道的底牌，一边对公众撒谎一边抢先交易，才是。龚总裁被罚没数亿，终身市场禁入。", en: "Correct. The fat finger itself was no crime — treating the accident as a private ace, lying to the public while front-running it, was. President Gong: hundreds of millions in fines, banned from the market for life." } },
      { who: "k", text: { zh: "这一案改写了行业：内幕信息不只是「别人公司的秘密」，你自己的重大事件在公告前同样不能交易。信息面前，必须众生平等。", en: "This case rewrote the rulebook: inside information isn't just 'other companies' secrets' — your own material events are equally untradeable before disclosure. Before information, all must stand equal." } },
      { who: "k", text: { zh: "记住这一课：程序化交易必须有风控熔断阀；而当事故发生时，最贵的不是那 234 亿——是说出「系统没有问题」的那句谎话。", en: "Remember the lesson: program trading needs a risk-control kill switch. And when the accident comes, the costliest thing isn't the 23.4 billion — it's the sentence 'our systems are fine.'" } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。写错代码的、奉命执行的、被「暂缓」的，都不是罪的源头。想想：谁一边对公众说「没有问题」，一边下令反向交易？", en: "Wrong. The coder, the order-follower, the 'postponed' — none was the source. Think: who told the public 'all fine' while ordering the opposite trade?" } },
    ],
  },
  {
    id: "ponzi",
    title: { zh: "第八案 · 15%的神话", en: "Case 8 · The 15% Miracle" },
    desc: { zh: "年化 15% 保本保息、广告铺满地铁、300 万投资人——直到某个周一，提现按钮变成了灰色。", en: "15% a year, principal guaranteed, ads in every subway car, three million investors — until one Monday, the withdraw button turned gray." },
    award: { zh: "庞氏终结者", en: "Ponzi Terminator" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      bao: { name: { zh: "鲍总", en: "Chairman Bao" }, color: "--down" },
      mu: { name: { zh: "慕总监", en: "CFO Mu" }, color: "--ma20" },
      tong: { name: { zh: "佟金牌", en: "Top Seller Tong" }, color: "--ma5" },
      hua: { name: { zh: "华姐", en: "Sister Hua" }, color: "--up" },
    },
    intro: [
      { who: "k", text: { zh: "「鑫富宝」，一个号称做「供应链金融创新」的理财平台：年化 15%，保本保息，随存随取。", en: "'XinFuBao', a wealth platform claiming 'supply-chain finance innovation': 15% a year, principal and interest guaranteed, withdraw anytime." } },
      { who: "k", text: { zh: "广告上了地铁、电视和春晚倒计时。两年吸金 700 亿，投资人 300 万——多数是把养老钱搬进来的普通人。", en: "Its ads ran in subways, on TV, before the New Year countdown. Two years: 70 billion raised, three million investors — mostly ordinary people moving in their pensions." } },
      { who: "k", text: { zh: "上周一，提现开始「排队」。周三，排队变成「系统升级」。周五，办公楼人去楼空，服务器和账本一起消失了。", en: "Last Monday, withdrawals started 'queuing'. Wednesday, the queue became a 'system upgrade'. Friday, the offices were empty — servers and ledgers gone." } },
      { who: "k", text: { zh: "警方在一处工地的地下六米，挖出了 80 本账册。四个人到案。开始吧。", en: "Police dug 80 ledgers out of a construction site — six meters underground. Four people in custody. Begin." } },
    ],
    suspects: [
      {
        id: "bao",
        dialog: [
          { who: "bao", text: { zh: "我们是金融创新！供应链金融！把核心企业的应收账款做成理财产品，怎么就成骗局了？", en: "We are financial innovation! Supply-chain finance! Turning core enterprises' receivables into wealth products — how is that a scam?" } },
          { who: "bao", text: { zh: "平台上的借款企业都是真实注册的公司……注册资料齐全，公章、执照，一样不少。", en: "Every borrower on the platform is a genuinely registered company... full paperwork, seals, licenses, everything." } },
          { who: "bao", text: { zh: "游艇和庄园是公司形象投入！给助理发的 5 个亿是……人才激励！埋账本？我不知道什么账本！", en: "The yacht and the estate were corporate image investments! The 500 million to my assistant was... talent incentive! Buried ledgers? I know nothing about ledgers!" } },
        ],
        clue: { zh: "平台上 95% 的「借款企业」是鲍总用同一批公章注册的壳公司——钱从投资人手里进来，转一圈流回他自己的口袋，这叫「自融」。", en: "95% of the platform's 'borrowers' are shell companies Chairman Bao registered with the same batch of seals — investor money loops straight back into his own pocket. The word for it: self-dealing." },
      },
      {
        id: "mu",
        dialog: [
          { who: "mu", text: { zh: "账是我管的。说实话吧——平台从第一天起就没有真实盈利，付给老投资人的「利息」，全部来自新投资人的本金。", en: "I kept the books. The truth, then — the platform never earned a real profit from day one. Every 'interest payment' to old investors came from new investors' principal." } },
          { who: "mu", text: { zh: "两套账：给监管看的那套有底层资产，真实的那套只有一个资金池——钱进来，一半付利息，一半听鲍总安排。", en: "Two sets of books: the regulator's version had underlying assets; the real one had only a cash pool — half of inflows paid interest, half went wherever Chairman Bao directed." } },
          { who: "mu", text: { zh: "崩盘前一周，鲍总让我把服务器硬盘和账册装进麻袋，埋到他小舅子的工地下面。挖出来的那 80 本，就是我埋的。", en: "A week before the collapse, Chairman Bao had me bag the server drives and ledgers and bury them at his brother-in-law's construction site. Those 80 books they dug up — I buried them." } },
        ],
        clue: { zh: "慕总监交代：平台从无真实盈利，全靠借新还旧维持资金池；埋账本是奉鲍总之命——他是做账和埋账的手，不是设局的人。", en: "CFO Mu confessed: no real profits ever — the cash pool survived on new-for-old money, and the ledgers were buried on Chairman Bao's orders. He was the hand that cooked and buried the books, not the one who built the trap." },
      },
      {
        id: "tong",
        dialog: [
          { who: "tong", text: { zh: "我是销售冠军，一年卖出 9 个亿。话术是公司统一培训的：「国资背景」「电视台都在播」「跑得了和尚跑不了庙」。", en: "I was top seller — 900 million in one year. The pitch was standard company training: 'state backing', 'it's on national TV', 'a temple this big can't run away'." } },
          { who: "tong", text: { zh: "提成 3 个点。可我自己也信了啊——我把自己 50 万积蓄和我妈的 30 万都投进去了，现在一分都取不出来。", en: "My commission was 3%. But I believed it myself — I put in my own 500k savings and my mother's 300k. Now I can't withdraw a cent." } },
          { who: "tong", text: { zh: "底层资产？培训的时候问过。经理说：「你只管卖，资产的事总部有人管。」", en: "The underlying assets? I asked in training. The manager said: 'You just sell. Headquarters handles the assets.'" } },
        ],
        clue: { zh: "佟金牌按话术卖出 9 个亿，但自己和母亲的 80 万也埋在里面——被骗局雇佣、又被骗局吞掉的推销员，不是设局者。", en: "Top Seller Tong moved 900 million on scripted pitches — with his own and his mother's 800k buried inside. Hired by the scam, then swallowed by it. Not the architect." },
      },
      {
        id: "hua",
        dialog: [
          { who: "hua", text: { zh: "我就是接了个代言。8000 万，念了三句广告词：「鑫富宝，安心宝，财富稳稳涨」。", en: "I took an endorsement deal. 80 million, three lines of copy: 'XinFuBao, peace of mind, wealth that steadily grows.'" } },
          { who: "hua", text: { zh: "资质？经纪人说平台证照齐全，还上过财经频道。我一个演员，怎么核实金融产品？", en: "Due diligence? My agent said the licenses were complete and it had been on the finance channel. I'm an actress — how do I verify a financial product?" } },
          { who: "hua", text: { zh: "现在骂我的人比骂鲍总的还多。代言费我退，官司我认。但设局的不是我。", en: "These days more people curse me than curse Chairman Bao. I'll return the fee, I'll face the lawsuits. But I didn't build the trap." } },
        ],
        clue: { zh: "华姐收 8000 万代言费为骗局镀了金，未尽核实义务要担责——但她接触不到资金池，也不知道底层资产是空的。", en: "Sister Hua's 80-million endorsement gilded the scam, and she'll answer for skipping due diligence — but she never touched the cash pool, nor knew the assets were hollow." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "看清这台机器：壳公司造「资产」，资金池收钱，新钱付旧息，明星镀金，销售扩散——而唯一知道全貌、唯一花掉这些钱的，只有一个人。", en: "See the machine whole: shell companies forge 'assets', the cash pool takes the money, new money pays old interest, a star gilds it, sellers spread it — and only one person saw the whole picture and spent the money." } },
      { who: "k", text: { zh: "庞氏骗局的定义只有一句话：收益不来自资产，来自下一个投资人的本金。指认设局的人。", en: "A Ponzi scheme is defined in one sentence: returns come not from assets, but from the next investor's principal. Name the architect." } },
    ],
    culprit: "bao",
    win: [
      { who: "k", text: { zh: "没错。鲍总用同一批公章造出 95% 的假借款人，700 亿在资金池里转了一圈：一半付利息稳住人心，一半变成游艇、庄园和埋进地下的账本。", en: "Correct. Chairman Bao forged 95% of the borrowers with one batch of seals. 70 billion cycled through the pool: half paid interest to keep the faith, half became yachts, estates, and ledgers buried underground." } },
      { who: "k", text: { zh: "识别庞氏骗局的三个信号：保本保息的承诺、看不见的底层资产、只进不出的资金池。三样占齐，跑！", en: "Three signals of a Ponzi: guaranteed principal and interest, invisible underlying assets, a cash pool that only takes in. All three present — run!" } },
      { who: "k", text: { zh: "记住这一课：无风险利率只有 2-3%。收益率超过 6% 要打问号，超过 8% 很危险，超过 10%——就要做好损失全部本金的准备。", en: "Remember the lesson: the risk-free rate is 2-3%. Above 6%, raise an eyebrow; above 8%, danger; above 10% — prepare to lose every cent of principal." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。做账的、卖单的、念广告的都是机器的零件。想想：钱最后变成了谁的游艇？账本埋在谁小舅子的工地？", en: "Wrong. The bookkeeper, the seller, the ad reader — parts of the machine. Think: whose yacht did the money become? Whose brother-in-law's site hid the ledgers?" } },
    ],
  },
  {
    id: "spoofing",
    title: { zh: "第九案 · 幽灵买单", en: "Case 9 · The Phantom Bids" },
    desc: { zh: "每天尾盘，买一到买五突然堆起巨量买单，股价应声上涨——可这些买单在成交前总会凭空消失。", en: "Every day near the close, massive bids pile onto the order book and the price jumps — yet the bids always vanish before they can fill." },
    award: { zh: "幌骗终结者", en: "Spoof Buster" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      zhen: { name: { zh: "甄总监", en: "Director Zhen" }, color: "--down" },
      mao: { name: { zh: "毛做市", en: "Mao the Market Maker" }, color: "--ma5" },
      yue: { name: { zh: "岳大户", en: "Whale Yue" }, color: "--up" },
      he: { name: { zh: "何工", en: "Engineer He" }, color: "--ma20" },
    },
    intro: [
      { who: "k", text: { zh: "「久禾科技」，一只平平无奇的中盘股。但最近二十个交易日，它的尾盘出了怪事。", en: "'Jiuhe Tech', an unremarkable mid-cap. But for twenty sessions now, strange things have happened at the close." } },
      { who: "k", text: { zh: "每天 14:40 之后，买一到买五突然堆起几千万的买单。散户一看：大资金进场了！追。股价被推高 2-3%。", en: "Every day after 14:40, tens of millions in bids stack up on the book. Retail sees it: big money is in! They chase. The price gets pushed up 2-3%." } },
      { who: "k", text: { zh: "可交易所数据显示：这些巨量买单的撤单率高达 99.7%——几乎一股都没真正买入。而第二天，股价总是低开。", en: "Yet exchange data shows a 99.7% cancellation rate on those giant bids — almost not a single share was actually bought. And the next day, the stock always opens lower." } },
      { who: "k", text: { zh: "有人在挂假单画图，引人接盘。这叫「幌骗」(Spoofing)。四个嫌疑人，链上数据不会撒谎。开始吧。", en: "Someone is painting the tape with fake orders, luring buyers in. It's called spoofing. Four suspects — the order data doesn't lie. Begin." } },
    ],
    suspects: [
      {
        id: "zhen",
        dialog: [
          { who: "zhen", text: { zh: "我是量化私募的交易总监。挂单撤单是算法的正常行为——行情变了，撤单调仓，天经地义。", en: "I'm the trading director of a quant fund. Placing and canceling orders is normal algorithmic behavior — conditions change, orders adjust. Perfectly routine." } },
          { who: "zhen", text: { zh: "99.7% 的撤单率怎么了？高频策略的撤单率本来就高。你们不懂技术就不要指手画脚。", en: "So what if the cancel rate is 99.7%? High-frequency strategies cancel most orders by design. Don't lecture me on technology you don't understand." } },
          { who: "zhen", text: { zh: "至于我们同时在卖出……组合再平衡而已。买卖两边都有单，很正常。", en: "As for our simultaneous selling... portfolio rebalancing, that's all. Orders on both sides of the book — completely normal." } },
        ],
        clue: { zh: "交易所定位：巨量买单全部来自甄总监名下的算法账户，且挂单价永远比买一低一档——刚好显示在盘口、又永远轮不到成交。同一时段，他的另一账户在卖一持续真实卖出。", en: "The exchange traced every phantom bid to Director Zhen's algo account — always one tick below the best bid: visible on the book, never first in line to fill. In the same minutes, his other account was genuinely selling at the ask." },
      },
      {
        id: "mao",
        dialog: [
          { who: "mao", text: { zh: "我是持牌做市商。我的职责就是双边挂单，给市场提供流动性——买卖两边都有我的单子，这是义务，不是嫌疑。", en: "I'm a licensed market maker. My job is quoting both sides — providing liquidity. Orders on both sides of my book are an obligation, not a crime." } },
          { who: "mao", text: { zh: "我的挂单是对称的：买卖各五档，每档数量差不多，全天稳定。尾盘那种单边几千万的堆单，不是做市行为。", en: "My quotes are symmetric: five levels each side, similar size, steady all day. A one-sided tens-of-millions pile at the close is not market making." } },
          { who: "mao", text: { zh: "说实话，那个幽灵买单害我亏了钱——我的算法把它当成真实需求，调高了报价。", en: "Honestly, those phantom bids cost me money — my algorithm read them as real demand and lifted my quotes." } },
        ],
        clue: { zh: "毛做市全天双边对称报价、单笔数量小且成交率正常，是幌骗的受害者之一——做市商的挂单模式和幌骗完全相反。", en: "Mao quoted symmetrically all day in small clips with a normal fill rate — one of the spoof's victims. A market maker's order pattern is the exact opposite of a spoofer's." },
      },
      {
        id: "yue",
        dialog: [
          { who: "yue", text: { zh: "我确实撤过单。上周挂了三笔大买单又撤了——因为我盯着盘口，看见那堆巨量买单，觉得有大资金抢筹，想挂高一点。", en: "I did cancel some orders. Three big bids last week — because I was watching the book, saw that giant pile of bids, figured big money was accumulating, and wanted to bid higher." } },
          { who: "yue", text: { zh: "后来我真金白银买进去了 2000 万，现在套着 8 个点。我是被那些假单骗进来的！", en: "Then I actually bought in — 20 million of real money. I'm down 8% now. Those fake bids lured me in!" } },
          { who: "yue", text: { zh: "我的撤单是改价重挂，撤一笔挂一笔，最后都成交了。跟那种挂了就跑的不一样。", en: "My cancels were re-pricing — cancel one, place another, and every one eventually filled. Nothing like orders placed only to vanish." } },
        ],
        clue: { zh: "岳大户撤单 3 笔但随后全部真实成交、实际买入 2000 万并被套——有真实交易意图的改单，和只挂不买的幌骗有本质区别。", en: "Whale Yue canceled three orders but re-placed and filled every one, ending up 20 million long and underwater — re-pricing with genuine intent to trade is fundamentally different from bids never meant to fill." },
      },
      {
        id: "he",
        dialog: [
          { who: "he", text: { zh: "我是交易所监察系统的工程师。是我先发现异常的：同一账户组，连续 20 天在 14:40-14:55 挂撤巨量买单。", en: "I'm an engineer on the exchange surveillance system. I flagged it first: the same account group, twenty straight days, placing and pulling giant bids between 14:40 and 14:55." } },
          { who: "he", text: { zh: "模式高度机械：挂单后平均存活 11 秒，从不成交；撤单后 3 秒内，关联账户在对手方向卖出。", en: "The pattern is machine-regular: bids live 11 seconds on average, never fill; within 3 seconds of each cancel, a linked account sells into the strength." } },
          { who: "he", text: { zh: "完整的账户对照表和时间戳我都带来了。谁的账户，一查便知。", en: "I've brought the full account mapping and timestamps. Whose accounts they are — one look will tell you." } },
        ],
        clue: { zh: "何工提供了关键证据链：幽灵买单存活 11 秒从不成交，撤单 3 秒内关联账户反向卖出——挂单方向和真实交易方向相反，正是幌骗的铁证。", en: "Engineer He supplied the key evidence: phantom bids lived 11 seconds and never filled, and within 3 seconds of each cancel a linked account sold the other way — orders opposite to the real trading direction, the signature of spoofing." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "把证据串起来：巨量买单只在尾盘出现、永远差一档不成交、11 秒撤单、撤后 3 秒关联账户反向卖出——挂单是画给你看的，卖出才是真实目的。", en: "String the evidence together: giant bids only at the close, always one tick from filling, canceled in 11 seconds, followed 3 seconds later by selling from a linked account — the bids were painted for your eyes; the selling was the real business." } },
      { who: "k", text: { zh: "幌骗的定义：以诱导他人交易为目的挂单、且无成交意图。谁的账户在挂假单、又在真卖出？指认他。", en: "Spoofing defined: placing orders to lure others into trading, with no intent to fill. Whose account posted the fake bids while genuinely selling? Name them." } },
    ],
    culprit: "zhen",
    win: [
      { who: "k", text: { zh: "正确。甄总监的算法账户挂出 99.7% 撤单率的幽灵买单，制造抢筹假象拉高股价，另一账户则在高位持续出货——教科书级的幌骗。", en: "Correct. Director Zhen's algo account posted phantom bids with a 99.7% cancel rate to fake a buying frenzy, while his other account distributed into the strength — textbook spoofing." } },
      { who: "k", text: { zh: "记住幌骗三要素：巨量挂单吸引眼球、无成交意图（撤单率极高、永远差一档）、真实交易在反方向。三样齐了，盘口就是画出来的。", en: "Remember the three marks of a spoof: eye-catching size, no intent to fill (extreme cancel rate, always a tick away), and real trading on the opposite side. All three present — the order book is a painting." } },
      { who: "k", text: { zh: "这一课：盘口挂单可以撤，成交记录不会骗人。判断资金方向，看真实成交，不看挂单表演。", en: "The lesson: orders can be canceled; the tape of actual fills cannot lie. To read the money's direction, watch real transactions, not order-book theater." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。再看一遍数据：谁的挂单从不成交？谁在撤单之后 3 秒真实卖出？对称报价的、改价成交的、提供证据的，都不是画图的人。", en: "Wrong. Look at the data again: whose bids never filled? Who sold for real 3 seconds after each cancel? The symmetric quoter, the re-pricer who filled, the one who brought the evidence — none of them painted the tape." } },
    ],
  },
  {
    id: "shortrumor",
    title: { zh: "第十案 · 匿名做空报告", en: "Case 10 · The Anonymous Short Report" },
    desc: { zh: "一份匿名做空报告让「恒芯半导体」单日暴跌 25%。报告里的银行流水截图，后来被证明是 PS 的。", en: "An anonymous short report crashed 'Hengxin Semi' 25% in a day. The bank statements in it were later proven photoshopped." },
    award: { zh: "谣言粉碎机", en: "Rumor Crusher" },
    roles: {
      k: { name: { zh: "老K", en: "Master K" }, color: "--accent" },
      kang: { name: { zh: "康总", en: "CEO Kang" }, color: "--up" },
      bai: { name: { zh: "白析师", en: "Analyst Bai" }, color: "--ma5" },
      wen: { name: { zh: "温博主", en: "Blogger Wen" }, color: "--ma20" },
      zheng: { name: { zh: "郑前总", en: "Ex-CFO Zheng" }, color: "--down" },
    },
    intro: [
      { who: "k", text: { zh: "周二早上 9:15，一份 87 页的匿名报告在网上炸开：《恒芯半导体：一场精心包装的骗局》，指控其虚增收入 40%。", en: "Tuesday, 9:15 a.m. An 87-page anonymous report detonated online: 'Hengxin Semi: A Carefully Packaged Fraud', alleging 40% inflated revenue." } },
      { who: "k", text: { zh: "报告有模有样：内部邮件、银行流水截图、离职员工「实名」爆料。开盘后股价直线跳水，收盘暴跌 25%，市值蒸发 300 亿。", en: "It looked convincing: internal emails, bank statement screenshots, 'named' whistleblowers. The stock went straight down at the open — minus 25% by the close, 30 billion in market cap gone." } },
      { who: "k", text: { zh: "三天后，银行出具证明：报告里的流水截图是伪造的，PS 痕迹明显。但股价再也没回去。", en: "Three days later the bank certified it: the statement screenshots were forged — obvious edit traces. But the price never came back." } },
      { who: "k", text: { zh: "先说清楚一件事：看空、做空本身是合法的。但「编造虚假信息 + 提前建仓交易」是操纵市场。谁造的谣？开始吧。", en: "First, be clear: bearish views and short selling are legal. But 'fabricating false information + trading on it beforehand' is market manipulation. Who forged the report? Begin." } },
    ],
    suspects: [
      {
        id: "kang",
        dialog: [
          { who: "kang", text: { zh: "我是最大的受害者！我的身家全在公司股票里，跌 25% 我账面损失几十亿！", en: "I'm the biggest victim here! My entire net worth is in company stock — that 25% cost me billions on paper!" } },
          { who: "kang", text: { zh: "有人说我「自导自演砸盘吸筹」？我倒是想问：暴跌当天我一股都没买——增持公告是一周后才发的，那是护盘！", en: "Some say I 'staged it to buy back cheap'? Then explain: I bought nothing on crash day — the buyback notice came a week later. That was defending the stock!" } },
          { who: "kang", text: { zh: "报告里的「内部邮件」格式是三年前的旧模板，现在公司邮件早就换系统了。这说明写报告的人离开公司很久了。", en: "The 'internal emails' in the report use a template from three years ago — we changed systems long since. Whoever wrote it left the company years ago." } },
        ],
        clue: { zh: "康总在暴跌当天及前后均无卖出或买入记录，损失真实存在；他指出的线索很关键——报告用的内部模板是三年前的旧版。", en: "CEO Kang neither bought nor sold around the crash, and his losses are real. His observation matters: the report's internal template is the three-year-old version." },
      },
      {
        id: "bai",
        dialog: [
          { who: "bai", text: { zh: "我是职业做空研究员，确实发过看空恒芯的报告——署名的、上个月、目标价下调 20%，逻辑是行业库存周期。", en: "I'm a professional short-side researcher, and yes, I published a bearish note on Hengxin — signed, last month, 20% price-target cut, based on the industry inventory cycle." } },
          { who: "bai", text: { zh: "我做空前公开披露持仓，报告里每个数据都有出处。这是合法的做空研究，跟那份 PS 流水的匿名报告是两回事。", en: "I disclose my short positions before publishing, and every number in my work is sourced. That's legitimate short research — nothing like an anonymous report with photoshopped statements." } },
          { who: "bai", text: { zh: "说难听点，那份假报告砸了我们全行业的招牌。以后谁还信真正的做空研究？", en: "Frankly, that fake report wrecked the reputation of my whole profession. Who will trust real short research now?" } },
        ],
        clue: { zh: "白析师的看空报告实名、注明持仓、数据有出处——合法做空研究的三个特征齐全；匿名报告发布时段他的持仓没有变动。", en: "Analyst Bai's bearish note was signed, position-disclosed, and fully sourced — all three marks of legitimate short research. His positions didn't move when the anonymous report dropped." },
      },
      {
        id: "wen",
        dialog: [
          { who: "wen", text: { zh: "我就是转发了一下！报告又不是我写的，我一个财经博主，看到猛料当然要第一时间发给粉丝。", en: "I only reposted it! I didn't write the report — I'm a finance blogger, of course I push hot material to my followers first." } },
          { who: "wen", text: { zh: "好吧……转发那条我收了 20 万「推广费」。钱是一家离岸公司打的，对接人只有一个微信号，现在已经注销了。", en: "Fine... I took 200k in 'promotion fees' for that repost. Paid by an offshore company; my only contact was a chat account that's since been deleted." } },
          { who: "wen", text: { zh: "但我只负责扩散！报告的内容、里面的流水截图，我碰都没碰过。我发的时候它已经在网上了。", en: "But I only amplified it! The content, the bank screenshots — I never touched them. It was already online when I posted." } },
        ],
        clue: { zh: "温博主收 20 万推广费扩散谣言、要承担传播责任，但资金来自离岸壳公司、报告发布前他并不知情——他是喇叭，不是写手。", en: "Blogger Wen took 200k from an offshore shell to amplify the rumor and will answer for spreading it — but he knew nothing before publication. He was the megaphone, not the author." },
      },
      {
        id: "zheng",
        dialog: [
          { who: "zheng", text: { zh: "我三年前从恒芯离职，跟公司早没有往来。看空报告？网上那么多人看空，怎么就查到我头上？", en: "I left Hengxin three years ago — no contact since. The short report? Half the internet is bearish, why come to me?" } },
          { who: "zheng", text: { zh: "旧邮件模板？离职员工谁手里没几封旧邮件。这能说明什么？", en: "The old email template? Every ex-employee has old emails lying around. What does that prove?" } },
          { who: "zheng", text: { zh: "我表弟的账户融券卖出？他成年人，自己炒股，跟我有什么关系。时间巧合而已。", en: "My cousin's account selling short? He's a grown man trading his own money. Nothing to do with me. A coincidence of timing." } },
        ],
        clue: { zh: "报告内嵌文档的作者信息指向郑前总的旧笔记本；他表弟的账户在报告发布前两天融券卖出 8000 万，发布当天全部买券还券平仓获利离场。", en: "Metadata in the report's embedded files points to Ex-CFO Zheng's old laptop. Two days before publication, his cousin's account shorted 80 million via margin — and covered the entire position at a profit on crash day." },
      },
    ],
    finale: [
      { who: "k", text: { zh: "整理时间线：报告用三年前的内部模板和旧笔记本写成，发布前两天关联账户融券建空仓，发布当天暴跌平仓获利，离岸壳公司花钱雇喇叭扩散。", en: "The timeline: a report written on an old laptop with a three-year-old internal template; a linked account building a short via margin two days before release; the position covered at a profit on crash day; an offshore shell paying the megaphone." } },
      { who: "k", text: { zh: "记住：看空是权利，造谣是犯罪。编造虚假信息 + 提前反向建仓 = 操纵市场。谁既写了假报告、又赚了这笔钱？", en: "Remember: a bearish view is a right; fabrication is a crime. False information plus a pre-built opposite position equals market manipulation. Who wrote the fake and pocketed the profit?" } },
    ],
    culprit: "zheng",
    win: [
      { who: "k", text: { zh: "正确。郑前总用离职时带走的旧模板和旧邮件伪造「内幕材料」，PS 银行流水，提前让表弟的账户融券做空 8000 万，一份假报告净赚两千万。", en: "Correct. Ex-CFO Zheng forged 'insider material' from templates and emails he took when he left, photoshopped the bank statements, and had his cousin's account short 80 million in advance — one fake report, 20 million in profit." } },
      { who: "k", text: { zh: "分清两件事：白析师那样实名、披露持仓、数据有出处的看空研究是市场的免疫系统；匿名、造假、藏仓位的「报告」是投毒。", en: "Keep two things apart: signed, position-disclosed, fully sourced short research like Analyst Bai's is the market's immune system; anonymous, forged, position-hiding 'reports' are poison." } },
      { who: "k", text: { zh: "这一课：遇到惊悚报告先查三样——作者是否实名、证据可否验证、发布前有没有异常空单。三样都不过关的，先别急着割肉。", en: "The lesson: when a shock report drops, check three things — is the author named, can the evidence be verified, were there unusual short positions beforehand. If all three fail, don't rush to sell at the bottom." } },
    ],
    lose: [
      { who: "k", text: { zh: "不对。想想谁「既有旧模板、又有动机、还提前建了空仓」。真受害的、实名看空的、收钱转发的，都构不成完整的证据链。", en: "Wrong. Think: who had the old template, the motive, AND the pre-built short position? The real victim, the signed bear, the paid reposter — none of them completes the chain of evidence." } },
    ],
  },
];

const CASE_XP_FIRST = 200;
const CASE_XP_REPLAY = 30;
const TEACH_XP_FIRST = 100;
const TEACH_XP_REPLAY = 20;
const FAMOUS_XP_FIRST = 150;
const FAMOUS_XP_REPLAY = 30;

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = "";
}

const story = { def: null, queue: [], step: 0, onDone: null, interviewed: [], finaleDone: false, accusing: false, wrongIds: [], timer: null };

// 调查进度断点: 按剧本 id 存 localStorage, 中途退出可续查
const CASE_RUN_KEY = "qs_case_run";

function loadCaseRuns() {
  try {
    return JSON.parse(localStorage.getItem(CASE_RUN_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveCaseRun() {
  if (!story.def || !story.interviewed.length) return;
  try {
    const runs = loadCaseRuns();
    runs[story.def.id] = { interviewed: story.interviewed, finaleDone: story.finaleDone, accusing: story.accusing, wrongIds: story.wrongIds };
    localStorage.setItem(CASE_RUN_KEY, JSON.stringify(runs));
  } catch (e) { /* 隐私模式下忽略 */ }
}

function clearCaseRun(id) {
  try {
    const runs = loadCaseRuns();
    delete runs[id];
    localStorage.setItem(CASE_RUN_KEY, JSON.stringify(runs));
  } catch (e) { /* 隐私模式下忽略 */ }
}

function addClueLine(s) {
  const li = document.createElement("li");
  li.innerHTML = linkifyTerms(pick(s.clue));
  $("story-clues").appendChild(li);
}

function openCase(idx) {
  const def = CASES[idx];
  story.def = def;
  story.interviewed = [];
  story.finaleDone = false;
  story.accusing = false;
  story.wrongIds = [];
  $("story-title").textContent = pick(def.title);
  $("story-result").hidden = true;
  $("btn-story-finish").hidden = true;
  $("btn-story-accuse").hidden = true;
  $("story-hub").hidden = true;
  $("story-clues").innerHTML = "";
  openModal("story-modal");

  const saved = loadCaseRuns()[def.id];
  if (saved && Array.isArray(saved.interviewed) && saved.interviewed.length) {
    story.interviewed = def.suspects.map((s) => s.id).filter((id) => saved.interviewed.includes(id));
    def.suspects.forEach((s) => {
      if (story.interviewed.includes(s.id)) addClueLine(s);
    });
    story.finaleDone = !!saved.finaleDone && story.interviewed.length >= def.suspects.length;
    story.accusing = !!saved.accusing && story.finaleDone;
    const ids = def.suspects.map((s) => s.id);
    story.wrongIds = Array.isArray(saved.wrongIds) ? saved.wrongIds.filter((id) => ids.includes(id)) : [];
    toast(t("story.resumeMsg"));
    if (story.interviewed.length >= def.suspects.length && !story.finaleDone) {
      story.finaleDone = true;
      runStory(def.finale, enterHub);
    } else {
      enterHub();
    }
  } else {
    runStory(def.intro, enterHub);
  }
}

function closeStory() {
  clearInterval(story.timer);
  closeModal("story-modal");
  renderCases();
}

function runStory(lines, onDone) {
  story.queue = lines;
  story.step = 0;
  story.onDone = onDone;
  $("story-dialog").hidden = false;
  $("btn-story-next").hidden = false;
  $("story-hub").hidden = true;
  showStoryLine();
}

function showStoryLine() {
  const line = story.queue[story.step];
  const role = story.def.roles[line.who];
  const name = pick(role.name);
  $("story-name").textContent = name;
  const avatar = $("story-avatar");
  avatar.textContent = name.charAt(0);
  avatar.style.background = cssVar(role.color);
  typeInto($("story-text"), pick(line.text), story);
}

$("btn-story-next").addEventListener("click", () => {
  const full = pick(story.queue[story.step].text);
  // 打字未完时先补全整句, 再点才翻页
  if ($("story-text").textContent.length < full.length) {
    clearInterval(story.timer);
    $("story-text").innerHTML = linkifyTerms(full);
    return;
  }
  if (story.step >= story.queue.length - 1) {
    const fn = story.onDone;
    story.onDone = null;
    if (fn) fn();
    return;
  }
  story.step++;
  showStoryLine();
});

function enterHub() {
  $("story-dialog").hidden = true;
  $("btn-story-next").hidden = true;
  $("story-hub").hidden = false;
  $("story-hub-hint").textContent = t(story.accusing ? "story.accuseWho" : "story.hubHint");
  renderSuspects();
  const btn = $("btn-story-accuse");
  btn.hidden = story.accusing;
  btn.disabled = !story.finaleDone;
  btn.title = story.finaleDone ? "" : t("story.needAll");
  saveCaseRun();
}

function renderSuspects() {
  const wrap = $("story-suspects");
  wrap.innerHTML = "";
  story.def.suspects.forEach((s) => {
    const role = story.def.roles[s.id];
    const done = story.interviewed.includes(s.id);
    const excluded = story.accusing && story.wrongIds.includes(s.id);
    const btn = document.createElement("button");
    btn.className = "suspect-btn" + (done && !story.accusing ? " done" : "") + (story.accusing ? " accuse-mode" : "");
    btn.disabled = excluded;
    const dot = document.createElement("span");
    dot.className = "suspect-dot";
    dot.style.background = cssVar(role.color);
    const label = document.createElement("span");
    let name = pick(role.name);
    if (excluded) name += " · " + t("story.excluded");
    else if (done && !story.accusing) name += " · " + t("story.interviewed");
    label.textContent = name;
    btn.append(dot, label);
    btn.addEventListener("click", () => (story.accusing ? accuseSuspect(s.id) : interview(s)));
    wrap.appendChild(btn);
  });
}

function interview(s) {
  runStory(s.dialog, () => {
    if (!story.interviewed.includes(s.id)) {
      story.interviewed.push(s.id);
      addClueLine(s);
      saveCaseRun();
    }
    if (!story.finaleDone && story.interviewed.length >= story.def.suspects.length) {
      story.finaleDone = true;
      runStory(story.def.finale, enterHub);
    } else {
      enterHub();
    }
  });
}

$("btn-story-accuse").addEventListener("click", () => {
  if (!story.finaleDone) return;
  story.accusing = true;
  $("btn-story-accuse").hidden = true;
  $("story-hub-hint").textContent = t("story.accuseWho");
  renderSuspects();
  saveCaseRun();
});

function accuseSuspect(id) {
  if (id === story.def.culprit) {
    runStory(story.def.win, finishCase);
    return;
  }
  // 指错不清局: 排除该嫌疑人, 回到指认现场继续, 但首破奖励打折
  if (!story.wrongIds.includes(id)) story.wrongIds.push(id);
  saveCaseRun();
  runStory(story.def.lose, enterHub);
}

function finishCase() {
  $("story-dialog").hidden = true;
  $("btn-story-next").hidden = true;
  $("story-hub").hidden = true;
  const result = $("story-result");
  clearCaseRun(story.def.id);
  const first = !prog.cases.includes(story.def.id);
  if (first) {
    prog.cases.push(story.def.id);
    saveProg();
  }
  const xp = first ? Math.max(60, CASE_XP_FIRST - 70 * story.wrongIds.length) : CASE_XP_REPLAY;
  addXp(xp);
  let text = t("story.winMsg") + " " + t("play.xpGain", xp);
  if (story.def.award) awardTitle(story.def.award);
  awardBadge("case_1");
  if (prog.cases.length >= CASES.length) awardBadge("case_all");
  renderCases();
  renderProfile();
  burstConfetti();
  result.textContent = text;
  result.className = "play-result win";
  result.hidden = false;
  $("btn-story-finish").hidden = false;
}

function renderCases() {
  const cleared = CASES.map((c, i) => (prog.cases.includes(c.id) ? i : -1)).filter((i) => i >= 0);
  renderLevelCards("case-levels", CASES, cleared, false, "case");
  const runs = loadCaseRuns();
  CASES.forEach((c, i) => {
    const run = runs[c.id];
    if (!run || !Array.isArray(run.interviewed) || !run.interviewed.length) return;
    const btn = $("case-levels").children[i].querySelector("button");
    if (btn) btn.textContent = t("story.resume");
  });
}

$("btn-story-finish").addEventListener("click", closeStory);
$("btn-story-close").addEventListener("click", closeStory);
$("story-modal").addEventListener("click", (e) => {
  if (e.target === $("story-modal")) closeStory();
});

// ---------- 实战关卡引擎 (教学关 + 名场面共用) ----------

const PLAY_INIT_CASH = 100000;
let playChart = null;

const play = {
  kind: "teach", idx: 0, def: null, data: [],
  visible: 0, cash: 0, shares: 0,
  peak: 0, maxDd: 0, trades: [], done: false,
};

function buildKlineOption(candles, visible, showMa, trades) {
  const view = candles.slice(0, visible);
  const cats = view.map((c) => "D" + c.day);
  const values = view.map((c) => [c.open, c.close, c.low, c.high]);
  const series = [{
    type: "candlestick",
    data: values,
    itemStyle: {
      color: "transparent",
      color0: COLORS.down,
      borderColor: COLORS.up,
      borderColor0: COLORS.down,
      borderWidth: 1.5,
    },
    markPoint: trades && trades.length ? {
      data: trades.filter((tr) => tr.idx < visible).map((tr) => ({
        coord: [tr.idx, candles[tr.idx].low],
        value: tr.type === "BUY" ? "B" : "S",
        symbol: "pin",
        symbolSize: 28,
        symbolOffset: [0, "50%"],
        itemStyle: { color: tr.type === "BUY" ? COLORS.up : COLORS.down },
        label: { color: "#fff", fontSize: 11 },
      })),
    } : undefined,
  }];
  if (showMa) {
    for (const [n, color] of [[5, COLORS.ma5], [20, COLORS.ma20]]) {
      series.push({
        type: "line",
        name: "MA" + n,
        data: view.map((c, i) => maAt(candles, n, i)),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.2, color },
      });
    }
  }
  return {
    animation: false,
    grid: { left: 52, right: 16, top: 18, bottom: 26 },
    xAxis: { type: "category", data: cats, axisLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
    yAxis: { scale: true, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel: { color: cssVar("--text-muted"), fontSize: 10 } },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    series,
  };
}

function playPrice() {
  return play.data[play.visible - 1].close;
}

function playAssets() {
  return play.cash + play.shares * playPrice();
}

function openPlay(kind, idx) {
  const def = kind === "teach" ? TEACH_LEVELS[idx] : FAMOUS_LEVELS[idx];
  const dialog = LEVEL_DIALOGS[def.seed];
  playCutscene(dialog ? pick(dialog) : [], () => reallyOpenPlay(kind, idx, def));
}

function reallyOpenPlay(kind, idx, def) {
  play.kind = kind;
  play.idx = idx;
  play.def = def;
  play.data = genCandles(def.seed, def.segments);
  play.visible = def.startVisible + (hasGear("fan") ? 3 : 0);
  play.cash = PLAY_INIT_CASH;
  play.shares = 0;
  play.peak = PLAY_INIT_CASH;
  play.maxDd = 0;
  play.trades = [];
  play.done = false;

  $("play-title").textContent = pick(def.title);
  $("play-story").innerHTML = linkifyTerms(pick(def.story));
  $("play-result").hidden = true;
  $("play-mentor").hidden = true;
  $("btn-play-finish").hidden = true;
  $("btn-play-buy").hidden = false;
  $("btn-play-sell").hidden = false;
  $("btn-play-next").hidden = false;
  openModal("play-modal");

  if (!playChart) playChart = echarts.init($("play-chart"));
  playChart.resize();
  refreshPlay();
  showPlayHint();
}

function closePlay() {
  closeModal("play-modal");
}

function refreshPlay() {
  playChart.setOption(buildKlineOption(play.data, play.visible, play.def.showMa, play.trades), true);
  $("play-day").textContent = t("play.dayFmt", play.visible, play.data.length);
  $("play-cash").textContent = fmtMoney(play.cash);
  $("play-shares").textContent = String(play.shares);
  const assets = playAssets();
  $("play-assets").textContent = fmtMoney(assets);
  const ret = assets / PLAY_INIT_CASH - 1;
  const el = $("play-return");
  el.textContent = fmtPct(ret);
  el.className = ret >= 0 ? "pos" : "neg";
  $("btn-play-buy").disabled = play.done || play.cash < playPrice();
  $("btn-play-sell").disabled = play.done || play.shares <= 0;
  $("btn-play-next").disabled = play.done;
}

function showPlayHint() {
  const hint = play.def.hints && play.def.hints[play.visible];
  const el = $("play-hint");
  if (hint) {
    el.innerHTML = linkifyTerms(pick(hint));
    el.hidden = false;
    if (!REDUCED_MOTION) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
  } else {
    el.hidden = true;
  }
}

function playBuy() {
  const price = playPrice();
  const qty = Math.floor(play.cash / price);
  if (qty <= 0 || play.done) return;
  play.cash = +(play.cash - qty * price).toFixed(2);
  play.shares += qty;
  play.trades.push({ idx: play.visible - 1, type: "BUY" });
  awardBadge("first_trade");
  toast(t("play.bought", qty, price.toFixed(2)));
  refreshPlay();
}

function playSell() {
  if (play.shares <= 0 || play.done) return;
  const price = playPrice();
  const gain = play.shares * price;
  play.cash = +(play.cash + gain).toFixed(2);
  play.shares = 0;
  play.trades.push({ idx: play.visible - 1, type: "SELL" });
  toast(t("play.sold", fmtMoney(gain)));
  refreshPlay();
}

function playNext() {
  if (play.done) return;
  play.visible++;
  const assets = playAssets();
  if (assets > play.peak) play.peak = assets;
  const dd = 1 - assets / play.peak;
  if (dd > play.maxDd) play.maxDd = dd;
  refreshPlay();
  showPlayHint();
  if (play.visible >= play.data.length) finishPlay();
}

function goalText(goal) {
  const parts = [];
  if (goal.minReturn != null) parts.push(t("play.goalReturn", fmtPct(goal.minReturn)));
  if (goal.beatHold) parts.push(t("play.goalBeatHold"));
  if (goal.maxDrawdown != null) parts.push(t("play.goalDd", fmtPct(goal.maxDrawdown)));
  return parts.join(t("play.goalJoin"));
}

function finishPlay() {
  play.done = true;
  const def = play.def;
  const ret = playAssets() / PLAY_INIT_CASH - 1;
  const anchor = play.data[def.startVisible - 1].close;
  const holdRet = play.data[play.data.length - 1].close / anchor - 1;
  const g = def.goal;
  const pass =
    (g.minReturn == null || ret >= g.minReturn) &&
    (!g.beatHold || ret > holdRet) &&
    (g.maxDrawdown == null || play.maxDd <= g.maxDrawdown);

  let text = (pass ? t("play.win") : t("play.lose")) +
    " " + t("play.stats", fmtPct(ret), fmtPct(holdRet), fmtPct(play.maxDd)) +
    (pass ? "" : " " + t("play.goalWas", goalText(g)));

  if (pass) {
    const cleared = play.kind === "teach" ? prog.teach : prog.famous;
    const first = !cleared.includes(play.idx);
    let xp = play.kind === "teach"
      ? (first ? TEACH_XP_FIRST : TEACH_XP_REPLAY)
      : (first ? FAMOUS_XP_FIRST : FAMOUS_XP_REPLAY);
    if (hasGear("watch")) xp += 30;
    if (first) {
      cleared.push(play.idx);
      saveProg();
    }
    addXp(xp);
    text += " " + t("play.xpGain", xp);
    if (play.kind === "teach") {
      if (play.idx === 0) awardBadge("teach_1");
      if (prog.teach.length >= TEACH_LEVELS.length) awardBadge("teach_all");
      renderTeach();
    } else {
      if (def.award) awardTitle(def.award);
      awardBadge("famous_1");
      if (prog.famous.length >= FAMOUS_LEVELS.length) awardBadge("famous_all");
      renderFamous();
      const epi = LEVEL_EPILOGUES[def.seed];
      if (epi) playCutscene(pick(epi), () => {});
    }
  }

  const result = $("play-result");
  result.textContent = text;
  result.className = "play-result " + (pass ? "win" : "lose");
  result.hidden = false;
  if (pass) spawnConfetti(document.querySelector(".play-modal"));
  const pool = pick(pass ? MENTOR.win : MENTOR.lose);
  const mentor = $("play-mentor");
  mentor.innerHTML = linkifyTerms(pick(MENTOR.name) + ": " + pool[Math.floor(Math.random() * pool.length)]);
  mentor.hidden = false;
  checkGearUnlocks();
  $("play-hint").hidden = true;
  $("btn-play-buy").hidden = true;
  $("btn-play-sell").hidden = true;
  $("btn-play-next").hidden = true;
  $("btn-play-finish").hidden = false;
}

$("btn-play-buy").addEventListener("click", playBuy);
$("btn-play-sell").addEventListener("click", playSell);
$("btn-play-next").addEventListener("click", playNext);
$("btn-play-finish").addEventListener("click", closePlay);
$("btn-play-close").addEventListener("click", closePlay);
$("play-modal").addEventListener("click", (e) => {
  if (e.target === $("play-modal")) closePlay();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("cutscene").hidden) endCutscene();
  else if (!$("play-modal").hidden) closePlay();
  else if (!$("story-modal").hidden) closeStory();
  else if (!$("guide-modal").hidden) closeGuide();
});

// ---------- K线猜涨跌 ----------

const GUESS_WINDOW = 30;
const DAILY_GUESSES = 10;
let guessChart = null;
const guess = { data: [], visible: 0, score: 0, streak: 0, playing: false, waiting: false, mode: "free", dailyLeft: 0, shieldUsed: false };

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function newGuessRound() {
  const seed = Math.floor(Math.random() * 4294967295);
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  // 随机拼 2~3 段不同趋势, 让走势有可学的惯性
  const segs = [];
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    segs.push({
      days: 18 + Math.floor(rnd() * 18),
      drift: (rnd() - 0.5) * 0.02,
      vol: 0.012 + rnd() * 0.025,
    });
  }
  guess.data = genCandles(seed, segs);
  guess.visible = GUESS_WINDOW;
}

function refreshGuessChart() {
  if (!guessChart) guessChart = echarts.init($("guess-chart"));
  const from = Math.max(0, guess.visible - GUESS_WINDOW);
  const windowData = guess.data.slice(from, guess.visible).map((c, i) => ({ ...c, day: i + 1 }));
  guessChart.setOption(buildKlineOption(windowData, windowData.length, false, null), true);
}

function refreshGuessStats() {
  $("guess-score").textContent = String(guess.score);
  $("guess-streak").textContent = String(guess.streak);
  $("guess-best").textContent = String(prog.bestStreak);
  $("guess-acc").textContent = prog.guessTotal > 0
    ? fmtPct(prog.guessHit / prog.guessTotal)
    : "--";
}

function startGuess() {
  guess.playing = true;
  guess.waiting = false;
  guess.mode = "free";
  guess.score = 0;
  guess.streak = 0;
  guess.shieldUsed = false;
  newGuessRound();
  refreshGuessChart();
  refreshGuessStats();
  $("btn-guess-start").hidden = true;
  $("btn-guess-up").hidden = false;
  $("btn-guess-down").hidden = false;
  $("guess-msg").textContent = t("guess.prompt");
}

// 每日挑战: 按日期定种子, 所有人同一走势, 固定 10 次, 每天限一局
function startDaily() {
  const today = todayStr();
  if (prog.daily.date === today) {
    toast(t("guess.dailyAlready", prog.daily.score));
    return;
  }
  const seed = Number(today.replace(/-/g, ""));
  const rnd = mulberry32(seed ^ 0x51ab1e);
  const segs = [];
  for (let i = 0; i < 3; i++) {
    segs.push({ days: 15, drift: (rnd() - 0.5) * 0.02, vol: 0.012 + rnd() * 0.02 });
  }
  guess.data = genCandles(seed, segs);
  guess.visible = GUESS_WINDOW;
  guess.playing = true;
  guess.waiting = false;
  guess.mode = "daily";
  guess.dailyLeft = DAILY_GUESSES + (hasGear("coin") ? 2 : 0);
  guess.score = 0;
  guess.streak = 0;
  guess.shieldUsed = false;
  refreshGuessChart();
  refreshGuessStats();
  $("btn-guess-start").hidden = true;
  $("btn-guess-daily").hidden = true;
  $("btn-guess-up").hidden = false;
  $("btn-guess-down").hidden = false;
  $("guess-msg").textContent = t("guess.prompt") + " " + t("guess.dailyLeft", guess.dailyLeft);
}

function finishDaily(prefix) {
  guess.playing = false;
  guess.waiting = false;
  guess.mode = "free";
  prog.daily = { date: todayStr(), score: guess.score, best: Math.max(prog.daily.best || 0, guess.score) };
  prog.dailyCount = (prog.dailyCount || 0) + 1;
  saveProg();
  awardBadge("daily_first");
  if (guess.score >= 150) awardBadge("daily_150");
  addXp(30);
  checkGearUnlocks();
  $("guess-msg").textContent = prefix + " " + t("guess.dailyDone", guess.score, prog.daily.best);
  $("btn-guess-up").hidden = true;
  $("btn-guess-down").hidden = true;
  $("btn-guess-start").hidden = false;
  $("btn-guess-daily").hidden = false;
}

function makeGuess(up) {
  if (!guess.playing || guess.waiting) return;
  guess.waiting = true;
  const prev = guess.data[guess.visible - 1].close;
  const next = guess.data[guess.visible];
  guess.visible++;
  refreshGuessChart();
  const wentUp = next.close > prev;
  const movePct = fmtPct((next.close - prev) / prev);
  const correct = up === wentUp;
  prog.guessTotal++;
  let msg = t(wentUp ? "guess.wentUp" : "guess.wentDown", movePct) + " ";
  if (correct) {
    guess.streak++;
    const pts = 10 + 2 * Math.min(guess.streak, 10) + (hasGear("finger") ? 5 : 0);
    guess.score += pts;
    prog.guessHit++;
    if (guess.streak > prog.bestStreak) prog.bestStreak = guess.streak;
    addXp(5);
    if (guess.streak >= 3) awardBadge("streak_3");
    if (guess.streak >= 10) awardBadge("streak_10");
    if (prog.guessHit >= 50) awardBadge("guess_50");
    msg += t("guess.hit", pts) + (guess.streak >= 2 ? " " + t("guess.combo", guess.streak) : "");
    replayAnim($("guess-score"), "anim-pop");
    replayAnim($("guess-streak"), "anim-pop");
    const card = document.querySelector(".guess-card");
    spawnFloat(card, "score-pop pos", "+" + pts);
    if (guess.streak >= 3) spawnFloat(card, "combo-pop", t("guess.combo", guess.streak));
  } else if (hasGear("amulet") && !guess.shieldUsed) {
    guess.shieldUsed = true;
    msg += t("gear.shielded");
    replayAnim($("guess-msg"), "anim-shake");
  } else {
    guess.streak = 0;
    msg += t("guess.miss");
    replayAnim($("guess-chart"), "anim-shake");
    replayAnim($("guess-msg"), "anim-shake");
  }
  saveProg();
  refreshGuessStats();
  checkGearUnlocks();

  if (guess.mode === "daily") {
    guess.dailyLeft--;
    if (guess.dailyLeft <= 0) {
      finishDaily(msg);
      return;
    }
    msg += " " + t("guess.dailyLeft", guess.dailyLeft);
  } else if (guess.visible >= guess.data.length) {
    newGuessRound();
    refreshGuessChart();
    msg += " " + t("guess.newRound");
  }
  $("guess-msg").textContent = msg;
  guess.waiting = false;
}

$("btn-guess-start").addEventListener("click", startGuess);
$("btn-guess-daily").addEventListener("click", startDaily);
$("btn-guess-up").addEventListener("click", () => makeGuess(true));
$("btn-guess-down").addEventListener("click", () => makeGuess(false));

// ---------- 段位 / 成就渲染 ----------

function renderProfile() {
  const rank = rankOf(prog.xp);
  $("profile-level").textContent = pick(rank.name);
  const titleEl = $("profile-title");
  if (prog.titles.length) {
    const names = FAMOUS_LEVELS.concat(CASES)
      .concat((window.QUIZ_PERSONAS || []).map((p) => ({ award: p.name })))
      .filter((l) => l.award && prog.titles.includes(l.award.zh)).map((l) => pick(l.award));
    titleEl.textContent = names.join(" · ");
    titleEl.hidden = false;
  } else {
    titleEl.hidden = true;
  }
  const next = RANKS[RANKS.indexOf(rank) + 1];
  const base = rank.xp;
  const span = next ? next.xp - base : 1;
  const fillPct = next ? Math.min(100, ((prog.xp - base) / span) * 100) : 100;
  $("xp-fill").style.width = fillPct + "%";
  $("xp-text").textContent = next
    ? t("profile.xpNext", prog.xp, next.xp, pick(next.name))
    : t("profile.xpMax", prog.xp);

  const list = $("badge-list");
  list.innerHTML = "";
  BADGES.forEach((b) => {
    const got = prog.badges.includes(b.id);
    const el = document.createElement("span");
    el.className = "badge" + (got ? " got" : "");
    if (b.hidden && !got) {
      el.textContent = "???";
      el.title = t("badge.hidden");
    } else {
      el.textContent = pick(b.name);
      let tip = pick(b.desc);
      if (!got && BADGE_PROGRESS[b.id]) {
        const [cur, max] = BADGE_PROGRESS[b.id]();
        tip += " · " + t("profile.progress", cur, max);
      }
      el.title = tip;
    }
    list.appendChild(el);
  });

  const titleList = $("title-list");
  const allAwards = FAMOUS_LEVELS.map((l) => ({ level: l, kind: "famous" }))
    .concat(CASES.map((l) => ({ level: l, kind: "case" })))
    .concat((window.QUIZ_PERSONAS || []).map((p) => ({ level: { award: p.name, title: p.name }, kind: "quiz" })))
    .filter((x) => x.level.award);
  titleList.innerHTML = "";
  let gotTitles = 0;
  allAwards.forEach(({ level, kind }) => {
    const got = prog.titles.includes(level.award.zh);
    if (got) gotTitles++;
    const el = document.createElement("span");
    el.className = "badge" + (got ? " got" : "");
    el.textContent = pick(level.award);
    el.title = got
      ? pick(level.title)
      : kind === "famous" ? t("collect.fromFamous", pick(level.title))
      : kind === "case" ? t("collect.fromCase", pick(level.title))
      : t("collect.fromQuiz");
    titleList.appendChild(el);
  });
  const gotBadges = BADGES.filter((b) => prog.badges.includes(b.id)).length;
  const totalPct = Math.round(((gotBadges + gotTitles) / (BADGES.length + allAwards.length)) * 100);
  $("collect-pct").textContent = t("collect.pct", totalPct, gotBadges, BADGES.length, gotTitles, allAwards.length);
}

function renderLevelCards(wrapId, levels, cleared, sequential, kind) {
  const wrap = $(wrapId);
  wrap.innerHTML = "";
  levels.forEach((level, i) => {
    const locked = sequential && i > 0 && !cleared.includes(i - 1);
    const done = cleared.includes(i);
    const card = document.createElement("div");
    card.className = "card level-card" + (locked ? " locked" : "") + (done ? " passed" : "");
    card.style.animationDelay = (i * 70) + "ms";

    const status = document.createElement("span");
    status.className = "level-badge";
    status.textContent = done ? t("academy.passed") : locked ? t("academy.locked") : t("academy.todo");
    const h = document.createElement("h3");
    h.textContent = pick(level.title);
    const desc = document.createElement("p");
    desc.className = "hint";
    desc.innerHTML = linkifyTerms(pick(level.desc));
    const btn = document.createElement("button");
    btn.className = done ? "replay" : "primary";
    btn.textContent = done ? t("academy.retry") : locked ? t("academy.lockedBtn") : t("academy.startBtn");
    btn.disabled = locked;
    btn.addEventListener("click", () => (kind === "case" ? openCase(i) : openPlay(kind, i)));

    card.append(status, h, desc);
    if (level.award) {
      const award = document.createElement("p");
      award.className = "level-award";
      award.textContent = t("famous.award", pick(level.award));
      card.append(award);
    }
    card.append(btn);
    wrap.appendChild(card);
  });
}

function renderTeach() {
  renderLevelCards("teach-levels", TEACH_LEVELS, prog.teach, true, "teach");
}

function renderFamous() {
  renderLevelCards("famous-levels", FAMOUS_LEVELS, prog.famous, false, "famous");
  renderTimeline();
}

// ---------- 市场大事记时间线 ----------

const TIMELINE_EVENTS = [
  {
    year: 1637,
    title: { zh: "郁金香狂热", en: "Tulip Mania" },
    blurb: {
      zh: "一颗郁金香球茎的价格超过阿姆斯特丹一栋豪宅——史上第一场有记载的资产泡沫，也是此后所有泡沫的模板。",
      en: "A single tulip bulb cost more than a mansion in Amsterdam — history's first recorded asset bubble, and the template for every one since.",
    },
  },
  { year: 1929, level: 10 },
  { year: 1987, level: 6 },
  { year: 1990, level: 7 },
  { year: 1997, level: 11 },
  { year: 2000, level: 5 },
  { year: 2007, level: 8 },
  { year: 2008, level: 3 },
  { year: 2015, level: 0 },
  { year: 2016, level: 9 },
  { year: 2020, level: 4 },
  { year: 2021, level: 2 },
  { year: 2021, level: 1 },
  { year: 2022, level: 12 },
];

function renderTimeline() {
  const wrap = $("timeline");
  if (!wrap) return;
  wrap.innerHTML = "";
  TIMELINE_EVENTS.forEach((ev) => {
    const level = ev.level == null ? null : FAMOUS_LEVELS[ev.level];
    const done = level && prog.famous.includes(ev.level);
    const item = document.createElement("div");
    item.className = "tl-item" + (level ? " playable" : "") + (done ? " done" : "");
    const dot = document.createElement("span");
    dot.className = "tl-dot";
    const year = document.createElement("span");
    year.className = "tl-year";
    year.textContent = ev.year;
    const body = document.createElement("div");
    body.className = "tl-body";
    const title = document.createElement("div");
    title.className = "tl-title";
    title.textContent = level ? pick(level.title).replace(/^\d{4}\s*·\s*/, "") : pick(ev.title);
    if (done) {
      const badge = document.createElement("span");
      badge.className = "tl-badge";
      badge.textContent = t("tl.done");
      title.appendChild(badge);
    }
    const blurb = document.createElement("p");
    blurb.className = "tl-blurb";
    blurb.textContent = pick(level ? level.desc : ev.blurb);
    body.append(title, blurb);
    if (level) {
      const btn = document.createElement("button");
      btn.className = (done ? "replay" : "primary") + " tl-btn";
      btn.textContent = done ? t("academy.retry") : t("tl.play");
      btn.addEventListener("click", () => openPlay("famous", ev.level));
      body.appendChild(btn);
    }
    item.append(dot, year, body);
    wrap.appendChild(item);
  });
}

// ---------- 彩蛋 ----------

function burstConfetti() {
  if (REDUCED_MOTION) return;
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  document.body.appendChild(layer);
  spawnConfetti(layer);
  setTimeout(() => layer.remove(), 3200);
}

// 彩蛋一: 对标题连点 7 次
let titleClicks = 0;
let titleClickTimer = null;
document.querySelector("header h1").addEventListener("click", () => {
  titleClicks++;
  clearTimeout(titleClickTimer);
  titleClickTimer = setTimeout(() => { titleClicks = 0; }, 1500);
  if (titleClicks >= 7) {
    titleClicks = 0;
    awardBadge("egg_curious");
    burstConfetti();
  }
});

// 彩蛋二: 神秘按键序列
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konamiPos = 0;
document.addEventListener("keydown", (e) => {
  konamiPos = e.key === KONAMI[konamiPos] ? konamiPos + 1 : (e.key === KONAMI[0] ? 1 : 0);
  if (konamiPos >= KONAMI.length) {
    konamiPos = 0;
    awardBadge("egg_konami");
    burstConfetti();
  }
});

// ---------- 图表识读教程: 怎么看这张图 ----------
// 用一段手工挑选的演示行情 (先跌后涨再跌, 含清晰金叉与死叉) 分五步讲解 K 线 / MA5 / MA20 / 交叉信号 / 成交量

const GUIDE_SEED = 77001;
const GUIDE_SEGS = [
  { days: 22, drift: -0.008, vol: 0.012 },
  { days: 16, drift: 0.014, vol: 0.012 },
  { days: 14, drift: -0.014, vol: 0.014 },
];

const GUIDE_STEPS = [
  {
    title: { zh: "第 1 步 · 一根 K 线 = 一天", en: "Step 1 · One candle = one day" },
    text: {
      zh: "每根柱子记录一天的价格：粗的「实体」两端是开盘价和收盘价，上下伸出的细线（影线）是当天冲到过的最高价和最低价。红色空心 = 收盘比开盘高（涨），绿色实心 = 收盘比开盘低（跌）。图上标出了这段行情里涨幅和跌幅最大的两天。",
      en: "Each bar records one day: the thick body spans the open and close prices, and the thin wicks show the day's high and low. Hollow red = closed higher than it opened (up); solid green = closed lower (down). The biggest up day and down day are marked on the chart.",
    },
  },
  {
    title: { zh: "第 2 步 · MA5：短期均线，反应快", en: "Step 2 · MA5: the fast, short-term line" },
    text: {
      zh: "MA5 就是「最近 5 天收盘价的平均值」连成的线——没有任何玄学。因为只平均 5 天，它紧贴价格、拐弯快，代表短期趋势：价格站在 MA5 上方，说明最近几天偏强；跌破它，说明短期转弱。",
      en: "MA5 is simply the average of the last 5 closing prices, drawn as a line — no magic involved. Averaging only 5 days makes it hug the price and turn quickly: price above MA5 means the last few days are strong; dropping below it means short-term weakness.",
    },
  },
  {
    title: { zh: "第 3 步 · MA20：中期均线，反应慢", en: "Step 3 · MA20: the slow, mid-term line" },
    text: {
      zh: "MA20 是「最近 20 天收盘价的平均值」。平均的天数多，所以它平滑得多、拐弯慢，像大部队行进的方向，代表中期趋势。价格在 MA20 上方运行时行情整体偏强，跌到下方则偏弱——很多人把它当作多空分界线。",
      en: "MA20 averages the last 20 closes. With more days in the average it is much smoother and slower to turn — think of it as the direction of the main army, the mid-term trend. Price above MA20 = broadly strong; below = broadly weak. Many traders treat it as the bull/bear divide.",
    },
  },
  {
    title: { zh: "第 4 步 · 金叉与死叉：两条线的交点", en: "Step 4 · Golden cross & death cross" },
    text: {
      zh: "两条均线的交叉是最常用的信号：快线 MA5 从下往上穿过慢线 MA20 叫「金叉」，说明短期涨势追上了中期趋势，偏多；从上往下穿叫「死叉」，偏空。注意图中两个交叉都发生在趋势转折之后一小段——均线是滞后指标，它帮你确认趋势，但别指望用它精准抄底逃顶。",
      en: "The crossover of the two lines is the classic signal: when fast MA5 crosses above slow MA20 it's a \"golden cross\" (bullish — short-term momentum has caught up with the mid-term trend); crossing below is a \"death cross\" (bearish). Note both crosses on the chart happen a little after the actual turning points — moving averages lag. They confirm a trend; don't expect them to nail the exact top or bottom.",
    },
  },
  {
    title: { zh: "第 5 步 · 成交量：看涨跌的「底气」", en: "Step 5 · Volume: how much conviction is behind a move" },
    text: {
      zh: "下方柱状图是每天的成交量。柱子突然变高叫「放量」，说明参与的人多、分歧大：放量上涨更可信，放量下跌要警惕；柱子很矮叫「缩量」，说明大家在观望。K 线看价格、均线看趋势、成交量看人气——三样一起看，判断才立体。",
      en: "The bars at the bottom show each day's trading volume. A sudden tall bar (\"high volume\") means many participants and real disagreement: a rally on high volume is more trustworthy, a drop on high volume is a warning. Short bars mean everyone is waiting. Candles show price, MAs show trend, volume shows conviction — read all three together.",
    },
  },
];

// 每步各系列的透明度: 聚焦当前讲解对象, 其余淡化
const GUIDE_OPACITY = [
  { candle: 1, ma5: 0.15, ma20: 0.15, vol: 0.15 },
  { candle: 0.25, ma5: 1, ma20: 0.12, vol: 0.12 },
  { candle: 0.25, ma5: 0.25, ma20: 1, vol: 0.12 },
  { candle: 0.2, ma5: 1, ma20: 1, vol: 0.12 },
  { candle: 0.3, ma5: 0.2, ma20: 0.2, vol: 1 },
];

let guideChart = null;
let guideStep = 0;
let guideData = null;

function buildGuideData() {
  const candles = genCandles(GUIDE_SEED, GUIDE_SEGS);
  const rv = mulberry32(GUIDE_SEED ^ 0x51ed);
  const vols = candles.map((c) => Math.round((600 + rv() * 300) * (1 + 12 * Math.abs(c.close / c.open - 1))));
  const ma5 = candles.map((_, i) => maAt(candles, 5, i));
  const ma20 = candles.map((_, i) => maAt(candles, 20, i));
  let golden = -1;
  let death = -1;
  for (let i = 1; i < candles.length; i++) {
    if (ma5[i] == null || ma20[i] == null || ma5[i - 1] == null || ma20[i - 1] == null) continue;
    if (golden < 0 && ma5[i - 1] <= ma20[i - 1] && ma5[i] > ma20[i]) golden = i;
    else if (golden >= 0 && death < 0 && ma5[i - 1] >= ma20[i - 1] && ma5[i] < ma20[i]) death = i;
  }
  let upIdx = 0;
  let downIdx = 0;
  candles.forEach((c, i) => {
    const r = c.close / c.open - 1;
    if (r > candles[upIdx].close / candles[upIdx].open - 1) upIdx = i;
    if (r < candles[downIdx].close / candles[downIdx].open - 1) downIdx = i;
  });
  return { candles, vols, ma5, ma20, golden, death, upIdx, downIdx };
}

function guideMarkLabel() {
  return { show: true, position: "top", formatter: (p) => p.data.value, color: cssVar("--text"), fontSize: 11 };
}

function guideOption(step) {
  const g = guideData;
  const o = GUIDE_OPACITY[step];
  const cats = g.candles.map((c) => "D" + c.day);
  const volName = pick({ zh: "成交量", en: "Volume" });
  const axisLabel = { color: cssVar("--text-muted"), fontSize: 10 };
  const axisLine = { lineStyle: { color: cssVar("--border") } };

  let candleMark;
  if (step === 0) {
    candleMark = {
      data: [
        { coord: [g.upIdx, g.candles[g.upIdx].high], value: pick({ zh: "阳线（涨）", en: "Up day" }), symbol: "circle", symbolSize: 8, itemStyle: { color: COLORS.up }, label: guideMarkLabel() },
        { coord: [g.downIdx, g.candles[g.downIdx].high], value: pick({ zh: "阴线（跌）", en: "Down day" }), symbol: "circle", symbolSize: 8, itemStyle: { color: COLORS.down }, label: guideMarkLabel() },
      ],
    };
  }
  let ma5Mark;
  if (step === 3) {
    const marks = [];
    if (g.golden >= 0) marks.push({ coord: [g.golden, g.ma5[g.golden]], value: pick({ zh: "金叉", en: "Golden cross" }), symbol: "circle", symbolSize: 10, itemStyle: { color: COLORS.up }, label: guideMarkLabel() });
    if (g.death >= 0) marks.push({ coord: [g.death, g.ma5[g.death]], value: pick({ zh: "死叉", en: "Death cross" }), symbol: "circle", symbolSize: 10, itemStyle: { color: COLORS.down }, label: guideMarkLabel() });
    if (marks.length) ma5Mark = { data: marks };
  }

  return {
    animation: false,
    legend: {
      top: 0,
      data: [t("chart.kline"), "MA5", "MA20", volName],
      textStyle: { color: cssVar("--text-muted"), fontSize: 11 },
      selectedMode: false,
    },
    grid: [
      { left: 48, right: 12, top: 28, height: "50%" },
      { left: 48, right: 12, top: "72%", height: "18%" },
    ],
    xAxis: [
      { type: "category", data: cats, gridIndex: 0, axisLine, axisLabel },
      { type: "category", data: cats, gridIndex: 1, axisLine, axisTick: { show: false }, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0, splitLine: { lineStyle: { color: cssVar("--border") } }, axisLabel },
      { gridIndex: 1, splitLine: { show: false }, axisLabel: { show: false } },
    ],
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    series: [
      {
        name: t("chart.kline"),
        type: "candlestick",
        data: g.candles.map((c) => [c.open, c.close, c.low, c.high]),
        itemStyle: { color: "transparent", color0: COLORS.down, borderColor: COLORS.up, borderColor0: COLORS.down, borderWidth: 1.5, opacity: o.candle },
        markPoint: candleMark,
      },
      { name: "MA5", type: "line", data: g.ma5, smooth: true, showSymbol: false, lineStyle: { width: 2, color: COLORS.ma5, opacity: o.ma5 }, itemStyle: { color: COLORS.ma5 }, markPoint: ma5Mark },
      { name: "MA20", type: "line", data: g.ma20, smooth: true, showSymbol: false, lineStyle: { width: 2, color: COLORS.ma20, opacity: o.ma20 }, itemStyle: { color: COLORS.ma20 } },
      {
        name: volName,
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: g.vols.map((v, i) => ({ value: v, itemStyle: { color: g.candles[i].close >= g.candles[i].open ? COLORS.up : COLORS.down, opacity: 0.55 * o.vol } })),
      },
    ],
  };
}

function renderGuideStep() {
  const st = GUIDE_STEPS[guideStep];
  $("guide-step-title").textContent = pick(st.title);
  $("guide-step-text").textContent = pick(st.text);
  $("guide-step-label").textContent = t("guide.stepLabel", guideStep + 1, GUIDE_STEPS.length);
  $("btn-guide-prev").disabled = guideStep === 0;
  $("btn-guide-prev").textContent = t("guide.prev");
  $("btn-guide-next").textContent = guideStep === GUIDE_STEPS.length - 1 ? t("guide.done") : t("guide.next");
  guideChart.setOption(guideOption(guideStep), true);
}

function openGuide() {
  if (!guideData) guideData = buildGuideData();
  guideStep = 0;
  openModal("guide-modal");
  if (!guideChart) guideChart = echarts.init($("guide-chart"));
  guideChart.resize();
  renderGuideStep();
}

function closeGuide() {
  closeModal("guide-modal");
}

$("btn-chart-guide").addEventListener("click", openGuide);
$("btn-guide-close").addEventListener("click", closeGuide);
$("btn-guide-prev").addEventListener("click", () => {
  if (guideStep > 0) { guideStep--; renderGuideStep(); }
});
$("btn-guide-next").addEventListener("click", () => {
  if (guideStep < GUIDE_STEPS.length - 1) {
    guideStep++;
    renderGuideStep();
    return;
  }
  if (!prog.guideDone) {
    prog.guideDone = true;
    saveProg();
    addXp(30);
    toast(t("play.xpGain", 30));
  }
  closeGuide();
});
$("guide-modal").addEventListener("click", (e) => {
  if (e.target === $("guide-modal")) closeGuide();
});

// ---------- 事件联动 ----------

// 模拟对局结算时发放经验与成就 (app.js 派发)
document.addEventListener("qs:settled", (e) => {
  const result = e.detail || {};
  awardBadge("settle_1");
  addXp(50);
  if (result.aiReturnRate != null && Number(result.returnRate) > Number(result.aiReturnRate)) {
    awardBadge("beat_ai");
    addXp(30);
  }
});

// 视图切换时图表重算尺寸 (隐藏容器中初始化尺寸为 0)
document.addEventListener("qs:view", (e) => {
  if (e.detail === "academy" && guessChart) guessChart.resize();
});

window.addEventListener("resize", () => {
  if (guessChart) guessChart.resize();
  if (playChart && !$("play-modal").hidden) playChart.resize();
  if (guideChart && !$("guide-modal").hidden) guideChart.resize();
});

// 主题切换后图表配色需重读 CSS 变量并重绘 (app.js 派发)
document.addEventListener("qs:theme", () => {
  if (guessChart && guess.data.length) refreshGuessChart();
  if (playChart && !$("play-modal").hidden) refreshPlay();
  if (guideChart && !$("guide-modal").hidden) renderGuideStep();
});

document.addEventListener("qs:lang", () => {
  renderProfile();
  renderTeach();
  renderFamous();
  renderCases();
  renderGear();
  refreshGuessStats();
  if (!guess.playing) $("guess-msg").textContent = t("guess.intro");
  if (!$("play-modal").hidden) {
    $("play-title").textContent = pick(play.def.title);
    $("play-story").innerHTML = linkifyTerms(pick(play.def.story));
    if (!play.done) {
      refreshPlay();
      showPlayHint();
    }
  }
  if (guideChart && !$("guide-modal").hidden) renderGuideStep();
});

renderProfile();
renderTeach();
renderFamous();
renderCases();
refreshGuessStats();
renderGear();
checkGearUnlocks();

