// 今日任务面板: 签到 / 猜涨跌赢 3 把 / 完成 1 局结算 -> 开宝箱 (+30 积分, 服务端任务位判重)。
// 设计目标: 给玩家一个"今天必须上线"的理由, 三项差一项没勾的人会留下来补。
// 本地进度 (猜涨跌计数/结算标记/连续上线) 存 qs_tasks; 积分入账全部走服务端。
// 依赖 app.js 的 $ / api / toast / switchView / spawnConfetti, auth.js 的 Auth, i18n.js 的 t。
(() => {
  const KEY = "qs_tasks";

  function todayLocal(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { /* ignore */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  }

  // 日切 + 连续上线: 昨天来过则 +1, 断档重置
  (function rollDay() {
    const today = todayLocal();
    if (st.streakLast !== today) {
      st.streakCount = st.streakLast === todayLocal(-1) ? (st.streakCount || 0) + 1 : 1;
      st.streakLast = today;
    }
    if (st.date !== today) {
      st.date = today;
      st.guessWins = 0;
      st.settled = false;
      st.chest = false;
    }
    save();
  })();

  let signedToday = false; // 服务端积分态 (登录后拉取)

  async function pullPoints() {
    if (!window.Auth || !Auth.user) { signedToday = false; return; }
    try {
      const res = await api("/me/points");
      signedToday = !!res.signedToday;
    } catch (e) { /* 拉不到不挡渲染 */ }
  }

  function rowText(done, label) {
    return `${done ? "✅" : "⬜"} ${label}`;
  }

  function render() {
    $("tasks-streak").textContent = t("todo.streak", st.streakCount || 1);
    $("btn-task-signin").textContent = rowText(signedToday, t("todo.signin"));
    $("btn-task-guess").textContent = rowText(st.guessWins >= 3, t("todo.guess", Math.min(3, st.guessWins || 0)));
    $("btn-task-settle").textContent = rowText(!!st.settled, t("todo.settle"));
    $("btn-task-signin").classList.toggle("done", signedToday);
    $("btn-task-guess").classList.toggle("done", st.guessWins >= 3);
    $("btn-task-settle").classList.toggle("done", !!st.settled);
    const allDone = signedToday && st.guessWins >= 3 && !!st.settled;
    const chest = $("btn-task-chest");
    if (st.chest) {
      chest.textContent = t("todo.chestDone");
      chest.disabled = true;
    } else if (allDone) {
      chest.textContent = t("todo.chest");
      chest.disabled = false;
    } else {
      chest.textContent = t("todo.chestLocked");
      chest.disabled = true;
    }
  }

  // 游戏侧上报: academy.js 猜对一把调 qsTask("guessWin"); 结算走 qs:settled 事件
  window.qsTask = function (kind) {
    if (st.date !== todayLocal()) return; // 跨日残留不计
    if (kind === "guessWin") st.guessWins = (st.guessWins || 0) + 1;
    save();
    render();
  };

  document.addEventListener("qs:settled", () => {
    st.settled = true;
    save();
    render();
  });

  // 行点击: 没做的任务直接送到对应入口
  $("btn-task-signin").addEventListener("click", () => {
    if (signedToday) return;
    if (!window.Auth || !Auth.user) { toast(t("auth.needLogin")); return; }
    api("/me/points/signin", { method: "POST", body: "{}" })
      .then(() => { signedToday = true; render(); toast(t("todo.signedToast")); })
      .catch((e) => toast(e.message));
  });
  $("btn-task-guess").addEventListener("click", () => {
    if (st.guessWins < 3) switchView("guess");
  });
  $("btn-task-settle").addEventListener("click", () => {
    if (!st.settled) switchView("game");
  });
  $("btn-task-chest").addEventListener("click", async () => {
    if (!window.Auth || !Auth.user) { toast(t("auth.needLogin")); return; }
    try {
      const res = await api("/me/points/chest", { method: "POST", body: "{}" });
      st.chest = true;
      save();
      render();
      if (res.earned > 0) {
        toast(t("todo.chestGot", res.earned));
        spawnConfetti();
        playSound("win");
      }
    } catch (e) { toast(e.message); }
  });

  if (window.Auth) Auth.onChange(() => { pullPoints().then(render); });

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "home") pullPoints().then(render);
  });
  document.addEventListener("qs:lang", render);

  pullPoints().then(render);
})();
