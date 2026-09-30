// 首页功能总览: 每个玩法一张卡片, 点击直达。依赖 app.js 的 $ / switchView 与 i18n.js 的 t()。

(() => {
  // view -> 图标; 标题/描述取 i18n 键 home.card.<view>.t / .d
  const CARDS = [
    { view: "game", icon: "📈" },
    { view: "daily", icon: "🗓️" },
    { view: "rooms", icon: "🤝" },
    { view: "arena", icon: "⚔️" },
    { view: "ranking", icon: "🏆" },
    { view: "academy", icon: "🎓" },
    { view: "guess", icon: "🎯" },
    { view: "famous", icon: "🌋" },
    { view: "story", icon: "🕵️" },
    { view: "quiz", icon: "🧬" },
    { view: "lab", icon: "🔬" },
    { view: "profile", icon: "📜" },
    { view: "history", icon: "🗂️" },
    { view: "account", icon: "👤" },
  ];

  function renderHome() {
    const wrap = $("home-cards");
    wrap.innerHTML = "";
    CARDS.forEach((c) => {
      const div = document.createElement("button");
      div.className = "home-card";
      div.innerHTML = `<span class="home-icon"></span><strong></strong><span class="hint"></span>`;
      div.querySelector(".home-icon").textContent = c.icon;
      div.querySelector("strong").textContent = t(`home.card.${c.view}.t`);
      div.querySelector(".hint").textContent = t(`home.card.${c.view}.d`);
      div.addEventListener("click", () => switchView(c.view));
      wrap.appendChild(div);
    });
  }

  document.addEventListener("qs:lang", renderHome);
  renderHome();
})();
