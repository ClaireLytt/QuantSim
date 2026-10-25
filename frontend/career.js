// 生涯模式: 平行主线。把学堂/对局/回测/研究所/事件回放/悬案/小游戏串成
// 「实习生→研究员→交易员→基金经理→传奇」的带剧情任务线; 抉择改写后续任务目标与结局。
// 进度存 prog.career (<1KB, 随 qs_progress 云同步); done[] 为唯一真相源, 当前步由其推导。
// 不门禁任何既有入口; 老玩家首进自动级联补过已达成的步骤。
// 依赖: app.js 的 $/toast/playSound/switchView, academy.js 的 prog/saveProg/addXp/awardBadge/awardTitle/playCutscene, i18n 的 t/pick。
(() => {
  // ---------- 章节定义 ----------
  // step.kind: dialog(剧情)/task(任务)/choice(抉择)/ending(结局)
  // task 判定二选一: check(p)=>[cur,need] (持久进度型, 可自动补过) 或 event+when (瞬时型, 计入 cnt)
  // variants: 按 flags[variantKey] 覆盖 goal/when —— 抉择改写任务
  const CAREER = [
    {
      id: "ch1", icon: "🌱",
      title: { zh: "第一章 · 实习生", en: "Ch.1 · The Intern" },
      steps: [
        {
          id: "c1s1", kind: "dialog",
          lines: [
            { zh: "欢迎来到 K 街资本。我是老K——从今天起，你是我带的实习生。", en: "Welcome to K-Street Capital. I'm Master K - as of today, you're my intern." },
            { zh: "这行的第一课：先学会亏小钱，再谈赚大钱。去学堂把基本功练了。", en: "Lesson one of this trade: learn to lose small before you dream big. Hit the academy." },
          ],
        },
        {
          id: "c1s2", kind: "task", go: "academy",
          goal: { zh: "通过 2 个实战教学关", en: "Clear 2 teaching levels" },
          check: (p) => [p.teach.length, 2],
          reward: { xp: 40 },
        },
        {
          id: "c1s3", kind: "task", go: "guess",
          goal: { zh: "K 线猜涨跌累计答对 10 次", en: "Hit 10 correct K-line calls (lifetime)" },
          check: (p) => [p.guessHit, 10],
          reward: { xp: 40 },
        },
        {
          id: "c1s4", kind: "task", go: "game",
          goal: { zh: "完整打完并结算 1 局对局", en: "Play and settle one full game" },
          event: "qs:settled", count: 1,
          reward: { xp: 60 },
        },
        {
          id: "c1s5", kind: "choice", flag: "path",
          prompt: { zh: "实习期满。老K问：想去哪个部门？", en: "Internship over. Master K asks: which desk?" },
          options: [
            { id: "steady", label: { zh: "🛡️ 研究部（稳健路线）", en: "🛡️ Research (steady path)" }, desc: { zh: "后续考核看重控制回撤", en: "Later exams grade your drawdown control" } },
            { id: "aggressive", label: { zh: "⚔️ 交易部（激进路线）", en: "⚔️ Trading desk (aggressive path)" }, desc: { zh: "后续考核看重绝对收益", en: "Later exams grade raw returns" } },
          ],
        },
      ],
      reward: { xp: 80, badge: "career_ch1" },
    },
    {
      id: "ch2", icon: "🔬",
      title: { zh: "第二章 · 研究员", en: "Ch.2 · The Analyst" },
      steps: [
        {
          id: "c2s1", kind: "dialog",
          lines: [
            { zh: "转正了。研究员的武器不是胆子，是证据。", en: "You're full-time now. An analyst's weapon isn't nerve - it's evidence." },
            { zh: "先认识你自己，再去研究所拿数据说话，顺便破个案子练练眼力。", en: "Know yourself first, then let the Lab's data do the talking - and crack a case to sharpen your eye." },
          ],
        },
        {
          id: "c2s2", kind: "task", go: "quiz",
          goal: { zh: "完成投资人格测试", en: "Finish the investor personality test" },
          event: "qs:quizDone", count: 1,
          check: (p) => [(p.titles || []).some((x) => window.QUIZ_PERSONAS && QUIZ_PERSONAS.some((q) => q.name.zh === (x.zh || x))) ? 1 : 0, 1],
          reward: { xp: 40 },
        },
        {
          id: "c2s3", kind: "task", go: "lab",
          goal: { zh: "在研究所完成一次双股对比", en: "Run one stock-vs-stock comparison in the Lab" },
          event: "qs:labRun", count: 1, when: (d) => d.tool === "compare",
          reward: { xp: 40 },
        },
        {
          id: "c2s4", kind: "task", go: "story",
          goal: { zh: "破解 1 宗市场悬案", en: "Solve 1 market mystery" },
          check: (p) => [p.cases.length, 1],
          reward: { xp: 60 },
        },
        {
          id: "c2s5", kind: "choice", flag: "school",
          prompt: { zh: "研究年会上你要立个山头：信什么？", en: "At the research off-site you must plant a flag: what do you believe?" },
          options: [
            { id: "tech", label: { zh: "📈 技术面（均线/动量）", en: "📈 Technicals (MA / momentum)" }, desc: { zh: "第四章回测考核用趋势类策略", en: "Ch.4 backtest exam uses trend strategies" } },
            { id: "fundamental", label: { zh: "📚 基本面（价值/定投）", en: "📚 Fundamentals (value / DCA)" }, desc: { zh: "第四章回测考核用价值类策略", en: "Ch.4 backtest exam uses value strategies" } },
          ],
        },
      ],
      reward: { xp: 100, badge: "career_ch2" },
    },
    {
      id: "ch3", icon: "⚔️",
      title: { zh: "第三章 · 交易员", en: "Ch.3 · The Trader" },
      steps: [
        {
          id: "c3s1", kind: "dialog",
          lines: [
            { zh: "上实盘了。记住：研究员输了丢脸，交易员输了丢钱。", en: "You're live now. Remember: analysts lose face, traders lose money." },
            { zh: "按你选的路线打——考核标准我已经写进任务里了。", en: "Play your chosen path - the grading is written into your tasks." },
          ],
        },
        {
          id: "c3s2", kind: "task", go: "game", variantKey: "path",
          variants: {
            aggressive: {
              goal: { zh: "激进考核：单局收益率 ≥ 15%", en: "Aggressive exam: one game with return ≥ 15%" },
              when: (d) => Number(d.returnRate) >= 0.15,
            },
            steady: {
              goal: { zh: "稳健考核：单局正收益且最大回撤 ≤ 10%", en: "Steady exam: positive return with max drawdown ≤ 10%" },
              when: (d) => Number(d.returnRate) > 0 && d.risk && Number(d.risk.maxDrawdown) <= 0.10,
            },
          },
          event: "qs:settled", count: 1,
          reward: { xp: 80 },
        },
        {
          id: "c3s3", kind: "task", go: "game",
          goal: { zh: "单局跑赢 AI 对手一次", en: "Beat the AI opponent in one game" },
          event: "qs:settled", count: 1,
          when: (d) => d.aiReturnRate != null && Number(d.returnRate) > Number(d.aiReturnRate),
          reward: { xp: 60 },
        },
        {
          id: "c3s4", kind: "task", go: "daily",
          goal: { zh: "完成 1 次每日挑战", en: "Finish 1 daily challenge" },
          check: (p) => [p.dailyCount || 0, 1],
          reward: { xp: 40 },
        },
      ],
      reward: { xp: 120, badge: "career_ch3" },
    },
    {
      id: "ch4", icon: "💼",
      title: { zh: "第四章 · 基金经理", en: "Ch.4 · The Fund Manager" },
      steps: [
        {
          id: "c4s1", kind: "dialog",
          lines: [
            { zh: "恭喜，现在你管的是别人的钱。压力大十倍，纪律也要严十倍。", en: "Congratulations - you manage other people's money now. Ten times the pressure, ten times the discipline." },
            { zh: "基金经理要经得起历史的盲测，也要守得住自己的策略。", en: "A fund manager must survive history blind - and stand by a strategy of their own." },
          ],
        },
        {
          id: "c4s2", kind: "task", go: "event",
          goal: { zh: "事件回放模式结算 1 局（盲测历史时刻）", en: "Settle 1 Event Replay game (a blind slice of history)" },
          event: "qs:settled", count: 1, when: (d) => d.eventReveal != null,
          reward: { xp: 80 },
        },
        {
          id: "c4s3", kind: "task", go: "arena", variantKey: "school",
          variants: {
            tech: {
              goal: { zh: "技术流考核：用均线/动量/RSI/MACD 类策略跑出正收益回测", en: "Technical exam: a positive backtest with an MA/momentum/RSI/MACD strategy" },
              when: (d) => ["MA_CROSS", "MOMENTUM", "RSI", "MACD", "BOLL", "TURTLE", "GRID"].includes(d.strategy) && Number(d.totalReturn) > 0,
            },
            fundamental: {
              goal: { zh: "价值流考核：用定投/买入持有/均值回归类策略跑出正收益回测", en: "Value exam: a positive backtest with DCA/buy-hold/mean-reversion" },
              when: (d) => ["BUY_HOLD", "DCA", "MEAN_REVERT", "CUSTOM"].includes(d.strategy) && Number(d.totalReturn) > 0,
            },
          },
          event: "qs:backtest", count: 1,
          reward: { xp: 80 },
        },
        {
          id: "c4s4", kind: "task", go: "bubble",
          goal: { zh: "泡沫大亨：以非负收益离场且别进监狱", en: "Bubble Tycoon: exit non-negative - and stay out of jail" },
          event: "qs:bubbleEnd", count: 1, when: (d) => d.pct >= 0 && d.title !== "jail",
          reward: { xp: 60 },
        },
        {
          id: "c4s5", kind: "choice", flag: "fund",
          prompt: { zh: "你的基金要定调了：产品说明书上写什么？", en: "Your fund needs a mandate. What goes in the prospectus?" },
          options: [
            { id: "growth", label: { zh: "🚀 进取型基金", en: "🚀 Growth fund" }, desc: { zh: "终考：高收益 + 跑赢 AI", en: "Final exam: big return + beat the AI" } },
            { id: "stable", label: { zh: "⚓ 稳健型基金", en: "⚓ Stable fund" }, desc: { zh: "终考：控回撤 + 跑赢持有", en: "Final exam: tame drawdown + beat buy & hold" } },
          ],
        },
      ],
      reward: { xp: 150, badge: "career_ch4" },
    },
    {
      id: "ch5", icon: "👑",
      title: { zh: "第五章 · 传奇", en: "Ch.5 · The Legend" },
      steps: [
        {
          id: "c5s1", kind: "dialog",
          lines: [
            { zh: "最后一课。我这辈子见过两种传奇：赚得最多的，和活得最久的。", en: "The last lesson. I've met two kinds of legends: those who made the most, and those who lasted the longest." },
            { zh: "毕业大考按你基金的章程打。打完，再去名场面里经历一次历史。", en: "Your final exam follows your fund's mandate. After that, go live through history once in the Famous Moments." },
          ],
        },
        {
          id: "c5s2", kind: "task", go: "game", variantKey: "fund",
          variants: {
            growth: {
              goal: { zh: "进取终考：单局收益率 ≥ 15% 且跑赢 AI", en: "Growth final: return ≥ 15% AND beat the AI" },
              when: (d) => Number(d.returnRate) >= 0.15 && d.aiReturnRate != null && Number(d.returnRate) > Number(d.aiReturnRate),
            },
            stable: {
              goal: { zh: "稳健终考：正收益、回撤 ≤ 10% 且跑赢买入持有", en: "Stable final: positive return, drawdown ≤ 10%, AND beat buy & hold" },
              when: (d) => Number(d.returnRate) > 0 && d.risk && Number(d.risk.maxDrawdown) <= 0.10
                && d.holdReturnRate != null && Number(d.returnRate) > Number(d.holdReturnRate),
            },
          },
          event: "qs:settled", count: 1,
          reward: { xp: 120 },
        },
        {
          id: "c5s3", kind: "task", go: "famous",
          goal: { zh: "通过任意 1 个名场面挑战", en: "Clear any Famous Moment" },
          check: (p) => [p.famous.length, 1],
          reward: { xp: 80 },
        },
        { id: "c5s4", kind: "ending" },
      ],
      reward: { xp: 200, badge: "career_end" },
    },
    {
      // 第六章 (成长系统改版): 从"打一局"转向"验证一个想法"。判定全部走既有事件/接口。
      id: "ch6", icon: "🔭",
      title: { zh: "第六章 · 策略研究者", en: "Ch.6 · The Strategy Researcher" },
      steps: [
        {
          id: "c6s1", kind: "dialog",
          lines: [
            { zh: "传奇之后呢？老K把研究部的钥匙放在你桌上：『赚过钱的人很多，讲得清为什么赚钱的人很少。』", en: "What comes after legend? Master K leaves the research-desk key on your table: 'Many have made money. Few can explain why.'" },
            { zh: "从今天起，别再问『这局赢了吗』，去问『这个想法站得住吗』。", en: "From today, stop asking 'did I win this run' - ask 'does this idea hold up'." },
          ],
        },
        {
          id: "c6s2", kind: "task", go: "game",
          // 纪律考核: bias 全绿 (过度交易也是 bias 之一, 天然反刷单); 诊断样本不足 (无报告) 不算过
          goal: { zh: "纪律考核：结算一局行为偏差零触发（≥3 笔交易）", en: "Discipline exam: settle a game with zero bias triggers (3+ trades)" },
          event: "qs:settled", count: 1,
          when: (d) => d.biasReport && (d.biasReport.verdicts || []).length > 0
            && d.biasReport.totalTrades >= 3
            && d.biasReport.verdicts.every((v) => !v.triggered),
          reward: { xp: 80, badge: "discipline" },
        },
        {
          id: "c6s3", kind: "task", go: "lab",
          goal: { zh: "校准之眼：在研究所跑一次 AI 预测校准", en: "The calibration eye: run the AI calibration check in the Lab" },
          event: "qs:labRun", count: 1, when: (d) => d.tool === "calibration",
          reward: { xp: 40 },
        },
        {
          id: "c6s4", kind: "task", go: "arena",
          goal: { zh: "过拟合防线：用自定义策略跑出正收益回测，且不被判过拟合", en: "The overfit line: a positive custom-strategy backtest that isn't flagged as overfit" },
          event: "qs:backtest", count: 1,
          when: (d) => d.strategy === "CUSTOM" && Number(d.totalReturn) > 0 && !d.overfit,
          reward: { xp: 80 },
        },
        {
          id: "c6s5", kind: "task", go: "duel",
          goal: { zh: "擂台亮剑：把一个策略提交上策略擂台", en: "Enter the ring: submit a strategy to the Strategy Ring" },
          event: "qs:duelSubmit", count: 1,
          reward: { xp: 60 },
        },
        {
          id: "c6s6", kind: "task", go: "mine",
          goal: { zh: "深读复盘：打开任意一局复盘报告（逐笔配对会说话）", en: "Read the tape: open any post-game recap (the paired trades will talk)" },
          event: "qs:recapOpen", count: 1,
          reward: { xp: 40 },
        },
        { id: "c6s7", kind: "ending" },
      ],
      reward: { xp: 240, badge: "career_res" },
    },
  ];

  // 结局: 由 path+fund 两个 flag 决定
  const ENDINGS = {
    wolf: {
      title: { zh: "华尔街之狼", en: "Wolf of the Street" },
      recap: { zh: "从实习生到执掌进取基金——你用收益率说话，市场记住了你的獠牙。", en: "From intern to a growth fund's helm - you spoke in returns, and the market remembers your teeth." },
    },
    helmsman: {
      title: { zh: "稳健舵手", en: "The Steady Helmsman" },
      recap: { zh: "风浪越大你越稳。你的净值曲线也许不陡峭，但它从不坠崖。", en: "The rougher the sea, the steadier your hand. Your curve may not be steep - but it never falls off a cliff." },
    },
    legend: {
      title: { zh: "市场传奇", en: "A Market Legend" },
      recap: { zh: "既懂进攻也懂防守，路线在你脚下只是工具。市场为你改写了教科书。", en: "Offense and defense alike are mere tools under your feet. The market rewrote its textbook for you." },
    },
    researcher: {
      title: { zh: "策略研究者", en: "The Strategy Researcher" },
      recap: { zh: "你不再追逐某一局的输赢——你验证想法、提防过拟合、读得懂自己的每一笔。市场之上，你有了方法。", en: "You no longer chase a single run - you test ideas, guard against overfitting, and can read your own every trade. Above the market, you now have a method." },
    },
  };
  // ch6 结局固定为研究者 (身份晋升, 覆盖 ch5 结局); ch5 仍按 path+fund 三选一
  const resolveEnding = (f) => (f.path === "aggressive" && f.fund === "growth" ? "wolf"
    : f.path === "steady" && f.fund === "stable" ? "helmsman" : "legend");
  // 称号墙聚合 (academy renderProfile 读取, 防加载顺序用 window 挂载)
  window.CAREER_TITLES = Object.values(ENDINGS).map((e) => ({ award: e.title }));

  // ---------- 状态 ----------
  prog.career = Object.assign({ v: 1, done: [], cnt: {}, flags: {}, seen: [], ending: null }, prog.career || {});
  const car = prog.career;
  const STEPS = CAREER.flatMap((ch) => ch.steps.map((s) => ({ ...s, chapter: ch })));

  const currentStep = () => STEPS.find((s) => !car.done.includes(s.id)) || null;

  // 已完成章数 (0-5): 声望系统据此计分 (relics.js 读取, 防加载顺序挂 window)
  window.qsCareerChapters = () =>
    CAREER.filter((ch) => ch.steps.every((s) => car.done.includes(s.id))).length;

  function effective(step) {
    // 应用抉择分支: variants 按 flag 覆盖 goal/when
    if (step.variantKey && step.variants) {
      const v = step.variants[car.flags[step.variantKey]] || Object.values(step.variants)[0];
      return { ...step, ...v };
    }
    return step;
  }

  // ---------- 引擎 ----------
  let evaluating = false;

  function evaluate() {
    if (evaluating) return;
    evaluating = true;
    try {
      let passed = 0;
      for (;;) {
        const step = currentStep();
        if (!step) break;
        if (step.kind !== "task") break; // dialog/choice/ending 等玩家在生涯页交互
        const eff = effective(step);
        let ok = false;
        if (eff.check) {
          const [cur, need] = eff.check(prog);
          ok = cur >= need;
        } else if (eff.event) {
          ok = (car.cnt[step.id] || 0) >= (eff.count || 1);
        }
        if (!ok) break;
        completeStep(step);
        passed++;
      }
      if (passed > 2) toast(t("career.autoPass", passed)); // 老玩家级联补过只发一条汇总
      saveProg();
    } finally {
      evaluating = false;
    }
    renderCareer();
  }

  function completeStep(step) {
    car.done.push(step.id);
    delete car.cnt[step.id];
    const eff = effective(step);
    if (eff.reward && eff.reward.xp) addXp(eff.reward.xp);
    if (eff.reward && eff.reward.badge) awardBadge(eff.reward.badge); // 步级徽章 (纪律考核等)
    // 本章最后一步完成 → 章奖励
    const ch = step.chapter;
    if (ch.steps.every((s) => car.done.includes(s.id))) {
      if (ch.reward.xp) addXp(ch.reward.xp);
      if (ch.reward.badge) awardBadge(ch.reward.badge);
      playSound("win");
      toast(t("career.chapterDone", pick(ch.title)));
    }
  }

  // ---------- 考核判定与失败重试回路 (成长系统改版) ----------
  // settleExam: 本局是否用于当前生涯考核及其判定 (结算弹窗读取, 每局结算时重置);
  // lastExamFail: 最近一次考核失败的现场 (指路卡用, 内存态即可——刷新后重打一局自然重建)
  let settleExam = null;
  let lastExamFail = null;
  window.qsCareerSettleExam = () => settleExam;

  /** 当前章进度摘要 (首页生活条/「我的」/任务卡读取) */
  window.qsCareerStatus = () => {
    const cur = currentStep();
    const chapters = window.qsCareerChapters();
    if (!cur) {
      const e = ENDINGS[car.ending] || ENDINGS.legend;
      return { chapters, title: pick(e.title), goal: null, done: true };
    }
    const eff = effective(cur);
    return { chapters, title: pick(cur.chapter.title),
      goal: cur.kind === "task" ? pick(eff.goal) : t("career.dialogGoal"), done: false };
  };

  // 事件接线: 只有当前步消费事件 (线性任务链)
  function handle(name, detail) {
    if (name === "qs:settled") settleExam = null; // 新一局结算: 先清上局判定
    const step = currentStep();
    if (!step || step.kind !== "task") return;
    const eff = effective(step);
    if (eff.event !== name) return;
    const pass = !eff.when || !!eff.when(detail || {});
    if (name === "qs:settled") {
      settleExam = { goal: pick(eff.goal), passed: pass };
      lastExamFail = pass ? null : { stepId: step.id, detail: detail || {} };
    }
    if (!pass) {
      if (name === "qs:settled") renderCareer(); // 失败也刷新: 生涯页立刻出指路卡
      return;
    }
    car.cnt[step.id] = (car.cnt[step.id] || 0) + 1;
    evaluate();
  }

  ["qs:settled", "qs:backtest", "qs:quizDone", "qs:labRun", "qs:bubbleEnd", "qs:optionEnd",
    "qs:tapeEnd", "qs:newsEnd", "qs:richmanEnd", "qs:buydipEnd", "qs:stratboxEnd",
    "qs:dailyStreak", "qs:aiStreak", "qs:rebornTier", "qs:duelSubmit", "qs:recapOpen"].forEach((name) => {
    document.addEventListener(name, (e) => handle(name, e.detail));
  });
  document.addEventListener("qs:progress", () => {
    // check 型任务可能被外部进度满足 (老玩家补过/学堂刚通关); evaluating 锁防 saveProg 回环
    if (!evaluating) evaluate();
  });

  // ---------- 剧情 / 抉择 / 结局 (生涯页内交互) ----------
  function playDialog(step) {
    if (!$("cutscene").hidden) return; // playCutscene 非重入, 排队到下次点击
    playCutscene(step.lines.map(pick), () => {
      if (!car.seen.includes(step.id)) car.seen.push(step.id);
      completeStep(step);
      saveProg();
      evaluate();
    });
  }

  function choose(step, optionId) {
    car.flags[step.flag] = optionId;
    completeStep(step);
    saveProg();
    playSound("fill");
    evaluate();
  }

  function finishEnding(step) {
    const id = step.chapter.id === "ch6" ? "researcher" : resolveEnding(car.flags);
    car.ending = id;
    completeStep(step);
    awardTitle(ENDINGS[id].title);
    saveProg();
    spawnConfetti();
    renderCareer();
  }

  // ---------- 渲染 ----------
  function renderCareer() {
    if ($("view-career").hidden) return;
    const cur = currentStep();
    // 章节地图
    const map = $("career-map");
    map.innerHTML = "";
    CAREER.forEach((ch) => {
      const doneCount = ch.steps.filter((s) => car.done.includes(s.id)).length;
      const node = document.createElement("div");
      const isCur = cur && cur.chapter.id === ch.id;
      node.className = "career-node" + (doneCount >= ch.steps.length ? " done" : "") + (isCur ? " cur" : "");
      const ico = document.createElement("span");
      ico.className = "career-node-ico";
      ico.textContent = doneCount >= ch.steps.length ? "✓" : ch.icon;
      const label = document.createElement("b");
      label.textContent = pick(ch.title);
      const prg = document.createElement("i");
      prg.textContent = `${doneCount}/${ch.steps.length}`;
      node.append(ico, label, prg);
      map.appendChild(node);
    });

    const stepBox = $("career-step");
    const choiceBox = $("career-choice");
    const endBox = $("career-ending");
    stepBox.hidden = true;
    choiceBox.hidden = true;
    endBox.hidden = true;

    if (!cur) {
      // 全部完成: 展示结局履历
      const e = ENDINGS[car.ending] || ENDINGS.legend;
      endBox.hidden = false;
      $("career-end-title").textContent = "👑 " + pick(e.title);
      $("career-end-recap").textContent = pick(e.recap);
      $("career-end-stats").textContent = t("career.endStats",
        car.flags.path === "aggressive" ? t("career.pathAgg") : t("career.pathSteady"),
        car.flags.school === "tech" ? t("career.schoolTech") : t("career.schoolFund"),
        prog.xp);
      return;
    }

    if (cur.kind === "choice") {
      choiceBox.hidden = false;
      $("career-choice-prompt").textContent = pick(cur.prompt);
      const wrap = $("career-choice-opts");
      wrap.innerHTML = "";
      cur.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "career-opt";
        const l = document.createElement("strong");
        l.textContent = pick(opt.label);
        const d = document.createElement("span");
        d.className = "sub";
        d.textContent = pick(opt.desc);
        btn.append(l, d);
        btn.addEventListener("click", () => choose(cur, opt.id));
        wrap.appendChild(btn);
      });
      return;
    }

    stepBox.hidden = false;
    $("career-step-ch").textContent = cur.chapter.icon + " " + pick(cur.chapter.title);
    if (cur.kind === "dialog") {
      $("career-step-goal").textContent = t("career.dialogGoal");
      $("career-step-progress").textContent = "";
      $("btn-career-go").textContent = t("career.watch");
      $("btn-career-go").onclick = () => playDialog(cur);
    } else if (cur.kind === "ending") {
      $("career-step-goal").textContent = t("career.endingGoal");
      $("career-step-progress").textContent = "";
      $("btn-career-go").textContent = t("career.reveal");
      $("btn-career-go").onclick = () => finishEnding(cur);
    } else {
      const eff = effective(cur);
      $("career-step-goal").textContent = pick(eff.goal);
      let curN, needN;
      if (eff.check) {
        [curN, needN] = eff.check(prog);
      } else {
        curN = car.cnt[cur.id] || 0;
        needN = eff.count || 1;
      }
      $("career-step-progress").textContent = t("career.progress", Math.min(curN, needN), needN);
      $("btn-career-go").textContent = t("career.go");
      $("btn-career-go").onclick = () => switchView(eff.go || "home");
      renderFailCard(cur);
    }
  }

  /** 考核失败指路卡: 本局关键数 + 偏差指路 (学习↔交易↔复盘回路的粘合点), 重试即主按钮 */
  function renderFailCard(cur) {
    const box = $("career-fail");
    const show = !!(lastExamFail && lastExamFail.stepId === cur.id);
    box.hidden = !show;
    if (!show) return;
    const d = lastExamFail.detail;
    const parts = [];
    if (d.returnRate != null) parts.push(t("career.fail.ret", fmtPct(Number(d.returnRate))));
    if (d.risk && d.risk.maxDrawdown != null) {
      parts.push(t("career.fail.dd", (Number(d.risk.maxDrawdown) * 100).toFixed(1) + "%"));
    }
    $("career-fail-nums").textContent = t("career.fail.head") + (parts.length ? " " + parts.join(" · ") : "");
    const ul = $("career-fail-hints");
    ul.innerHTML = "";
    const triggered = ((d.biasReport && d.biasReport.verdicts) || []).filter((v) => v.triggered);
    ul.hidden = !triggered.length;
    triggered.slice(0, 3).forEach((v) => {
      const li = document.createElement("li");
      li.textContent = t("recap.bias." + v.key) + " — " + t("career.fix." + v.key);
      ul.appendChild(li);
    });
  }
  $("btn-career-fail-academy").addEventListener("click", () => switchView("academy"));
  $("btn-career-fail-wiki").addEventListener("click", () => switchView("wiki"));

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "career") {
      evaluate(); // 进页先补过 + 渲染
    }
  });
  document.addEventListener("qs:lang", () => renderCareer());

  // 开机: 静默补过一次 (不渲染隐藏视图, evaluate 内部已判)
  evaluate();
})();
