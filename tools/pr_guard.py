# -*- coding: utf-8 -*-
"""PR 历史踩坑扫描器: 变更代码一旦出现 docs/bug-knowledge-base.md 里的高危写法就告警。

与 ui_check.py 互补 —— 那个查前端静态问题, 这个查"根因级反面模式"(事务/分页/并发/空值/
状态判断), 覆盖本项目 2026-10 踩过的 7 类坑。启发式匹配, 有误报, 所以**默认只告警不阻断**;
确信要卡 CI 时加 --strict (只对高置信规则返回非 0)。

用法:
    python tools/pr_guard.py                 # 扫 git 变更文件 (对比 origin/main, 退回 main)
    python tools/pr_guard.py --all           # 扫全仓 (首次接入/定期体检)
    python tools/pr_guard.py --base <ref>     # 指定对比基线
    python tools/pr_guard.py --strict         # 高置信规则命中则 exit 1 (CI 卡口)

每条告警给出: 文件:行 / 规则 / 风险解释 / 修改示例。规则定义集中在 RULES, 新增历史坑在那里加。
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 不扫描的文件 (文案库/测试/文档/本扫描器自身): 它们合法地包含"反面写法"
SKIP_SUBSTR = (
    "frontend/i18n.js",          # 全是中文文案, 规则 4 必误报
    "src/test/",                 # 测试合法断言中文错误消息
    "docs/bug-knowledge-base.md",
    "tools/pr_guard.py",
    "CLAUDE.md",
)

CJK = r"[一-鿿]"


def has_cjk(s):
    return re.search(CJK, s) is not None


# 每条规则: id, 标题, 适用后缀, confidence(high/medium), 检测函数(lines)->[(lineno, 证据)], 风险, 修改示例
def _scan_simple(pattern, flags=0):
    """逐行正则, 返回命中行。"""
    rx = re.compile(pattern, flags)
    def fn(lines):
        return [(i + 1, ln.strip()) for i, ln in enumerate(lines) if rx.search(ln)]
    return fn


def _scan_paginate_then_filter(lines):
    """分页调用后在 stream 上 .filter(): PageRequest/Pageable 与 .filter( 相隔 <=6 行且中间有 .stream()。"""
    hits = []
    for i, ln in enumerate(lines):
        if "PageRequest.of(" in ln or "Pageable" in ln and "(" in ln:
            window = "".join(lines[i:i + 7])
            if ".stream()" in window and ".filter(" in window:
                # 粗判: filter 作用在分页结果上 (分页在前, filter 在后)
                hits.append((i + 1, ln.strip()))
    return hits


def _scan_loop_settle(lines):
    """循环体内调用 *.settle( 但不是 settleIsolated: 子结算可能污染父事务。"""
    hits = []
    in_loop_depth = None
    brace = 0
    loop_brace = None
    for i, ln in enumerate(lines):
        if re.search(r"\b(for|while)\b.*\{", ln) or re.search(r"\.forEach\(", ln):
            loop_brace = brace
        brace += ln.count("{") - ln.count("}")
        if loop_brace is not None:
            if re.search(r"\.settle\s*\(", ln) and "settleIsolated" not in ln and "requireInProgress" not in ln:
                hits.append((i + 1, ln.strip()))
            if brace <= loop_brace:
                loop_brace = None
    return hits


def _scan_divide_no_guard(lines):
    """两类高信号: (a) divide 全行无 RoundingMode/scale (无限小数必抛); (b) 除数是裸 close/price
    行情变量且 12 行窗口内无 signum 守卫。刻意放过 BigDecimal.valueOf(shares/size)——那类几乎不会为 0。"""
    hits = []
    for i, ln in enumerate(lines):
        if ".divide" not in ln:
            continue
        # (a) 无 scale: divide 行里既没有 RoundingMode 也没有 ", 数字" 的 scale 参数
        if ".divide(" in ln and "RoundingMode" not in ln and not re.search(r"\.divide[^)]*,\s*\d", ln):
            hits.append((i + 1, ln.strip()))
            continue
        # (b) 除数是裸行情变量 close / price (非 tx.getPrice() 调用、非 BigDecimal.valueOf 包装);
        # signum 守卫常在方法顶部早返, 所以向上扫到所属方法声明为止, 而非固定窗口
        if re.search(r"\.divide(?:ToIntegralValue)?\s*\(\s*(close|price)\s*[,)]", ln):
            start = i
            while start > 0 and not re.search(r"\b(private|public|protected|static)\b.*\(.*\{?\s*$", lines[start]):
                start -= 1
            ctx = "".join(lines[start:i + 2])
            if "signum(" not in ctx:
                hits.append((i + 1, ln.strip()))
    return hits


# 已知可空的后端数值字段 (旧记录/边界下为 null): 只有渲染这些才是真风险, 其余字段 (balance/
# returnRate) 在对应响应里恒有值。新增可空字段在这里登记。
NULLABLE_FIELDS = ("maxDrawdown", "sharpe", "sharpeRatio", "finalSharpe", "annualReturn",
                   "winRate", "sortino", "inSampleReturn", "outSampleReturn", "plRatio")


def _scan_null_render(lines):
    """只盯把'已知可空字段'直接喂给不做 null 兜底的格式化器 (Number/fmtPct/pctText) 后渲染的情形。
    包在自定义 helper (如本地 pct/num, 多半自己判空) 里的不算, 避免对恒有值字段与已兜底写法误报。"""
    hits = []
    fieldrx = r"[A-Za-z_]\w*\.\s*(?:" + "|".join(NULLABLE_FIELDS) + r")\b"
    # 字段直接作为 Number(/fmtPct(/pctText( 的实参
    rx = re.compile(r"\.(textContent|innerHTML)\s*=.*(?:Number|fmtPct|pctText)\(\s*" + fieldrx)
    for i, ln in enumerate(lines):
        if not rx.search(ln):
            continue
        if re.search(r"==\s*null|\?\?|\|\|\s*[\"']|--[\"']|ddText|isNull", ln):
            continue  # 本行已兜底
        if re.search(r"==\s*null", "".join(lines[max(0, i - 5):i])):
            continue  # 上方 5 行有 null 守卫 (常见的 if(x==null){--}else{render} 形态)
        hits.append((i + 1, ln.strip()))
    return hits


RULES = [
    {
        "id": "R1-paginate-then-filter",
        "title": "分页后再内存过滤 → TOP 榜单数据不准",
        "exts": (".java",),
        "confidence": "medium",
        "scan": _scan_paginate_then_filter,
        "risk": "过滤发生在 LIMIT N 之后: 先取满 N 条再剔除, 剔掉几条榜单就少几条, 真实数据被挤出。",
        "fix": "过滤条件下沉进 JPQL WHERE, 分页之前:\n"
               "  @Query(\"... where ... and u.username not like 'smoke\\\\_%' escape '\\\\' order by ...\")\n"
               "  // 而不是 repo.findTopN(PageRequest).stream().filter(...)",
    },
    {
        "id": "R2-username-identity",
        "title": "前端用 username 做身份比对 → 脱敏后失效",
        "exts": (".js",),
        "confidence": "high",
        "scan": _scan_simple(r"(Auth\.user\.username\s*===|===\s*\w+\.username|\.username\s*===)"),
        "risk": "榜单 username 可能被后端脱敏 (邮箱 -> cl***@x), 按名字认'自己'永远不相等, 高亮/徽章静默失效。",
        "fix": "身份判断用后端 DTO 的布尔标记:\n"
               "  后端: new XxxEntry(..., s.getUserId() != null && s.getUserId().equals(authUserId))\n"
               "  前端: rows.find(r => r.isSelf)   // 不要 r.username === Auth.user.username",
    },
    {
        "id": "R3-loop-shared-tx-settle",
        "title": "循环内结算共用父事务 → 子步骤异常污染整个事务",
        "exts": (".java",),
        "confidence": "medium",
        "scan": _scan_loop_settle,
        "risk": "子结算抛异常会把父物理事务标记 rollback-only, catch 住也救不回, 提交时 UnexpectedRollbackException 整体 500。",
        "fix": "批量成员结算: 子操作走独立事务:\n"
               "  @Transactional(propagation = Propagation.REQUIRES_NEW)\n"
               "  public ... settleIsolated(...) { ... }\n"
               "  // 父循环 catch 后继续, 单成员失败只回滚自己",
    },
    {
        "id": "R4-error-text-branch",
        "title": "错误分支依赖中文文案 → 文案一改逻辑就错",
        "exts": (".js", ".java"),
        "confidence": "high",
        "scan": lambda lines: [
            (i + 1, ln.strip()) for i, ln in enumerate(lines)
            if re.search(r"\.(message|getMessage\(\))\s*\)?\.(includes|contains|equals|indexOf)\s*\(", ln)
            and has_cjk(ln)
        ],
        "risk": "用错误消息子串做分支: 后端改文案 / 网关返回英文或 HTML 时逻辑失效。",
        "fix": "按 HTTP status 或业务 code 判断:\n"
               "  前端: if (e.status !== 401) toast(e.message);   // api() 已把 status 挂到 err\n"
               "  后端: 用异常类型 (NotFoundException / BusinessException) 区分, 不比对文案",
    },
    {
        "id": "R5-state-persist-on-finish",
        "title": "状态结束时才落库 → 可被刷新/跨零点绕过",
        "exts": (".js", ".java"),
        "confidence": "medium",
        "scan": lambda lines: [
            (i + 1, ln.strip()) for i, ln in enumerate(lines)
            if re.search(r"(date|played|done|flag)\s*[:=].*todayStr\(\)|setItem\([^)]*todayStr\(\)", ln)
            and re.search(r"finish|end|settle|complete|结束|完成", "".join(lines[max(0, i - 25):i + 1]))
        ],
        "risk": "'每日/每局一次'标记在动作结束时才写: 跨零点记到第二天吞名额, 或中途刷新无限重开。",
        "fix": "标记在动作开局/触发时就落 (占位), 结束只更新结果:\n"
               "  function start() { prog.daily = { date: today, score: 0, best: ... }; save(); ... }\n"
               "  function finish() { prog.daily.score = ...; save(); }  // date 不再重写",
    },
    {
        "id": "R6-divide-no-zero-guard",
        "title": "除法缺除零保护 → 脏行情炸 ArithmeticException",
        "exts": (".java",),
        "confidence": "medium",
        "scan": _scan_divide_no_guard,
        "risk": "divide 无 scale 遇无限小数抛异常; 除数为数据字段 (price/close/total) 且未判 signum 时, 零价行情 500。",
        "fix": "divide 必带 scale+RoundingMode; 除数来自数据的先判 signum:\n"
               "  if (price.signum() <= 0) return 0;\n"
               "  x.divide(price, 2, RoundingMode.HALF_UP);",
    },
    {
        "id": "R7-null-render-no-fallback",
        "title": "空值直接渲染 → 显示 +0.0% / NaN%",
        "exts": (".js",),
        "confidence": "medium",
        "scan": _scan_null_render,
        "risk": "Number(null)=0、Number(undefined)=NaN 渗进展示: 旧记录的 null 字段显示成 +0.0% 或 NaN%。",
        "fix": "数值字段渲染先判空:\n"
               "  el.textContent = v == null ? \"--\" : pctText(v);",
    },
]


def changed_files(base):
    """git 变更文件 (base...HEAD + 工作区未提交)。base 不存在时返回 None (交给 --all)。"""
    def run(args):
        try:
            out = subprocess.run(["git"] + args, cwd=ROOT, capture_output=True, text=True, timeout=20)
            return out.stdout.splitlines() if out.returncode == 0 else None
        except Exception:
            return None
    # 校验 base 存在
    if run(["rev-parse", "--verify", base]) is None:
        return None
    files = set()
    for diff_base in ([base + "...HEAD"], ["HEAD"]):
        r = run(["diff", "--name-only"] + diff_base)
        if r:
            files.update(r)
    r = run(["diff", "--name-only"])  # 未暂存
    if r:
        files.update(r)
    r = run(["diff", "--name-only", "--cached"])  # 已暂存未提交
    if r:
        files.update(r)
    return sorted(f for f in files if f)


def all_source_files():
    out = []
    for base in ("frontend", "backend/src/main"):
        for dp, _, fns in os.walk(os.path.join(ROOT, base)):
            for fn in fns:
                if fn.endswith((".js", ".java")):
                    out.append(os.path.relpath(os.path.join(dp, fn), ROOT).replace("\\", "/"))
    return out


def main():
    args = sys.argv[1:]
    scan_all = "--all" in args
    strict = "--strict" in args
    base = "origin/main"
    if "--base" in args:
        base = args[args.index("--base") + 1]

    if scan_all:
        files = all_source_files()
        scope = "全仓"
    else:
        files = changed_files(base)
        if files is None:
            files = changed_files("main")
        if files is None:
            print("pr_guard: 无法确定 git 变更 (base 不存在?), 退回 --all 全仓扫描\n")
            files = all_source_files()
            scope = "全仓(退化)"
        else:
            scope = f"变更文件 (base={base})"

    findings = []
    for rel in files:
        if any(s in rel.replace("\\", "/") for s in SKIP_SUBSTR):
            continue
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            continue
        try:
            lines = open(path, encoding="utf-8").read().splitlines()
        except Exception:
            continue
        for rule in RULES:
            if not rel.endswith(rule["exts"]):
                continue
            for lineno, evidence in rule["scan"](lines):
                findings.append((rule, rel, lineno, evidence))

    print(f"pr_guard: 扫描 {scope}, {len(files)} 个文件\n")
    if not findings:
        print("✅ 未发现历史踩坑模式")
        return 0

    # 按规则分组输出
    by_rule = {}
    for rule, rel, lineno, ev in findings:
        by_rule.setdefault(rule["id"], (rule, []))[1].append((rel, lineno, ev))
    high_hit = False
    for rid, (rule, hits) in by_rule.items():
        mark = "⛔" if rule["confidence"] == "high" else "⚠️"
        if rule["confidence"] == "high":
            high_hit = True
        print(f"{mark} [{rid}] {rule['title']}  ({rule['confidence']}, {len(hits)} 处)")
        print(f"    风险: {rule['risk']}")
        for rel, lineno, ev in hits[:10]:
            print(f"    → {rel}:{lineno}  {ev[:100]}")
        if len(hits) > 10:
            print(f"    … 另有 {len(hits) - 10} 处")
        print("    修改示例:")
        for fl in rule["fix"].split("\n"):
            print(f"      {fl}")
        print()

    print(f"═══ 命中 {len(findings)} 处 / {len(by_rule)} 条规则 ═══")
    print("说明: 启发式匹配有误报, 请人工确认; 确为历史坑则按修改示例改, 确为误报可在 pr_guard.py 的 SKIP 或规则里收窄。")
    if strict and high_hit:
        print("\n--strict: 存在 high 置信规则命中, 返回非 0")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
