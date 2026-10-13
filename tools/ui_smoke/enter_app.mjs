// 共享"进应用"引导: 过 landing 落地页 / 首访新手引导 / 登录门禁注册。
// smoke.mjs 与 button_check.mjs 共用, 改门禁/引导流程只改这一处。
export async function enterApp(page, BASE, userPrefix = "smoke_") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // 首访会被 index.html 内联脚本 location.replace 到 landing.html, 点 CTA 回主应用
  if (page.url().includes("landing")) {
    await page.click('a.ld-cta[href^="index.html"]', { timeout: 5000 });
    await page.waitForTimeout(300);
  }
  await page.waitForSelector("#nav-groups .nav-group", { timeout: 15000 });
  await page.waitForTimeout(800); // 首访弹层/引导异步弹出, 等它们就位再统一关
  if (await page.isVisible("#btn-tour-skip")) {
    await page.click("#btn-tour-skip");
    await page.waitForTimeout(300);
  }
  if (await page.isVisible("#help-modal")) await page.click("#btn-help-close");
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
    if (await page.isVisible("#btn-tour-skip")) {
      await page.click("#btn-tour-skip");
      await page.waitForTimeout(300);
    }
    if (await page.isVisible("#help-modal")) await page.click("#btn-help-close");
  }
}
