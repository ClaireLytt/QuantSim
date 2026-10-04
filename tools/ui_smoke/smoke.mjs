// QuantSim UI 运行时冒烟测试: 真浏览器跑关键流程, 抓静态检查抓不到的问题 ——
// console 报错 / 未捕获异常 / 请求失败 / 死流程 / 布局横向溢出。
//
// 前置: 后端已启动且库里有行情数据 (QUANTSIM_URL 可覆盖, 默认 http://localhost:8080)。
// 用法: cd tools/ui_smoke && npm install && npx playwright install chromium && npm run smoke
// 退出码: 0 = 全过; 1 = 有失败项 (末尾统一列出)。
import { chromium } from "playwright";

const BASE = process.env.QUANTSIM_URL || "http://localhost:8080";
const findings = [];
const record = (kind, msg) => findings.push(`[${kind}] ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// 原生 confirm() (提前结算等) 一律接受, 否则无头浏览器默认 dismiss, 流程走不下去
page.on("dialog", (d) => d.accept());

// 全程监听三类运行时异常; 行情无数据等业务 toast 不算 (那是后端状态, 不是 UI bug)
page.on("console", (m) => {
  // 401 是未登录访问受保护视图 (每日/房间/我的) 的预期返回, 不算 UI bug
  if (m.type() === "error" && !/status of 401/.test(m.text())) {
    record("console", m.text().slice(0, 200));
  }
});
page.on("pageerror", (e) => record("pageerror", String(e).slice(0, 200)));
page.on("requestfailed", (r) => {
  if (!r.url().includes("favicon")) {
    record("requestfailed", `${r.url()} -> ${r.failure()?.errorText}`);
  }
});

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    record("step", `${name}: ${String(e).split("\n")[0].slice(0, 160)}`);
    console.log(`FAIL  ${name}`);
  }
}

await step("首页加载 (过登录门禁 + 首访弹层)", async () => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nav-groups .nav-group", { timeout: 15000 });
  await page.waitForTimeout(800);
  // 首访自动弹新手引导 (tour-mask 盖全屏), 点「跳过引导」
  if (await page.isVisible("#btn-tour-skip")) {
    await page.click("#btn-tour-skip");
    await page.waitForTimeout(300);
  }
  // 部分版本还会弹玩法说明
  if (await page.isVisible("#help-modal")) {
    await page.click("#btn-help-close");
  }
  // 登录门禁: 注册一次性账号过闸 (门禁上线后不登录看不到应用)
  if (await page.isVisible("#login-gate")) {
    if (!(await page.isVisible("#auth-modal"))) {
      await page.click("#btn-gate-login");
    }
    await page.click("#link-register");
    await page.fill("#reg-name", "smoke_" + Date.now().toString().slice(-8));
    await page.fill("#reg-pass", "smoke123");
    await page.fill("#reg-pass2", "smoke123");
    await page.click("#btn-register");
    await page.waitForSelector("#login-gate[hidden]", { state: "attached", timeout: 10000 });
    // 首访引导在过闸后才弹 (登录前不打扰), 这里再跳一次
    await page.waitForTimeout(800);
    if (await page.isVisible("#btn-tour-skip")) {
      await page.click("#btn-tour-skip");
      await page.waitForTimeout(300);
    }
    if (await page.isVisible("#help-modal")) {
      await page.click("#btn-help-close");
    }
  }
});

await step("新手引导 10 步走完", async () => {
  await page.click("#btn-tour");
  await page.waitForSelector("#tour-pop", { state: "visible", timeout: 5000 });
  for (let i = 0; i < 12 && await page.isVisible("#tour-pop"); i++) {
    await page.click("#btn-tour-next");
    await page.waitForTimeout(250);
  }
  if (await page.isVisible("#tour-pop")) throw new Error("引导走了 12 步仍未结束");
});

await step("遍历全部导航视图与子标签", async () => {
  // 子标签每次切视图都整体重建 (innerHTML 重写), 不能复用 locator 句柄,
  // 用 data-view 值逐个重新定位
  const groupCount = await page.locator("#nav-groups .nav-group").count();
  for (let i = 0; i < groupCount; i++) {
    await page.locator("#nav-groups .nav-group").nth(i).click();
    await page.waitForTimeout(250);
    // 单视图组的子标签条整体 hidden (无需点击); 只遍历可见 tab
    const views = await page.$$eval("#nav-subtabs .nav-tab",
      (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.view));
    for (const v of views) {
      await page.click(`#nav-subtabs .nav-tab[data-view="${v}"]`, { timeout: 5000 });
      await page.waitForTimeout(200);
    }
  }
  // 回到对局组, 为后续步骤定位
  await page.click('#nav-groups .nav-group[data-group="play"]');
});

