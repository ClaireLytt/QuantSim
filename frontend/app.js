const API = "/api";

// 图表用色统一取自 style.css 的 CSS 变量, 避免两处维护
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 主题必须在读取 COLORS 前应用, 否则图表首帧取到错误配色
// 2026-10 茶室换装: 默认亮色 (首页样板以茶室为第一印象), 存过 dark 偏好的用户不受影响
let THEME = "light";
try { if (localStorage.getItem("qs_theme") === "dark") THEME = "dark"; } catch (e) { /* 隐私模式下忽略 */ }
document.documentElement.dataset.theme = THEME;

const COLORS = {
  up: cssVar("--up"),
  down: cssVar("--down"),
  ma5: cssVar("--ma5"),
  ma20: cssVar("--ma20"),
  text: cssVar("--text"),
  muted: cssVar("--text-muted"),
  border: cssVar("--border"),
  panel: cssVar("--panel-raised"),
  accent: cssVar("--accent"),
  accent2: cssVar("--accent-2"),
};

// 任意 CSS 色加透明度 (echarts 吃不了 color-mix): 支持本仓变量的 hsl()/#rrggbb 两种形态
function hexA(color, a) {
  if (color.startsWith("hsl(")) return color.replace("hsl(", "hsla(").replace(")", ", " + a + ")");
  if (color.startsWith("#") && color.length === 7) return color + Math.round(a * 255).toString(16).padStart(2, "0");
  return color;
}

// dataZoom 滑块主题化的唯一口径 (2026-10-25 /correct 错误类 B): 曾在对局主图与回测曲线
// 各手搓一份同样的 token 组合, 两处必然漂移。新图表要滑块一律 { ...qsSliderZoom(C), 自己的定位 }。
function qsSliderZoom(C) {
  return {
    type: "slider",
    borderColor: C.border,
    textStyle: { color: C.muted },
    backgroundColor: "transparent",
    fillerColor: hexA(C.accent, 0.14),
    handleStyle: { color: C.panel, borderColor: C.border },
    moveHandleStyle: { color: C.border },
    emphasis: { handleStyle: { borderColor: C.accent }, moveHandleStyle: { color: C.accent } },
    dataBackground: { lineStyle: { color: C.border }, areaStyle: { color: hexA(C.muted, 0.1) } },
    selectedDataBackground: { lineStyle: { color: C.accent }, areaStyle: { color: hexA(C.accent, 0.12) } },
  };
}


const state = {
  sessionId: null,
  klines: [],
  trades: [],
  totalTicks: 20,
  startDate: null,
  settled: false,
  lotSize: 100,
  stockName: "",
  stockCode: "",
  market: "",
  aiLevel: "",
  daysElapsed: 0,
  mode: "CLASSIC",
  advanced: false,
  stocks: [],        // 组合模式的标的清单 [{code,name}]
  activeStock: "",   // 组合模式当前查看/交易的标的
  orders: [],
  // 语言切换时重渲染动态区域所需的缓存
  lastStatus: null,
  lastSettle: null,
  lastBt: null,
  lbRows: null,
  arenaRows: null,
  arenaStocks: [],
};

const $ = (id) => document.getElementById(id);

