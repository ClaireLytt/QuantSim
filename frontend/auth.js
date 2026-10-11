// 账户模块: 注册 / 登录 / 登出、头部状态、学堂进度云同步。
// 依赖 app.js 的全局 $ / api / toast / switchView 与 i18n.js 的 t()。

(() => {
  const listeners = [];
  const Auth = {
    user: null,
    onChange(fn) { listeners.push(fn); },
    /** 需要登录的入口统一走这里: 已登录执行回调, 未登录弹登录窗。 */
    require(fn) {
      if (Auth.user) { fn(); return true; }
      toast(t("auth.needLogin"));
      openAuthModal(false);
      return false;
    },
  };
  window.Auth = Auth;

  function emit() { listeners.forEach((fn) => { try { fn(Auth.user); } catch (e) { /* 单个监听失败不影响其它 */ } }); }

  function renderHeader() {
    const btn = $("btn-account");
    btn.textContent = Auth.user ? Auth.user.username : t("auth.navBtn");
    btn.classList.toggle("logged-in", !!Auth.user);
    // 头部已无用户名输入框: 身份由 app.js currentUsername() 统一解析 (登录名 / 游客持久昵称)
  }

  // 登录 / 注册弹窗: 默认展示登录, 小字链接切到注册 (主流登录范式)
  function showAuthPanel(register) {
    $("login-card").hidden = register;
    $("register-card").hidden = !register;
  }
  function openAuthModal(register) {
    showAuthPanel(!!register);
    $("auth-modal").hidden = false;
    $(register ? "reg-name" : "login-name").focus();
  }
  function closeAuthModal() {
    $("auth-modal").hidden = true;
  }
  $("link-register").addEventListener("click", (e) => { e.preventDefault(); showAuthPanel(true); });
  $("link-login").addEventListener("click", (e) => { e.preventDefault(); showAuthPanel(false); });
  $("btn-auth-close").addEventListener("click", closeAuthModal);
  $("auth-modal").addEventListener("click", (e) => {
    if (e.target === $("auth-modal")) closeAuthModal(); // 点遮罩关闭
  });
  $("btn-open-auth").addEventListener("click", () => openAuthModal(false));

  function renderAccountView() {
    $("auth-guest").hidden = !!Auth.user;
    $("auth-me").hidden = !Auth.user;
    if (Auth.user) {
      $("me-name").textContent = Auth.user.username;
      $("me-since").textContent = Auth.user.createdAt
        ? t("auth.since", String(Auth.user.createdAt).slice(0, 10)) : "";
    }
  }

  // 登录门禁: 登录或游客试玩放行; 登出即重新落闸 (游客标记只活在本次会话)
  let guestOk = false;
  try { guestOk = sessionStorage.getItem("qs_guest") === "1"; } catch (e) { /* ignore */ }

  function renderGate() {
    const pass = !!Auth.user || guestOk;
    $("login-gate").hidden = pass;
    if (pass && window.qsMaybeOnboard) qsMaybeOnboard();
  }

  function setUser(user) {
    Auth.user = user;
    renderHeader();
    renderAccountView();
    renderGate();
    emit();
  }

  // ---------- 学堂进度云同步 ----------
  // 本地 qs_progress 为读主; 变更后防抖上传。新设备 (本地无进度) 以服务端为准。

  let syncTimer = null;
  function pushProgress() {
    if (!Auth.user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      let local = null;
      try { local = localStorage.getItem("qs_progress"); } catch (e) { /* 隐私模式下忽略 */ }
      if (!local) return;
      try {
        await api("/me/progress", { method: "POST", body: JSON.stringify({ progressJson: local }) });
      } catch (e) { /* 同步失败静默, 下次变更再试 */ }
    }, 2000);
  }
  // academy.js 在 saveProg() 后调用
  window.qsSyncProgress = pushProgress;

  async function syncOnLogin() {
    let local = null;
    try { local = localStorage.getItem("qs_progress"); } catch (e) { /* 隐私模式下忽略 */ }
    try {
      const remote = await api("/me/progress");
      if (remote.progressJson && !local) {
        // 新设备: 拉下云端进度并刷新页面让 academy.js 重新加载
        try { localStorage.setItem("qs_progress", remote.progressJson); } catch (e) { /* ignore */ }
        location.reload();
        return;
      }
      if (local) pushProgress();
    } catch (e) { /* 未登录/网络异常时跳过 */ }
  }

  // ---------- 表单动作 ----------

  async function doLogin() {
    const username = $("login-name").value.trim();
    const password = $("login-pass").value;
    if (!username || !password) { toast(t("auth.fillBoth")); return; }
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setUser(res.user);
      toast(t("auth.welcome", res.user.username));
      $("login-pass").value = "";
      closeAuthModal();
      syncOnLogin();
    } catch (e) {
      toast(e.message);
    }
  }

  async function doRegister() {
    const username = $("reg-name").value.trim();
    const password = $("reg-pass").value;
    const confirm = $("reg-pass2").value;
    if (!username || !password) { toast(t("auth.fillBoth")); return; }
    if (password.length < 6) { toast(t("auth.passTooShort")); return; }
    if (password !== confirm) { toast(t("auth.passMismatch")); return; }
    try {
      const res = await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
      setUser(res.user);
      toast(t("auth.registered", res.user.username));
      $("reg-pass").value = "";
      $("reg-pass2").value = "";
      closeAuthModal();
      syncOnLogin();
    } catch (e) {
      toast(e.message);
    }
  }

  async function doLogout() {
    try { await api("/auth/logout", { method: "POST" }); } catch (e) { /* 会话已失效也算登出成功 */ }
    guestOk = false;
    try { sessionStorage.removeItem("qs_guest"); } catch (e) { /* ignore */ }
    setUser(null);
    toast(t("auth.loggedOut"));
  }

  // 未登录点「登录」弹小窗即可, 不整页跳转; 已登录才进账户页看资料
  $("btn-account").addEventListener("click", () => {
    if (Auth.user) switchView("account");
    else openAuthModal(false);
  });
  $("btn-login").addEventListener("click", doLogin);
  $("btn-register").addEventListener("click", doRegister);
  $("btn-logout").addEventListener("click", doLogout);
  $("login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("reg-pass2").addEventListener("keydown", (e) => { if (e.key === "Enter") doRegister(); });

  document.addEventListener("qs:lang", () => { renderHeader(); renderAccountView(); });

  // 启动时恢复会话
  (async () => {
    try {
      const res = await api("/auth/me");
      if (res.user) {
        setUser(res.user);
        syncOnLogin();
      } else {
        renderHeader();
        gateReady();
        renderGate(); // 游客标记在本会话仍有效: 回访直接放行, 不再落闸
        if (!guestOk) openAuthModal(false); // 门禁页直接弹登录窗; 游客回访不再打扰
      }
    } catch (e) {
      renderHeader();
      gateReady(); // 后端不可达也要亮出按钮, 别让用户卡在「恢复会话」
      renderGate();
    }
  })();

  // 门禁从「恢复会话」切到可登录态 (已登录用户刷新时不闪登录按钮)
  function gateReady() {
    $("gate-loading").hidden = true;
    $("btn-gate-login").hidden = false;
  }

  $("btn-gate-login").addEventListener("click", () => openAuthModal(false));
  // 游客试玩: 本次会话内免登录逛逛 (每日挑战/房间等仍会就地弹登录)。
  // 入口有两个: 门禁页小字 + 登录弹窗小字 (弹窗自动打开时会盖住门禁, 必须双入口)
  function enterGuest(e) {
    e.preventDefault();
    guestOk = true;
    try { sessionStorage.setItem("qs_guest", "1"); } catch (e2) { /* ignore */ }
    closeAuthModal();
    renderGate();
  }
  $("link-guest").addEventListener("click", enterGuest);
  $("link-guest2").addEventListener("click", enterGuest);
})();