await step("语言/主题/音效开关往返", async () => {
  await page.click("#btn-lang");
  await page.waitForTimeout(250);
  // 英文态粗检: 可见文本里不应出现形如 i18n 键的裸 key (a.b 或 a.b.c)
  const bare = await page.evaluate(() =>
    [...document.querySelectorAll("button, h2, h3, label, p")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.childNodes[0]?.textContent?.trim() || "")
      .filter((t) => /^[a-z]+(\.[a-zA-Z]+){1,3}$/.test(t)).slice(0, 3));
  if (bare.length) throw new Error("英文界面出现裸 i18n 键: " + bare.join(", "));
  await page.click("#btn-lang");
  await page.click("#btn-theme");
  await page.waitForTimeout(150);
  await page.click("#btn-theme");
  await page.click("#btn-sound");
  await page.click("#btn-sound");
});

await step("玩法说明弹窗开关", async () => {
  await page.click("#btn-help");
  await page.waitForSelector("#help-modal:not([hidden])");
  await page.click("#btn-help-close");
  await page.waitForSelector("#help-modal[hidden]", { state: "attached" });
});

await step("经典对局: 开局→买入→推进→结算", async () => {
  await page.click('#nav-groups .nav-group[data-group="play"]');
  await page.waitForTimeout(200);
  // 头部已无用户名输入框: 已登录直接以账号身份开局
  await page.click("#btn-start");
  await page.waitForSelector("#game-area:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(500); // 等历史 K 线与状态加载

  await page.click("#btn-buy");
  await page.waitForTimeout(400);

  await page.click("#btn-tick");
  await page.waitForTimeout(400);
  // 明日有历史事件时会先弹决策卡
  if (await page.isVisible("#newsgate-modal")) {
    await page.click("#btn-newsgate-go");
    await page.waitForTimeout(400);
  }

  await page.click("#btn-settle");
  await page.waitForSelector("#settle-card:not([hidden])", { timeout: 10000 });
  const ret = await page.textContent("#settle-return");
  if (!ret || !ret.includes("%")) throw new Error("结算收益率未渲染: " + ret);
});

await step("回测工坊: 默认策略跑通出曲线", async () => {
  // 对局专注模式会折叠导航, 先点「展开导航」才能切页
  if (await page.locator("header.collapsed").count()) {
    await page.click("#btn-header-fold");
    await page.waitForTimeout(200);
  }
  await page.click('#nav-groups .nav-group[data-group="arenaG"]');
  await page.waitForTimeout(300);
  await page.click("#btn-backtest");
  await page.waitForSelector("#bt-result:not([hidden])", { timeout: 20000 });
  const days = await page.textContent("#bt-days");
  if (!days || days === "--") throw new Error("回测指标未渲染");
});

await step("布局无横向溢出 (桌面 1280 / 手机 390)", async () => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.waitForTimeout(300);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) throw new Error(`宽 ${width}px 下横向溢出 ${over}px`);
  }
});

await browser.close();

console.log(`\nui_smoke: ${passed} step(s) passed, ${findings.length} finding(s)`);
for (const f of findings) console.log("  " + f);
process.exit(findings.length ? 1 : 0);
