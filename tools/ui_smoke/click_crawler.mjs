// QuantSim 全站点击爬虫: 真浏览器遍历全部视图, 逐个点击可见按钮并观察后果。
// 与另外两层体检互补 —— button_check 是静态"有没有 click 监听", smoke 是固定流程;
// 这里回答"每个按钮真点下去会不会炸 / 有没有反应"。
//
// 判定: 点击后观察 console error / pageerror / 5xx (=error), DOM 零变化 (=noop 警告),
//       元素随视图重建消失 (=consumed, 正常)。
// 安全: 复用 enterApp 注册 smoke_ 一次性账号 (公开榜单已按前缀隔离, 见 PublicNames);
//       /api/backtest/run 拦截改 preview:true 不入榜; 跳过 btn-logout (会杀会话) 与外链。
//
// 用法: 起后端后  cd tools/ui_smoke && npm run crawl
//       可选: node click_crawler.mjs --view=lab --max=30 --budget-ms=600000
// 退出码: 0 = 无 error; 1 = 有按钮点出运行时错误。
import { chromium } from "playwright";
import { enterApp, attachRuntimeGuards, dismissLabGuide } from "./enter_app.mjs";

const BASE = process.env.QUANTSIM_URL || "http://localhost:8080";
const argMap = Object.fromEntries(process.argv.slice(2)
    .filter((a) => a.startsWith("--")).map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? true];
    }));
const ONLY_VIEW = argMap.view || null;
const MAX_PER_VIEW = Number(argMap.max || 60);        // 每视图点击上限 (列表类页面按钮可能上百)
const BUDGET_MS = Number(argMap["budget-ms"] || 15 * 60 * 1000);
const SETTLE_MS = 400;                                 // 点击后等待副作用落地的时间

// 永不点击: 会终结会话/离开应用/刷新页面的按钮
const SKIP_IDS = new Set(["btn-logout", "btn-gate-login", "btn-gate-register"]);

const findings = [];   // { view, sig, type: "error"|"noop"|"blocked", detail }
const counts = {};     // view -> { clicked, ok, noop, error, consumed }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let runtimeErrors = [];
attachRuntimeGuards(page, (kind, severity, text) => {
  // 400 是后端业务校验的预期拒绝 (BusinessException -> toast), 同共享守卫放行 401 的逻辑;
  // 真正的服务端错误 (500) 与前端异常照常记 error
  if (/status of 400/.test(text) || / 400 /.test(" " + text + " ")) return;
  if (severity === "error") runtimeErrors.push(`[${kind}] ${text}`);
});
// 回测一律预回测: 爬虫会点到"开始回测", 不能每跑一次就入一条榜
await page.route("**/api/backtest/run", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  body.preview = true;
  await route.continue({ postData: JSON.stringify(body) });
});

try {
  await fetch(BASE, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`后端不可达: ${BASE} — 先启动后端 (mvn spring-boot:run 或 start.ps1)`);
  process.exit(1);
}
await enterApp(page, BASE, "smoke_");

// ---------- 页面内工具 ----------

/** 当前视图里可见、可点、未被跳过的按钮清单 (签名 + 定位信息)。在页面上下文执行。 */
function listButtons(skipIds) {
  const out = [];
  const seen = new Set();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && el.offsetParent !== null;
  };
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!visible(el) || el.disabled) continue;
    if (el.id && skipIds.includes(el.id)) continue;
    // 导航/页头由遍历框架自己管; 桌宠是跨视图悬浮层 (面板随时开合, 每视图重复点只会制造噪音)
    if (el.closest("#nav-groups, #nav-subtabs, header, #pet-widget, #pet-pop")) continue;
    if (el.closest("a[target='_blank']")) continue;
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const sig = el.id ? "#" + el.id : `${text}|${cls}`;
    if (!sig || seen.has(sig)) continue; // 同签名 (列表重复项) 只点第一个
    seen.add(sig);
    out.push({ sig, id: el.id || null, text, cls });
  }
  return out;
}

/** 按签名重新定位元素 (视图可能整体重建, 不能缓存句柄)。 */
async function locate(btn) {
  if (btn.id) {
    const byId = page.locator(`[id="${btn.id}"]`).first();
    return (await byId.count()) ? byId : null;
  }
  const loc = page.locator(`button:has-text("${btn.text.replace(/"/g, '\\"')}")`).first();
  return (await loc.count()) ? loc : null;
}

