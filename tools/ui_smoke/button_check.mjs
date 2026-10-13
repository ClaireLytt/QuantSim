// QuantSim 按钮体检 CLI: 真浏览器遍历全部视图, 专查「按钮是否正常」——
// 死按钮 (无任何 click 监听、含事件委托)、无可访问名称、重复 id、零尺寸可见按钮,
// 全程监听 console error / pageerror / 5xx / requestfailed。
// 参照 time-visual-tool 的 scripts/ui-audit.mjs 思路, 适配本站无框架 IIFE 结构。
//
// 前置: 后端已启动 (QUANTSIM_URL 可覆盖, 默认 http://localhost:8080)。
// 用法: cd tools/ui_smoke && npm run buttons
// 退出码: 0 = 全过; 1 = 有 error 级问题。
import { chromium } from "playwright";

const BASE = process.env.QUANTSIM_URL || "http://localhost:8080";
const findings = []; // { view, type, severity, detail }
const add = (view, type, severity, detail) => findings.push({ view, type, severity, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("dialog", (d) => d.accept()); // 无头浏览器默认 dismiss confirm, 统一 accept

// 在任何页面脚本之前注入: 给挂了 click 监听的元素打标记, 供"死按钮"检测用。
// 事件委托 (监听挂在祖先上) 由检测端向上找标记解决。
await page.addInitScript(() => {
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    // document/window/body 级委托单独计数, 不给元素打标 —— 否则一个全局监听就让所有死按钮"复活",
    // 检测形同虚设 (2026-10 代码审查指出)
    if (type === "click") {
      if (this === document || this === window || this === document.body || this === document.documentElement) {
        window.__qsGlobalClick = (window.__qsGlobalClick || 0) + 1;
      } else if (this instanceof Element) {
        this.__qsHasClick = true;
      }
    }
    return orig.call(this, type, ...rest);
  };
});

let currentView = "boot";
page.on("console", (m) => {
  if (m.type() === "error" && !/status of 401/.test(m.text())) {
    add(currentView, "console", "error", m.text().slice(0, 200));
  }
});
page.on("pageerror", (e) => add(currentView, "pageerror", "error", String(e).slice(0, 200)));
page.on("response", (r) => {
  if (r.status() >= 500) add(currentView, "http5xx", "error", `${r.status()} ${r.url().slice(0, 120)}`);
});
page.on("requestfailed", (r) => {
  if (!r.url().includes("favicon")) {
    add(currentView, "requestfailed", "warn", `${r.url().slice(0, 120)} -> ${r.failure()?.errorText}`);
  }
});

// 页面内执行: 对当前可见 DOM 做按钮级检查
function domChecks() {
  const out = { dead: [], maybeDead: [], noName: [], dupIds: [], zeroSize: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!visible(el)) continue;
    // 1. 死按钮: 自身/祖先 (body 以下) 都没有 click 监听, 也没有 onclick, 也不是表单 submit。
    // 注意 form 内 <button> 默认 type=submit, 已被 submit 条件覆盖; 不要再按 closest(form) 放行,
    // 否则 type=button 的死按钮藏在表单里永远测不出来 (2026-10 代码审查指出)
    let alive = !!el.onclick || el.type === "submit";
    for (let n = el; n && !alive && n !== document.body; n = n.parentElement) {
      if (n.__qsHasClick) alive = true;
    }
    if (!alive) {
      // 存在全局委托时无法静态判死 (可能经 document 委托处理), 降级为疑似而非 error
      (window.__qsGlobalClick ? out.maybeDead : out.dead).push(describe(el));
    }
    // 2. 无可访问名称 (纯图标按钮须有 aria-label/title)
    const name = (el.getAttribute("aria-label") || el.title || el.textContent || "").trim();
    if (!name) out.noName.push(describe(el));
    // 3. 可见但零面积 (样式塌了点不到)
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) out.zeroSize.push(describe(el));
  }
  // 4. 重复 id (事件绑定会静默绑错)
  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] || 0) + 1;
  for (const [id, n] of Object.entries(ids)) if (n > 1) out.dupIds.push(`#${id} x${n}`);
  return out;
}