// ---- 图表生命周期管家: qsChart(elId, buildOption) ----
// 深模块: init(懒加载, 避开隐藏容器零尺寸)/qs:theme 重绘/qs:view+窗口 resize 全部内化,
// 视图只描述"怎么构造 option"。buildOption() 读当前状态返回完整 option, 返回 null = 未就绪跳过。
// 返回 { refresh, instance }: 数据变化时调 refresh(); instance() 是逃生口, 仅供增量 merge
// 更新 (updateChartData、tape.js 高频 tick) 等确需直操实例的场景, 常规路径别用。新图表一律
// 走这里, 别再手搓 init/theme/resize 三件套 (曾散落 19 个文件 25 处, 2026-10 收口)。
// 命名约定: 句柄变量以 H 结尾 (= Handle), 如 btChartH / pfPieH。
// 全站唯一例外: landing.html 是不加载 app.js 的独立落地页, 其图表保留自管 echarts.init。
const QS_CHARTS = [];
function qsChart(elId, buildOption) {
  const entry = { elId, buildOption, chart: null, pending: false };
  QS_CHARTS.push(entry);
  return {
    refresh() { qsChartRefresh(entry); },
    instance() { return entry.chart; },
  };
}
function qsChartRefresh(entry) {
  const opt = entry.buildOption();
  if (opt == null) return;
  if (!entry.chart) {
    const el = $(entry.elId);
    // 不可见容器 init 会退化成 100px 画布; 标记 pending, 等 qs:view 可见后再画
    if (!el || el.clientWidth === 0) { entry.pending = true; return; }
    entry.chart = echarts.init(el);
  }
  entry.pending = false;
  entry.chart.setOption(opt, { notMerge: true });
  entry.chart.resize(); // 容器尺寸可能在隐藏期间变过, 画完统一校正
}
// 主题切换: COLORS 已被 toggleTheme 重读, 重调 buildOption 即拿到新配色
document.addEventListener("qs:theme", () => QS_CHARTS.forEach((e) => { if (e.chart) qsChartRefresh(e); }));
// 视图切换: 补画 pending 的、校正已有的
document.addEventListener("qs:view", () => QS_CHARTS.forEach((e) => {
  if (e.pending) qsChartRefresh(e);
  else if (e.chart) e.chart.resize();
}));
// 窗口拖动期间每帧全量 resize 太费; 150ms 尾沿节流, 停止拖动后统一校正
let qsResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(qsResizeTimer);
  qsResizeTimer = setTimeout(
      () => QS_CHARTS.forEach((e) => { if (e.chart) e.chart.resize(); }), 150);
});

const mainChart = qsChart("chart", () => (state.klines.length ? buildChartOption() : null));

// ---- 弹窗接线管家: qsModal(modalId, opts) ----
// 内化弹窗三件套: 背板点击关闭 (e.target === 自身)、关按钮代绑 (closeBtnId)、开时音效 (sound)。
// onOpen/onClose 挂业务副作用 (如 body 滚动锁)。escape: true 可选 Esc 关闭 (默认关:
// 登录/新手引导类流程弹窗不可被 Esc 中断; 既有集中式 Esc 分发保留)。
// 特殊形态不强迁, 已登记: tour-mask (点击=下一步, 非关闭)。新弹窗别再手搓三件套 (2026-10 收口)。
function qsModal(modalId, opts = {}) {
  const el = $(modalId);
  const close = () => { el.hidden = true; if (opts.onClose) opts.onClose(); };
  const open = () => { el.hidden = false; if (opts.sound) playSound(opts.sound); if (opts.onOpen) opts.onOpen(); };
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  if (opts.closeBtnId) $(opts.closeBtnId).addEventListener("click", close);
  if (opts.escape) {
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  }
  return { open, close, el };
}

