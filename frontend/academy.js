// 量化学堂玩法: 实战教学关卡 / K线猜涨跌 / 名场面挑战 / 成就与等级
// 依赖 app.js 的全局 $ / toast / cssVar / fmtPct, i18n.js 的 t / pick

// ---------- 成长进度存储 ----------

const PROG_KEY = "qs_progress";

function loadProg() {
  const def = { xp: 0, badges: [], titles: [], teach: [], famous: [], bestStreak: 0, guessTotal: 0, guessHit: 0, guessRecent: [], daily: { date: "", score: 0, best: 0 }, dailyCount: 0, gear: [], equipped: [], cases: [], wealth: 1000000, wealthBest: 1000000 };
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
  // 进度变更广播: 生涯模式等订阅方重算 check 型任务 (订阅方需自带重入锁防回环)
  document.dispatchEvent(new CustomEvent("qs:progress"));
  // 登录后防抖同步到云端 (auth.js 提供; 未加载/未登录时为空操作)
  if (window.qsSyncProgress) window.qsSyncProgress();
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

// spawnConfetti 的唯一实现在 app.js (支持可选 host); 这里不再重定义——
// 曾因本文件后加载覆盖掉全屏版, 导致 app/bubble/reborn/tasks 的无参调用静默失效。

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
  { id: "daily_streak3", name: { zh: "风雨无阻", en: "Rain or Shine" }, desc: { zh: "连续 3 天完成每日挑战", en: "Complete daily challenges 3 days in a row" } },
  { id: "survivor", name: { zh: "熊市幸存者", en: "Bear Survivor" }, desc: { zh: "熊市生存挑战中跑赢买入持有", en: "Beat buy & hold in a Bear Survival run" } },
  { id: "ai_streak3", name: { zh: "AI 克星", en: "AI Nemesis" }, desc: { zh: "连续 3 局战胜 AI 操盘手", en: "Beat the AI trader 3 games in a row" } },
  { id: "season_podium", name: { zh: "载入史册", en: "Hall of Fame" }, desc: { zh: "登上赛季收益榜前三的颁奖台", en: "Finish a season in the return top 3" } },
  { id: "rich_double", name: { zh: "身家翻倍", en: "Doubled Up" }, desc: { zh: "富豪场身家冲上 200 万", en: "Grow your fortune to 2,000,000" } },
  { id: "rich_streak5", name: { zh: "富豪五连", en: "Hot Hand" }, desc: { zh: "富豪场连赢 5 注", en: "Win 5 bets in a row in Tycoon mode" } },
  { id: "rich_reborn", name: { zh: "东山再起", en: "Back From Broke" }, desc: { zh: "破产后选择重生再战", en: "Go broke and come back for more" } },
  { id: "reborn_tycoon", name: { zh: "一代首富", en: "Tycoon of the Age" }, desc: { zh: "重生逆袭中以首富身家谢幕", en: "Finish a rebirth run as the Tycoon of the Age" } },
  { id: "reborn_boss", name: { zh: "白手起家", en: "Self-Made" }, desc: { zh: "重生逆袭中至少干成小老板", en: "Finish a rebirth run as at least a Boss" } },
  { id: "daily_150", name: { zh: "手感火热", en: "On Fire" }, desc: { zh: "单次每日挑战得分 ≥ 150", en: "Score 150+ in one daily challenge" } },
  { id: "settle_1", name: { zh: "实盘首秀", en: "Debut Settled" }, desc: { zh: "在模拟对局中完成一次结算", en: "Settle a full trading game" } },
  { id: "beat_ai", name: { zh: "人机对决", en: "AI Slayer" }, desc: { zh: "结算收益率跑赢 AI 操盘手", en: "Beat the AI trader at settlement" } },
  { id: "case_1", name: { zh: "初勘现场", en: "First on Scene" }, desc: { zh: "破解第一个市场悬案", en: "Solve your first market mystery" } },
  { id: "case_all", name: { zh: "真相只有一个", en: "One Truth Prevails" }, desc: { zh: "破解全部市场悬案", en: "Solve every market mystery" } },
  { id: "egg_curious", hidden: true, name: { zh: "好奇宝宝", en: "Curious Cat" }, desc: { zh: "对着标题连点 7 次发现的彩蛋", en: "Found by clicking the title 7 times" } },
  { id: "egg_konami", hidden: true, name: { zh: "秘籍玩家", en: "Cheat Coder" }, desc: { zh: "输入了传说中的神秘按键序列", en: "Entered the legendary secret key sequence" } },
  // 生涯模式章节徽章 (career.js 发放)
  { id: "career_ch1", name: { zh: "转正信", en: "The Offer Letter" }, desc: { zh: "生涯第一章：完成实习期", en: "Career Ch.1: survive the internship" } },
  { id: "career_ch2", name: { zh: "研究笔记", en: "Research Notes" }, desc: { zh: "生涯第二章：转正研究员", en: "Career Ch.2: make analyst" } },
  { id: "career_ch3", name: { zh: "交易工牌", en: "The Trading Badge" }, desc: { zh: "生涯第三章：通过交易员考核", en: "Career Ch.3: pass the trader exam" } },
  { id: "career_ch4", name: { zh: "基金牌照", en: "The Fund License" }, desc: { zh: "生涯第四章：执掌自己的基金", en: "Career Ch.4: run your own fund" } },
  { id: "career_end", name: { zh: "生涯圆满", en: "Career Complete" }, desc: { zh: "走完整条生涯主线并迎来结局", en: "Finish the career storyline and meet your ending" } },
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

// (教学关与名场面关卡数据已拆至 data/levels.js, 本文件只留引擎)

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

// (剧本杀案件数据已拆至 data/cases.js, 本文件只留办案引擎)

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
  if (first) claimAcademyPoints("case"); // 首破才有积分, 重玩不领
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

// ---------- 学堂积分奖励: 名场面首通/悬案首破 +40 (服务端任务位封顶每日各一次) ----------

async function claimAcademyPoints(kind) {
  if (!window.Auth || !Auth.user) return; // 游客无积分账户, 静默跳过
  try {
    const res = await api("/me/points/academy-claim", { method: "POST", body: JSON.stringify({ kind }) });
    if (res.earned > 0) {
      toast(t("points.academyGot", res.earned));
      const head = $("points-balance-head");
      if (head && res.state) head.textContent = Number(res.state.balance).toLocaleString();
    }
  } catch (e) { /* 当日已领/网络异常不打断通关结算 */ }
}

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
      if (first) claimAcademyPoints("famous"); // 首通才有积分, 重玩不领
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
const guess = { data: [], visible: 0, score: 0, streak: 0, lossStreak: 0, playing: false, waiting: false, mode: "free", dailyLeft: 0, shieldUsed: false };

const todayStr = qsTodayStr; // 共享实现在 app.js

// ---------- 猜涨跌行情引擎 ----------
// 下一根 K 线在玩家按下按钮后才生成。标准判定 4 步:
//   1. 读最近 3 局涨跌 → 判趋势/震荡/变盘;
//   2. 概率加权: 趋势局 70% 延续 / 震荡局 50-50 / 变盘局 (每5~8局) 80% 反向突破;
//      另有假动作 (每4~7局) 诱多诱空打断惯性;
//   3. 胜率修正: 新手前 10 局 ≈55% 利好 → 连赢/连输 3 局后 65% 反转补救 →
//      近 100 局滚动回中 48%~52%; 4. 输出唯一结果。
//   胜率回中: 近 100 局玩家胜率偏出 48%~52% 时按偏差概率往回拉;
//   极端抑制: 同向 ≥5 根强制大概率反转、≥7 根必反 (杜绝十连涨跌),
//            完美交替 ≥6 根强制延续一根 (杜绝天地板反复)。
const mkt = { rnd: Math.random, regime: "range", trendDir: 1, regimeLeft: 6, fakeLeft: 5,
  runDir: 0, runLen: 0, altLen: 0 };

function engineReset(rnd) {
  mkt.rnd = rnd;
  mkt.regime = rnd() < 0.45 ? "trend" : "range";
  mkt.trendDir = rnd() < 0.5 ? 1 : -1;
  mkt.regimeLeft = 5 + Math.floor(rnd() * 4);   // 5~8 局后变盘
  mkt.fakeLeft = 4 + Math.floor(rnd() * 4);     // 4~7 局后一次假动作
  mkt.runDir = 0;
  mkt.runLen = 0;
  mkt.altLen = 0;
}

/** 近 100 局滚动胜率 (持久化在 prog, 跨回合生效)。 */
function recentWinRate() {
  const r = prog.guessRecent || [];
  if (r.length < 20) return null; // 样本太少不干预
  return r.reduce((a, b) => a + b, 0) / r.length;
}

/** 生成下一根 K 线。guessUp 为玩家本次的猜测 (铺历史时传 null, 不做胜率干预)。 */
function engineNext(guessUp) {
  const rnd = mkt.rnd;
  const last = guess.data[guess.data.length - 1];
  const price = last ? last.close : 100;
  const lastDir = mkt.runDir || (rnd() < 0.5 ? 1 : -1);

  // ① 读取最近 3 局涨跌记录, 分类当前状态 (标准判定第 1 步)
  const n = guess.data.length;
  const last3 = [];
  for (let i = Math.max(1, n - 3); i < n; i++) {
    last3.push(guess.data[i].close > guess.data[i - 1].close ? 1 : -1);
  }
  const sum3 = last3.reduce((a, b) => a + b, 0);
  const trending = Math.abs(sum3) >= 2 && last3.length >= 2; // 3 局中 ≥2 局同向视为趋势
  const trendDir3 = sum3 >= 0 ? 1 : -1;

  // ② 概率加权 (标准判定第 2 步): 趋势 70% 延续 / 震荡 50-50 / 变盘局 80% 反向突破
  let dir;
  let fake = false;
  if (--mkt.regimeLeft <= 0) {
    // 变盘局 (每 5~8 局): 80% 反向突破当前方向
    dir = rnd() < 0.8 ? -lastDir : lastDir;
    fake = true;
    mkt.regimeLeft = 5 + Math.floor(rnd() * 4);
    mkt.fakeLeft = Math.max(mkt.fakeLeft, 2); // 刚变完盘, 别紧接着又洗盘
  } else if (--mkt.fakeLeft <= 0) {
    dir = -lastDir; // 假动作 (每 4~7 局): 诱多/诱空, 直接打断惯性
    fake = true;
    mkt.fakeLeft = 4 + Math.floor(rnd() * 4);
  } else if (trending) {
    dir = rnd() < 0.7 ? trendDir3 : -trendDir3;
  } else {
    dir = rnd() < 0.5 ? 1 : -1; // 震荡: 涨跌对半
  }

  // ③ 胜率修正 (只在真实下注时干预), 优先级: 新手保护 > 连胜/连输补救 > 全局回中
  if (guessUp !== null) {
    const guessDir = guessUp ? 1 : -1;
    if (prog.guessTotal < 10) {
      // 新手局: 前 10 局小幅利好, 胜率 ≈55%, 之后自动回归均衡
      dir = rnd() < 0.55 ? guessDir : -guessDir;
    } else if (guess.streak >= 3) {
      dir = rnd() < 0.65 ? -guessDir : guessDir; // 连赢 3 局: 下一局 65% 反转 / 35% 继续让赢
    } else if (guess.lossStreak >= 3) {
      dir = rnd() < 0.65 ? guessDir : -guessDir; // 连输 3 局: 下一局 65% 送回 / 35% 继续压
    } else {
      const wr = recentWinRate();
      if (wr !== null && Math.abs(wr - 0.5) > 0.015) {
        // 偏差 3% 时拉力约 0.18, 偏差 6% 时约 0.54 —— 把各种玩家风格摁回 48%~52%
        const pull = Math.min(0.9, (Math.abs(wr - 0.5) - 0.015) * 12);
        if (rnd() < pull) {
          dir = wr > 0.5 ? -guessDir : guessDir;
        }
      }
    }
  }

  // ④ 极端抑制 (最高优先级): 长连 run 封顶、完美交替封顶
  if (dir === mkt.runDir) {
    if (mkt.runLen >= 7 || (mkt.runLen >= 5 && rnd() < 0.75)) dir = -dir;
  } else if (mkt.altLen >= 6) {
    dir = mkt.runDir || dir; // 已经天地板来回 6 次, 强制延续一根
  }

  // ⑤ 落 K 线: 假动作幅度更大一点 (突变感), 其余 0.3%~2.2%
  const mag = (fake ? 0.008 : 0.003) + rnd() * (fake ? 0.022 : 0.019);
  const open = price;
  const close = Math.max(1, +(open * (1 + dir * mag)).toFixed(2));
  const hi = +(Math.max(open, close) * (1 + rnd() * 0.006)).toFixed(2);
  const lo = +(Math.min(open, close) * (1 - rnd() * 0.006)).toFixed(2);
  const candle = { day: (last ? last.day : 0) + 1, open: +open.toFixed(2), close, high: hi, low: lo };

  // 维护连根/交替计数
  if (dir === mkt.runDir) { mkt.runLen++; mkt.altLen = 0; }
  else { mkt.altLen = mkt.runDir === 0 ? 0 : mkt.altLen + 1; mkt.runDir = dir; mkt.runLen = 1; }

  // 解说选池: 假动作 > 微幅震荡 > 方向话术 (揭晓后才显示, 不剧透)
  candle.kind = fake ? "fake" : mag < 0.006 ? "chop" : dir > 0 ? "up" : "down";
  guess.data.push(candle);
  // 永续模式防内存无限涨: 只保留最近 120 根, 掐头并同步 visible 游标
  if (guess.data.length > 120) {
    const drop = guess.data.length - 120;
    guess.data.splice(0, drop);
    guess.visible -= drop;
  }
  return candle;
}

function newGuessRound(seedRnd) {
  const rnd = seedRnd || mulberry32(Math.floor(Math.random() * 4294967295));
  guess.data = [];
  engineReset(rnd);
  for (let i = 0; i < GUESS_WINDOW; i++) engineNext(null); // 铺可见历史, 走势自带惯性
  guess.visible = GUESS_WINDOW;
}

function refreshGuessChart() {
  // 开局才显示图表 (空壳 300px 很难看); 容器刚解除 hidden 时必须 resize, 否则画布是 100px
  const el = $("guess-chart");
  const wasHidden = el.hidden;
  el.hidden = false;
  if (!guessChart) guessChart = echarts.init(el);
  if (wasHidden) guessChart.resize();
  const from = Math.max(0, guess.visible - GUESS_WINDOW);
  const windowData = guess.data.slice(from, guess.visible).map((c, i) => ({ ...c, day: i + 1 }));
  const opt = buildKlineOption(windowData, windowData.length, false, null);
  // 右侧补一段"未来空位": 基准 K 线落在视野约 2/3 处而不是贴死右缘, 下一根有落点可想象
  const FUTURE_SLOTS = 12;
  const future = [];
  for (let i = 0; i < FUTURE_SLOTS; i++) future.push(i === 0 ? "?" : "");
  opt.xAxis.data = opt.xAxis.data.concat(future);
  // 指示当前待猜的基准 K 线: 最后一根顶上挂「猜它的下一根」箭头标签
  const lastIdx = windowData.length - 1;
  const lastBar = windowData[lastIdx];
  opt.series[0].markPoint = {
    animation: false,
    data: [{
      coord: [lastIdx, lastBar.high],
      value: t("guess.cursor"),
      symbol: "arrow",
      symbolSize: 14,
      symbolRotate: 180,
      symbolOffset: [0, -12],
      itemStyle: { color: cssVar("--accent") },
      label: { position: "top", distance: 10, color: cssVar("--accent"), fontSize: 12, fontWeight: 600 },
    }],
  };
  guessChart.setOption(opt, true);
}

function refreshGuessStats() {
  $("guess-score").textContent = String(guess.score);
  $("guess-streak").textContent = String(guess.streak);
  $("guess-best").textContent = String(prog.bestStreak);
  $("guess-acc").textContent = prog.guessTotal > 0
    ? ((prog.guessHit / prog.guessTotal) * 100).toFixed(1) + "%" // 命中率不带涨跌符号
    : "--";
}

function startGuess() {
  guess.playing = true;
  guess.waiting = false;
  guess.mode = "free";
  guess.score = 0;
  guess.streak = 0;
  guess.lossStreak = 0;
  guess.shieldUsed = false;
  newGuessRound();
  refreshGuessChart();
  refreshGuessStats();
  $("btn-guess-start").hidden = true;
  $("btn-guess-daily").hidden = true; // 对局中只留看涨/看跌一行, 别和大按钮挤在一起
  $("btn-guess-rich").hidden = true;
  $("rich-bar").hidden = true;
  $("rich-wealth-wrap").hidden = true;
  $("rich-best-wrap").hidden = true;
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
  newGuessRound(mulberry32(seed ^ 0x51ab1e)); // 日期定种子: 当天初始走势全服一致
  guess.playing = true;
  guess.waiting = false;
  guess.mode = "daily";
  guess.dailyLeft = DAILY_GUESSES + (hasGear("coin") ? 2 : 0);
  guess.score = 0;
  guess.streak = 0;
  guess.lossStreak = 0;
  guess.shieldUsed = false;
  refreshGuessChart();
  refreshGuessStats();
  $("btn-guess-start").hidden = true;
  $("btn-guess-daily").hidden = true;
  $("btn-guess-rich").hidden = true;
  $("rich-bar").hidden = true;
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
  $("btn-guess-rich").hidden = false;
}

function makeGuess(up) {
  if (!guess.playing || guess.waiting) return;
  if (guess.mode === "rich" && !richStakeOk()) return; // 保证金不足, 不开这一注
  guess.waiting = true;
  const prev = guess.data[guess.visible - 1].close;
  const next = engineNext(up); // 猜完才生成下一根 (引擎含胜率回中与极端抑制)
  guess.visible++;
  refreshGuessChart();
  const wentUp = next.close > prev;
  const movePct = fmtPct((next.close - prev) / prev);
  const correct = up === wentUp;
  prog.guessTotal++;
  // 近 100 局滚动战绩: 胜率回中的依据
  prog.guessRecent = prog.guessRecent || [];
  prog.guessRecent.push(correct ? 1 : 0);
  if (prog.guessRecent.length > 100) prog.guessRecent.shift();
  // 轻量化解说 (≤15字, 游戏风, 不构成任何投资建议)
  const cmt = t("guess.cmt." + (next.kind || (wentUp ? "up" : "down")) + "." + Math.floor(Math.random() * 3));
  let msg = t(wentUp ? "guess.wentUp" : "guess.wentDown", movePct) + "「" + cmt + "」 ";
  if (correct) {
    guess.streak++;
    guess.lossStreak = 0;
    const pts = guess.mode === "rich" ? 0
      : 10 + 2 * Math.min(guess.streak, 10) + (hasGear("finger") ? 5 : 0);
    guess.score += pts;
    prog.guessHit++;
    if (window.qsTask) qsTask("guessWin"); // 今日任务: 猜涨跌赢 3 把
    if (guess.streak > prog.bestStreak) prog.bestStreak = guess.streak;
    addXp(5);
    if (guess.streak >= 3) awardBadge("streak_3");
    if (guess.streak >= 10) awardBadge("streak_10");
    if (prog.guessHit >= 50) awardBadge("guess_50");
    msg += guess.mode === "rich"
      ? settleRichBet(true) + (guess.streak >= 2 ? " " + t("guess.combo", guess.streak) : "")
      : t("guess.hit", pts) + (guess.streak >= 2 ? " " + t("guess.combo", guess.streak) : "");
    replayAnim($("guess-score"), "anim-pop");
    replayAnim($("guess-streak"), "anim-pop");
    const card = document.querySelector(".guess-card");
    spawnFloat(card, "score-pop pos", "+" + pts);
    if (guess.streak >= 3) spawnFloat(card, "combo-pop", t("guess.combo", guess.streak));
  } else if (hasGear("amulet") && !guess.shieldUsed) {
    guess.shieldUsed = true;
    guess.lossStreak++;
    msg += t("gear.shielded");
    replayAnim($("guess-msg"), "anim-shake");
  } else {
    guess.streak = 0;
    guess.lossStreak++;
    msg += guess.mode === "rich" ? settleRichBet(false) : t("guess.miss");
    replayAnim($("guess-chart"), "anim-shake");
    replayAnim($("guess-msg"), "anim-shake");
  }
  saveProg();
  refreshGuessStats();
  checkGearUnlocks();

  if (guess.mode === "rich") {
    saveProg();
    if (checkBankrupt()) {
      $("guess-msg").textContent = msg + " " + t("rich.bankrupt");
      guess.waiting = false;
      return;
    }
  }
  if (guess.mode === "daily") {
    guess.dailyLeft--;
    if (guess.dailyLeft <= 0) {
      finishDaily(msg);
      return;
    }
    msg += " " + t("guess.dailyLeft", guess.dailyLeft);
  }
  $("guess-msg").textContent = msg;
  guess.waiting = false;
}

// 测试钩子: 冒烟/统计校验用, 只读 (不要在业务代码里依赖)
window.qsGuessState = { guess, mkt };

$("btn-guess-start").addEventListener("click", startGuess);
$("btn-guess-daily").addEventListener("click", startDaily);
$("btn-guess-up").addEventListener("click", () => makeGuess(true));
$("btn-guess-down").addEventListener("click", () => makeGuess(false));

// ---------- 段位 / 成就渲染 ----------

function renderProfile() {
  const rank = rankOf(prog.xp);
  $("profile-level").textContent = pick(rank.name);
  $("profile-lv").textContent = "Lv." + (RANKS.indexOf(rank) + 1); // 段位序号即等级
  // 头像: 登录用首字母, 游客保留狐狸向导
  const ava = $("profile-ava");
  const uname = window.Auth && Auth.user && Auth.user.username;
  ava.textContent = uname ? uname.slice(0, 1).toUpperCase() : "🐺"; // 行者本体是狼, 狐狸是主线向导
  ava.classList.toggle("is-letter", !!uname);
  const titleEl = $("profile-title");
  if (prog.titles.length) {
    const names = FAMOUS_LEVELS.concat(CASES)
      .concat((window.QUIZ_PERSONAS || []).map((p) => ({ award: p.name })))
      .concat(window.CAREER_TITLES || []) // 生涯结局称号 (career.js 后加载, 同 QUIZ_PERSONAS 防顺序写法)
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
  // 段位环形进度与直条同源: r=31, 周长 2πr≈194.8
  const ring = $("xp-ring");
  const circ = 2 * Math.PI * 31;
  ring.style.strokeDasharray = circ.toFixed(1);
  ring.style.strokeDashoffset = (circ * (1 - fillPct / 100)).toFixed(1);
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
    .concat((window.CAREER_TITLES || []).map((c) => ({ level: { award: c.award, title: c.award }, kind: "career" })))
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

// 横向时间轴: 圆形节点 (通关发光/未通关灰/纯史料蓝灰), 悬停弹事件卡 (简介 + 声望/藏品奖励 + 进入挑战)
function renderTimeline() {
  const rail = $("timeline");
  if (!rail) return;
  rail.innerHTML = "";
  TIMELINE_EVENTS.forEach((ev) => {
    const level = ev.level == null ? null : FAMOUS_LEVELS[ev.level];
    const done = level && prog.famous.includes(ev.level);
    const node = document.createElement("div");
    node.className = "tl-node" + (level ? " playable" : " info") + (done ? " done" : "");
    node.tabIndex = 0;
    const dot = document.createElement("span");
    dot.className = "tl-dot2";
    const year = document.createElement("span");
    year.className = "tl-year2";
    year.textContent = ev.year;
    const name = document.createElement("span");
    name.className = "tl-name";
    name.textContent = level ? pick(level.title).replace(/^\d{4}\s*·\s*/, "") : pick(ev.title);
    node.append(dot, year, name);
    const show = () => showTlPop(node, ev, level, done);
    node.addEventListener("mouseenter", show);
    node.addEventListener("focus", show);
    node.addEventListener("click", show); // 触屏: 点一下出卡, 卡内按钮进关
    rail.appendChild(node);
  });
  // 拖拽横向漫游 (滚轮纵向也转为横向)
  if (!rail.dataset.dragBound) {
    rail.dataset.dragBound = "1";
    let down = false, sx = 0, sl = 0;
    rail.addEventListener("pointerdown", (e) => { down = true; sx = e.clientX; sl = rail.scrollLeft; });
    rail.addEventListener("pointermove", (e) => {
      if (!down) return;
      if (Math.abs(e.clientX - sx) > 6) rail.setPointerCapture(e.pointerId); // 阈值后再捕获, 不吃节点 click
      rail.scrollLeft = sl - (e.clientX - sx);
    });
    const up = () => { down = false; };
    rail.addEventListener("pointerup", up);
    rail.addEventListener("pointercancel", up);
    rail.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { rail.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    // 鼠标离开整个轨道区才收卡
    $("tl-rail-wrap").addEventListener("mouseleave", () => { $("tl-pop").hidden = true; });
  }
}

function showTlPop(node, ev, level, done) {
  const pop = $("tl-pop");
  pop.innerHTML = "";
  const title = document.createElement("b");
  title.textContent = ev.year + " · " + (level ? pick(level.title).replace(/^\d{4}\s*·\s*/, "") : pick(ev.title));
  const blurb = document.createElement("p");
  blurb.className = "hint";
  blurb.textContent = pick(level ? level.desc : ev.blurb);
  pop.append(title, blurb);
  if (level) {
    // 奖励行: 声望 + 对应历史藏品 (relics.js 派生目录)
    const relic = window.qsRelicOfLevel ? window.qsRelicOfLevel(ev.level) : null;
    const reward = document.createElement("p");
    reward.className = "tl-reward";
    reward.textContent = t("tl.reward", 40) + (relic ? " · " + window.qsRelicName(relic) : "");
    const btn = document.createElement("button");
    btn.className = (done ? "replay" : "primary") + " small";
    btn.textContent = done ? t("academy.retry") : t("tl.play");
    btn.addEventListener("click", () => { pop.hidden = true; openPlay("famous", ev.level); });
    pop.append(reward, btn);
  }
  pop.hidden = false;
  // 跟随节点定位, 右缘防溢出
  const wrapR = $("tl-rail-wrap").getBoundingClientRect();
  const r = node.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(r.left - wrapR.left - 60, wrapR.width - 264)) + "px";
}

// ---------- 彩蛋 ----------

// 全屏彩带 = 无参 spawnConfetti (app.js 统一实现), 保留旧名兼容本文件调用点
const burstConfetti = () => spawnConfetti();

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

// ---------- 富豪场 (交易所·短线预判): 大额身家 + 高倍杠杆下注, 共用均衡引擎 ----------

const rich = { stake: 100000, lev: 1 };
const RICH_START = 1000000;
const RICH_MIN_STAKE = 10000;

function fmtWan(v) {
  // 身家按「万」(zh) / 「k」(en) 展示, 富豪场的数字要有分量感。
  // 不能用「除以一万再在译文里补 0k」的拼法: toLocaleString 的千分位逗号/小数
  // 会把补出来的 0 拼坏 (如 1 亿 → "10,0000k")。
  if (LANG === "en") {
    return (v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
  }
  return (v / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + " 万";
}

function refreshRichStats() {
  $("rich-wealth").textContent = fmtWan(prog.wealth);
  $("rich-best").textContent = fmtWan(prog.wealthBest);
}

function startRich() {
  guess.playing = true;
  guess.waiting = false;
  guess.mode = "rich";
  guess.score = 0;
  guess.streak = 0;
  guess.lossStreak = 0;
  guess.shieldUsed = false;
  newGuessRound();
  refreshGuessChart();
  refreshGuessStats();
  refreshRichStats();
  $("rich-wealth-wrap").hidden = false;
  $("rich-best-wrap").hidden = false;
  $("rich-bar").hidden = false;
  $("btn-guess-start").hidden = true;
  $("btn-guess-daily").hidden = true;
  $("btn-guess-rich").hidden = true;
  $("btn-rich-exit").hidden = false;
  $("btn-guess-up").hidden = false;
  $("btn-guess-down").hidden = false;
  $("guess-msg").textContent = t("rich.prompt");
}

function exitRich() {
  guess.playing = false;
  guess.mode = "free";
  $("rich-bar").hidden = true;
  $("btn-rich-exit").hidden = true;
  $("btn-rich-reborn").hidden = true;
  $("btn-guess-up").hidden = true;
  $("btn-guess-down").hidden = true;
  $("btn-guess-start").hidden = false;
  $("btn-guess-daily").hidden = false;
  $("btn-guess-rich").hidden = false;
  $("guess-msg").textContent = t("rich.exited", fmtWan(prog.wealth));
}

/** 破产判定: 连最小注 ×1 都下不起就算出局, 给重生按钮。 */
function checkBankrupt() {
  if (prog.wealth >= RICH_MIN_STAKE) return false;
  guess.playing = false;
  $("btn-guess-up").hidden = true;
  $("btn-guess-down").hidden = true;
  $("btn-rich-reborn").hidden = false;
  $("guess-msg").textContent = t("rich.bankrupt");
  return true;
}

function richReborn() {
  prog.wealth = RICH_START;
  saveProg();
  awardBadge("rich_reborn");
  $("btn-rich-reborn").hidden = true;
  refreshRichStats();
  guess.playing = true;
  guess.streak = 0;
  guess.lossStreak = 0;
  $("btn-guess-up").hidden = false;
  $("btn-guess-down").hidden = false;
  $("guess-msg").textContent = t("rich.rebornOk", fmtWan(RICH_START));
}

/** 富豪场结算一注: 返回展示文案; 保证金 = 注金×杠杆, 不足时拒单。 */
function settleRichBet(correct) {
  const stakeRaw = rich.stake === -1 ? Math.floor(prog.wealth / rich.lev) : rich.stake;
  const exposure = stakeRaw * rich.lev;
  const delta = correct ? exposure : -exposure;
  prog.wealth = Math.max(0, prog.wealth + delta);
  if (prog.wealth > prog.wealthBest) prog.wealthBest = prog.wealth;
  if (prog.wealth >= RICH_START * 2) awardBadge("rich_double");
  if (correct && guess.streak >= 5) awardBadge("rich_streak5");
  refreshRichStats();
  const card = document.querySelector(".guess-card");
  spawnFloat(card, "score-pop " + (correct ? "pos" : "neg"), (correct ? "+" : "-") + fmtWan(exposure));
  return t(correct ? "rich.win" : "rich.lose", fmtWan(exposure), fmtWan(prog.wealth));
}

/** 下注前校验保证金, 不足返回 false 并提示。 */
function richStakeOk() {
  const stakeRaw = rich.stake === -1 ? Math.floor(prog.wealth / rich.lev) : rich.stake;
  if (stakeRaw < RICH_MIN_STAKE || stakeRaw * rich.lev > prog.wealth) {
    toast(t("rich.noMargin", fmtWan(prog.wealth)));
    return false;
  }
  return true;
}

document.querySelectorAll(".rich-stake").forEach((btn) => {
  btn.addEventListener("click", () => {
    rich.stake = Number(btn.dataset.stake);
    document.querySelectorAll(".rich-stake").forEach((b) => b.classList.toggle("active", b === btn));
  });
});
document.querySelectorAll(".rich-lev").forEach((btn) => {
  btn.addEventListener("click", () => {
    rich.lev = Number(btn.dataset.lev);
    document.querySelectorAll(".rich-lev").forEach((b) => b.classList.toggle("active", b === btn));
  });
});
$("btn-guess-rich").addEventListener("click", startRich);
$("btn-rich-exit").addEventListener("click", exitRich);
$("btn-rich-reborn").addEventListener("click", richReborn);

// ---------- 期权入门沙盒: 欧式期权 BS 定价 + 到期损益曲线 ----------

(() => {
  const SPOT = 100;       // 现价固定 100, 聚焦"结构"而不是行情
  const VOL = 0.3;        // 年化波动率 30%
  const RATE = 0.03;      // 无风险利率 3%
  const T = 30 / 365;     // 30 天到期
  let optType = "call";
  let optChart = null;

  // 标准正态 CDF (Abramowitz-Stegun 近似, 教学精度足够)
  function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function bsPremium(strike) {
    const d1 = (Math.log(SPOT / strike) + (RATE + VOL * VOL / 2) * T) / (VOL * Math.sqrt(T));
    const d2 = d1 - VOL * Math.sqrt(T);
    if (optType === "call") {
      return SPOT * normCdf(d1) - strike * Math.exp(-RATE * T) * normCdf(d2);
    }
    return strike * Math.exp(-RATE * T) * normCdf(-d2) - SPOT * normCdf(-d1);
  }

  function renderOption() {
    const strike = Number($("opt-strike").value);
    $("opt-strike-val").textContent = strike;
    const premium = bsPremium(strike);
    $("opt-premium").textContent = premium.toFixed(2);
    $("btn-opt-call").classList.toggle("active", optType === "call");
    $("btn-opt-put").classList.toggle("active", optType === "put");

    const xs = [];
    const ys = [];
    for (let s = 60; s <= 140; s += 1) {
      const intrinsic = optType === "call" ? Math.max(0, s - strike) : Math.max(0, strike - s);
      xs.push(s);
      ys.push(+(intrinsic - premium).toFixed(2));
    }
    const breakeven = optType === "call" ? strike + premium : strike - premium;
    if (!optChart) {
      optChart = echarts.init($("opt-chart"));
      window.addEventListener("resize", () => optChart.resize());
    }
    optChart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", valueFormatter: (v) => (v >= 0 ? "+" : "") + v },
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: { type: "category", data: xs, name: t("opt.axisX"), nameLocation: "middle", nameGap: 24,
        axisLabel: { color: cssVar("--text-muted") }, axisLine: { lineStyle: { color: cssVar("--border") } } },
      yAxis: { type: "value",
        axisLabel: { color: cssVar("--text-muted") },
        splitLine: { lineStyle: { color: cssVar("--border"), opacity: 0.4 } } },
      series: [{ type: "line", data: ys, showSymbol: false,
        lineStyle: { width: 2, color: cssVar("--accent") },
        areaStyle: { opacity: 0.1, color: cssVar("--accent") },
        markLine: { symbol: "none", lineStyle: { color: cssVar("--text-muted"), type: "dashed" },
          label: { color: cssVar("--text-muted") },
          data: [{ yAxis: 0 }, { xAxis: String(Math.round(breakeven)) }] } }],
    }, true);
    optChart.resize();
    $("opt-verdict").textContent = t("opt.verdict", premium.toFixed(2), breakeven.toFixed(1));
  }

  $("btn-opt-call").addEventListener("click", () => { optType = "call"; renderOption(); });
  $("btn-opt-put").addEventListener("click", () => { optType = "put"; renderOption(); });
  $("opt-strike").addEventListener("input", renderOption);
  document.addEventListener("qs:view", (e) => { if (e.detail === "option") renderOption(); });
  document.addEventListener("qs:lang", () => { if (!$("view-option").hidden) renderOption(); });
  if (!$("view-option").hidden) renderOption(); // 启动兜底: 停在期权沙盒刷新会错过首次 qs:view
})();

// ---------- 事件联动 ----------

// 每日挑战连续天数 (daily.js 派发): 连续 3 天发徽章
document.addEventListener("qs:dailyStreak", (e) => {
  if (Number(e.detail) >= 3) awardBadge("daily_streak3");
});

// 模拟对局结算时发放经验与成就 (app.js 派发)
document.addEventListener("qs:settled", (e) => {
  const result = e.detail || {};
  awardBadge("settle_1");
  addXp(50);
  if (result.aiReturnRate != null && Number(result.returnRate) > Number(result.aiReturnRate)) {
    awardBadge("beat_ai");
    addXp(30);
  }
  // 熊市生存: 亏得比买入持有少即算通关
  if (window.state && state.mode === "SURVIVAL" && result.holdReturnRate != null
      && Number(result.returnRate) > Number(result.holdReturnRate)) {
    awardBadge("survivor");
    addXp(60);
  }
});

// 连胜 AI 徽章 (points.js 派发连胜数)
document.addEventListener("qs:aiStreak", (e) => {
  if (Number(e.detail) >= 3) awardBadge("ai_streak3");
});

// 上赛季颁奖台徽章 (ranking.js 派发名次)
document.addEventListener("qs:seasonPodium", () => awardBadge("season_podium"));

// 重生逆袭结算 (reborn.js 派发称号档位)
document.addEventListener("qs:rebornTier", (e) => {
  const tier = e.detail;
  if (tier === "tycoon") awardBadge("reborn_tycoon");
  if (tier === "tycoon" || tier === "magnate" || tier === "boss") awardBadge("reborn_boss");
  addXp(tier === "tycoon" ? 80 : 40);
});

// 视图切换时图表重算尺寸 (隐藏容器中初始化尺寸为 0)
document.addEventListener("qs:view", (e) => {
  if ((e.detail === "academy" || e.detail === "guess") && guessChart) guessChart.resize();
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