async function checkCurrent(view) {
  currentView = view;
  const res = await page.evaluate(domChecks);
  for (const d of res.dead) add(view, "dead-button", "error", d);
  for (const d of res.maybeDead) add(view, "maybe-dead-button", "warn", d);
  for (const d of res.noName) add(view, "no-accessible-name", "warn", d);
  for (const d of res.dupIds) add(view, "dup-id", "error", d);
  for (const d of res.zeroSize) add(view, "zero-size", "warn", d);
}

// ── 进应用 (过 landing / 登录门禁 / 新手引导, 逻辑同 smoke.mjs) ──
try {
  await fetch(BASE, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`后端不可达: ${BASE} — 先启动后端 (mvn spring-boot:run 或 start.ps1)`);
  process.exit(1);
}
await page.goto(BASE, { waitUntil: "domcontentloaded" });
if (page.url().includes("landing")) {
  await page.click('a.ld-cta[href^="index.html"]', { timeout: 5000 });
  await page.waitForTimeout(300);
}
await page.waitForSelector("#nav-groups .nav-group", { timeout: 15000 });
await page.waitForTimeout(800);
if (await page.isVisible("#btn-tour-skip")) { await page.click("#btn-tour-skip"); await page.waitForTimeout(300); }
if (await page.isVisible("#help-modal")) await page.click("#btn-help-close");
if (await page.isVisible("#login-gate")) {
  if (!(await page.isVisible("#auth-modal"))) await page.click("#btn-gate-login");
  await page.click("#link-register");
  await page.fill("#reg-name", "btncheck_" + Date.now().toString().slice(-8));
  await page.fill("#reg-pass", "smoke123");
  await page.fill("#reg-pass2", "smoke123");
  await page.click("#btn-register");
  await page.waitForSelector("#login-gate[hidden]", { state: "attached", timeout: 10000 });
  await page.waitForTimeout(800);
  if (await page.isVisible("#btn-tour-skip")) { await page.click("#btn-tour-skip"); await page.waitForTimeout(300); }
  if (await page.isVisible("#help-modal")) await page.click("#btn-help-close");
}

// ── 遍历全部导航组与子标签, 每个视图跑一遍按钮检查 ──
console.log(`▶ 按钮体检 ${BASE}\n`);
const dismissLabGuide = async () => {
  if (await page.isVisible("#lab-guide-modal")) {
    await page.click("#btn-lab-guide-skip");
    await page.waitForTimeout(200);
  }
};
const groupCount = await page.locator("#nav-groups .nav-group").count();
for (let i = 0; i < groupCount; i++) {
  const group = page.locator("#nav-groups .nav-group").nth(i);
  const gName = (await group.getAttribute("data-group")) || `group${i}`;
  await group.click();
  await page.waitForTimeout(300);
  await dismissLabGuide();
  // 子标签每次切视图整体重建, 用 data-view 逐个重新定位
  const views = await page.$$eval("#nav-subtabs .nav-tab",
    (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.view));
  if (!views.length) {
    await checkCurrent(gName);
    const n = findings.filter((f) => f.view === gName).length;
    console.log(`  ${gName.padEnd(14)}${n === 0 ? "ok" : `⚠ ${n} 条`}`);
    continue;
  }
  for (const v of views) {
    await page.click(`#nav-subtabs .nav-tab[data-view="${v}"]`);
    await page.waitForTimeout(300);
    await dismissLabGuide();
    await checkCurrent(`${gName}/${v}`);
    const n = findings.filter((f) => f.view === `${gName}/${v}`).length;
    console.log(`  ${(gName + "/" + v).padEnd(14)}${n === 0 ? "ok" : `⚠ ${n} 条`}`);
  }
}
await browser.close();

// ── 汇总 ──
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
console.log(`\n═══ ${errors.length} error(s), ${warns.length} warning(s) ═══`);
for (const f of [...errors, ...warns]) {
  console.log(`  [${f.severity === "error" ? "✗" : "⚠"}] ${f.view} / ${f.type}: ${f.detail}`);
}
process.exit(errors.length > 0 ? 1 : 0);