const fmtMoney = (v) => Number(v).toLocaleString(LANG === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";

// ---- 迷你游戏共享工具 (tape/option/tasks/academy 用, 别再各自复制一份) ----
// 标准正态随机 (Box-Muller); ||1e-9 防 log(0)
function qsGauss() {
  const u = Math.random() || 1e-9;
  const v = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// 整数千分位 (迷你游戏金额展示)
const qsFmtInt = (n) => Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
// 本地日期 yyyy-MM-dd (可偏移天数); 不走 toISOString, 避免 UTC 时区跨日
function qsTodayStr(offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 本地周序号 (周一为界): duel 轮换 / lab 每周课题 / home 推荐共用一套口径,
// 别再用 epoch 周 (那是 UTC 周四起算, 和"周日 24:00 切换"的倒计时文案对不上)
function qsWeekIndex() {
  const days = Math.floor((Date.now() - new Date(1970, 0, 5).getTime()) / 864e5); // 1970-01-05 = 本地周一
  return Math.floor(days / 7);
}
// 策略综合分 (收益50/夏普30/回撤20, 榜内 min-max 归一): duel 擂台与首页预览同口径
function qsCompositeScores(rows) {
  // 缺失值 (旧记录 sharpe/drawdown 为 null) 记中性 0.5: 之前 ||0 会把 null 回撤当成 0 回撤白送 20 分
  const nums = (get) => rows.map((x) => {
    const v = Number(get(x));
    return Number.isFinite(v) && get(x) != null ? v : null;
  });
  const norm = (arr, inv) => {
    const real = arr.filter((v) => v != null);
    const lo = Math.min(...real);
    const hi = Math.max(...real);
    return arr.map((v) => {
      const n = (v == null || hi === lo) ? 0.5 : (v - lo) / (hi - lo);
      return inv ? 1 - n : n;
    });
  };
  const r = norm(nums((x) => x.totalReturn));
  const s = norm(nums((x) => x.sharpeRatio));
  const d = norm(nums((x) => x.maxDrawdown), true);
  return rows.map((x, i) => ({ ...x, score: Math.round(100 * (0.5 * r[i] + 0.3 * s[i] + 0.2 * d[i])) }));
}
// 表格体渲染收口 (榜单/持仓/流水通用): 清空 -> 空态行 (i18n 文案) -> 逐行 build(r, i) 返回 <tr>。
// 用户可控文本仍由各调用方的 build 用 textContent 填充 (XSS 纪律不变), 这里只收敛空态与循环骨架
function qsRenderRows(tbody, rows, colspan, emptyKey, build) {
  tbody.innerHTML = "";
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-row"></td></tr>`;
    tbody.querySelector(".empty-row").textContent = t(emptyKey);
    return;
  }
  rows.forEach((r, i) => tbody.appendChild(build(r, i)));
}
// 无偏洗牌 (Fisher-Yates, 返回新数组); sort(() => random - .5) 分布有偏, 别再用
function qsShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 迷你游戏最佳成绩读取 (统一容错)
function qsLoadBest(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === "object" ? v : { best: 0 };
  } catch (e) {
    return { best: 0 };
  }
}
// 迷你游戏最佳成绩写入 (与 qsLoadBest 对偶, patch 合并进已有记录; 隐私模式静默忽略)
function qsSaveBest(key, patch) {
  try { localStorage.setItem(key, JSON.stringify({ ...qsLoadBest(key), ...patch })); } catch (e) { /* 忽略 */ }
}
// 带符号百分比 (默认 1 位小数; duel/home 榜单共用, 2 位场景用 fmtPct)
function qsSignedPct(v, digits = 1) {
  const n = Number(v);
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(digits) + "%";
}
// 标准正态 CDF (Abramowitz-Stegun 近似, 教学精度足够; academy/option 的 BS 定价共用)
function qsNormCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
// 欧式期权 Black-Scholes 定价: academy 沙盒与 option 游戏共用同一公式
// (之前各写一份, 公式体已漂移; r/T 假设由调用方给——沙盒 r=3%/自然日, 游戏 r=0/交易日)
function qsBsPrice(spot, strike, T, vol, isCall, r = 0) {
  if (T <= 0) {
    return Math.max(0, isCall ? spot - strike : strike - spot); // 到期只剩内在价值
  }
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + vol * vol / 2) * T) / sd;
  const d2 = d1 - sd;
  if (isCall) {
    return spot * qsNormCdf(d1) - strike * Math.exp(-r * T) * qsNormCdf(d2);
  }
  return strike * Math.exp(-r * T) * qsNormCdf(-d2) - spot * qsNormCdf(-d1);
}
// 轮回模式最佳身家 (relics/walker 共用, 读 localStorage qs_reborn)
function qsRebornWorth() {
  try {
    const d = JSON.parse(localStorage.getItem("qs_reborn") || "null");
    return d && d.best ? Number(d.best.worth) || 0 : 0;
  } catch (e) { return 0; }
}

function marketTag(market) {
  if (market === "CRYPTO") return t("tag.crypto");
  if (market === "US") return t("tag.us");
  return "";
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

async function api(path, options = {}) {
  let resp;
  try {
    resp = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    // fetch 网络层 reject 的是 "TypeError: Failed to fetch" 英文原文, 不能直漏给用户
    const err = new Error(t("err.network"));
    err.network = true;
    throw err;
  }
  // 非 JSON 响应 (502 HTML / 空体) 不能让解析错误盖过真实失败原因
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const err = new Error((data && data.message) || t("err.http", resp.status));
    err.status = resp.status; // 调用方按状态码判断 (401 未登录等), 别依赖文案子串
    throw err;
  }
  if (data === null) {
    throw new Error(t("err.badResp"));
  }
  return data;
}

