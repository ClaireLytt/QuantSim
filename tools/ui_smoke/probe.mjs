// probe.mjs — 手搓 Playwright 探针的统一开场。
// 为什么存在: 一次性 node -e 探针反复踩同三个坑 (2026-10-25 一个会话内 3 次首跑失败):
//   1) 首访无 qs_seen 会被 location.replace 跳去 landing.html, 等 #view-home 必超时;
//   2) 登录门禁 #auth-modal 遮罩拦截一切 click, 文字链上还叠着 span, 必须 JS 点 #link-guest;
//   3) 宠物 bob / 骨架屏等常驻动画让元素"not stable", 元素截图糊成色块。
// 用法:
//   import { openApp } from "./probe.mjs";
//   const { browser, page } = await openApp({ guest: true, freezeAnimations: true, theme: "dark" });
//   ... 自己的动作 ...; await browser.close();
import { chromium } from "playwright";

const BASE = process.env.QUANTSIM_URL || "http://localhost:8080";

export async function openApp({ guest = true, freezeAnimations = false, theme = null, viewport = { width: 1280, height: 900 } } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  await context.addInitScript(([th]) => {
    try {
      localStorage.setItem("qs_seen", "1"); // 跳过 landing 重定向
      if (th) localStorage.setItem("qs_theme", th);
    } catch { /* 隐私模式忽略 */ }
  }, [theme]);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE);
  if (guest) {
    // 门禁弹窗出现则以游客身份关掉; 已登录态下弹窗不存在, 静默跳过
    const gate = await page.waitForSelector("#link-guest", { timeout: 5000 }).catch(() => null);
    if (gate) {
      await page.evaluate(() => document.getElementById("link-guest").click());
      await page.waitForTimeout(600);
    }
  }
  if (freezeAnimations) {
    await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
  }
  return { browser, context, page, errors };
}
