// 设计评审用截图: 预置游客放行与引导已读标记, 截取指定视图的整页截图。
// 用法: node shot.js <view> <输出png> [light]
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [view = "home", out = "shot.png", theme] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(([v, th]) => {
  sessionStorage.setItem("qs_guest", "1");
  localStorage.setItem("qs_help_seen", "1");
  localStorage.setItem("qs_tour_done", "1");
  localStorage.setItem("qs_lab_guide", "1");
  localStorage.setItem("qs_view", v);
  if (th === "light") localStorage.setItem("qs_theme", "light");
}, [view, theme || ""]);
const url = "file:///" + path.resolve(__dirname, "../../frontend/index.html").replace(/\\/g, "/");
await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2500); // 等字体/图表/空态渲染
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("saved:", out);