// 请求进行中禁止重复提交 (防止双击"下一天"导致前后端天数错位)
let busy = false;
async function guarded(fn) {
  if (busy) return;
  busy = true;
  setTradeEnabled(false);
  try {
    await fn();
  } finally {
    busy = false;
    if (!state.settled) setTradeEnabled(true);
  }
}

// ---------- 音效 (WebAudio 合成, 零素材; 默认关, 头部按钮开关) ----------

let SOUND = false;
try { SOUND = localStorage.getItem("qs_sound") === "on"; } catch (e) { /* 隐私模式下忽略 */ }
let audioCtx = null;

function playTone(freq, dur, delay = 0) {
  const ctx = audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

// 质感音: 短促滤波噪声 (翻页/按键的"沙/嗒"感), 比纯音更不打扰
function playNoise(dur, freq, vol = 0.05, delay = 0) {
  const ctx = audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(bp).connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}

// 触觉反馈 (Android Chrome 等支持 vibrate 的环境; iOS 静默跳过)。
// 与音效共用总开关: 用户关掉 🔇 即同时关掉声音与震动, 不另设一个开关去烦人
function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* 不支持则作罢 */ }
}

function playSound(kind) {
  if (!SOUND) return;
  try {
    if (kind === "buy") { playTone(660, 0.12); buzz(15); }
    else if (kind === "sell") { playTone(440, 0.12); buzz(15); }
    else if (kind === "fill") { playTone(523, 0.1); playTone(784, 0.12, 0.1); buzz([10, 40, 10]); }
    else if (kind === "win") { playTone(523, 0.12); playTone(659, 0.12, 0.12); playTone(784, 0.3, 0.24); buzz([20, 60, 20, 60, 60]); }
    else if (kind === "lose") { playTone(330, 0.18); playTone(262, 0.35, 0.18); buzz(120); }
    else if (kind === "tap") playNoise(0.04, 2400, 0.04); // 导航切换: 极轻的"嗒"
    else if (kind === "flip") playNoise(0.09, 900, 0.06); // 弹窗开合: 翻页"沙"
  } catch (e) { /* 浏览器自动播放策略阻止时静默 */ }
}

// ---------- 玩法说明弹窗 ----------

const helpModal = qsModal("help-modal", {
  closeBtnId: "btn-help-close",
  onOpen: () => { document.body.style.overflow = "hidden"; },
  onClose: () => {
    document.body.style.overflow = "";
    try { localStorage.setItem("qs_help_seen", "1"); } catch (e) { /* 隐私模式下忽略 */ }
  },
});
function openHelp() { helpModal.open(); }
function closeHelp() { helpModal.close(); }
$("btn-help").addEventListener("click", openHelp);
$("btn-help-ok").addEventListener("click", closeHelp);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("tour-pop").hidden) endTour();
  else if (!$("recap-modal").hidden) closeRecap();
  else if (!$("help-modal").hidden) closeHelp();
  else if (!$("settle-modal").hidden) closeSettlePop(); // 结算弹窗同样可 Esc, 且会恢复 body 滚动
});

// 首访引导改为过登录门禁后再弹 (auth.js 放行时调 qsMaybeOnboard), 避免叠在登录窗上

// ---------- 界面切换: 两级导航 (分组 + 子标签) ----------

const NAV_GROUPS = {
  home: ["home"],
  play: ["game", "daily", "event", "rooms"],
  arenaG: ["arena", "duel", "ranking"],
  // 学堂 = 金融纪元大世界: 仅 4 个页签 (主线/行者档案/藏品馆/训练场), 旧小游戏不再独立设卡
  learn: ["academy", "profile", "relics", "games"],
  labG: ["lab"],
  me: ["mine", "career", "history", "account"],
  // extra: 无导航入口但仍是合法视图 (章节任务/训练场/首页卡片经 switchView 进入)
  extra: ["wiki", "guess", "famous", "story", "quiz", "option", "tape", "reborn", "bubble",
    "newsjudge", "richman", "buydip", "stratbox", "qdetect", "autopsy", "monk", "alchemy"],
};
const VIEWS = Object.values(NAV_GROUPS).flat();
const VIEW_GROUP = {};
Object.entries(NAV_GROUPS).forEach(([g, vs]) => vs.forEach((v) => { VIEW_GROUP[v] = g; }));
const groupTabs = document.querySelectorAll("#nav-groups .nav-group");
let currentView = "home";

