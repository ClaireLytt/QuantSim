// K线猜涨跌 + 富豪场 (2026-10 从 academy.js 拆出, 行为不变)。两者共用同一台均衡引擎与
// guess 状态机 (guess.mode === "rich"), 双向耦合, 必须同文件——拆开会变成跨文件循环依赖。
// 依赖 academy.js 的 prog / addXp / awardBadge / hasGear (成长进度与装备),
// app.js 的 $ / toast / qsTodayStr / cssVar, i18n.js 的 t —— 必须在 academy.js 之后加载。
// ---------- K线猜涨跌 ----------

const GUESS_WINDOW = 30;
const DAILY_GUESSES = 10;
const guessChartH = qsChart("guess-chart", () => buildGuessOption());
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
  // 开局才显示图表 (空壳 300px 很难看); 解除 hidden 后交给 qsChart 画 (refresh 自带 resize)
  $("guess-chart").hidden = false;
  guessChartH.refresh();
}

function buildGuessOption() {
  if (!guess.data.length || !guess.visible) return null;
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
  return opt;
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
  // 开局即落"已玩"标记 (结束时再写得分): 结束才写日期会被两种方式绕过——
  // 跨夜局把标记写到第二天吞掉名额, 或中途刷新无限重开当日局
  prog.daily = { date: today, score: 0, best: prog.daily.best || 0 };
  saveProg();
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
  // 日期在 startDaily 已落 (防跨夜/刷新重开), 这里只更新得分; 不用 todayStr():
  // 跨夜结束时应记在开局那天名下
  prog.daily = { date: prog.daily.date, score: guess.score, best: Math.max(prog.daily.best || 0, guess.score) };
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

$("btn-guess-start").addEventListener("click", startGuess);
$("btn-guess-daily").addEventListener("click", startDaily);
$("btn-guess-up").addEventListener("click", () => makeGuess(true));
$("btn-guess-down").addEventListener("click", () => makeGuess(false));

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

// ---------- 事件联动 (guess 域) ----------
// 图表主题/视图/窗口尺寸全部由 qsChart 兜底

document.addEventListener("qs:lang", () => {
  refreshGuessStats();
  if (!guess.playing) $("guess-msg").textContent = t("guess.intro");
});

refreshGuessStats();
