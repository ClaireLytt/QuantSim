// 悬浮 AI 智能小宠: 小小一只的动物 (可换形象), 可以拖到屏幕任意位置安家 (位置记忆),
// 平时会自己在落脚点附近遛弯/转身/小跳, 夜里原地睡觉; 点它弹出功能面板 (摸头/投喂/聊天/改名/升级)。
// 纯本地规则引擎, 零后端成本; 状态存 qs_pet。
// 依赖 app.js 的 $ / toast / playSound / qsTodayStr, i18n.js 的 t, academy.js 的 prog (可选)。
(() => {
  const KEY = "qs_pet";
  const FEED_PER_DAY = 3;
  const PAT_XP_PER_DAY = 20;
  const SPECIES = ["🐱", "🐶", "🐰", "🦊", "🐹"];
  const WANDER_X = 90;  // 自主遛弯: 距安家点的最大水平半径
  const WANDER_Y = 24;  // 垂直方向只许小幅挪动, 走路姿态才合理
  const SPEED = 42;     // px/s

  let pet = { name: "", species: 0, xp: 0, fedDate: "", fedCount: 0, patDate: "", patXp: 0, lastSeen: "", pos: null };
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
  const clampX = (x) => Math.max(4, Math.min(window.innerWidth - 48, x));
  const clampY = (y) => Math.max(58, Math.min(window.innerHeight - 52, y)); // 上留吸顶头部, 下留 toast
  let home = pet.pos && Number.isFinite(pet.pos.x)
    ? { x: clampX(pet.pos.x), y: clampY(pet.pos.y) }
    : { x: 10, y: 64 };
  let cur = { ...home };

  function applyPos() {
    widget.style.left = cur.x + "px";
    widget.style.top = cur.y + "px";
    // 弹出层防溢出: 靠右开左侧, 靠下往上开
    widget.classList.toggle("pet-pop-left", cur.x > window.innerWidth - 260);
    widget.classList.toggle("pet-pop-up", cur.y > window.innerHeight - 240);
  }

  window.addEventListener("resize", () => {
    home = { x: clampX(home.x), y: clampY(home.y) };
    cur = { x: clampX(cur.x), y: clampY(cur.y) };
    applyPos();
  });

  // ---------- 情绪引擎: 按优先级从上下文推断 ----------
  // sleep > miss > hungry > worried > happy > idle
  function mood() {
    const h = new Date().getHours();
    if (h >= 23 || h < 6) return "sleep";
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
    const m = mood();
    // 睡觉/被拖/页面不可见/面板开着/偏好少动画 → 原地呆着
    if (!reduced && !dragging && !walking && !document.hidden && $("pet-pop").hidden && m !== "sleep") {
      if (Math.random() < 0.18) {
        hop(); // 偶尔原地小跳
      } else {
        const tx = clampX(home.x + (Math.random() * 2 - 1) * WANDER_X);
        const ty = clampY(home.y + (Math.random() * 2 - 1) * WANDER_Y);
        walkTo(tx, ty);
      }
    }
    scheduleAct();
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
  const POOL_SIZE = { greet: 3, sleep: 2, hungry: 2, miss: 1, happy: 2, worried: 2, tip: 8, fed: 2, pat: 3 };
  function line(pool) {
    const i = Math.floor(Math.random() * POOL_SIZE[pool]);
    return t("pet.line." + pool + "." + i);
  }

  function chatLine(m) {
    // 聊天一半概率说情绪话, 一半概率给投资小贴士 (情绪异常时优先说情绪)
    if (m === "sleep" || m === "miss" || m === "hungry" || m === "worried") return line(m);
    return Math.random() < 0.5 ? line(m === "happy" ? "happy" : "greet") : line("tip");
  }

  // ---------- 渲染 ----------
  let bubbleTimer;
  function speak(text) {
    const b = $("pet-bubble");
    b.textContent = text;
    b.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { b.hidden = true; }, 6000);
  }

  function render() {
    const m = mood();
    widget.className = "pet-widget pet-" + m
      + (walking ? " pet-walking" : "")
      + (dragging ? " pet-dragging" : "")
      + (cur.x > window.innerWidth - 260 ? " pet-pop-left" : "")
      + (cur.y > window.innerHeight - 240 ? " pet-pop-up" : "");
    $("pet-sprite").textContent = SPECIES[pet.species % SPECIES.length];
    // 等级配饰: 2 级起戴帽子, 3 级领结, 4 级墨镜 (emoji, 非文案, 不进 i18n)
    $("pet-hat").textContent = level() >= 4 ? "🕶️" : level() >= 3 ? "🎀" : level() >= 2 ? "🎩" : "";
    $("pet-name").textContent = pet.name || t("pet.name.default");
    $("pet-level").textContent = t("pet.level", level());
    const next = 50 * level() * level();
    const prev = 50 * (level() - 1) * (level() - 1);
    $("pet-xp-bar").style.width = Math.min(100, ((pet.xp - prev) / (next - prev)) * 100) + "%";
    $("btn-pet-feed").disabled = pet.fedDate === qsTodayStr() && pet.fedCount >= FEED_PER_DAY;
  }

  function gainXp(n) {
    const before = level();
    pet.xp += n;
    save();
    if (level() > before) {
      toast(t("pet.levelup", level()));
      playSound("win");
    }
    render();
  }

  function spawnHearts() {
    if (reduced) return;
    for (let i = 0; i < 3; i++) {
      const h = document.createElement("span");
      h.className = "pet-heart";
      h.textContent = "❤";
      h.style.left = 8 + Math.random() * 24 + "px";
      h.style.animationDelay = i * 0.12 + "s";
      widget.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    }
  }

  // ---------- 交互 ----------
  // 点小动物: 摸头 + 开/关功能面板
  $("pet-sprite-box").addEventListener("click", () => {
    const today = qsTodayStr();
    if (pet.patDate !== today) { pet.patDate = today; pet.patXp = 0; }
    stopWalk();
    if (!reduced) hop();
    spawnHearts();
    playSound("fill");
    speak(line(mood() === "sleep" ? "sleep" : "pat"));
    $("pet-pop").hidden = !$("pet-pop").hidden;
    if (pet.patXp < PAT_XP_PER_DAY) {
      pet.patXp += 2;
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
    speak(line("fed"));
    playSound("buy");
    gainXp(20);
  });

  $("btn-pet-chat").addEventListener("click", () => {
    speak(chatLine(mood()));
  });

  // ---------- 真·AI 对话: 走后端 /api/pet/chat (Claude, 双限流); 失败降级本地台词 ----------
  function petContext() {
    // 给 LLM 的氛围素材 (纯数字/枚举, 不含用户可控文本)
    const parts = ["mood=" + mood(), "level=" + level()];
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
    speak(t("pet.thinking"));
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
    } catch (e) {
      // 后端没配 key / 限流 / 网络问题: 降级本地台词, 并把原因轻提示
      speak(chatLine(mood()));
      toast(e.message);
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
  applyPos();
  render();
  speak(away ? line("miss") : line(mood() === "sleep" ? "sleep" : "greet"));
  scheduleAct();

  // 每分钟重估情绪 (跨过入睡时刻/喂食日期翻篇时表情跟上)
  setInterval(render, 60000);
})();
