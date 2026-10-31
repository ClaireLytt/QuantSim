#!/usr/bin/env node
// floor_guard.mjs — diff 范围内强制 CONSTRAINTS.md 的 floor 规则（降低质量门槛的五类动作）。
// 跑法: node tools/floor_guard.mjs [--base <ref>]  (默认对比 origin/main 的 merge-base)
// 退出码: 0 干净 / 1 有 floor 违规 (阻断) / 2 guard 自身跑不起来 (不得当 0 用)。
// 查五类"把红灯变绿的捷径":
//   1. 新增压制注释 (@ts-ignore / eslint-disable / noqa / @SuppressWarnings / gitleaks:allow ...)
//   2. 测试变容易 (.skip / @Disabled / 删测试文件 / 测试文件里删断言)
//   3. 未完成的实现 (not implemented stub / 空 catch)
//   4. CONSTRAINTS.md 阈值被放宽或规则被删
//   5. CONSTRAINTS.md 新增 Exceptions 行 (必须人工讨论过)
// 收紧是静默的，放宽必须响——只报降低门槛的方向。
// 改编自 constraint-driven-development 技能的参考实现；模式按本仓栈 (Java/JS/Python) 扩展。
import { execFileSync } from 'node:child_process';

const base = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'origin/main';
})();

// git diff --no-index 两侧不同就退 1 (新文件的正常情况)，保留输出；其他失败返回 null，null 永不当"干净"。
const git = (args, { diffExit = false } = {}) => {
  // maxBuffer 默认 1MB 不够: vendor 大文件 (echarts.min.js) 入 diff 后曾把 guard 打成 exit 2
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null; }
};
const bail = (msg) => { console.error('floor-guard: ' + msg); process.exit(2); };

// 必须从仓库根跑: ls-files 只列当前子树，子目录启动会漏掉别处的未跟踪文件。
const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);

const mergeBase = git(['merge-base', base, 'HEAD'])?.trim();
if (!mergeBase) bail('no merge base against ' + base);

// 统一 diff + 未跟踪文件 (git diff 看不到新文件)。
const tracked = git(['diff', '--unified=0', mergeBase, '--']);
if (tracked === null) bail('could not diff against ' + mergeBase);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
if (untrackedFiles === null) bail('could not list untracked files');
const NUL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const untracked = untrackedFiles.split('\n').filter(Boolean)
  // 截图/日志/依赖不进 floor 判定 (二进制与生成物)
  .filter((f) => !/\.(png|jpg|gif|log|lock)$/.test(f) && !f.includes('node_modules'))
  .map((f) => {
    const d = git(['diff', '--no-index', '--unified=0', NUL, f], { diffExit: true });
    if (d === null) bail('could not diff untracked file ' + f);
    return d;
  }).join('\n');
const diff = tracked + '\n' + untracked;

// 逐行走 diff。--- / +++ 只在文件头区间 (diff 行到首个 @@ 之间) 才是头，hunk 内全是内容。
const added = [], removed = [], deleted = [];
const pathOf = (s) => s.replace(/^[ab]\//, '');
let file = '', oldFile = '', inHeader = false;
for (const line of diff.split('\n')) {
  if (line.startsWith('diff ')) inHeader = true;
  else if (line.startsWith('@@')) inHeader = false;
  else if (inHeader) {
    if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4));
    else if (line.startsWith('+++ ')) {
      const newFile = pathOf(line.slice(4));
      file = (newFile === '/dev/null' || newFile === 'NUL') ? oldFile : newFile;
      if (newFile === '/dev/null' || newFile === 'NUL') deleted.push(file);
    }
  }
  else if (line.startsWith('+')) added.push({ file, text: line.slice(1) });
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1) });
}

const findings = [];
const notices = []; // 点名但不阻断 (新增例外行: 讨论发生在 PR 上, 阻断会让例外通道永远走不通)
const flag = (rule, f, text) => findings.push({ rule, file: f, text: text.trim().slice(0, 120) });
const note = (rule, f, text) => notices.push({ rule, file: f, text: text.trim().slice(0, 120) });

// 读 CONSTRAINTS.md 的 Exceptions 表: 未过期的 E 行按 Path 豁免对应文件的 floor 违规。
// 这是 guard 自己指路的唯一放行通道 ("route it through a tracked exception"), 必须真的生效。
const exceptions = (() => {
  const md = git(['show', 'HEAD:CONSTRAINTS.md']);
  if (md === null) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\| *(E\d+) *\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!m) continue;
    const expires = m[6].trim();
    if (expires && expires < today) continue; // 过期例外不再豁免
    out.push({ id: m[1], path: m[3].trim() });
  }
  return out;
})();
const isExcepted = (f) => exceptions.some((e) => e.path === f);
// 本仓测试形态: Java 的 *Test.java / *Tests.java, Python 的 test_*.py, JS 冒烟脚本不算测试
const isTest = (f) => /Tests?\.java$|(^|\/)test_[^/]+\.py$|\.(test|spec)\./.test(f);
const isConstraints = (f) => /CONSTRAINTS\.md$/.test(f);
// guard 自身、知识库文档里的模式示例、第三方 vendor 压缩库不触发
const isGuardOrDoc = (f) => /floor_guard\.mjs$|pr_guard\.py$|docs\/|issue_recode\/|\/vendor\/|^vendor\//.test(f);

