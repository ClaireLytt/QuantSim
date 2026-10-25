// 悬浮 AI 智能小宠: 小小一只的动物 (可换形象), 可以拖到屏幕任意位置安家 (位置记忆),
// 平时会自己在落脚点附近遛弯/转身/小跳, 夜里原地睡觉; 点它弹出功能面板 (摸头/投喂/聊天/改名/升级)。
// 纯本地规则引擎, 零后端成本; 状态存 qs_pet。
// 依赖 app.js 的 $ / toast / playSound / qsTodayStr, i18n.js 的 t, academy.js 的 prog (可选)。
(() => {
  const KEY = "qs_pet";
  const FEED_PER_DAY = 3;
  const PAT_XP_PER_DAY = 20;
  // 每种宠物 3 段进化形态: 幼年(Lv1-2) → 成年(Lv3-5) → 完全体(Lv6+), 长相随等级变化
  const SPECIES = [
    ["🐱", "🐈", "🐅"], // 猫 → 大猫 → 虎
    ["🐶", "🐕", "🦁"], // 狗 → 大狗 → 狮
    ["🐰", "🐇", "🦄"], // 兔 → 大兔 → 独角兽
    ["🦊", "🐺", "🐉"], // 狐 → 狼 → 龙
    ["🐹", "🐿️", "🐻"], // 仓鼠 → 松鼠 → 熊
  ];
  // 进化阶段: 由等级推导 (等级又由 xp 推导), 不单独存档
  const stage = () => (level() >= 6 ? 2 : level() >= 3 ? 1 : 0);
  const WANDER_X = 90;  // 自主遛弯: 距安家点的最大水平半径
  const WANDER_Y = 24;  // 垂直方向只许小幅挪动, 走路姿态才合理
  const SPEED = 42;     // px/s

  let pet = { name: "", species: 0, xp: 0, fedDate: "", fedCount: 0, patDate: "", patXp: 0,
    lastSeen: "", pos: null, loot: {}, lootDate: "", lootCount: 0,
    bond: 0, tDate: "", tasks: {}, log: [],
    stats: { bt: 0, games: 0, ring: 0, overfit: 0 } }; // 养成面板: 亲密度 / 任务 / 记录 / 里程碑计数
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && typeof p === "object") pet = Object.assign(pet, p);
  } catch (e) { /* 隐私模式下忽略 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(pet)); } catch (e) { /* 同上 */ }
  }

  // 等级曲线: 50/200/450/800... xp, 平方根成长, 前几级快后面慢
  const level = () => Math.floor(Math.sqrt(pet.xp / 50)) + 1;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const widget = $("pet-widget");

  // ---------- 位置: 安家点 (拖拽落点) + 当前位 ----------
  const clampX = (x) => Math.max(4, Math.min(window.innerWidth - 136, x));
  const clampY = (y) => Math.max(58, Math.min(window.innerHeight - 132, y)); // 上留吸顶头部, 下留 toast
  // 默认落点右下角 (设计评审: 左上角与导航拥挤且气质割裂); 玩家拖过的位置照旧记忆
  let home = pet.pos && Number.isFinite(pet.pos.x)
    ? { x: clampX(pet.pos.x), y: clampY(pet.pos.y) }
    : { x: clampX(window.innerWidth - 170), y: clampY(window.innerHeight - 200) };
  let cur = { ...home };

  function applyPos() {
    widget.style.left = cur.x + "px";
    widget.style.top = cur.y + "px";
    // 弹出层防溢出: 靠右开左侧, 靠下往上开
    widget.classList.toggle("pet-pop-left", cur.x > window.innerWidth - 320);
    widget.classList.toggle("pet-pop-up", cur.y > window.innerHeight - 330);
  }

  window.addEventListener("resize", () => {
    home = { x: clampX(home.x), y: clampY(home.y) };
    cur = { x: clampX(cur.x), y: clampY(cur.y) };
    applyPos();
  });

  // ---------- 情绪引擎: 按优先级从上下文推断 ----------
  // miss > hungry > worried > happy > idle (不睡觉: 全天候陪玩家值班)
  function mood() {
    if (pet.lastSeen && daysBetween(pet.lastSeen, qsTodayStr()) >= 2) return "miss";
    if (pet.fedDate !== qsTodayStr()) return "hungry";
    if (typeof prog !== "undefined") {
      // 富豪场身家腰斩 → 担忧; 近 10 猜命中 ≥7 或今日任务全清 → 开心
      if (prog.wealth < prog.wealthBest * 0.5) return "worried";
      const recent = (prog.guessRecent || []).slice(-10);
      const hits = recent.filter(Boolean).length;
      if (recent.length >= 5 && hits / recent.length >= 0.7) return "happy";
    }
    if (tasksAllDone()) return "happy";
    return "idle";
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 864e5);
  }

  function tasksAllDone() {
    // qs_tasks 是扁平结构 {date, guessWins, settled, ...}; 签到态在服务端, 本地只看这两项
    try {
      const st = JSON.parse(localStorage.getItem("qs_tasks") || "{}");
      return st.date === qsTodayStr() && (st.guessWins || 0) >= 3 && !!st.settled;
    } catch (e) {
      return false;
    }
  }

  // ---------- 自主行为: 空闲时在安家点附近遛弯, 偶尔小跳 ----------
  let walking = false;
  let dragging = false;
  let rafId = 0;
  let nextActTimer = 0;

  function face(dir) {
    // emoji 默认朝左; 向右走翻转
    $("pet-sprite-box").classList.toggle("pet-flip", dir > 0);
  }

  function walkTo(tx, ty, onDone) {
    cancelAnimationFrame(rafId);
    walking = true;
    widget.classList.add("pet-walking");
    face(tx - cur.x);
    let last = performance.now();
    const step = (now) => {
      if (dragging) { stopWalk(); return; } // 被拎起来就别蹬腿了
      const dt = (now - last) / 1000;
      last = now;
      const dx = tx - cur.x;
      const dy = ty - cur.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = SPEED * dt;
      if (dist <= stepLen) {
        cur = { x: tx, y: ty };
        applyPos();
        stopWalk();
        if (onDone) onDone();
        return;
      }
      cur = { x: cur.x + (dx / dist) * stepLen, y: cur.y + (dy / dist) * stepLen };
      applyPos();
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  function stopWalk() {
    walking = false;
    widget.classList.remove("pet-walking");
    cancelAnimationFrame(rafId);
    face(-1); // 停下来就转回正脸 (默认朝向), 不保留镜像, 免得看着歪
  }

  function hop() {
    const box = $("pet-sprite-box");
    box.classList.remove("pet-bounce");
    void box.offsetWidth;
    box.classList.add("pet-bounce");
  }

  function scheduleAct() {
    clearTimeout(nextActTimer);
    // 担忧/想念时没精神, 动得更少
    const m = mood();
    const lazy = m === "worried" || m === "miss" ? 2 : 1;
    nextActTimer = setTimeout(act, (3000 + Math.random() * 6000) * lazy);
  }

  function act() {
    // 被拖/页面不可见/面板开着/偏好少动画 → 原地呆着
    if (!reduced && !dragging && !walking && !document.hidden && $("pet-pop").hidden) {
      const roll = Math.random();
      if (roll < 0.1) {
        chaseButterfly(); // 偶尔有蝴蝶飞过, 追!
      } else if (roll < 0.26) {
        hop(); // 偶尔原地小跳
      } else {
        const tx = clampX(home.x + (Math.random() * 2 - 1) * WANDER_X);
        const ty = clampY(home.y + (Math.random() * 2 - 1) * WANDER_Y);
        walkTo(tx, ty, maybeFindLoot); // 遛弯到头偶尔刨出宝物
      }
    }
    scheduleAct();
  }

  // ---------- 趣味: 追蝴蝶 ----------
  function chaseButterfly() {
    const bx = clampX(cur.x + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 80));
    const by = clampY(cur.y + (Math.random() * 2 - 1) * 40);
    const fly = document.createElement("span");
    fly.className = "pet-butterfly";
    fly.textContent = "🦋";
    fly.style.left = bx + 46 + "px";
    fly.style.top = by + 18 + "px";
    document.body.appendChild(fly);
    walkTo(bx, by, () => {
      fly.remove();
      hop();
      spawnHearts();
      speak(t("pet.line.catch"));
      gainXp(2);
    });
    // 兜底: 追丢了 (被拖走/切页) 蝴蝶自己飞走
    setTimeout(() => fly.remove(), 8000);
  }

  // ---------- 趣味: 遛弯刨宝 (每日限 3 次, 宝物进图鉴) ----------
  const LOOT = ["💎", "🍀", "🪙", "🐚", "⭐", "🧧"];
  function maybeFindLoot() {
    const today = qsTodayStr();
    if (pet.lootDate !== today) { pet.lootDate = today; pet.lootCount = 0; }
    if (pet.lootCount >= 3 || Math.random() > 0.22) return;
    const item = LOOT[Math.floor(Math.random() * LOOT.length)];
    pet.lootCount++;
    pet.loot[item] = (pet.loot[item] || 0) + 1;
    save();
    hop();
    // 宝物浮起 (复用爱心飘浮动画)
    const h = document.createElement("span");
    h.className = "pet-heart";
    h.textContent = item;
    h.style.left = "46px";
    widget.appendChild(h);
    setTimeout(() => h.remove(), 1400);
    speak(t("pet.loot.found", pet.name || t("pet.name.default"), item));
    playSound("fill");
    gainXp(5);
  }

  // ---------- 拖拽安家: 按住拖走, 松手落户 (与点击按位移阈值区分) ----------
  (() => {
    const box = $("pet-sprite-box");
    let startX = 0, startY = 0, origX = 0, origY = 0, moved = false;
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      dragging = false;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      origX = cur.x;
      origY = cur.y;
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener("pointermove", (e) => {
      if (!box.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return; // 阈值内当点击
      moved = true;
      dragging = true;
      stopWalk();
      widget.classList.add("pet-dragging");
      cur = { x: clampX(origX + dx), y: clampY(origY + dy) };
      applyPos();
    });
    function endDrag(e, settle) {
      if (box.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
      widget.classList.remove("pet-dragging"); // 必须清掉, 否则 -8° 歪头样式会卡住
      if (settle && moved) {
        home = { ...cur }; // 新家
        pet.pos = { ...home };
        save();
        hop();
      }
      dragging = false;
    }
    box.addEventListener("pointerup", (e) => endDrag(e, true));
    box.addEventListener("pointercancel", (e) => endDrag(e, false));
    // 拖拽后的合成 click 不算摸头
    box.addEventListener("click", (e) => {
      if (moved) {
        e.stopImmediatePropagation();
        moved = false;
      }
    }, true);
  })();

  // ---------- 台词: 按情绪选池, 池内随机 ----------
  const POOL_SIZE = { greet: 3, hungry: 2, miss: 1, happy: 2, worried: 2, tip: 8, fed: 2, pat: 3 };
  function line(pool) {
    const i = Math.floor(Math.random() * POOL_SIZE[pool]);
    return t("pet.line." + pool + "." + i);
  }

  function chatLine(m) {
    // 聊天一半概率说情绪话, 一半概率给投资小贴士 (情绪异常时优先说情绪)
    if (m === "miss" || m === "hungry" || m === "worried") return line(m);
    return Math.random() < 0.5 ? line(m === "happy" ? "happy" : "greet") : line("tip");
  }

  // ---------- 渲染 ----------
  let bubbleTimer;
  // 气泡让路 (ticket 12): 点按立即收起 (移动端无 hover, 这是等价出口); hover 淡出走 CSS
  $("pet-bubble").addEventListener("click", () => {
    clearTimeout(bubbleTimer);
    speakToken++; // 打断进行中的逐字打字, 否则收起后又被补字顶回来
    $("pet-bubble").hidden = true;
  });
  // 逐字打字: token 防新话打断旧话时两段文字串在一起
  let speakToken = 0;
  const REDUCED_MOTION = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function speak(text) {
    const b = $("pet-bubble");
    const tok = ++speakToken;
    clearTimeout(bubbleTimer);
    b.classList.remove("pet-thinking-caps");
    b.hidden = false;
    const armHide = () => { bubbleTimer = setTimeout(() => { b.hidden = true; }, 6000); };
    if (REDUCED_MOTION) { b.textContent = text; armHide(); return; }
    b.textContent = "";
    b.classList.add("pet-typing");
    (async () => {
      for (const ch of text) {
        if (tok !== speakToken) return; // 被新发言打断
        b.textContent += ch;
        await new Promise((r) => setTimeout(r, "，。？！…；,.?!".includes(ch) ? 160 : 28 + Math.random() * 40));
      }
      b.classList.remove("pet-typing");
      armHide();
    })();
  }
  // 思考态: 仅等 /pet/chat 时显示 (本地台词不装思考), 不挂自动隐藏定时器
  function speakThinking() {
    const b = $("pet-bubble");
    ++speakToken;
    clearTimeout(bubbleTimer);
    b.classList.remove("pet-typing");
    b.innerHTML = "<i>Q</i><i>S</i><i>?</i>"; // 纯静态字形, 非文案不进 i18n
    b.classList.add("pet-thinking-caps");
    b.hidden = false;
  }

  function render() {
    const m = mood();
    widget.className = "pet-widget pet-" + m
      + " pet-stage-" + stage()
      + (walking ? " pet-walking" : "")
      + (dragging ? " pet-dragging" : "")
      + (cur.x > window.innerWidth - 320 ? " pet-pop-left" : "")
      + (cur.y > window.innerHeight - 330 ? " pet-pop-up" : "");
    $("pet-sprite").textContent = SPECIES[pet.species % SPECIES.length][stage()];
    // 等级配饰: 2 级起戴帽子, 3 级领结, 4 级墨镜 (emoji, 非文案, 不进 i18n)
    $("pet-hat").textContent = level() >= 4 ? "🕶️" : level() >= 3 ? "🎀" : level() >= 2 ? "🎩" : "";
    $("pet-name").textContent = pet.name || t("pet.name.default");
    $("pet-level").textContent = t("pet.level", level()) + " · " + t("pet.stage." + stage());
    const next = 50 * level() * level();
    const prev = 50 * (level() - 1) * (level() - 1);
    $("pet-xp-bar").style.width = Math.min(100, ((pet.xp - prev) / (next - prev)) * 100) + "%";
    $("btn-pet-feed").disabled = pet.fedDate === qsTodayStr() && pet.fedCount >= FEED_PER_DAY;
    // 宝物袋: 面板内按规格用文字名 (禁 emoji), 浮起动画里仍用 emoji 本体
    const LOOT_NAME = { "💎": "pet.loot.gem", "🍀": "pet.loot.clover", "🪙": "pet.loot.coin",
      "🐚": "pet.loot.shell", "⭐": "pet.loot.star", "🧧": "pet.loot.pack" };
    const items = Object.entries(pet.loot || {});
    $("pet-loot").textContent = items.length
      ? t("pet.loot.label") + ": " + items.map(([k, v]) => t(LOOT_NAME[k] || k) + "×" + v).join("，")
      : t("pet.loot.empty");
    renderPanel();
  }

  // ---------- 养成面板: 成长状态 / 任务 / 技能 / 亲密度 / 成长记录 ----------

  // 四维属性全部由真实行为推导, 不单独存档 (心情=情绪引擎, 专注=今日互动, 纪律=任务与破案, 幸运=按日伪随机)
  function attrs() {
    const moodScore = { happy: 88, idle: 70, hungry: 50, worried: 40, miss: 32 }[mood()] || 60;
    const focus = Math.min(100, 36 + (pet.patXp || 0) * 2 + (pet.fedDate === qsTodayStr() ? pet.fedCount * 10 : 0));
    let disc = 30 + taskDoneCount() * 15;
    if (typeof prog !== "undefined") disc += Math.min(25, ((prog.cases || []).length || 0) * 5);
    // 幸运: 日期+名字做种子的确定性"玄学", 每天换一次
    let h = 0;
    const seedStr = qsTodayStr() + (pet.name || "");
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    const luck = 30 + (h % 66);
    return { mood: Math.min(100, moodScore + Math.floor((pet.bond || 0) / 30)), focus, disc: Math.min(100, disc), luck };
  }

  // 今日训练任务: 回测×1 / 猜涨跌×1 / 聊交易想法×1, 完成即发经验 (每日重置)
  const TASK_XP = { bt: 30, game: 20, report: 25, guess: 20, chat: 25 };
  function ensureTaskDay() {
    const today = qsTodayStr();
    if (pet.tDate !== today) { pet.tDate = today; pet.tasks = {}; }
  }
  function taskDoneCount() {
    ensureTaskDay();
    return Object.keys(pet.tasks).filter((k) => pet.tasks[k]).length;
  }
  function completeTask(key) {
    ensureTaskDay();
    if (pet.tasks[key]) return;
    pet.tasks[key] = 1;
    pushLog("pet.log." + key);
    speak(t("pet.taskDone", t("pet.task." + key), TASK_XP[key]));
    playSound("fill");
    gainXp(TASK_XP[key]); // gainXp 内部 save + render
  }

  // 技能树: 6 节点, 等级/亲密度/经验三类条件 (前 4 个同时显示在主页速览格)
  // n=名称 s=卡片短简介 d=弹窗完整描述
  const SKILLS = [
    { n: "pet.skill.0.n", s: "pet.skill.0.s", d: "pet.skill.0.d", cond: { lv: 1 } },
    { n: "pet.skill.1.n", s: "pet.skill.1.s", d: "pet.skill.1.d", cond: { lv: 2 } },
    { n: "pet.skill.2.n", s: "pet.skill.2.s", d: "pet.skill.2.d", cond: { lv: 3, xp: 800 } },
    { n: "pet.skill.3.n", s: "pet.skill.3.s", d: "pet.skill.3.d", cond: { lv: 3, bond: 300 } },
    { n: "pet.skill.4.n", s: "pet.skill.4.s", d: "pet.skill.4.d", cond: { lv: 4 } },
    { n: "pet.skill.5.n", s: "pet.skill.5.s", d: "pet.skill.5.d", cond: { lv: 4, bond: 600 } },
  ];
  function skillOk(i) {
    const c = SKILLS[i].cond;
    return level() >= (c.lv || 1) && (pet.bond || 0) >= (c.bond || 0) && pet.xp >= (c.xp || 0);
  }
  function condText(i) {
    const c = SKILLS[i].cond;
    const parts = [t("pet.cond.lv", c.lv || 1)];
    if (c.xp) parts.push(t("pet.cond.xp", c.xp));
    if (c.bond) parts.push(t("pet.cond.bond", c.bond));
    return parts.join(" · ");
  }
  function unlockedSkills() {
    return SKILLS.filter((_, i) => skillOk(i)).length;
  }

  // 技能页: 2 列紧凑卡片, 点卡片弹详情 (完整描述 + 解锁条件)
  function renderTree() {
    $("pet-tree-title").textContent = t("pet.tree.title", pet.name || t("pet.name.default"));
    const grid = $("pet-tree-grid");
    grid.innerHTML = "";
    SKILLS.forEach((sk, i) => {
      const ok = skillOk(i);
      const card = document.createElement("button");
      card.className = "pet-sk" + (ok ? " lit" : " locked");
      const name = document.createElement("b");
      name.textContent = t(sk.n);
      const brief = document.createElement("span");
      brief.textContent = t(sk.s);
      card.append(name, brief);
      card.addEventListener("click", () => openSkillModal(i));
      grid.appendChild(card);
    });
  }

  function openSkillModal(i) {
    const ok = skillOk(i);
    $("pet-sk-name").textContent = t(SKILLS[i].n);
    $("pet-sk-desc").textContent = t(SKILLS[i].d);
    $("pet-sk-cond").textContent = (ok ? t("pet.node.unlocked") : t("pet.sk.needs")) + " · " + condText(i);
    petSkillModal.open();
  }
  const petSkillModal = qsModal("pet-skill-modal", { sound: "flip", closeBtnId: "btn-pet-sk-close" });

  // 亲密度: 摸头/投喂/聊天积累; 关系档位 初识→研究伙伴→黄金搭档
  function bondTier() {
    return pet.bond >= 200 ? 2 : pet.bond >= 60 ? 1 : 0;
  }
  function addBond(n) {
    const before = bondTier();
    pet.bond = (pet.bond || 0) + n;
    if (bondTier() > before) {
      speak(t("pet.tierUp", t("pet.tier." + bondTier())));
      playSound("win");
    }
    save();
  }

  // 成长记录: 环形日志, 主页展示最近 3 条, 子页展示全部 30 条 (存 i18n 键, 切语言不坏)
  function pushLog(key) {
    pet.log = [{ d: qsTodayStr(), k: key }, ...(pet.log || [])].slice(0, 30);
    save();
  }

  function bumpStat(key) {
    pet.stats = pet.stats || { bt: 0, games: 0, ring: 0, overfit: 0 };
    pet.stats[key] = (pet.stats[key] || 0) + 1;
    save();
    if (!$("pet-growth").hidden) renderGrowth();
  }

  // ---------- 成长记录子页: 相对日期分组时间轴 + 里程碑 + 统计 ----------
  const MILESTONES = [
    { k: "pet.ms.bt", stat: "bt", need: 5 },
    { k: "pet.ms.games", stat: "games", need: 10 },
    { k: "pet.ms.ring", stat: "ring", need: 3 },
    { k: "pet.ms.overfit", stat: "overfit", need: 1 },
  ];
  function dayLabel(d) {
    const diff = daysBetween(d, qsTodayStr());
    if (diff <= 0) return t("pet.day.today");
    if (diff === 1) return t("pet.day.yest");
    if (diff < 7) return t("pet.day.ago", diff);
    return t("pet.day.week");
  }
  // 页内紧凑版: 最近 3 条 + 迷你统计
  function renderGrowth() {
    const ul = $("pet-log");
    ul.innerHTML = "";
    const logs = (pet.log || []).slice(0, 3);
    if (!logs.length) {
      const li = document.createElement("li");
      li.textContent = t("pet.log.empty");
      ul.appendChild(li);
    } else {
      logs.forEach((e) => {
        const li = document.createElement("li");
        li.textContent = e.d.slice(5) + " · " + t(e.k, pet.name || t("pet.name.default"));
        ul.appendChild(li);
      });
    }
    const st = pet.stats || {};
    $("pet-gs-games").textContent = String(st.games || 0);
    $("pet-gs-bt").textContent = String(st.bt || 0);
  }

  // 「全部」弹窗: 完整分组时间轴 + 里程碑 + 统计汇总
  function renderGrowthModal() {
    $("pet-growth-title").textContent = t("pet.growth.title", pet.name || t("pet.name.default"));
    // 时间轴: 按相对日期分组
    const tl = $("pet-timeline");
    tl.innerHTML = "";
    const logs = pet.log || [];
    if (!logs.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = t("pet.log.empty");
      tl.appendChild(empty);
    }
    let lastLabel = null;
    logs.forEach((e) => {
      const label = dayLabel(e.d);
      if (label !== lastLabel) {
        lastLabel = label;
        const h = document.createElement("p");
        h.className = "pet-tl-day";
        h.textContent = label;
        tl.appendChild(h);
      }
      const item = document.createElement("div");
      item.className = "pet-tl-item";
      item.textContent = t(e.k, pet.name || t("pet.name.default"));
      tl.appendChild(item);
    });
    // 里程碑: 达成打勾, 未达成显示进度
    const ms = $("pet-milestones");
    ms.innerHTML = "";
    const st = pet.stats || {};
    MILESTONES.forEach((m) => {
      const cur = Math.min(st[m.stat] || 0, m.need);
      const row = document.createElement("div");
      row.className = "pet-ms" + (cur >= m.need ? " done" : "");
      const name = document.createElement("span");
      name.textContent = t(m.k, m.need);
      const prog2 = document.createElement("b");
      prog2.textContent = cur >= m.need ? "✓" : cur + "/" + m.need;
      row.append(name, prog2);
      ms.appendChild(row);
    });
    $("pet-stats-line").textContent = t("pet.stats", st.games || 0, st.bt || 0, pet.bond || 0);
  }
  document.addEventListener("qs:duelSubmit", () => { bumpStat("ring"); pushLog("pet.log.ring"); });
  const petGrowthModal = qsModal("pet-growth-modal", { sound: "flip", closeBtnId: "btn-pet-growth-close" });
  $("btn-pet-growth-all").addEventListener("click", () => {
    renderGrowthModal();
    petGrowthModal.open();
  });

  function renderPanel() {
    ensureTaskDay();
    // 成长状态
    const next = 50 * level() * level();
    const prev = 50 * (level() - 1) * (level() - 1);
    $("pet-xp-text").textContent = t("pet.xp", pet.xp - prev, next - prev);
    $("pet-stage-title").textContent = t("pet.stageTitle." + stage());
    const a = attrs();
    [["mood", a.mood], ["focus", a.focus], ["disc", a.disc], ["luck", a.luck]].forEach(([k, v]) => {
      $("pet-a-" + k).textContent = String(v);
      $("pet-ab-" + k).style.width = v + "%";
    });
    // 任务: 主页只露 2 条精简卡 (未完成优先, 不够拿已完成补位), 全量 5 条轮换
    const order = ["bt", "game", "report", "guess", "chat"];
    const pending = order.filter((k) => !pet.tasks[k]);
    const show = pending.concat(order.filter((k) => pet.tasks[k])).slice(0, 1); // 主页只露 1 条
    order.forEach((k) => {
      const done = !!pet.tasks[k];
      $("pet-tp-" + k).textContent = (done ? 1 : 0) + "/1";
      const card = document.querySelector(`.pet-task[data-task="${k}"]`);
      card.classList.toggle("done", done);
      card.hidden = !show.includes(k);
    });
    if (!$("pet-tree").hidden) renderTree(); // 树页开着时数据联动刷新
    // 互动与亲密度
    $("pet-chat-title").textContent = t("pet.chatTitle", pet.name || t("pet.name.default"));
    $("pet-bond").textContent = t("pet.bond", pet.bond || 0);
    if (!$("pet-growth").hidden) renderGrowth(); // 记录页开着时联动刷新
  }

  // ---------- 底部页签: 主页 / 技能 / 成长记录 三页切换 ----------
  function setPetPage(page) {
    $("pet-main").hidden = page !== "main";
    $("pet-tree").hidden = page !== "tree";
    $("pet-growth").hidden = page !== "growth";
    document.querySelectorAll(".pet-tab").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    if (page === "tree") renderTree();
    if (page === "growth") renderGrowth();
    playSound("flip");
  }
  document.querySelectorAll(".pet-tab").forEach((b) => {
    b.addEventListener("click", () => setPetPage(b.dataset.page));
  });

  // 任务埋点: 回测 qs:backtest / 对局结算 qs:settled (反应监听里顺带) / 研究报告 qs:labReport /
  // 猜涨跌经 qs:progress 对比局数 / 聊天在 askPet 里
  document.addEventListener("qs:backtest", (e) => {
    completeTask("bt");
    bumpStat("bt");
    if (e.detail && e.detail.overfit) { bumpStat("overfit"); pushLog("pet.log.overfit"); }
  });
  document.addEventListener("qs:labReport", () => completeTask("report"));
  let lastGuessLen = -1;
  function guessLen() {
    return typeof prog !== "undefined" ? (prog.guessTotal || 0) : 0; // 单调计数器, 不会被滚动窗口截断
  }
  document.addEventListener("qs:progress", () => {
    const n = guessLen();
    if (lastGuessLen >= 0 && n > lastGuessLen) completeTask("guess");
    lastGuessLen = n;
  });

  $("btn-pet-fold").addEventListener("click", () => { $("pet-pop").hidden = true; });

  // 面板锚在宠物上/下方, 高度按可用空间收口 (内部滚动), 别被视口裁掉
  function fitPop() {
    const pop = $("pet-pop");
    if (pop.hidden) return;
    const box = $("pet-sprite-box").getBoundingClientRect();
    const up = widget.classList.contains("pet-pop-up");
    const avail = up ? box.top - 18 : window.innerHeight - box.bottom - 18;
    pop.style.maxHeight = Math.max(240, Math.min(620, avail)) + "px";
  }
  window.addEventListener("resize", fitPop);

  // 头像档案弹窗: 属性 / 宝物袋 / 投喂 / 换形象 (主页只留头像入口)
  const petProfileModal = qsModal("pet-profile-modal", { sound: "flip", closeBtnId: "btn-pet-profile-close" });
  $("pet-avatar").addEventListener("click", (e) => {
    e.stopPropagation(); // 别触发面板开合
    $("pet-profile-name").textContent = (pet.name || t("pet.name.default")) + " · " + t("pet.stageTitle." + stage());
    petProfileModal.open();
  });

  function gainXp(n) {
    const before = level();
    const beforeStage = stage();
    pet.xp += n;
    save();
    if (level() > before) {
      toast(t("pet.levelup", level()));
      pushLog("pet.log.level");
      playSound("win");
    }
    render();
    // 跨进化阈值: 长相进化 + 庆祝一下 (render 先行, 新形态已上身)
    if (stage() > beforeStage) {
      speak(t("pet.evolve", pet.name || t("pet.name.default")));
      pushLog("pet.log.evolve");
      toast(t("pet.evolve", pet.name || t("pet.name.default")));
      if (typeof spawnConfetti === "function") spawnConfetti();
      hop();
    }
  }

  function spawnHearts() {
    if (reduced) return;
    for (let i = 0; i < 3; i++) {
      const h = document.createElement("span");
      h.className = "pet-heart";
      h.textContent = "❤";
      h.style.left = 20 + Math.random() * 70 + "px";
      h.style.animationDelay = i * 0.12 + "s";
      widget.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    }
  }

  // ---------- 交互 ----------
  // 点小动物: 摸头 + 开/关功能面板; 2.5 秒内连摸 5 下触发转圈撒欢
  let patCombo = 0;
  let patComboTimer = 0;
  $("pet-sprite-box").addEventListener("click", () => {
    const today = qsTodayStr();
    if (pet.patDate !== today) { pet.patDate = today; pet.patXp = 0; }
    stopWalk();
    if (!reduced) hop();
    spawnHearts();
    playSound("fill");
    clearTimeout(patComboTimer);
    patComboTimer = setTimeout(() => { patCombo = 0; }, 2500);
    if (++patCombo >= 5) {
      patCombo = 0;
      const box = $("pet-sprite-box");
      box.classList.remove("pet-spin");
      void box.offsetWidth;
      if (!reduced) box.classList.add("pet-spin");
      speak(t("pet.line.combo"));
      playSound("win");
    } else {
      speak(line("pat"));
    }
    $("pet-pop").hidden = !$("pet-pop").hidden;
    fitPop();
    if (pet.patXp < PAT_XP_PER_DAY) {
      pet.patXp += 2;
      addBond(1);
      gainXp(2);
    } else {
      render();
    }
  });

  // 自定义 role=button 的键盘可达性: 回车/空格等同点击
  $("pet-sprite-box").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("pet-sprite-box").click();
    }
  });

  // 点面板外任意处收起面板 (游戏操作时别挡视线)
  document.addEventListener("click", (e) => {
    if (!$("pet-pop").hidden && !widget.contains(e.target)) {
      $("pet-pop").hidden = true;
    }
  });

  $("btn-pet-feed").addEventListener("click", () => {
    const today = qsTodayStr();
    if (pet.fedDate !== today) { pet.fedDate = today; pet.fedCount = 0; }
    if (pet.fedCount >= FEED_PER_DAY) {
      speak(t("pet.fed.full", FEED_PER_DAY));
      return;
    }
    pet.fedCount++;
    addBond(2);
    // 投喂动画: 鸡腿从面板飞向嘴边, 到位再张嘴 (说话)
    if (!reduced) {
      const food = document.createElement("span");
      food.className = "pet-food";
      food.textContent = "🍗";
      widget.appendChild(food);
      setTimeout(() => { food.remove(); hop(); }, 650);
    }
    speak(line("fed"));
    playSound("buy");
    gainXp(20);
  });

  // ---------- 趣味: 看你结算, 赢了撒欢输了安慰 ----------
  document.addEventListener("qs:settled", (e) => {
    const win = Number(e.detail && e.detail.returnRate) >= 0;
    stopWalk();
    if (!reduced) {
      const box = $("pet-sprite-box");
      box.classList.remove("pet-spin");
      void box.offsetWidth;
      if (win) box.classList.add("pet-spin");
      else hop();
    }
    if (win) spawnHearts();
    speak(t(win ? "pet.line.win" : "pet.line.lose"));
    pushLog(win ? "pet.log.win" : "pet.log.lose");
    completeTask("game"); // 今日任务: 参与 1 场模拟对局
    bumpStat("games");
    gainXp(3); // 陪你打完一局也算陪伴
  });

  $("btn-pet-chat").addEventListener("click", () => {
    speak(chatLine(mood()));
  });

  // 大世界剧情助手: 其他模块 (walker.js 等) 派 qs:petSay 让金豆说台词
  document.addEventListener("qs:petSay", (e) => {
    if (typeof e.detail === "string" && e.detail) speak(e.detail);
  });

  // ---------- 真·AI 对话: 走后端 /api/pet/chat (Claude, 双限流); 失败降级本地台词 ----------
  function petContext() {
    // 给 LLM 的氛围素材 (纯数字/枚举, 不含用户可控文本)
    const a = attrs();
    const parts = ["mood=" + mood(), "level=" + level(), "stage=" + stage(),
      "bond=" + (pet.bond || 0), "skills_unlocked=" + unlockedSkills(),
      "attrs=" + a.mood + "/" + a.focus + "/" + a.disc + "/" + a.luck];
    if (typeof prog !== "undefined") {
      const recent = (prog.guessRecent || []).slice(-10);
      if (recent.length) parts.push("recent_guess_hits=" + recent.filter(Boolean).length + "/" + recent.length);
      parts.push("rich_wealth=" + prog.wealth + "/best=" + prog.wealthBest);
    }
    if (tasksAllDone()) parts.push("daily_tasks=done");
    return parts.join(", ");
  }

  let asking = false;
  async function askPet() {
    const input = $("pet-chat-input");
    const q = input.value.trim();
    if (!q || asking) return;
    asking = true;
    $("btn-pet-ask").disabled = true;
    speakThinking();
    try {
      const res = await api("/pet/chat", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          petName: pet.name || t("pet.name.default"),
          context: petContext(),
          lang: typeof LANG !== "undefined" ? LANG : "zh",
        }),
      });
      speak(res.advice);
      input.value = "";
      gainXp(1); // 聊天也算陪伴
      completeTask("chat");
      addBond(3);
    } catch (e) {
      // 后端没配 key / 限流 / 网络问题: 降级本地台词, 并把原因轻提示
      speak(chatLine(mood()));
      toast(e.message);
      completeTask("chat"); // 聊没聊成是后端的事, 用户确实来聊了
      addBond(1);
    } finally {
      asking = false;
      $("btn-pet-ask").disabled = false;
    }
  }
  $("btn-pet-ask").addEventListener("click", askPet);
  $("pet-chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") askPet();
  });

  // 换形象: 猫→狗→兔→狐→仓鼠循环
  $("btn-pet-skin").addEventListener("click", () => {
    pet.species = (pet.species + 1) % SPECIES.length;
    save();
    render();
    playSound("fill");
  });

  // 改名: 点名字切换到行内输入框 (textContent 渲染, 不进 innerHTML)
  $("pet-name").addEventListener("click", () => {
    $("pet-name").hidden = true;
    const input = $("pet-name-input");
    input.hidden = false;
    input.value = pet.name || "";
    input.focus();
  });
  function commitName() {
    const input = $("pet-name-input");
    const name = input.value.replace(/\p{Cc}/gu, "").trim().slice(0, 12);
    if (name) pet.name = name;
    save();
    input.hidden = true;
    $("pet-name").hidden = false;
    render();
  }
  $("pet-name-input").addEventListener("blur", commitName);
  $("pet-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitName();
  });

  // ---------- 开场: 落位 + 久别重逢/问候一句 ----------
  const today = qsTodayStr();
  const away = pet.lastSeen && daysBetween(pet.lastSeen, today) >= 2;
  pet.lastSeen = today;
  save();
  lastGuessLen = guessLen(); // 任务埋点基线: 启动后第一局猜涨跌才算今日任务
  applyPos();
  render();
  speak(away ? line("miss") : line("greet"));
  scheduleAct();

  // 每分钟重估情绪 (喂食日期翻篇/战绩变化时表情跟上)
  setInterval(render, 60000);
})();