function renderSubtabs(group, active) {
  const wrap = $("nav-subtabs");
  // extra 组 = 无导航的内化视图 (大世界任务直达), 不渲染子页签, 否则旧入口又复活了
  const views = group === "extra" ? [] : (NAV_GROUPS[group] || []);
  wrap.hidden = views.length <= 1;
  wrap.innerHTML = "";
  views.forEach((v) => {
    const b = document.createElement("button");
    b.className = "nav-tab" + (v === active ? " active" : "");
    b.dataset.view = v;
    b.textContent = t("nav." + v);
    b.addEventListener("click", () => switchView(v));
    wrap.appendChild(b);
  });
}

// 对局专注模式: 折叠头部三行导航只留品牌行, K 线顶上去; 箭头按钮可随时展开
function setHeaderFold(fold) {
  document.querySelector("header").classList.toggle("collapsed", fold);
  renderFoldBtn();
  const c = mainChart.instance();
  if (c) c.resize(); // 头部折叠改变图表容器高度
}

function renderFoldBtn() {
  const fold = document.querySelector("header").classList.contains("collapsed");
  $("btn-header-fold").textContent = (fold ? "⌄ " : "⌃ ") + t(fold ? "fold.expand" : "fold.collapse");
}
document.addEventListener("qs:lang", renderFoldBtn);

function switchView(name) {
  if (!VIEWS.includes(name)) name = "home";
  const group = VIEW_GROUP[name];
  currentView = name;
  VIEWS.forEach((v) => { $("view-" + v).hidden = v !== name; });
  groupTabs.forEach((b) => b.classList.toggle("active", b.dataset.group === group));
  renderSubtabs(group, name);
  try { localStorage.setItem("qs_view", name); } catch (e) { /* 隐私模式下忽略 */ }
  // 进行中的对局自动进入专注模式, 离开或已结算则展开 (结算后还折叠会把导航藏死)
  setHeaderFold(name === "game" && !!state.sessionId && !state.settled);
  playSound("tap"); // 导航质感音: 极轻的"嗒", 给切页一点物理反馈
  // 图表补画/尺寸校正由 qsChart 的 qs:view 监听统一处理, 这里只负责派发
  document.dispatchEvent(new CustomEvent("qs:view", { detail: name }));
}
$("btn-header-fold").addEventListener("click", () => {
  setHeaderFold(!document.querySelector("header").classList.contains("collapsed"));
});

// 账户状态 / AI 操盘手: 左上角胶囊按钮唤起弹窗 (侧栏只留高频交易操作)
const statusModal = qsModal("status-modal", { sound: "flip", closeBtnId: "btn-status-close" });
$("btn-status-pop").addEventListener("click", statusModal.open);
const aiModal = qsModal("ai-modal", { sound: "flip", closeBtnId: "btn-ai-close" });
$("btn-ai-pop").addEventListener("click", aiModal.open);

// 点分组标签 = 进入该组第一个子页
groupTabs.forEach((b) => {
  b.addEventListener("click", () => switchView(NAV_GROUPS[b.dataset.group][0]));
});

let savedView = "home";
try { savedView = localStorage.getItem("qs_view") || "home"; } catch (e) { /* 隐私模式下忽略 */ }
switchView(savedView);

// ---------- 深色 / 浅色主题 ----------

function renderThemeBtn() {
  $("btn-theme").textContent = t(THEME === "light" ? "theme.toDark" : "theme.toLight");
}

