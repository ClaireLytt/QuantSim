// 事件回放: 服务端随机抽真实历史场景盲测, 结算揭晓。依赖 $ / api / t / toast / switchView / Auth / qsEnterGame。

(() => {
  let catalog = null;

  async function load() {
    try {
      catalog = await api("/event/catalog");
      renderMsg();
    } catch (e) {
      // 未登录时 401 由入口按钮引导, 这里静默 (按状态码判断, 不依赖中文文案)
      if (e.status !== 401) toast(e.message);
    }
  }

  function renderMsg() {
    const msg = $("event-msg");
    if (!catalog) { msg.hidden = true; return; }
    msg.hidden = false;
    msg.textContent = t("event.count", catalog.count);
  }

  async function start() {
    if (!window.Auth) return;
    Auth.require(async () => {
      const btn = $("btn-event-start");
      btn.disabled = true;
      try {
        const body = {
          market: $("event-market").value || null,
          difficulty: $("event-difficulty").value || null,
        };
        const res = await api("/event/start", { method: "POST", body: JSON.stringify(body) });
        await window.qsEnterGame(res);
        switchView("game");
        toast(t("event.started"));
      } catch (e) {
        toast(e.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  $("btn-event-start").addEventListener("click", start);
  document.addEventListener("qs:view", (e) => {
    if (e.detail === "event") load();
  });

  // 刷新直达本视图时 qs:view 不会触发, 启动时兜底加载 (同 daily/relics 的惯例)
  if (!$("view-event").hidden) load();
})();
