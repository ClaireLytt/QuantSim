// 视觉升级底片: 仪表盘态首页 桌面 + 390 移动端
import { openApp } from "./probe.mjs";

const { browser, page } = await openApp({ guest: true, freezeAnimations: true });
await page.evaluate(async () => {
  await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "shot_life1", password: "shot123456" }),
  });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const skip = await page.$("button:has-text('跳过引导')");
if (skip) { await skip.click(); await page.waitForTimeout(400); }
await page.screenshot({ path: "../../issue_recode/audit_home_desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.screenshot({ path: "../../issue_recode/audit_home_mobile.png", fullPage: true });
console.log("saved audit shots");
await browser.close();
