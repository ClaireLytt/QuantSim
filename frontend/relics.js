// 声望 + 历史藏品元系统: 名场面/生涯/重生的成就统一折算成"声望", 名场面通关掉落"历史藏品"。
// 关键设计: 声望与藏品全部从现有进度 **派生** (prog.famous / 生涯章数 / 重生最佳身家),
// 不新增任何存档字段——云同步、老档兼容、跨页一致性全部免费。
// 依赖 app.js 的 $ / switchView / playSound, academy.js 的 prog / FAMOUS_LEVELS / pick, i18n 的 t()。
(() => {
  // ---------- 藏品目录: 每个名场面关卡掉一件 (era 按年代分馆), 外加重生逆袭的首富奖杯 ----------
  // own(): 派生持有判定; year 用于分组标签
  const glyph = {
    news: '<path d="M5 4h11v16H5z"/><path d="M16 8h3v12h-3"/><path d="M8 8h5M8 12h5M8 16h5"/>',
    tape: '<circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M8 15h8"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 10h6M9 14h6"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 13h5M10 17h5"/>',
    fuse: '<path d="M9 3h6l-2 7h4L9 21l2-8H7z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v3M9 20h6M10 16h4v4h-4z"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
    rocket: '<path d="M12 3c3 2 5 6 5 9l-2 5-3-2-3 2-2-5c0-3 2-7 5-9z"/><circle cx="12" cy="10" r="1.6"/><path d="M8 19l-2 2M16 19l2 2"/>',
  };
  // level: FAMOUS_LEVELS 下标; hue: 配图渐变色相 (藏品"彩色配图" = 渐变底 + 线性图形)
  // cat: 筛选分类 (crisis 危机档案 / tech 技术革命 / policy 政策事件); rare: 稀有藏品 (大卡+光晕)
  const RELICS = [
    { id: "r10", level: 10, year: 1929, g: "news", hue: 358, cat: "crisis", rare: true },
    { id: "r6", level: 6, year: 1987, g: "tape", hue: 24, cat: "crisis" },
    { id: "r7", level: 7, year: 1990, g: "coin", hue: 46, cat: "crisis" },
    { id: "r11", level: 11, year: 1997, g: "coin", hue: 160, cat: "crisis" },
    { id: "r5", level: 5, year: 2000, g: "rocket", hue: 200, cat: "tech" },
    { id: "r8", level: 8, year: 2007, g: "doc", hue: 28, cat: "crisis" },
    { id: "r3", level: 3, year: 2008, g: "news", hue: 350, cat: "crisis", rare: true },
    { id: "r0", level: 0, year: 2015, g: "fuse", hue: 0, cat: "policy" },
    { id: "r9", level: 9, year: 2016, g: "fuse", hue: 16, cat: "policy" },
    { id: "r4", level: 4, year: 2020, g: "doc", hue: 190, cat: "crisis" },
    { id: "r2", level: 2, year: 2021, g: "rocket", hue: 265, cat: "tech" },
    { id: "r1", level: 1, year: 2021, g: "coin", hue: 280, cat: "tech" },
    { id: "r12", level: 12, year: 2022, g: "key", hue: 230, cat: "policy" },
    { id: "rich", level: null, year: 0, g: "trophy", hue: 44, rare: true }, // 重生逆袭奖杯: 不属三类, 仅"全部"可见
  ];
  // 分馆 (套装): 年代 → 组标签键
  const ERA = (y) => (y === 0 ? "reborn" : y <= 1929 ? "e1929" : y <= 1990 ? "e8090" : y <= 1997 ? "e1997"
    : y <= 2000 ? "e2000" : y <= 2008 ? "e2008" : y <= 2016 ? "e2015" : y <= 2020 ? "e2020" : "e2021");
  const ERA_ORDER = ["e1929", "e8090", "e1997", "e2000", "e2008", "e2015", "e2020", "e2021", "reborn"];

  const rebornWorth = qsRebornWorth; // 共享实现在 app.js
  const owned = (r) => (r.level != null ? prog.famous.includes(r.level) : rebornWorth() >= 10000000);

  // ---------- 声望: 名场面 40/关 + 生涯 50/章 + 重生里程碑 (100万 +30 / 1000万 +60) ----------
  function qsRep() {
    let rep = prog.famous.length * 40;
    if (window.qsCareerChapters) rep += window.qsCareerChapters() * 50;
    const w = rebornWorth();
    if (w >= 1000000) rep += 30;
    if (w >= 10000000) rep += 60;
    return rep;
  }
  window.qsRep = qsRep;
  // 纪元页右栏复用: 藏品缩略预览 + 计数
  window.qsRelicsCount = () => ({ got: RELICS.filter(owned).length, total: RELICS.length });
  window.qsRelicsPreview = (container, max) => {
    container.innerHTML = "";
    RELICS.filter(owned).slice(0, max || 6).forEach((r) => container.appendChild(relicTile(r, false)));
  };
  window.qsRelicOfLevel = (idx) => RELICS.find((r) => r.level === idx) || null;
  window.qsRelicName = (r) => t("relic." + r.id + ".n");

  // 称号阶梯: 下一档作为进度条目标
  const TIERS = [0, 150, 400, 800];
  const tierIdx = (rep) => (rep >= 800 ? 3 : rep >= 400 ? 2 : rep >= 150 ? 1 : 0);

  function relicTile(r, big) {
    const isOwn = owned(r);
    const tile = document.createElement("div");
    tile.className = (big ? "relic-card" : "relic-thumb") + (isOwn ? " own" : " lock");
    if (isOwn) tile.style.background = `linear-gradient(135deg, hsl(${r.hue} 55% 38%), hsl(${(r.hue + 40) % 360} 60% 26%))`;
    tile.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isOwn ? glyph[r.g] : glyph.doc}</svg>`;
    if (!isOwn) tile.querySelector("svg").innerHTML = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
    tile.title = isOwn ? t("relic." + r.id + ".n") : t("relics.locked");
    return tile;
  }

  // ---------- 角色面板 (全局弹窗): 称号/声望进度 + 藏品预览 + 跨游戏概览 + 套装提示 ----------
  function openRoleModal() {
    const rep = qsRep();
    const ti = tierIdx(rep);
    const name = (window.Auth && Auth.user && Auth.user.username) || t("role.guest");
    $("role-name").textContent = name + " · " + t("role.tier." + ti);
    $("role-rep").textContent = t("role.rep", rep);
    const next = TIERS[ti + 1];
    $("role-rep-bar").style.width = next ? Math.min(100, (rep / next) * 100) + "%" : "100%";
    $("role-rep-next").textContent = next ? t("role.repNext", next - rep, t("role.tier." + (ti + 1))) : t("role.repMax");
    // 藏品预览: 已收集的前 8 件
    const box = $("role-relics");
    box.innerHTML = "";
    const got = RELICS.filter(owned);
    got.slice(0, 8).forEach((r) => box.appendChild(relicTile(r, false)));
    $("role-relics-empty").hidden = !!got.length;
    // 跨游戏概览
    $("role-worth").textContent = rebornWorth() ? rebornWorth().toLocaleString() : "--";
    $("role-famous").textContent = prog.famous.length + " / " + FAMOUS_LEVELS.length;
    // 套装进度: 集齐任一时代
    const eras = {};
    RELICS.forEach((r) => {
      const e = ERA(r.year);
      eras[e] = eras[e] || [0, 0];
      eras[e][1]++;
      if (owned(r)) eras[e][0]++;
    });
    const full = Object.values(eras).filter(([a, b]) => a >= b).length;
    $("role-sets").textContent = t("role.sets", full, Object.keys(eras).length);
    if (window.qsWalkerRole) window.qsWalkerRole(); // 市场行者扩展: 学识/信誉/历练日志/套装被动
    $("role-modal").hidden = false;
    playSound("flip");
  }
  window.qsOpenRole = openRoleModal;
  qsModal("role-modal", { closeBtnId: "btn-role-close" });
  $("btn-role-archive").addEventListener("click", () => {
    $("role-modal").hidden = true;
    switchView("relics");
  });
  $("btn-famous-role").addEventListener("click", openRoleModal);
  $("btn-relics-role").addEventListener("click", openRoleModal);

  // ---------- 藏品档案馆页: 声望条 + 分类筛选 + 按时代分馆的网格 + 套装进度 ----------
  let relicFilter = ""; // "" = 全部时代
  const CATS = ["", "crisis", "tech", "policy"];

  function renderRepBar(wrap) {
    const rep = qsRep();
    const tier = tierIdx(rep); // 复用角色面板同一阈值表, 别再抄一份
    const next = TIERS[tier + 1];
    const box = document.createElement("div");
    box.className = "card relic-rep"; // 复用全站卡片材质
    const line = document.createElement("p");
    line.className = "relic-rep-line";
    line.textContent = t("relics.repNow", rep, t("role.tier." + tier))
      + (next != null ? " · " + t("role.repNext", next - rep, t("role.tier." + (tier + 1))) : "");
    const bar = document.createElement("i");
    bar.className = "relic-era-bar";
    bar.innerHTML = "<u></u>";
    bar.querySelector("u").style.width = (next != null ? Math.min(100, (rep / next) * 100) : 100) + "%";
    box.append(line, bar);
    wrap.appendChild(box);
  }

  function renderFilter(wrap) {
    const row = document.createElement("div");
    row.className = "relic-filter";
    CATS.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "small" + (relicFilter === cat ? " primary" : " ghost");
      btn.textContent = t("relics.cat." + (cat || "all"));
      btn.addEventListener("click", () => { relicFilter = cat; renderRelics(); });
      row.appendChild(btn);
    });
    wrap.appendChild(row);
  }

  function renderRelics() {
    const wrap = $("relics-wrap");
    wrap.innerHTML = "";
    renderRepBar(wrap);
    renderFilter(wrap);
    ERA_ORDER.forEach((era) => {
      // 套装进度/集齐徽章必须按"全套"算, 分类筛选只决定展示哪些卡 (否则筛选下会误标集齐)
      const full = RELICS.filter((r) => ERA(r.year) === era);
      const list = full.filter((r) => !relicFilter || r.cat === relicFilter);
      if (!list.length) return;
      const got = full.filter(owned).length;
      // 每个时代套装包独立玻璃卡 (复用 .card 材质), 分组标题在卡顶
      const sec = document.createElement("div");
      sec.className = "card relic-era";
      const head = document.createElement("div");
      head.className = "relic-era-head";
      const label = document.createElement("b");
      label.textContent = t("relics.era." + era);
      const progEl = document.createElement("span");
      progEl.className = "hint";
      progEl.textContent = got + " / " + full.length;
      // 套装集齐徽挂分组标题右侧 (不再逐卡标注)
      if (got >= full.length) {
        const setTag = document.createElement("i");
        setTag.className = "relic-set-tag";
        setTag.textContent = t("relics.setDone");
        head.appendChild(setTag);
      }
      const bar = document.createElement("i");
      bar.className = "relic-era-bar";
      bar.innerHTML = "<u></u>";
      bar.querySelector("u").style.width = (got / full.length) * 100 + "%";
      head.append(label, progEl, bar);
      const grid = document.createElement("div");
      grid.className = "relic-grid";
      list.forEach((r) => {
        const has = owned(r);
        const card = document.createElement("div");
        // rare = 稀有藏品: 同尺寸但带蓝紫光晕, 形成稀有度层级
        card.className = "relic-item" + (has ? "" : " lock") + (r.rare ? " rare" : "");
        // 已收集: 右上角小绿勾徽 (不占文字); 未收集: 锁图标压在预览图中心
        if (has) {
          const tag = document.createElement("i");
          tag.className = "relic-tag got";
          tag.textContent = "✓";
          tag.title = t("relics.got");
          card.appendChild(tag);
        } else {
          const lockIco = document.createElement("span");
          lockIco.className = "relic-lock";
          lockIco.title = t("relics.notGot");
          lockIco.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
          card.appendChild(lockIco);
        }
        card.appendChild(relicTile(r, true));
        const nm = document.createElement("b");
        nm.textContent = has ? t("relic." + r.id + ".n") : t("relics.unknown");
        card.appendChild(nm);
        // 时代标签 chip 放名称之后: 展品的"馆藏编目", 与筛选分类互补
        const eraTag = document.createElement("i");
        eraTag.className = "relic-era-tag";
        eraTag.textContent = t("relics.era." + era);
        card.appendChild(eraTag);
        const ds = document.createElement("span");
        ds.className = "hint";
        ds.textContent = has ? t("relic." + r.id + ".d") : t("relics.lockHint");
        card.appendChild(ds);
        grid.appendChild(card);
      });
      sec.append(head, grid);
      wrap.appendChild(sec);
    });
  }

  document.addEventListener("qs:view", (e) => {
    if (e.detail === "relics") renderRelics();
  });
  document.addEventListener("qs:lang", () => {
    if (!$("view-relics").hidden) renderRelics();
  });
  // 启动兜底: app.js 的首次 switchView 在本脚本加载前就派发了 qs:view,
  // 停在本视图刷新页面会错过事件 → 永久空白, 这里补一次初始渲染
  if (!$("view-relics").hidden) renderRelics();
})();