function toggleTheme() {
  THEME = THEME === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = THEME;
  try { localStorage.setItem("qs_theme", THEME); } catch (e) { /* 隐私模式下忽略 */ }
  // COLORS 在加载时缓存, 主题变化后需重读再重绘图表
  Object.assign(COLORS, {
    up: cssVar("--up"),
    down: cssVar("--down"),
    ma5: cssVar("--ma5"),
    ma20: cssVar("--ma20"),
    text: cssVar("--text"),
    muted: cssVar("--text-muted"),
    border: cssVar("--border"),
    panel: cssVar("--panel-raised"),
    accent: cssVar("--accent"),
    accent2: cssVar("--accent-2"),
  });
  renderThemeBtn();
  // 图表重绘全部由 qsChart 的 qs:theme 监听兜底; 这里只补非图表的 DOM 重渲染
  if (state.lastStatus) renderStatus(state.lastStatus);
  document.dispatchEvent(new CustomEvent("qs:theme"));
}

$("btn-theme").addEventListener("click", toggleTheme);

function renderSoundBtn() {
  const btn = $("btn-sound");
  // 扬声器图标换单色 SVG (ticket 25, emoji 功能图标禁令); 开=带声波, 关=斜杠静音
  const horn = 'M4 10v4h4l5 4V6l-5 4z';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px"><path d="' + horn + '"/>'
    + (SOUND ? '<path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 7a8 8 0 0 1 0 10"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>')
    + "</svg>";
  btn.title = t("sound.title");
  btn.setAttribute("aria-label", t("sound.title"));
}
$("btn-sound").addEventListener("click", () => {
  SOUND = !SOUND;
  try { localStorage.setItem("qs_sound", SOUND ? "on" : "off"); } catch (e) { /* ignore */ }
  renderSoundBtn();
  playSound("buy"); // 开启时给一声反馈
});
renderSoundBtn();
document.addEventListener("qs:lang", renderSoundBtn);

// 听盘开关已随听盘模式整体迁往 play.js (架构评审⑤: 它读写 SONIFY, 属对局层)
renderThemeBtn();

// ---------- 语言切换: 重渲染所有动态区域 ----------

document.addEventListener("qs:lang", () => {
  renderThemeBtn();
  renderSubtabs(VIEW_GROUP[currentView], currentView);
  if (state.klines.length) renderChart();
  renderStockLabel();
  renderAiLevelLabel();
  if (state.sessionId) updateDayLabel();
  if (state.lastStatus) renderStatus(state.lastStatus);
  syncTradeInputs();
  if (state.lastSettle) renderSettle(state.lastSettle);
  renderPfTabs();
  renderOrders();
  if (state.lastStatus) renderPositions(state.lastStatus.positions);
  updateStrategyUi();
  renderArenaStockOptions();
  renderIndustryOptions();
  refreshCondLabels();
  if (state.lastBt) renderBacktestResult(state.lastBt);
  renderLeaderboard();
  renderArenaBoard();
});

// ---------- 绑定 ----------

$("btn-start").addEventListener("click", () => guarded(() => startGame()));
// 熊市生存: 后端挑历史暴跌窗口, 目标是亏得比买入持有少
$("btn-survival").addEventListener("click", () => guarded(() => startGame({
  mode: "SURVIVAL", market: undefined, industry: undefined,
  advanced: false, realRules: false, // 表单残留的勾选会和"全市场随机"冲突, 生存模式一律素身开局
})));
// 盲盒开局: 市场/行业/AI 难度全随机, roguelike 手气局
$("btn-blindbox-start").addEventListener("click", () => guarded(async () => {
  const markets = ["", "STOCK", "US", "CRYPTO"];
  $("market-select").value = markets[Math.floor(Math.random() * markets.length)];
  $("market-select").dispatchEvent(new Event("change"));
  const ais = ["EASY", "NORMAL", "HARD", "HELL"];
  $("ai-level-select").value = ais[Math.floor(Math.random() * ais.length)];
  const inds = $("industry-select").options;
  $("industry-select").selectedIndex = Math.floor(Math.random() * inds.length);
  toast(t("blindstart.rolling"));
  await startGame();
}));
$("btn-order").addEventListener("click", () => guarded(placeOrder));
$("btn-challenge").addEventListener("click", () => guarded(startChallenge));
// 移动止损填「跟踪 %」而不是触发价, 两个输入框互换显示
$("order-type").addEventListener("change", () => {
  const trailing = $("order-type").value === "TRAIL_STOP";
  $("order-price").hidden = trailing;
  $("order-trail").hidden = !trailing;
});
// 勾选/取消「叠加上次曲线」立即重绘资金曲线
$("bt-compare").addEventListener("change", () => {
  if (state.lastBt) renderEquityChart(state.lastBt.equityCurve, prevBtRun);
});
$("market-select").addEventListener("change", () => {
  const m = $("market-select").value;
  const ok = m === "US" || m === "CRYPTO";
  $("adv-wrap").hidden = !ok;
  if (!ok) $("adv-toggle").checked = false;
  // 真实规则 (T+1/涨跌停) 只对 A股有意义
  const cn = m === "STOCK";
  $("real-wrap").hidden = !cn;
  if (!cn) $("real-toggle").checked = false;
  // 行业候选随市场联动 (切市场后不保留另一市场的行业选择)
  renderIndustryOptions();
});
// loadIndustries() 启动调用随对局业务在 play.js 执行 (架构评审⑤)
// 推进前先看明日快讯: 有事件先弹决策卡 (信息差 -> 决策时刻), 每个交易日只拦一次
let newsGateDay = -1;
async function tickWithNewsGate() {
  // 竞技模式 (每日挑战/房间) 后端不下发预告, 不必多打一次请求
  const blind = state.mode === "DAILY" || state.mode === "ROOM";
  if (!state.settled && !blind && newsGateDay !== state.daysElapsed) {
    try {
      const news = await api(`/game/${state.sessionId}/news/upcoming`);
      if (news && news.length) {
        newsGateDay = state.daysElapsed;
        openNewsGate(news);
        return;
      }
    } catch (e) { /* 预告接口失败不阻断推进 */ }
  }
  await tick();
}

