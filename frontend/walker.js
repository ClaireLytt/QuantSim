// 市场行者: 学堂的叙事 RPG 层——把名场面(亲历历史)/剧本杀(悬案调查)/重生逆袭(资产经营)
// 按时代串成 8 个章节。与声望/藏品系统同一哲学: 一切状态从现有进度派生, 零新增存档
// (唯一例外: 二周目开关 qs_walker_ng, 一个布尔)。
// 依赖 academy.js 的 prog/FAMOUS_LEVELS/CASES/openPlay/openCase/pick, relics.js 的 qsRep, i18n 的 t()。
(() => {
  // 章节: famous = 本章名场面关卡下标; caseIdx = 本章悬案; 年份标签用于节点
  const CHAPTERS = [
    { id: 0, year: "1929", famous: [10], caseIdx: 0 },
    { id: 1, year: "1987-90", famous: [6, 7], caseIdx: 1 },
    { id: 2, year: "1997", famous: [11], caseIdx: 2 },
    { id: 3, year: "2000", famous: [5], caseIdx: 3 },
    { id: 4, year: "2007-08", famous: [8, 3], caseIdx: 4 },
    { id: 5, year: "2015-16", famous: [0, 9], caseIdx: 5 },
    { id: 6, year: "2020", famous: [4], caseIdx: 6 },
    { id: 7, year: "2021-22", famous: [2, 1, 12], caseIdx: 7 },
  ];
  const NG_KEY = "qs_walker_ng";
  const isNG = () => {
    try { return localStorage.getItem(NG_KEY) === "1"; } catch (e) { return false; }
  };

  const chDone = (ch) => ch.famous.every((i) => prog.famous.includes(i)) && prog.cases.includes(CASES[ch.caseIdx].id);
  const chCleared = (ch) => ch.famous.filter((i) => prog.famous.includes(i)).length;
  const allDone = () => CHAPTERS.every(chDone);

  let selected = null;

  // ---------- 时代章节时间线: 紫=已通关 / 蓝光=当前推进点 / 灰=未推进 (不锁功能, 全部可点) ----------
  // 章节进度软门禁: 首章永远开放; 其余章需前一章有任意进度 (或本章已有存量进度, 老档不回退)
  const chTouched = (ch) => chCleared(ch) > 0 || prog.cases.includes(CASES[ch.caseIdx].id);
  const chUnlocked = (ch) => ch.id === 0 || chTouched(ch) || chTouched(CHAPTERS[ch.id - 1]);

  // 节点时代图标 (线性 glyph 嵌圆点; 通关=循环, 锁定=锁)
  const CH_ICON = [
    '<path d="M5 4h11v16H5z"/><path d="M8 8h5M8 12h5M8 16h5"/>',
    '<circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M8 15h8"/>',
    '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 10h6M9 14h6"/>',
    '<path d="M12 3c3 2 5 6 5 9l-2 5-3-2-3 2-2-5c0-3 2-7 5-9z"/>',
    '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    '<path d="M9 3h6l-2 7h4L9 21l2-8H7z"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3"/>',
  ];
  const svgWrap = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const LOOP_ICON = '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/>';
  const LOCK_ICON = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';

  function renderRail() {
    const rail = $("walker-rail");
    rail.innerHTML = "";
    const nextUp = CHAPTERS.find((ch) => !chDone(ch) && chUnlocked(ch));
    CHAPTERS.forEach((ch) => {
      const done = chDone(ch);
      const locked = !chUnlocked(ch);
      // 四态: 灰锁定(不可点) / 蓝可进入 / 紫已通关 / 紫+循环=开放轮回
      const node = document.createElement("div");
      node.className = "tl-node" + (locked ? " locked" : " playable")
        + (done ? " done" : !locked && ch === nextUp ? " walker-next" : "")
        + (ch.id === selected ? " sel" : "");
      if (!locked) node.tabIndex = 0;
      const dot = document.createElement("span");
      dot.className = "tl-dot2";
      dot.innerHTML = svgWrap(done ? LOOP_ICON : locked ? LOCK_ICON : CH_ICON[ch.id], done || locked ? 2.4 : 2);
      const year = document.createElement("span");
      year.className = "tl-year2";
      year.textContent = ch.year;
      const name = document.createElement("span");
      name.className = "tl-name";
      name.textContent = t("walker.ch" + ch.id + ".t");
      node.append(dot, year, name);
      // 已通关节点: 圆点右下角绿勾小徽 (悬停 title 给全文, 避免节点下方再挂胶囊)
      if (done) {
        const tag = document.createElement("i");
        tag.className = "tl-done-tag";
        tag.textContent = "✓";
        tag.title = t("academy.passed"); // 复用"已通关"键, 全站状态词统一
        dot.appendChild(tag);
      }
      if (!locked) {
        const open = () => { selected = ch.id; renderRail(); renderPanel(); };
        node.addEventListener("click", open);
        node.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });
      }
      rail.appendChild(node);
    });
    renderGlobal();
  }

  // ---------- 右栏全局进度: 主线 / 藏品 / 行者任务 ----------
  function renderGlobal() {
    const done = CHAPTERS.filter(chDone).length;
    $("ep-main-bar").style.width = (done / CHAPTERS.length) * 100 + "%";
    $("ep-main-text").textContent = t("ep.mainText", done, CHAPTERS.length);
    $("btn-walker-end").hidden = !allDone();
    $("btn-walker-ng2").hidden = !allDone() || isNG();
    if (window.qsRelicsPreview) {
      qsRelicsPreview($("epoch-relics"), 6);
      const c = qsRelicsCount();
      $("ep-relic-sets").textContent = c.got + " / " + c.total;
    }
    // 行者任务: 读桌宠每日训练 (qs_pet.tasks), 完成打勾领声望 (经验奖励由桌宠体系发放)
    const ul = $("epoch-tasks");
    ul.innerHTML = "";
    let petTasks = {};
    try {
      const pd = JSON.parse(localStorage.getItem("qs_pet") || "null");
      if (pd && pd.tDate === qsTodayStr()) petTasks = pd.tasks || {};
    } catch (e) { /* ignore */ }
    ["bt", "game", "report"].forEach((k) => {
      const li = document.createElement("li");
      li.textContent = (petTasks[k] ? "✓ " : "") + t("pet.task." + k);
      if (petTasks[k]) li.classList.add("ep-task-done");
      ul.appendChild(li);
    });
  }

  // ---------- 时代章节抽屉: 简介 + 三个纵向任务 + 互通数据 (资产/情报/藏品/声望) ----------
  function renderPanel() {
    const box = $("walker-panel");
    if (selected == null) { box.hidden = true; return; }
    const ch = CHAPTERS[selected];
    box.hidden = false;
    $("walker-ch-title").textContent = ch.year + " · " + t("walker.ch" + ch.id + ".t");
    $("walker-ch-desc").textContent = t("walker.ch" + ch.id + ".d");
    $("walker-ch-intro").textContent = t("walker.ch" + ch.id + ".s"); // 故事引子
    const clearedN = chCleared(ch);
    $("walker-task-event").querySelector("i").textContent = clearedN + " / " + ch.famous.length;
    const caseDone = prog.cases.includes(CASES[ch.caseIdx].id);
    $("walker-task-case").querySelector("i").textContent = (caseDone ? 1 : 0) + " / 1";
    $("walker-task-case").querySelector("span").textContent = pick(CASES[ch.caseIdx].title);
    // 互通数据: 总资产 (重生最佳身家, 全时代共用的"本金池") / 情报 (破案即得) / 藏品 / 声望
    const worth = rebornWorth();
    // 任务进度条: 历练按身家对标 1000 万里程碑, 悬案 0/1, 危机按本章关卡
    $("wt-bar-biz").style.width = Math.min(100, worth / 10000000 * 100) + "%";
    $("wt-bar-case").style.width = (caseDone ? 100 : 0) + "%";
    $("wt-bar-event").style.width = (clearedN / ch.famous.length) * 100 + "%";
    // 状态/标签/按钮: 按主线进度切换 (通关后开放轮回/支线玩法)
    const eventDone = clearedN >= ch.famous.length;
    $("wt-tag-biz").textContent = t("ep.tag.repeat");
    $("wt-tag-case").textContent = caseDone ? t("ep.tag.side") : t("ep.tag.main");
    $("wt-tag-event").textContent = eventDone ? t("ep.tag.loop") : t("ep.tag.main");
    $("wt-status-biz").textContent = worth
      ? t("walker.st.bizDone", worth.toLocaleString()) : t("walker.st.biz");
    $("btn-walker-risky").hidden = !worth;
    $("wt-status-case").textContent = caseDone ? t("walker.st.caseDone") : t("walker.st.case");
    $("wt-side-left").hidden = !caseDone;
    if (caseDone) $("wt-side-left").textContent = t("ep.sideLeft", sideLeft());
    $("wt-status-event").textContent = eventDone ? t("walker.st.eventDone") : t("walker.st.event");
    $("btn-walker-loop").hidden = !eventDone;
    $("walker-ch-worth").textContent = worth ? worth.toLocaleString() : "--";
    $("walker-ch-intel").textContent = (caseDone ? 1 : 0) + "/1";
    $("walker-ch-rep").textContent = String(clearedN * 40 + (caseDone ? 30 : 0));
    $("walker-ch-relics").textContent = clearedN + " / " + ch.famous.length;
    // 金豆 NPC: 台词随时代 + 任务进度动态切换 (未动工=时代引导 / 推进中=催更 / 已通关=轮回邀请)
    const npcLine = chDone(ch) ? t("walker.npcDone." + (ch.id % 3))
      : (clearedN > 0 || caseDone) ? t("walker.npcMid." + (ch.id % 3))
        : t("walker.npc." + ch.id);
    document.dispatchEvent(new CustomEvent("qs:petSay", { detail: npcLine }));
  }

  const rebornWorth = qsRebornWorth; // 共享实现在 app.js
  $("btn-walker-close").addEventListener("click", () => { selected = null; renderPanel(); });

  // ---------- 左上角一行档案入口 ----------
  function renderMini() {
    $("wm-name").textContent = (window.Auth && Auth.user && Auth.user.username) || t("role.guest");
    $("wm-rep-line").textContent = t("role.rep", window.qsRep ? qsRep() : 0);
    $("walker-talent-sel").value = prog.talent || ""; // 选择器已移入完整档案弹窗
    // 向导狐狸台词: 按周轮换 3 句叙事引导 (口径与首页本周推荐一致)
    $("walker-fox-bubble").textContent = t("walker.fox." + (qsWeekIndex() % 3));
  }
  $("walker-line").addEventListener("click", () => window.qsOpenRole && qsOpenRole());
  document.addEventListener("qs:view", renderMini);

  $("btn-walker-event").addEventListener("click", () => {
    const ch = CHAPTERS[selected];
    const next = ch.famous.find((i) => !prog.famous.includes(i));
    // 主线通关后 = 轮回扰动挑战: 随机重返本章任一危机
    openPlay("famous", next != null ? next : ch.famous[Math.floor(Math.random() * ch.famous.length)]);
  });
  // 支线配额: 每日 3 次随机支线 (主线不占额度)
  const SIDE_KEY = "qs_walker_side";
  function sideLeft() {
    try {
      const d = JSON.parse(localStorage.getItem(SIDE_KEY) || "null");
      return d && d.d === qsTodayStr() ? Math.max(0, 3 - (d.n || 0)) : 3;
    } catch (e) { return 3; }
  }
  function useSide() {
    try {
      const d = JSON.parse(localStorage.getItem(SIDE_KEY) || "null");
      const n = d && d.d === qsTodayStr() ? (d.n || 0) + 1 : 1;
      localStorage.setItem(SIDE_KEY, JSON.stringify({ d: qsTodayStr(), n }));
    } catch (e) { /* ignore */ }
  }
  $("btn-walker-case").addEventListener("click", () => {
    const ch = CHAPTERS[selected];
    if (prog.cases.includes(CASES[ch.caseIdx].id)) {
      if (sideLeft() <= 0) { toast(t("ep.sideOut")); return; }
      // 主线案件已破: 接取随机支线 (任一未破案件; 全破则随机重温)
      const open = CASES.map((c, i) => i).filter((i) => !prog.cases.includes(CASES[i].id));
      const pool = open.length ? open : CASES.map((_, i) => i);
      useSide();
      openCase(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      openCase(ch.caseIdx);
    }
  });
  $("btn-walker-loop").addEventListener("click", () => {
    const ch = CHAPTERS[selected];
    openPlay("famous", ch.famous[Math.floor(Math.random() * ch.famous.length)]); // 轮回扰动: 随机重返
  });
  $("btn-walker-ng2").addEventListener("click", () => {
    try { localStorage.setItem(NG_KEY, "1"); } catch (e) { /* ignore */ }
    toast(t("walker.ng.on"));
    playSound("win");
    renderGlobal();
  });
  $("btn-ep-train").addEventListener("click", () => switchView("games"));
  // 职业天赋: 可选分支, 存 prog.talent (云同步)
  $("walker-talent-sel").addEventListener("change", () => {
    prog.talent = $("walker-talent-sel").value;
    saveProg();
    toast(t("ep.talentSet"));
  });
  $("btn-walker-biz").addEventListener("click", () => switchView("reborn"));
  // 高风险模式: 直奔重生逆袭并给出玩法指引 (生意全押 + 竞拍抢筹的高波动打法)
  $("btn-walker-risky").addEventListener("click", () => {
    switchView("reborn");
    toast(t("walker.riskyHint"));
  });

  // ---------- 行者档案扩展: 学识/信誉 + 历练日志 + 套装被动 (relics.js 的角色面板回调) ----------
  // 市场学识 = 教学关×10 + 破案×15; 信誉值 = 名场面×5 + 生涯章×20 —— 全派生
  window.qsWalkerRole = () => {
    const wis = prog.teach.length * 10 + prog.cases.length * 15;
    const cred = prog.famous.length * 5 + (window.qsCareerChapters ? qsCareerChapters() * 20 : 0);
    $("role-wis").textContent = String(wis);
    $("role-cred").textContent = String(cred);
    // 历练日志: 关键选择 (生涯 flags) + 已通关章节
    const ul = $("role-journal");
    ul.innerHTML = "";
    const f = (prog.career && prog.career.flags) || {};
    const entries = [];
    if (f.path) entries.push(t("walker.log.path." + f.path));
    if (f.school) entries.push(t("walker.log.school." + f.school));
    if (f.fund) entries.push(t("walker.log.fund." + f.fund));
    CHAPTERS.filter(chDone).forEach((ch) => entries.push(t("walker.log.chDone", ch.year)));
    if (!entries.length) entries.push(t("walker.log.empty"));
    entries.slice(0, 6).forEach((txt) => {
      const li = document.createElement("li");
      li.textContent = txt;
      ul.appendChild(li);
    });
    // 二周目套装被动: 开启二周目后, 每个通关章节点亮一条被动 (风味加成)
    const pa = $("role-passives");
    pa.innerHTML = "";
    if (!isNG()) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = t("walker.ng.locked");
      pa.appendChild(p);
    } else {
      CHAPTERS.filter(chDone).forEach((ch) => {
        const row = document.createElement("div");
        row.className = "walker-passive";
        row.textContent = t("walker.pass." + ch.id);
        pa.appendChild(row);
      });
      if (!pa.children.length) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = t("walker.ng.none");
        pa.appendChild(p);
      }
    }
  };

  // ---------- 结局页: 终局汇总 + 叙事独白 + 二周目 ----------
  function openEnding() {
    const famousRate = prog.famous.length / FAMOUS_LEVELS.length;
    const caseRate = prog.cases.length / CASES.length;
    let worth = 0;
    try {
      const d = JSON.parse(localStorage.getItem("qs_reborn") || "null");
      worth = d && d.best ? Number(d.best.worth) || 0 : 0;
    } catch (e) { /* ignore */ }
    // 结局判定: 全能→行者; 偏破案→历史侦探; 偏资产→时间旅商; 兜底→收藏家
    const key = caseRate >= 0.8 && famousRate >= 0.8 ? "legend"
      : caseRate >= famousRate ? "sleuth" : worth >= 10000000 ? "tycoon" : "collector";
    $("walker-end-title").textContent = t("walker.end.title", t("walker.end." + key + ".n"));
    $("walker-end-worth").textContent = worth ? worth.toLocaleString() : "--";
    $("walker-end-case").textContent = Math.round(caseRate * 100) + "%";
    $("walker-end-relic").textContent = Math.round(famousRate * 100) + "%";
    const f = (prog.career && prog.career.flags) || {};
    $("walker-end-choices").textContent = [f.path && t("walker.log.path." + f.path),
      f.school && t("walker.log.school." + f.school), f.fund && t("walker.log.fund." + f.fund)]
      .filter(Boolean).join(" · ") || t("walker.log.empty");
    $("walker-end-story").textContent = t("walker.end." + key + ".s");
    $("walker-end-pet").textContent = t("walker.end." + key + ".pet");
    $("walker-end-modal").hidden = false;
    if (typeof spawnConfetti === "function") spawnConfetti();
    playSound("win");
  }
  $("btn-walker-end").addEventListener("click", openEnding);
  $("btn-walker-end-close").addEventListener("click", () => { $("walker-end-modal").hidden = true; });
  $("btn-walker-back").addEventListener("click", () => {
    $("walker-end-modal").hidden = true;
    switchView("academy");
  });
  $("btn-walker-ng").addEventListener("click", () => {
    try { localStorage.setItem(NG_KEY, "1"); } catch (e) { /* ignore */ }
    $("walker-end-modal").hidden = true;
    toast(t("walker.ng.on"));
    playSound("win");
  });

  // 悬案弹窗里的金豆提示: 没破的案给一句通用侦查思路 (零 LLM 成本)
  $("btn-story-pet").addEventListener("click", () => {
    toast(t("walker.petHint." + Math.floor(Math.random() * 3)));
    playSound("tap");
  });

  document.addEventListener("qs:progress", () => { renderRail(); renderPanel(); renderMini(); });
  document.addEventListener("qs:lang", () => { renderRail(); renderPanel(); renderMini(); });
  renderRail();
  renderMini();
})();