/** 点击后把可能弹出的遮罩/弹窗收掉, 保证下一个按钮可点。 */
async function closeOverlays() {
  await page.keyboard.press("Escape").catch(() => {});
  // 常见关闭钮: 弹窗右上 ✕ / 明确的关闭按钮 (只点可见的, 最多收 3 层)
  for (let i = 0; i < 3; i++) {
    const closer = page.locator(
        '.modal-mask:not([hidden]) .close, .modal-mask:not([hidden]) [data-i18n$=".close"],'
        + ' #btn-help-close:visible, #btn-tour-skip:visible, #btn-lab-guide-skip:visible').first();
    if (!(await closer.count()) || !(await closer.isVisible().catch(() => false))) break;
    await closer.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await dismissLabGuide(page);
}

async function currentView() {
  return page.evaluate(() => {
    const v = [...document.querySelectorAll('[id^="view-"]')].find((el) => !el.hidden);
    return v ? v.id.slice(5) : null;
  });
}

async function gotoView(v) {
  await page.evaluate((vv) => window.switchView && window.switchView(vv), v);
  await page.waitForTimeout(250);
  await dismissLabGuide(page);
}

// ---------- 遍历 ----------

const deadline = Date.now() + BUDGET_MS;
// 视图清单从导航自动采集 (与 button_check 同一口径), 保证新视图自动纳入
const groups = await page.locator("#nav-groups .nav-group").count();
const views = [];
for (let i = 0; i < groups; i++) {
  await page.locator("#nav-groups .nav-group").nth(i).click();
  await page.waitForTimeout(150);
  await dismissLabGuide(page);
  const tabs = await page.$$eval("#nav-subtabs .nav-tab",
      (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.view));
  if (tabs.length) views.push(...tabs);
  else {
    const v = await currentView();
    if (v) views.push(v);
  }
}
const targets = [...new Set(views)].filter((v) => !ONLY_VIEW || v === ONLY_VIEW);
console.log(`▶ 点击爬虫 ${BASE} — ${targets.length} 个视图\n`);

for (const view of targets) {
  if (Date.now() > deadline) { console.log("⏱ 预算用尽, 提前收尾"); break; }
  await gotoView(view);
  const c = (counts[view] = { clicked: 0, ok: 0, noop: 0, error: 0, consumed: 0 });
  const buttons = (await page.evaluate(listButtons, [...SKIP_IDS])).slice(0, MAX_PER_VIEW);

  for (const btn of buttons) {
    if (Date.now() > deadline) break;
    // 确保还在目标视图 (上一个按钮可能切走了)
    if ((await currentView()) !== view) await gotoView(view);
    const loc = await locate(btn);
    // 元素消失或已不可见 (上次交互关掉了所在容器): 属正常消费, 不算 blocked
    if (!loc || !(await loc.isVisible().catch(() => false))) { c.consumed++; continue; }
    runtimeErrors = [];
    const domBefore = await page.evaluate(() => document.body.innerHTML.length);
    try {
      await loc.click({ timeout: 2500 });
    } catch (e) {
      findings.push({ view, sig: btn.sig, type: "blocked",
        detail: String(e).split("\n")[0].slice(0, 120) });
      continue;
    }
    c.clicked++;
    await page.waitForTimeout(SETTLE_MS);
    if (runtimeErrors.length) {
      c.error++;
      findings.push({ view, sig: btn.sig, type: "error", detail: runtimeErrors.join(" ; ").slice(0, 200) });
    } else {
      const domAfter = await page.evaluate(() => document.body.innerHTML.length);
      const viewNow = await currentView();
      if (domAfter === domBefore && viewNow === view) {
        c.noop++;
        findings.push({ view, sig: btn.sig, type: "noop", detail: "点击后 DOM 无任何变化 (可能是无效按钮或缺反馈)" });
      } else {
        c.ok++;
      }
    }
    await closeOverlays();
  }
  const line = `clicked ${String(c.clicked).padStart(3)} | ok ${c.ok} | noop ${c.noop} | err ${c.error}`;
  console.log(`  ${view.padEnd(12)}${line}${c.error ? "  ✗" : ""}`);
}

await browser.close();

// ---------- 汇总 ----------
const errors = findings.filter((f) => f.type === "error");
const noops = findings.filter((f) => f.type === "noop");
const blocked = findings.filter((f) => f.type === "blocked");
console.log(`\n═══ ${errors.length} error(s), ${noops.length} noop(s), ${blocked.length} blocked ═══`);
for (const f of errors) console.log(`  [✗] ${f.view} ${f.sig}: ${f.detail}`);
for (const f of noops) console.log(`  [⚠] ${f.view} ${f.sig}: ${f.detail}`);
for (const f of blocked) console.log(`  [≠] ${f.view} ${f.sig}: ${f.detail}`);
process.exit(errors.length > 0 ? 1 : 0);