function openNewsGate(news) {
  const item = news[0];
  $("newsgate-title").textContent = LANG === "en" ? item.titleEn : item.titleZh;
  $("newsgate-body").textContent = (LANG === "en" ? item.bodyEn : item.bodyZh) || "";
  $("newsgate-modal").hidden = false;
}

$("btn-newsgate-go").addEventListener("click", () => {
  $("newsgate-modal").hidden = true;
  guarded(tick);
});
$("btn-newsgate-hold").addEventListener("click", () => { $("newsgate-modal").hidden = true; });
$("btn-tick").addEventListener("click", () => guarded(tickWithNewsGate));
$("btn-buy").addEventListener("click", () => guarded(() => trade("BUY")));
$("btn-sell").addEventListener("click", () => guarded(() => trade("SELL")));
$("btn-settle").addEventListener("click", () => {
  if (confirm(t("confirm.settle"))) guarded(settle);
});
$("btn-review").addEventListener("click", () => askReview()); // 惰性引用: askReview 定义在后加载的 play.js
// ---------- 新手引导 (可随时重新打开) ----------

const tourTab = (g) => document.querySelector(`#nav-groups .nav-group[data-group="${g}"]`);
const TOUR_STEPS = [
  { key: "welcome" },
  { key: "start", view: "game", el: () => document.querySelector(".game-intro .start-box") },
  { key: "home", view: "home", el: () => tourTab("home") },
  { key: "play", view: "game", el: () => tourTab("play") },
  { key: "arenaG", view: "arena", el: () => tourTab("arenaG") },
  { key: "learn", view: "academy", el: () => tourTab("learn") },
  { key: "labG", view: "lab", el: () => tourTab("labG") },
  { key: "me", view: "profile", el: () => tourTab("me") },
  { key: "help", view: "game", el: () => $("btn-help") },
  { key: "end", view: "game", el: () => $("btn-tour") },
];

let tourStep = 0;
let tourReturnView = "game";
const tourActive = () => !$("tour-pop").hidden;

