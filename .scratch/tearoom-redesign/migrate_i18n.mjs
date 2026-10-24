// 架构评审③: i18n 字典迁移为按键双语对齐 —— 同一个键的 zh/en 同行, 消灭"相距 1800 行的孪生行"。
// 做法: 真实求值两个语言块 (值都是纯字符串字面量, 无代码), 以 zh 块的行序+注释为骨架逐行重排,
// en 独有键(若有)补在尾部。运行后 I18N 的运行时形状不变, t()/applyI18n 等逻辑零改动。
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("frontend/i18n.js", "utf8");
const lines = src.split("\n");

// 定位三段: 头(1 行注释) / zh 块 / en 块 / 字典后的其余逻辑
const zhStart = lines.findIndex((l) => l.trim() === "zh: {");
const enStart = lines.findIndex((l) => l.trim() === "en: {");
const dictEnd = lines.findIndex((l, i) => i > enStart && l === "};");
if (zhStart < 0 || enStart < 0 || dictEnd < 0) throw new Error("结构定位失败");

// 求值两块 (eval 括号包裹的对象字面量; 文件是本仓受控源码, 无外部输入)
const blockText = (from, to) => lines.slice(from, to).join("\n").replace(/,\s*$/, "");
const zhObj = eval("({" + blockText(zhStart + 1, lines.findIndex((l, i) => i > zhStart && l.trim() === "},")) + "})");
const enObj = eval("({" + blockText(enStart + 1, dictEnd).replace(/},?\s*$/, "") + "})");
console.log("zh keys:", Object.keys(zhObj).length, "en keys:", Object.keys(enObj).length);

const esc = (s) => JSON.stringify(s);
const out = [];
out.push("// 中英文双语字典与切换。t(key, ...args) 取当前语言文案, {0}/{1} 为占位符。");
out.push("// 结构 (架构评审③ 2026-10-25): 每键一行 [zh, en] 双语对齐 —— 增删改一个键只动一行,");
out.push('// "EN 漏翻"从流程纪律问题变成结构上不可能; ui_check 的缺键/死键扫描照常兜底。');
out.push("const PAIRS = {");

const seen = new Set();
// 以 zh 块原行序为骨架: 注释行原样保留, 键行重排为双语对
for (let i = zhStart + 1; i < lines.length; i++) {
  const l = lines[i];
  if (l.trim() === "},") break;
  const m = l.match(/^\s*("(?:[^"\\]|\\.)*")\s*:/);
  if (!m) { out.push(l); continue; } // 注释/空行原样保留
  const key = JSON.parse(m[1]);
  seen.add(key);
  if (!(key in enObj)) throw new Error("en 缺键: " + key);
  out.push(`  ${esc(key)}: [${esc(zhObj[key])}, ${esc(enObj[key])}],`);
}
// en 独有键 (理论上 ui_check 不允许, 兜底不丢数据)
for (const k of Object.keys(enObj)) {
  if (!seen.has(k)) out.push(`  ${esc(k)}: ["", ${esc(enObj[k])}], // TODO-i18n: zh 缺文案`);
}
out.push("};");
out.push("// 运行时展开为原 I18N 形状, t()/applyI18n 等逻辑零改动");
out.push("const I18N = { zh: {}, en: {} };");
out.push('for (const k in PAIRS) { I18N.zh[k] = PAIRS[k][0]; I18N.en[k] = PAIRS[k][1]; }');

const rest = lines.slice(dictEnd + 1);
writeFileSync("frontend/i18n.js", out.join("\n") + "\n" + rest.join("\n"), "utf8");
console.log("migrated; new line count:", out.length + rest.length);
