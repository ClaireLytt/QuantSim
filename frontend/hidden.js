// 隐藏机制 1-20 (策略单一化审计后的"可发现奖励层"方案, 2026-10-27):
// 1-10: 纪律之手 / 以静制动 / 对手镜 / 晨钟 / 睡后收入 / 以彼之道 /
//       历史回声印章 / 抄底试炼 / 排队文化 / 凤凰计划;
// 11-20: 共振日 / 禅定局(佛系) / 偏差矫正 / 日志学者 / 空窗期 /
//        双冠 / 规则字条 / 策略档案 / 分布思维 / 似曾相识。
// 设计守则: 纯奖励层 (徽章/称号/彩蛋), 不发积分、不改任何竞技口径; 线索全部来自
// 游戏内可见数据。跨局进度存 localStorage (qs_hidden), 与 qs_progress 分开。
// 加载序依赖: app.js ($ / t / toast / qsModal) + i18n.js (t 键) +
// academy.js (awardBadge / awardTitle) + play.js (全局 state 与 qs:* 事件), 必须在四者之后。

(() => {
  const KEY = "qs_hidden";
  let H = { bellLast: "", bellStreak: 0, mirrorStreak: 0, stamps: [], phoenixArmed: false,
    // 11-20 的跨局进度
    resonance: 0, journal: [], holderRun: 0, zenUnlocked: false,
    aiLoss: {}, biasRun: {}, biasArmed: {}, biasClean: {},
    ruleFails: {}, ruleArmed: "", blindBadWeeks: 0, blindLastWeek: null, blindArmed: false,
    labSeen: {}, dejaApplied: 0, lastBox: "", firstSeen: "", activeDays: [],
    // 21-25 的跨局进度
    monthPass: {}, medals: [] };
  try { H = Object.assign(H, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* 隐私模式下忽略 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(H)); } catch (e) { /* ignore */ } };
  window.qsHidden = H; // academy.js 的徽章进度条 (晨钟/亲历者) 从这里读

  // 会话内状态: 每局开局 (qs:gameStart) 重置
  let queueHits = 0;       // #9 同一局内涨停板拒单次数
  let dipShown = false;    // #8 抄底试炼每局最多弹一次
  let dipAccepted = false;
  let phoenixPending = false; // #10 点了凤凰按钮、等开局成功
  let phoenixSession = false;
  let zenPending = false;     // #12 禅定局同理
  let zenSession = false;
  let prevCloses = null;      // #11 组合模式上一 tick 各标的收盘
  let dejaActive = false;     // #20 本局标的曾在研究所完整浏览过

  document.addEventListener("qs:gameStart", () => {
    queueHits = 0;
    dipShown = false;
    dipAccepted = false;
    phoenixSession = phoenixPending;
    phoenixPending = false;
    zenSession = zenPending;
    zenPending = false;
    prevCloses = null;
    // #20 似曾相识: 竞技局标的是 "???", 结构上不可能命中 (防剧透)
    const s = window.state || {};
    dejaActive = !!(s.stockCode && H.labSeen[s.stockCode]);
    const hint = $("deja-hint");
    if (hint) {
      hint.hidden = !dejaActive;
      if (dejaActive) hint.textContent = t("hidden.deja", H.labSeen[s.stockCode]);
    }
    renderArchiveLink(s.aiLevel);
  });

  // ---------- #8 抄底试炼: 连续 3 根阴线且累计 ≤ -8% 时弹试炼卡 ----------

  const dipModal = qsModal("dip-modal", { closeBtnId: "btn-dip-close", escape: true });
  $("btn-dip-accept").addEventListener("click", () => {
    dipAccepted = true;
    dipModal.close();
    toast(t("hidden.dipAccepted"));
  });
  $("btn-dip-decline").addEventListener("click", dipModal.close);

  document.addEventListener("qs:tick", (ev) => {
    const s = window.state || {};
    // #11 共振日: 组合模式三标的同日全部 ±3% 同向
    const positions = ev.detail && ev.detail.status && ev.detail.status.positions;
    if (s.mode === "PORTFOLIO" && Array.isArray(positions) && positions.length >= 3) {
      const closes = {};
      positions.forEach((p) => { closes[p.stockCode] = Number(p.price); });
      if (prevCloses) {
        const pcts = positions.map((p) => prevCloses[p.stockCode] > 0
          ? closes[p.stockCode] / prevCloses[p.stockCode] - 1 : 0);
        const allUp = pcts.every((x) => x >= 0.03);
        const allDown = pcts.every((x) => x <= -0.03);
        if (allUp || allDown) {
          H.resonance++;
          save();
          toast(t("hidden.resonance", H.resonance));
          if (H.resonance >= 3) awardBadge("h_resonance");
        }
      }
      prevCloses = closes;
    }
    const k = s.klines || [];
    if (dipShown || k.length < 4) return;
    const base = Number(k[k.length - 4].close);
    const closes = k.slice(-3).map((b) => Number(b.close));
    const allDown = closes[0] < base && closes[1] < closes[0] && closes[2] < closes[1];
    if (base > 0 && allDown && closes[2] / base - 1 <= -0.08) {
      dipShown = true;
      dipModal.open();
    }
  });

  // ---------- #9 排队文化: 同一局涨停拒单三连 ----------

  document.addEventListener("qs:tradeRejected", (e) => {
    if (!String(e.detail || "").includes("涨停")) return;
    queueHits++;
    if (queueHits === 3) {
      toast(t("hidden.queue3"));
      awardBadge("h_queue");
    }
  });

  // ---------- #6 以彼之道: 战书榜踢馆成功 (mates.js 派发) ----------

  document.addEventListener("qs:gateCrash", () => awardBadge("h_gate"));

  // ---------- 结算时判定 #1/#2/#3/#5/#7/#8/#10 ----------

  document.addEventListener("qs:settled", (e) => {
    const r = e.detail || {};
    const s = window.state || {};
    const trades = s.trades || [];
    const ret = Number(r.returnRate);

    // #1 纪律之手: 全理由 (≥8 字, 与 AUDIT 口径一致) + 未用道具 + 正收益。
    // 线索: 只要全理由就在结算卡留批注, 不论胜负——引导玩家保持直到集齐三条件
    const allReasons = trades.length > 0
      && trades.every((tx) => String(tx.reason || "").trim().length >= 8);
    if (allReasons) {
      const card = $("settle-card");
      if (card && !card.querySelector(".hidden-note")) {
        const p = document.createElement("p");
        p.className = "hint hidden-note";
        p.textContent = t("hidden.allReasons");
        card.appendChild(p);
      }
      if (!s.itemUsed && ret > 0) awardBadge("h_discipline");
    }

    // #2 以静制动: 熊市生存零交易, 靠利息跑赢买入持有
    if (s.mode === "SURVIVAL" && trades.length === 0 && r.holdReturnRate != null
        && ret > Number(r.holdReturnRate)) {
      awardBadge("h_idle");
    }

    // #5 睡后收入: 利息 > |交易盈亏| 且至少交易过一笔 (与 #2 的纯躺平区分)
    const interest = Number(r.interestTotal || 0);
    const tradePnl = Number(r.finalAssets) - Number(r.initialCash) - interest;
    if (trades.length >= 1 && interest > 0 && interest > Math.abs(tradePnl)) {
      awardBadge("h_interest");
    }

    // #3 对手镜: AI 出手的每一天方向都相反且胜之, 连续三局
    updateMirror(r, s, trades, ret);

    // #4 晨钟: 每日挑战在刷新 (上海零点) 后 1 小时内完赛, 连续 7 天
    if (s.mode === "DAILY") updateBell();

    // #7 历史回声: 本局见过的 HIGH 级历史事件记成印章 (play.js 收集进 state.newsHigh)
    const seen = s.newsHigh || [];
    if (seen.length) {
      seen.forEach((n) => {
        if (!H.stamps.some((x) => x.zh === n.zh)) H.stamps.push(n);
      });
      save();
      renderStamps();
      if (H.stamps.length >= 5) awardBadge("h_witness");
    }

    // #8 抄底试炼收卷: 接了试炼、真买过、正收益
    if (dipAccepted && ret > 0 && trades.some((tx) => tx.dir === "BUY")) {
      awardBadge("h_knife");
    }

    // #10 凤凰计划: 凤凰局正收益得称号; 被强平则点亮下次开局的凤凰入口
    if (phoenixSession && ret > 0) {
      awardTitle({ zh: "涅槃", en: "Phoenix" });
    }
    if (s.wasLiquidated) {
      H.phoenixArmed = true;
      save();
      renderPhoenix();
    }

    // #12 禅定局: 连续 5 局风格画像为佛系持有 → 点亮入口; 禅定局获胜得称号
    if (s.mode !== "INTRO" && r.styleTag) {
      H.holderRun = r.styleTag === "HOLDER" ? H.holderRun + 1 : 0;
      if (!H.zenUnlocked && H.holderRun >= 5) {
        H.zenUnlocked = true;
        toast(t("hidden.zenUnlocked"));
      }
      save();
      renderZen();
    }
    if (zenSession && ret > 0) {
      awardTitle({ zh: "扫地僧", en: "The Sweeper Monk" });
      awardBadge("h_zen");
    }

    // #13 偏差矫正: 同一偏差连亮 3 局 → 提示; 其后连续 3 局不亮 → 破除徽章
    const verdicts = (r.biasReport && r.biasReport.verdicts) || [];
    if (verdicts.length) {
      verdicts.forEach((v) => {
        const k = v.key;
        if (v.triggered) {
          H.biasRun[k] = (H.biasRun[k] || 0) + 1;
          H.biasClean[k] = 0;
          if (H.biasRun[k] === 3 && !H.biasArmed[k]) {
            H.biasArmed[k] = true;
            toast(t("hidden.biasRun3"));
          }
        } else {
          H.biasRun[k] = 0;
          if (H.biasArmed[k]) {
            H.biasClean[k] = (H.biasClean[k] || 0) + 1;
            if (H.biasClean[k] >= 3) {
              delete H.biasArmed[k];
              H.biasClean[k] = 0;
              awardBadge("h_corrected");
            }
          }
        }
      });
      save();
    }

    // #14 日志学者: 认真理由 (≥8 字) 的流水攒 20 条解锁"理由×结果"透视
    (r.journal || []).forEach((j) => {
      if (String(j.reason || "").trim().length >= 8) {
        H.journal.push({ r: j.reason, o: j.outcomePct });
        if (H.journal.length > 100) H.journal.shift();
      }
    });
    if ((r.journal || []).length) {
      save();
      renderScholar();
      if (H.journal.length >= 20) awardBadge("h_scholar");
    }

    // #17 规则字条: 同一每日规则连败 3 次 → 结算卡出现攻略字条; 之后通过该规则 → 破咒
    if (r.dailyChallenge && r.dailyChallenge.rule) {
      const rule = r.dailyChallenge.rule;
      if (r.dailyChallenge.passed) {
        if (H.ruleArmed === rule) {
          H.ruleArmed = "";
          awardBadge("h_curse");
        }
        H.ruleFails[rule] = 0;
      } else {
        H.ruleFails[rule] = (H.ruleFails[rule] || 0) + 1;
        if (H.ruleFails[rule] >= 3) {
          H.ruleArmed = rule;
          showRuleNote(rule);
        }
      }
      save();
    }

    // #18 策略档案: 被同一 AI 人设击败累计计数; 档案解锁后首次战而胜之 → 知己知彼
    if (r.aiReturnRate != null && s.aiLevel) {
      const persona = String(s.aiLevel).toLowerCase();
      const beatAi = ret > Number(r.aiReturnRate);
      if (!beatAi) {
        H.aiLoss[persona] = (H.aiLoss[persona] || 0) + 1;
      } else if ((H.aiLoss[persona] || 0) >= 5) {
        awardBadge("h_knowfoe");
      }
      save();
      renderArchiveLink(s.aiLevel);
      // #23 你读完了它的书: 量化狂魔是确定性均线纪律派——在它出手前一天同向埋伏并胜之
      if (persona === "hard" && beatAi) {
        const aiMoves = (s.aiMoves || []).filter((m) => m.shares);
        const frontRan = trades.some((tx) => aiMoves.some((m) =>
          m.idx === tx.idx + 1 && Math.sign(m.shares) === (tx.dir === "BUY" ? 1 : -1)));
        if (frontRan) awardBadge("h_readbook");
      }
    }

    // #25 赛季月相: 每日挑战通过数按月累计, 攒满 10 次铸当月勋章
    if (r.dailyChallenge && r.dailyChallenge.passed) {
      const ym = shanghaiNow().toISOString().slice(0, 7);
      H.monthPass[ym] = (H.monthPass[ym] || 0) + 1;
      save();
      mintMedals();
    }

    // #20 似曾相识: 研究过的标的上取胜计入"学以致用"
    if (dejaActive && ret > 0) {
      H.dejaApplied++;
      save();
      if (H.dejaApplied >= 3) awardBadge("h_deja");
    }
  });

  // ---------- #17 字条内容: 按规则给静态攻略 (匿名高分摘要需后端聚合, 先用手写字条) ----------

  function showRuleNote(rule) {
    const card = $("settle-card");
    if (!card || card.querySelector(".hidden-rule-note")) return;
    const p = document.createElement("p");
    p.className = "hint hidden-rule-note";
    p.textContent = t("hidden.ruleNote") + " " + t("hidden.note." + rule);
    card.appendChild(p);
  }

  // ---------- #16 双冠: 收益榜与夏普榜同季同时进 TOP20 ----------

  let crownChecked = false; // 每次进榜单页查一次即可
  document.addEventListener("qs:view", async (e) => {
    if (e.detail !== "ranking" || crownChecked) return;
    crownChecked = true;
    try {
      const now = new Date();
      const season = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ret, sharpe] = await Promise.all([
        api("/leaderboard?season=" + season),
        api("/leaderboard?season=" + season + "&sort=sharpe"),
      ]);
      if (ret.some((x) => x.isSelf) && sharpe.some((x) => x.isSelf)) {
        awardTitle({ zh: "既快又稳", en: "Fast and Steady" });
      }
    } catch (err) { /* 榜单失败不打扰 */ }
  });

  // ---------- #18 策略档案 UI ----------

  const PERSONAS = ["easy", "normal", "hard", "hell"];
  const archiveModal = qsModal("archive-modal", { closeBtnId: "btn-archive-close", escape: true });

  function renderArchiveLink(aiLevel) {
    const link = $("ai-archive-link");
    if (!link) return;
    const persona = String(aiLevel || "").toLowerCase();
    // 裂纹线索: 被该人设击败 ≥3 次后才出现入口
    link.hidden = !persona || (H.aiLoss[persona] || 0) < 3;
  }

  function renderArchive() {
    const box = $("archive-list");
    box.innerHTML = "";
    PERSONAS.forEach((p) => {
      const losses = H.aiLoss[p] || 0;
      const item = document.createElement("p");
      item.className = "hint";
      const name = document.createElement("b");
      name.textContent = t("ai.persona." + p) + " · ";
      const body = document.createElement("span");
      body.textContent = losses >= 5
        ? t("hidden.archive." + p)
        : t("hidden.archiveLocked", losses);
      item.append(name, body);
      box.appendChild(item);
    });
  }

  $("ai-archive-link").addEventListener("click", () => {
    renderArchive();
    archiveModal.open();
  });

  // ---------- #19 分布思维: 盲测擂台连续两周垫底后翻出对照卡 (dojo.js 派发) ----------

  document.addEventListener("qs:blindBoard", (e) => {
    const b = e.detail || {};
    if (!b.revealed || !Array.isArray(b.rows) || b.rows.length < 3) return;
    const idx = b.rows.findIndex((x) => x.isSelf);
    if (idx < 0 || b.week === H.blindLastWeek) {
      renderBlindCard(b);
      return;
    }
    H.blindLastWeek = b.week;
    const bottom = idx >= Math.ceil(b.rows.length * 2 / 3);
    const topHalf = idx < Math.ceil(b.rows.length / 2);
    if (H.blindArmed && topHalf) {
      H.blindArmed = false;
      H.blindBadWeeks = 0;
      awardBadge("h_distribution");
    }
    H.blindBadWeeks = bottom ? H.blindBadWeeks + 1 : 0;
    if (H.blindBadWeeks >= 2) H.blindArmed = true;
    save();
    renderBlindCard(b);
  });

  /** 对照卡: 自己与榜首的三段收益并排——"最差段 50%"的教学时刻。 */
  function renderBlindCard(b) {
    const box = $("rq10-dist");
    if (!box) return;
    const idx = b.rows.findIndex((x) => x.isSelf);
    if (!H.blindArmed || idx < 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const fmt = (ws) => (ws || []).map((w) => fmtPct(Number(w))).join(" / ");
    $("rq10-dist-mine").textContent = t("hidden.distMine", fmt(b.rows[idx].windows));
    $("rq10-dist-top").textContent = t("hidden.distTop", fmt(b.rows[0].windows));
  }

  // ---------- #20 研究所浏览记录 (lab.js 派发) ----------

  document.addEventListener("qs:labHistory", (e) => {
    const code = e.detail;
    if (!code) return;
    H.labSeen[code] = (H.labSeen[code] || 0) + 1;
    save();
  });

  // ---------- #15 空窗期: 30 天活跃且不碰盲盒 ----------

  document.addEventListener("qs:blindbox", () => {
    H.lastBox = shanghaiNow().toISOString().slice(0, 10);
    H.activeDays = [];
    save();
  });

  /** 商城灰尘线索 (points.js renderShop 调): ≥7 天没碰盲盒开始积灰。 */
  window.qsHiddenDustLabel = () => {
    const days = daysSinceBox();
    return days >= 7 ? t("hidden.dust", days) : null;
  };

  function daysSinceBox() {
    const from = H.lastBox || H.firstSeen;
    if (!from) return 0;
    return Math.floor((shanghaiNow() - new Date(from)) / 86400e3);
  }

  function trackActiveDay() {
    const today = shanghaiNow().toISOString().slice(0, 10);
    if (!H.firstSeen) H.firstSeen = today;
    if (!H.activeDays.includes(today)) {
      H.activeDays.push(today);
      if (H.activeDays.length > 40) H.activeDays.shift();
    }
    // 自律者: 30 天没碰盲盒且期间活跃 ≥10 天 (奖励层徽章; 商城折扣需后端经济支持, 另期)
    if (daysSinceBox() >= 30 && H.activeDays.length >= 10) awardBadge("h_abstainer");
    save();
  }

  // ---------- #12 禅定局入口 ----------

  function renderZen() {
    const box = $("zen-banner");
    if (box) box.hidden = !H.zenUnlocked;
  }

  $("btn-zen").addEventListener("click", () => {
    zenPending = true;
    startGame({ maxTrades: 2, requireReason: false });
  });

  // ---------- #14 日志学者面板 (个人页): 1 条起显示进度, 20 条解锁透视 ----------

  function renderScholar() {
    const card = $("profile-scholar-card");
    const box = $("scholar-list");
    if (!card || !box) return;
    card.hidden = H.journal.length === 0;
    if (card.hidden) return;
    const n = H.journal.length;
    $("scholar-progress").textContent = n < 20
      ? t("hidden.scholarProgress", n)
      : t("hidden.scholarRate",
          Math.round(100 * H.journal.filter((j) => Number(j.o) > 0).length / n));
    box.innerHTML = "";
    if (n < 20) return; // 透视 20 条起解锁
    H.journal.slice(-20).reverse().forEach((j) => {
      const p = document.createElement("p");
      p.className = "hint";
      const pct = document.createElement("span");
      const v = Number(j.o);
      pct.className = v >= 0 ? "pos" : "neg";
      pct.textContent = j.o == null ? "--" : fmtPct(v) + " ";
      const txt = document.createElement("span");
      txt.textContent = j.r;
      p.append(pct, txt);
      box.appendChild(p);
    });
  }

  /** #3 判定: AI 每个出手日 (shares≠0) 玩家当日净方向必须相反; AI 出手 <3 天的局不计。 */
  function updateMirror(r, s, trades, ret) {
    if (r.aiReturnRate == null) return;
    const aiMoves = (s.aiMoves || []).filter((m) => m.shares);
    if (aiMoves.length < 3) return;
    const mineByIdx = new Map();
    trades.forEach((tx) => mineByIdx.set(tx.idx,
      (mineByIdx.get(tx.idx) || 0) + (tx.dir === "BUY" ? tx.shares : -tx.shares)));
    const opposedAll = aiMoves.every((m) =>
      Math.sign(mineByIdx.get(m.idx) || 0) === -Math.sign(m.shares));
    H.mirrorStreak = opposedAll && ret > Number(r.aiReturnRate) ? H.mirrorStreak + 1 : 0;
    save();
    if (H.mirrorStreak >= 3) awardBadge("h_mirror");
  }

  /** #4: 以 UTC+8 (无夏令时) 近似游戏时区; 仅视觉奖励, 客户端时钟作弊无利可图。 */
  function shanghaiNow() {
    return new Date(Date.now() + 8 * 3600e3);
  }

  function updateBell() {
    const sh = shanghaiNow();
    if (sh.getUTCHours() !== 0) return; // 刷新后 1 小时内
    const today = sh.toISOString().slice(0, 10);
    if (H.bellLast === today) return;
    const yesterday = new Date(sh.getTime() - 86400e3).toISOString().slice(0, 10);
    H.bellStreak = H.bellLast === yesterday ? H.bellStreak + 1 : 1;
    H.bellLast = today;
    save();
    if (H.bellStreak >= 7) awardBadge("h_bell");
  }

  // ---------- #7 印章墙 (个人页): 集到第一枚才出现 ----------

  function renderStamps() {
    const card = $("profile-stamps-card");
    const list = $("stamp-list");
    if (!card || !list) return;
    card.hidden = H.stamps.length === 0;
    list.innerHTML = "";
    H.stamps.forEach((n) => {
      const span = document.createElement("span");
      span.className = "badge got";
      span.textContent = pick(n);
      list.appendChild(span);
    });
  }

  // ---------- #10 凤凰入口 (开局区): 强平后点亮, 点击即按预设限制开局 ----------

  function renderPhoenix() {
    const box = $("phoenix-banner");
    if (box) box.hidden = !H.phoenixArmed;
  }

  $("btn-phoenix").addEventListener("click", () => {
    H.phoenixArmed = false;
    save();
    renderPhoenix();
    phoenixPending = true;
    startGame({ maxTrades: 10, requireReason: true });
  });

  // ---------- #4/#25 线索: 每日页的清晨一句话与月末满月 ----------

  document.addEventListener("qs:view", (e) => {
    if (e.detail !== "daily") return;
    const view = $("view-daily");
    if (!view) return;
    if (shanghaiNow().getUTCHours() === 0 && !view.querySelector(".hidden-bell-hint")) {
      const p = document.createElement("p");
      p.className = "hint hidden-bell-hint";
      p.textContent = t("hidden.bellHint");
      view.prepend(p);
    }
    // #25 月末 7 天: 月亮渐圆的提示 (勋章按当月通过数在月末铸成)
    const sh = shanghaiNow();
    const lastDay = new Date(Date.UTC(sh.getUTCFullYear(), sh.getUTCMonth() + 1, 0)).getUTCDate();
    if (lastDay - sh.getUTCDate() <= 6 && !view.querySelector(".hidden-moon-hint")) {
      const ym = sh.toISOString().slice(0, 7);
      const p = document.createElement("p");
      p.className = "hint hidden-moon-hint";
      p.textContent = t("hidden.moonHint", H.monthPass[ym] || 0);
      view.prepend(p);
    }
  });

  // ---------- #25 月勋章: 已成为过去的月份且当月通过 ≥10 次 → 铸一枚 (错过不补) ----------

  const MEDAL_MIN_PASSES = 10;

  function mintMedals() {
    const cur = shanghaiNow().toISOString().slice(0, 7);
    Object.keys(H.monthPass).forEach((ym) => {
      if (ym < cur && H.monthPass[ym] >= MEDAL_MIN_PASSES && !H.medals.includes(ym)) {
        H.medals.push(ym);
        toast(t("hidden.medalGot", ym));
      }
    });
    save();
    renderMedals();
  }

  function renderMedals() {
    const card = $("profile-medals-card");
    const list = $("medal-list");
    if (!card || !list) return;
    card.hidden = H.medals.length === 0;
    list.innerHTML = "";
    H.medals.forEach((ym) => {
      const span = document.createElement("span");
      span.className = "badge got";
      span.textContent = ym;
      list.appendChild(span);
    });
  }

  // ---------- #21 第四根线: 通关学院均线课 (教学第 2 关) 解锁 BOLL 芯片 ----------

  function syncBoll() {
    const chip = $("chip-boll");
    // prog 是 academy.js 的顶层 let (全局词法绑定, 不在 window 上), 用 typeof 探测
    if (chip) chip.hidden = !(typeof prog !== "undefined" && prog.teach && prog.teach.includes(1));
  }
  document.addEventListener("qs:view", syncBoll);

  // ---------- #24 周期之眼: 30 局完赛后个人页点亮月份胜率热力 ----------

  let cycleLoaded = false;
  document.addEventListener("qs:view", async (e) => {
    if (e.detail !== "profile" || cycleLoaded) return;
    if (!(window.Auth && Auth.user)) return; // 生涯数据需登录
    cycleLoaded = true;
    try {
      const games = await api("/me/games");
      renderCycleEye(games.filter((g) => g.status === "SETTLED" && g.returnRate != null));
    } catch (err) { /* 未登录/网络异常不打扰 */ }
  });

  function renderCycleEye(rows) {
    const card = $("profile-cycle-card");
    const box = $("cycle-list");
    if (!card || !box) return;
    card.hidden = rows.length < 30; // 样本不足不显示, 避免小样本误导
    if (card.hidden) return;
    const byMonth = {};
    rows.forEach((g) => {
      const m = String(g.createdAt).slice(5, 7);
      byMonth[m] = byMonth[m] || { n: 0, w: 0 };
      byMonth[m].n++;
      if (Number(g.returnRate) > 0) byMonth[m].w++;
    });
    box.innerHTML = "";
    let best = null;
    let worst = null;
    Object.keys(byMonth).sort().forEach((m) => {
      const v = byMonth[m];
      if (v.n < 3) return; // 单月样本 <3 不计入最佳/最差
      const rate = v.w / v.n;
      if (!best || rate > best.rate) best = { m, rate };
      if (!worst || rate < worst.rate) worst = { m, rate };
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("hidden.cycleRow", Number(m), Math.round(rate * 100), v.n);
      box.appendChild(p);
    });
    if (best && worst && best.m !== worst.m) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("hidden.cycleBest", Number(best.m), Number(worst.m));
      box.prepend(p);
    }
  }

  renderStamps();
  renderPhoenix();
  renderZen();
  renderScholar();
  renderMedals();
  mintMedals();
  syncBoll();
  trackActiveDay();
})();