function positionTourPop(rect) {
  const pop = $("tour-pop");
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  if (!rect) {
    pop.style.left = Math.max(16, (window.innerWidth - pw) / 2) + "px";
    pop.style.top = Math.max(16, (window.innerHeight - ph) / 2) + "px";
    return;
  }
  let top = rect.bottom + 14;
  if (top + ph > window.innerHeight - 16) top = Math.max(16, rect.top - ph - 14);
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.min(Math.max(16, left), window.innerWidth - pw - 16);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function renderTourStep() {
  const step = TOUR_STEPS[tourStep];
  if (step.view) switchView(step.view);
  $("tour-pop-title").textContent = t(`tour.${step.key}.t`);
  $("tour-pop-text").textContent = t(`tour.${step.key}.d`);
  $("tour-step-label").textContent = t("tour.stepLabel", tourStep + 1, TOUR_STEPS.length);
  $("btn-tour-prev").disabled = tourStep === 0;
  $("btn-tour-next").textContent = t(tourStep === TOUR_STEPS.length - 1 ? "tour.done" : "tour.next");

  const ring = $("tour-ring");
  const el = step.el && step.el();
  if (el) {
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    const pad = 6;
    ring.classList.remove("bare");
    ring.style.left = (r.left - pad) + "px";
    ring.style.top = (r.top - pad) + "px";
    ring.style.width = (r.width + pad * 2) + "px";
    ring.style.height = (r.height + pad * 2) + "px";
    positionTourPop(ring.getBoundingClientRect());
  } else {
    // 无目标步骤: 光圈缩为不可见的点, 只保留全屏遮罩
    ring.classList.add("bare");
    ring.style.left = window.innerWidth / 2 + "px";
    ring.style.top = window.innerHeight / 2 + "px";
    ring.style.width = "0";
    ring.style.height = "0";
    positionTourPop(null);
  }
}

function startTour() {
  tourReturnView = VIEWS.find((v) => !$("view-" + v).hidden) || "game";
  tourStep = 0;
  $("tour-mask").hidden = false;
  $("tour-ring").hidden = false;
  $("tour-pop").hidden = false;
  renderTourStep();
}

function endTour() {
  $("tour-mask").hidden = true;
  $("tour-ring").hidden = true;
  $("tour-pop").hidden = true;
  try { localStorage.setItem("qs_tour_done", "1"); } catch (e) { /* 隐私模式下忽略 */ }
  switchView(tourReturnView);
}

function tourNext() {
  if (tourStep >= TOUR_STEPS.length - 1) endTour();
  else { tourStep++; renderTourStep(); }
}

$("btn-tour").addEventListener("click", startTour);
$("btn-tour-skip").addEventListener("click", endTour);
$("btn-tour-next").addEventListener("click", tourNext);
$("btn-tour-prev").addEventListener("click", () => {
  if (tourStep > 0) { tourStep--; renderTourStep(); }
});
$("tour-mask").addEventListener("click", tourNext);
window.addEventListener("resize", () => {
  if (tourActive()) renderTourStep();
});
document.addEventListener("qs:lang", () => {
  if (tourActive()) renderTourStep();
});

// 首访引导: 过门禁 (登录或游客试玩) 后才弹, 新手引导优先于玩法说明
let onboarded = false;
window.qsMaybeOnboard = () => {
  if (onboarded) return;
  onboarded = true;
  try {
    if (!localStorage.getItem("qs_tour_done")) startTour();
    else if (!localStorage.getItem("qs_help_seen")) openHelp();
  } catch (e) { /* 隐私模式下忽略 */ }
};

// 排行榜加载/渲染 (共享层: ranking.js 复用, 启动即调) —— ⑤拆分时曾误入 play.js, 回迁
async function loadLeaderboard() {
  try {
    const params = new URLSearchParams();
    if (window.qsSeason) params.set("season", window.qsSeason);
    if (window.qsRankSort) params.set("sort", window.qsRankSort);
    const q = params.toString();
    state.lbRows = await api("/leaderboard" + (q ? "?" + q : ""));
    renderLeaderboard();
  } catch (e) {
    /* 排行榜加载失败不打断游戏 */
  }
}

function renderLeaderboard() {
  const rows = state.lbRows;
  if (!rows) return;
  qsRenderRows($("leaderboard").querySelector("tbody"), rows, 6, "lb.empty", (r, i) => {
    const tr = document.createElement("tr");
    const rate = Number(r.returnRate);
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td></td>
      <td></td>
      <td>${r.startDate}</td>
      <td class="${rate >= 0 ? "pos" : "neg"}">${fmtPct(rate)}</td>
      <td>${r.sharpe == null ? "--" : Number(r.sharpe).toFixed(2)}</td>`;
    tr.children[1].textContent = r.username;
    tr.children[2].textContent = stockName(r.stockName, r.stockCode);
    return tr;
  });
}

loadLeaderboard();

