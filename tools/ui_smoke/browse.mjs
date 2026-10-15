// 参数化浏览器 CLI: 让 AI 能用一条命令做"打开 → 操作 → 断言 → 截图"的任意验证。
// 固定流程的巡检用 smoke/buttons/crawl, 针对某个改动的交互验证与前后截图对比用本脚本。
//
// 用法 (动作按命令行出现顺序执行):
//   node browse.mjs [--view lab | --url /path] [--login auto | user:pass]
//     [--theme light|dark] [--lang en] [--width 390]
//     [--click <sel>] [--fill <sel>=<val>] [--press <sel>=<key>]
//     [--wait <sel>] [--wait-ms <n>] [--eval <js>]
//     [--assert-text <sel>=<substr>] [--assert-visible <sel>]
//     [--assert-no-console-error] [--assert-no-overflow]
//     [--screenshot out.png] [--json]
// 前置: 后端已启动且库里有数据 (QUANTSIM_URL 可覆盖, 默认 http://localhost:8080)。
// 退出码: 0 全部通过 / 1 任一步失败; --json 时 stdout 输出结构化结果供程序读取。

import { chromium } from "playwright";
import { enterApp, attachRuntimeGuards, dismissLabGuide } from "./enter_app.mjs";

const BASE = process.env.QUANTSIM_URL || "http://localhost:8080";

// ---- 解析参数: 环境类选项先收集, 动作类按出现顺序入队 ----
const ACTION_FLAGS = new Set([
  "--click", "--fill", "--press", "--wait", "--wait-ms", "--eval",
  "--assert-text", "--assert-visible", "--assert-no-console-error",
  "--assert-no-overflow", "--screenshot", "--view", "--url", "--theme", "--lang",
]);
const NO_ARG = new Set(["--assert-no-console-error", "--assert-no-overflow", "--json"]);

const opts = { login: null, width: 1280, json: false };
const actions = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  const val = NO_ARG.has(flag) ? null : argv[++i];
  if (flag === "--login") opts.login = val;
  else if (flag === "--width") opts.width = parseInt(val, 10);
  else if (flag === "--json") opts.json = true;
  else if (ACTION_FLAGS.has(flag)) actions.push({ flag, val });
  else {
    console.error(`未知参数: ${flag}`);
    process.exit(1);
  }
}

// "sel=value" 形式拆分 (value 里允许再出现 =)
function splitPair(s) {
  const i = s.indexOf("=");
  if (i < 0) throw new Error(`参数需要 "选择器=值" 形式: ${s}`);
  return [s.slice(0, i), s.slice(i + 1)];
}

const result = { ok: true, steps: [], consoleErrors: [], http5xx: [], requestFailed: [], screenshots: [] };
function log(line) {
  if (!opts.json) console.log(line);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: opts.width, height: 800 } });
attachRuntimeGuards(page, (kind, severity, text) => {
  if (kind === "console") result.consoleErrors.push(text);
  else if (kind === "http5xx") result.http5xx.push(text);
  else if (kind === "pageerror") result.consoleErrors.push("pageerror: " + text);
  else result.requestFailed.push(text);
});

/** 执行一步并记录结果; 失败置 ok=false 但继续后续步骤 (断言各自独立, 一次跑完多拿证据)。 */
async function step(name, fn) {
  const rec = { action: name, ok: true, detail: "" };
  try {
    const d = await fn();
    if (d) rec.detail = String(d);
    log(`[ok]   ${name}${rec.detail ? " -> " + rec.detail : ""}`);
  } catch (e) {
    rec.ok = false;
    rec.detail = String(e?.message || e).slice(0, 300);
    result.ok = false;
    log(`[FAIL] ${name} -> ${rec.detail}`);
  }
  result.steps.push(rec);
}