// 1. 压制注释 — Java/JS/Python 三栈
// noqa: E402 豁免: sys.path hack 后再 import 的惯用法 (本仓测试都这么写), 不压制正确性检查
const SUPPRESSIONS = /@ts-ignore|@ts-nocheck|eslint-disable|# *noqa(?!: *E402)|# *type: *ignore|@SuppressWarnings|nosemgrep|gitleaks:allow|istanbul ignore/;
// 3. 未完成实现 (TODO 不拦: 本仓注释文化允许登记债务, 拦 stub 与空 catch)
const STUBS = /throw new (Error|UnsupportedOperationException)\((['"]).*[Nn]ot implemented|catch\s*\((\w+\s+)?\w*\)\s*\{\s*\}|raise NotImplementedError/;
// 2. 跳过测试 — JUnit5 @Disabled / JUnit4 @Ignore / pytest 装饰器 / JS skip。
// 不拦运行时条件 pytest.skip() (环境不可用时跳过是守护, 不是偷懒)。
const SKIPS = /\b(it|describe|test)\.(skip|todo)\(|\bxit\(|\bxdescribe\(|@pytest\.mark\.skip|@Disabled|@Ignore\b/;

for (const { file, text } of added) {
  // CONSTRAINTS.md 描述规则时必然写出这些模式, 它由下方规则/阈值 diff 逻辑单独保护
  if (isConstraints(file)) {
    if (/^\| *(W|E)\d+ *\|/.test(text)) note('new-exception', file, text);
    continue;
  }
  if (isGuardOrDoc(file)) continue;
  if (SUPPRESSIONS.test(text)) flag('silenced-checker', file, text);
  if (STUBS.test(text)) flag('unfinished-work', file, text);
  if (SKIPS.test(text)) flag('test-made-easier', file, text);
}

// 2b. 删测试文件 / 留下的测试文件里删断言
for (const f of deleted) if (isTest(f)) flag('test-deleted', f, 'file deleted');
for (const { file, text } of removed) {
  if (isTest(file) && !deleted.includes(file) && /\b(expect|assert\w*|should)\b/i.test(text)) {
    if (isExcepted(file)) note('assertion-removed (excepted)', file, text);
    else flag('assertion-removed', file, text);
  }
}

// 4. CONSTRAINTS.md 的规则被删或阈值放宽。规则 = floor 列表项或表格行，键 = 冒号前文本或首列。
// 数字带方向 (>= / must not fall = 下限, <= / must not grow = 上限)；下限变小或上限变大 = 放宽。
// 读不出方向的数字一变就报——guard 分不清收紧放宽时，沉默是错误默认。
const ruleKey = (t) => {
  const s = t.trim();
  if (s.startsWith('|')) return s.split('|').map((c) => c.trim()).filter(Boolean)[0] ?? '';
  if (/^[-*] /.test(s)) return s.slice(2).split(':')[0].trim();
  return null;
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE = /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const MIN_AFTER = /^\s*\S*\s*(or more|or higher|must not fall|must not drop)/;
const MAX_AFTER = /^\s*\S*\s*(or less|or lower|must not grow|must not exceed)/;
const thresholds = (t) => {
  const out = [], re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    const dir = MIN_BEFORE.test(before) || MIN_AFTER.test(after) ? 'min'
      : MAX_BEFORE.test(before) || MAX_AFTER.test(after) ? 'max' : null;
    out.push({ n: Number(m[0]), dir });
  }
  return out;
};
const removedRules = removed.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
for (const r of removedRules) {
  const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
  if (!a) {
    if (!isException(r.text)) flag('rule-removed', r.file, r.text); // 删 Exceptions 行是收紧: 静默
    continue;
  }
  const before = thresholds(r.text), after = thresholds(a.text);
  let verdict = null;
  for (const dir of ['min', 'max', null]) {
    const was = before.filter((x) => x.dir === dir), now = after.filter((x) => x.dir === dir);
    was.forEach((b, i) => {
      const n = now[i];
      if (verdict) return;
      if (!n) verdict = 'threshold-removed';
      else if (n.n === b.n) return;
      else if (dir === 'min' ? n.n < b.n : dir === 'max' ? n.n > b.n : true) {
        verdict = dir ? 'threshold-loosened' : 'threshold-changed';
      }
    });
  }
  if (verdict) flag(verdict, r.file, r.text + '  ->  ' + a.text);
}

// 指纹闸门: 资源内容已变但 ?v= 未盖 → 阻断 (2026-10-25 两次把旧指纹带上线, hook 与 W3 曾同时失守)。
const py = process.platform === 'win32' ? 'python' : 'python3';
try {
  execFileSync(py, ['tools/bump_assets.py', '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  if (e.status === 1) flag('stale-asset-fingerprint', 'frontend/index.html', String(e.stderr || '').trim() || 'bump_assets --check failed');
  else bail('bump_assets --check could not run: ' + (e.message || e));
}

if (notices.length > 0) {
  console.error('floor-guard: ' + notices.length + ' notice(s) (non-blocking, must be discussed on the PR):');
  for (const n of notices) console.error(`  [${n.rule}] ${n.file}: ${n.text}`);
}
if (findings.length === 0) { console.log('floor-guard: clean'); process.exit(0); }
console.error('floor-guard: ' + findings.length + ' floor violation(s):');
for (const f of findings) console.error(`  [${f.rule}] ${f.file}: ${f.text}`);
console.error('\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception in CONSTRAINTS.md.');
process.exit(1);
