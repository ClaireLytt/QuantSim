// 共享"进应用"引导: 过 landing 落地页 / 首访新手引导 / 登录门禁注册。
// smoke.mjs 与 button_check.mjs 共用, 改门禁/引导流程只改这一处。

/** 关掉首访新手引导弹层 + 帮助弹窗 (过闸前后各可能弹一次)。 */
async function closeTour(page) {
  if (await page.isVisible("#btn-tour-skip")) {
    await page.click("#btn-tour-skip");
    await page.waitForTimeout(300);
  }
  if (await page.isVisible("#help-modal")) await page.click("#btn-help-close");
}

/** 关掉首次进研究所的 3 步引导遮罩 (lab-guide-modal), 不关会挡死后续一切点击。 */
export async function dismissLabGuide(page) {
  if (await page.isVisible("#lab-guide-modal")) {
    await page.click("#btn-lab-guide-skip");
    await page.waitForTimeout(200);
  }
}

/**
 * 统一挂载运行时监听: 原生 confirm 一律 accept (无头浏览器默认 dismiss, 流程走不下去),
 * 外加四类异常 —— console error (401 是未登录访问受保护视图的预期返回, 放行) /
 * pageerror / 5xx 响应 (带 method+URL, console 的 "Failed to load resource" 定位不了) /
 * requestfailed (favicon 除外)。落到哪个清单由调用方的 report(kind, severity, text) 决定。
 */
export function attachRuntimeGuards(page, report) {
  page.on("dialog", (d) => d.accept());
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 401/.test(m.text())) {
      report("console", "error", m.text().slice(0, 200));
    }
  });
  page.on("pageerror", (e) => report("pageerror", "error", String(e).slice(0, 200)));
  page.on("response", (r) => {
    if (r.status() >= 500) {
      report("http5xx", "error", `${r.status()} ${r.request().method()} ${r.url()}`.slice(0, 160));
    }
  });
  page.on("requestfailed", (r) => {
    if (!r.url().includes("favicon")) {
      report("requestfailed", "warn", `${r.url().slice(0, 120)} -> ${r.failure()?.errorText}`);
    }
  });
}

export async function enterApp(page, BASE, userPrefix = "smoke_") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // 首访会被 index.html 内联脚本 location.replace 到 landing.html, 点 CTA 回主应用
  if (page.url().includes("landing")) {
    await page.click('a.ld-cta[href^="index.html"]', { timeout: 5000 });
    await page.waitForTimeout(300);
  }
  await page.waitForSelector("#nav-groups .nav-group", { timeout: 15000 });
  await page.waitForTimeout(800); // 首访弹层/引导异步弹出, 等它们就位再统一关
  await closeTour(page);
  // 登录门禁: 注册一次性账号过闸
  if (await page.isVisible("#login-gate")) {
    if (!(await page.isVisible("#auth-modal"))) await page.click("#btn-gate-login");
    await page.click("#link-register");
    await page.fill("#reg-name", userPrefix + Date.now().toString().slice(-8));
    await page.fill("#reg-pass", "smoke123");
    await page.fill("#reg-pass2", "smoke123");
    await page.click("#btn-register");
    await page.waitForSelector("#login-gate[hidden]", { state: "attached", timeout: 10000 });
    // 首访引导在过闸后才弹, 再关一次
    await page.waitForTimeout(800);
    await closeTour(page);
  }
}