try {
  await step("进入应用", async () => {
    await enterApp(page, BASE, "browse_");
  });

  // 登录: auto = enterApp 已顺手注册过闸; user:pass = 显式走登录弹窗
  if (opts.login && opts.login !== "auto") {
    const [user, pass] = splitPair(opts.login.replace(":", "="));
    await step(`登录 ${user}`, async () => {
      if (!(await page.isVisible("#auth-modal"))) {
        // 门禁页用 #btn-gate-login, 已过闸场景用右上角 #btn-open-auth
        if (await page.isVisible("#btn-gate-login")) await page.click("#btn-gate-login");
        else await page.click("#btn-open-auth");
      }
      await page.fill("#login-name", user);
      await page.fill("#login-pass", pass);
      await page.click("#btn-login");
      await page.waitForTimeout(800);
    });
  }

  for (const { flag, val } of actions) {
    switch (flag) {
      case "--view":
        await step(`切视图 ${val}`, async () => {
          await page.evaluate((v) => switchView(v), val);
          await page.waitForTimeout(500);
          await dismissLabGuide(page);
        });
        break;
      case "--url":
        await step(`打开 ${val}`, async () => {
          await page.goto(BASE + val, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(500);
        });
        break;
      case "--theme":
        await step(`主题 ${val}`, async () => {
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
            try { localStorage.setItem("quantsim_theme", t); } catch {}
          }, val);
          await page.waitForTimeout(300);
        });
        break;
      case "--lang":
        await step(`语言 ${val}`, async () => {
          // 与 #btn-lang 的切换逻辑同效: 直接点按钮直到命中目标语言 (只有 zh/en 两档)
          const cur = await page.evaluate(() => localStorage.getItem("quantsim_lang") || "zh");
          if (cur !== val) await page.click("#btn-lang");
          await page.waitForTimeout(300);
        });
        break;
      case "--click":
        await step(`点击 ${val}`, () => page.click(val, { timeout: 5000 }));
        break;
      case "--fill": {
        const [sel, v] = splitPair(val);
        await step(`填写 ${sel}`, () => page.fill(sel, v, { timeout: 5000 }));
        break;
      }
      case "--press": {
        const [sel, key] = splitPair(val);
        await step(`按键 ${sel} ${key}`, () => page.press(sel, key, { timeout: 5000 }));
        break;
      }
      case "--wait":
        await step(`等待 ${val}`, () => page.waitForSelector(val, { timeout: 10000 }));
        break;
      case "--wait-ms":
        await step(`等待 ${val}ms`, () => page.waitForTimeout(parseInt(val, 10)));
        break;
      case "--eval":
        await step("eval", async () => {
          const r = await page.evaluate(val);
          return JSON.stringify(r)?.slice(0, 200);
        });
        break;
      case "--assert-text": {
        const [sel, expect] = splitPair(val);
        await step(`断言文本 ${sel} 含 "${expect}"`, async () => {
          const text = (await page.textContent(sel, { timeout: 5000 })) || "";
          if (!text.includes(expect)) throw new Error(`实际文本: "${text.trim().slice(0, 120)}"`);
        });
        break;
      }
      case "--assert-visible":
        await step(`断言可见 ${val}`, async () => {
          if (!(await page.isVisible(val))) throw new Error("元素不可见或不存在");
        });
        break;
      case "--assert-no-console-error":
        await step("断言无 console error", () => {
          if (result.consoleErrors.length || result.http5xx.length) {
            throw new Error(`console=${result.consoleErrors.length} http5xx=${result.http5xx.length}: ` +
              [...result.consoleErrors, ...result.http5xx].slice(0, 3).join(" | "));
          }
        });
        break;
      case "--assert-no-overflow":
        await step("断言无横向溢出", async () => {
          const over = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (over > 1) throw new Error(`横向溢出 ${over}px`);
        });
        break;
      case "--screenshot":
        await step(`截图 ${val}`, async () => {
          await page.screenshot({ path: val, fullPage: true });
          result.screenshots.push(val);
        });
        break;
    }
  }
} finally {
  await browser.close();
}

if (opts.json) console.log(JSON.stringify(result, null, 2));
else log(result.ok ? "browse: 全部通过" : "browse: 存在失败步骤");
process.exit(result.ok ? 0 : 1);
