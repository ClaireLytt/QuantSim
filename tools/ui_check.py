"""QuantSim 前端 UI 静态体检: 专抓"按钮点了没反应"这类低级但致命的 bug。

用法: python tools/ui_check.py   (仓库根目录或任意位置均可)
退出码: 0 = 干净; 1 = 有 ERROR 级问题 (WARN 不影响退出码)。

检查项:
  E1 重复 id            —— 同一 id 出现多次, getElementById 只命中第一个, 后面的按钮全部失灵
  E2 JS 引用缺失的 id   —— $("x")/getElementById("x") 在 HTML 与 JS 动态赋值里都找不到
  E3 死按钮             —— HTML 里的 <button id=...> 没有任何 JS 文件提到这个 id (没绑事件)
  E4 i18n 中文缺键      —— data-i18n* / t("key") 用到的键在 zh 字典里不存在 (界面显示裸 key)
  E5 半死按钮           —— id 有引用 (改文案/disabled) 但找不到 addEventListener/onclick 绑定
  E6 i18n 键重复定义    —— 同一语言字典里键定义两次, 后者悄悄覆盖前者
  E7 正文对比度不足     —— 两主题下 text/底色 等关键配对低于 WCAG 3:1
  W1 i18n 英文缺键      —— 键在 zh 有、en 没有 (英文界面回退中文, 违反双语规范)
  W2 无 id 的静态按钮   —— 无法被 JS 选中绑事件 (模板内动态生成的不算)
  W3 脚本版本号未更新   —— js/css 文件比 index.html 里它的 ?v= 版本新 (缓存不刷新, 按钮修了等于没修)
  W5 死键               —— zh 字典里定义了但全站没有任何地方使用 (只报总数和示例)
  W7 硬编码中文         —— index.html 的中文文本不带 data-i18n 且不在 data-lang-block 区内 (英文界面不会翻译)
  W8 次级对比度偏低     —— 对比度在 3:1 ~ 4.5:1 之间 (大字号/语义色可接受, 正文建议修)

已知动态模式白名单 (事件委托/运行时创建), 避免误报, 见 DYNAMIC_KEY_PREFIXES / DELEGATED_OK。
"""
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")
INDEX = os.path.join(FRONTEND, "index.html")
I18N = os.path.join(FRONTEND, "i18n.js")

# t("strat." + x) 这类动态拼接键的合法前缀: 只要 zh 字典里存在该前缀的键即认为覆盖
DYNAMIC_KEY_PREFIXES = ("strat.", "room.status.", "me.mode.", "orders.",
                        "ailevel.", "nav.", "style.", "ai.persona.", "settle.taunt.")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def js_files():
    return sorted(
        os.path.join(FRONTEND, f) for f in os.listdir(FRONTEND) if f.endswith(".js")
    )


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def main():
    # Windows 控制台默认 GBK, 强制 UTF-8 防乱码
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    errors, warns = [], []
    html = read(INDEX)
    sources = {os.path.basename(p): read(p) for p in js_files()}
    all_js = "\n".join(sources.values())

    # ---------- 收集 id ----------
    html_ids = {}
    for m in re.finditer(r'\bid="([^"]+)"', html):
        html_ids.setdefault(m.group(1), []).append(line_of(html, m.start()))

    # E1 重复 id
    for i, lines in sorted(html_ids.items()):
        if len(lines) > 1:
            errors.append(f'E1 重复 id "{i}" @ index.html:{lines}')

    # JS 运行时赋的 id (el.id = "x" / id="x" 字面量模板)
    js_assigned_ids = set(re.findall(r'\.id\s*=\s*"([^"]+)"', all_js))
    js_assigned_ids |= set(re.findall(r'id="([a-zA-Z][\w-]*)"', all_js))
    known_ids = set(html_ids) | js_assigned_ids

    # E2 JS 引用缺失的 id
    for name, src in sources.items():
        for m in re.finditer(r'(?:\$\(|getElementById\()\s*"([^"]+)"\s*\)', src):
            ref = m.group(1)
            if ref not in known_ids:
                errors.append(f'E2 引用了不存在的 id "{ref}" @ {name}:{line_of(src, m.start())}')

    # 按 class 选择器/事件委托绑定的按钮不算死按钮: 收集 JS 里出现过的 ".cls" 选择器
    js_class_selectors = set(re.findall(r'["\'`][^"\'`]*\.([a-zA-Z][\w-]*)', all_js))

    # E3/W2 按钮体检: 静态 <button> 必须有 id (或被 class 选择器接管) 且被某个 JS 提到
    for m in re.finditer(r"<button\b[^>]*>", html):
        tag = m.group(0)
        line = line_of(html, m.start())
        idm = re.search(r'\bid="([^"]+)"', tag)
        if not idm:
            cls = re.search(r'\bclass="([^"]+)"', tag)
            classes = set(cls.group(1).split()) if cls else set()
            if "onclick" not in tag and not (classes & js_class_selectors):
                warns.append(f"W2 静态按钮无 id 无 onclick 且 class 未被 JS 选中 @ index.html:{line} -> {tag[:60]}")
            continue
        bid = idm.group(1)
        if f'"{bid}"' not in all_js:
            errors.append(f'E3 死按钮: id "{bid}" 在所有 JS 中零引用 (没绑事件) @ index.html:{line}')
            continue
        # W4 半死按钮: id 有引用 (比如只改文案/disabled) 但找不到事件绑定。
        # 绑定证据: 直接链式 $("id").addEventListener/.onclick, 或赋给变量后 var.addEventListener
        esc = re.escape(bid)
        bound = re.search(
            r'(?:\$\(|getElementById\()\s*"' + esc + r'"\s*\)\s*(?:\.addEventListener\s*\(|\.onclick\s*=)',
            all_js) is not None
        if not bound:
            for vm2 in re.finditer(
                    r'(?:const|let|var)\s+(\w+)\s*=\s*(?:\$\(|document\.getElementById\()\s*"' + esc + r'"\s*\)',
                    all_js):
                if re.search(r'\b' + re.escape(vm2.group(1)) + r'\s*\.\s*(?:addEventListener\s*\(|onclick\s*=)',
                             all_js):
                    bound = True
                    break
        if not bound:
            cls2 = re.search(r'\bclass="([^"]+)"', tag)
            classes2 = set(cls2.group(1).split()) if cls2 else set()
            if not (classes2 & js_class_selectors):
                errors.append(f'E5 半死按钮: id "{bid}" 有引用但未发现事件绑定 @ index.html:{line}')

    # ---------- i18n ----------
    i18n_src = sources.get("i18n.js", "")
    zh_keys, en_keys = set(), set()
    section = None
    section_name = ""
    for ln, line in enumerate(i18n_src.splitlines(), 1):
        if re.match(r"\s*zh:\s*{", line):
            section, section_name = zh_keys, "zh"
        elif re.match(r"\s*en:\s*{", line):
            section, section_name = en_keys, "en"
        elif re.match(r"\s*},?\s*$", line) and section is not None:
            # 只在遇到语言块结束时退出该 section; 嵌套结构 i18n.js 没有, 够用
            if section is en_keys or section is zh_keys:
                section = None
        km = re.match(r'\s*"([^"]+)":', line)
        if km and section is not None:
            # E6 同一字典键重复定义: JS 对象字面量后者覆盖前者, 极难察觉
            if km.group(1) in section:
                errors.append(f'E6 i18n 键 "{km.group(1)}" 在 {section_name} 字典重复定义 @ i18n.js:{ln}')
            section.add(km.group(1))

    used_keys = {}  # key -> "file:line"
    # data-i18n / -placeholder / -title / -attr 四种挂载方式都要收集
    for m in re.finditer(r'data-i18n(?:-placeholder|-title|-attr)?="([^"]+)"', html):
        used_keys.setdefault(m.group(1), f"index.html:{line_of(html, m.start())}")
    for name, src in sources.items():
        # i18n.js 自己也会调 t() (如 applyI18n 里的 app.title), 不能跳过
        for m in re.finditer(r'\bt\(\s*"([^"]+)"', src):
            used_keys.setdefault(m.group(1), f"{name}:{line_of(src, m.start())}")

    # 动态拼接键前缀自动采集: t("x." + var) 与 t(`x.${var}`) 两种写法, 再并上手工白名单
    dyn_prefixes = set(DYNAMIC_KEY_PREFIXES)
    dyn_prefixes |= set(re.findall(r't\(\s*"([\w.]+\.)"\s*\+', all_js))
    dyn_prefixes |= set(re.findall(r't\(\s*`([\w.]+\.)\$\{', all_js))

    for key, where in sorted(used_keys.items()):
        if key in zh_keys:
            if key not in en_keys:
                warns.append(f'W1 i18n 键 "{key}" 缺英文 (回退中文) 首次使用 @ {where}')
            continue
        # 动态拼接键会被抓成前缀串, 若属动态前缀且 zh 有同前缀键则放过
        if any(key.startswith(p) or (p.startswith(key) and any(k.startswith(p) for k in zh_keys))
               for p in dyn_prefixes):
            continue
        errors.append(f'E4 i18n 键 "{key}" 在 zh 字典缺失 (界面会显示裸 key) @ {where}')

    # ---------- W5 死键: 定义了但没人用 ----------
    # 使用判定取最宽口径, 覆盖 t(a ? "k1" : "k2") / {key:"..."} 配置表 / 前缀传参等写法:
    # 键名字符串只要出现在任何非 i18n.js 的代码里就算在用; 前缀命中动态拼接也算在用。
    # 子串判定最朴素但最抗各种引号嵌套: 键名出现在任何非 i18n.js 的 JS 源码里即算在用
    js_no_dict = "\n".join(src for name, src in sources.items() if name != "i18n.js")
    prefix_literals = set(re.findall(r'"([\w.]+\.)"', js_no_dict))
    w5_prefixes = dyn_prefixes | prefix_literals
    dynamic_used = {k for k in zh_keys if any(k.startswith(p) for p in w5_prefixes)}
    dead = sorted(k for k in zh_keys - set(used_keys) - dynamic_used
                  if k not in js_no_dict)
    if dead:
        warns.append(f"W5 {len(dead)} 个 zh 键无任何使用处, 如: {', '.join(dead[:8])}")

    # ---------- W7 硬编码中文: 不带 data-i18n 且不在 data-lang-block 区内 ----------
    # data-lang-block="zh" 到下一个 data-lang-block="en" 之间是整块切换的双语区, 豁免
    html_lines = html.splitlines()
    block_marks = [(i + 1, 'zh' if 'data-lang-block="zh"' in l else 'en')
                   for i, l in enumerate(html_lines) if "data-lang-block=" in l]
    exempt = set()
    for (start, kind), (end, _) in zip(block_marks, block_marks[1:] + [(len(html_lines) + 1, "")]):
        if kind == "zh":
            exempt.update(range(start, end))
    W7_SKIP = ("<!--", "<title>", "btn-lang")  # 注释/JS 设置的页题/双语按钮
    for i, l in enumerate(html_lines, 1):
        if i in exempt or "data-i18n" in l or any(skip in l for skip in W7_SKIP):
            continue
        if not re.search(r"[一-鿿]", l):
            continue
        # 元素若被 JS 写 textContent/innerHTML, HTML 里的中文只是占位默认值, 不算硬编码
        idm = re.search(r'\bid="([^"]+)"', l)
        if idm and re.search(
                r'\$\("' + re.escape(idm.group(1)) + r'"\)[^;\n]*\.(?:textContent|innerHTML)\s*=',
                all_js):
            continue
        warns.append(f"W7 硬编码中文 (英文界面不翻译) @ index.html:{i} -> {l.strip()[:50]}")

    # ---------- E7/W8 主题对比度审核 (WCAG) ----------
    def luminance(hexcolor):
        rgb = [int(hexcolor[j:j + 2], 16) / 255 for j in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

    def contrast(fg, bg):
        la, lb = luminance(fg), luminance(bg)
        hi, lo = max(la, lb), min(la, lb)
        return (hi + 0.05) / (lo + 0.05)

    css = read(os.path.join(FRONTEND, "style.css"))
    themes = {}
    for tname, pat in (("dark", r":root\s*{([^}]*)}"),
                       ("light", r':root\[data-theme="light"\]\s*{([^}]*)}')):
        m = re.search(pat, css)
        if m:
            themes[tname] = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", m.group(1)))
    # (前景, 背景, 最低要求): 正文 4.5, 大字号/语义色 3.0
    PAIRS = [
        ("text", "surface", 4.5), ("text", "panel", 4.5), ("text", "surface-2", 4.5),
        ("text", "panel-raised", 4.5), ("text-muted", "panel", 4.5), ("text-muted", "surface", 4.5),
        ("on-accent", "accent", 4.5), ("on-accent", "accent-strong", 4.5),
        ("up", "panel", 3.0), ("down", "panel", 3.0), ("good", "panel", 3.0),
        ("bad", "panel", 3.0), ("warn", "panel", 3.0), ("accent", "surface", 3.0),
    ]
    for tname, vars_ in themes.items():
        for fg, bg, need in PAIRS:
            if fg not in vars_ or bg not in vars_:
                continue
            ratio = contrast(vars_[fg], vars_[bg])
            if ratio < 3.0:
                errors.append(f"E7 [{tname}] --{fg} 在 --{bg} 上对比度 {ratio:.2f}:1 (< 3:1, 难以辨认)")
            elif ratio < need:
                warns.append(f"W8 [{tname}] --{fg} 在 --{bg} 上对比度 {ratio:.2f}:1 (建议 ≥ {need}:1)")

    # ---------- W3 版本号 ----------
    for m in re.finditer(r'(?:src|href)="([\w./]+\.(?:js|css))\?v=([\w]+)"', html):
        fname, ver = m.group(1), m.group(2)
        path = os.path.join(FRONTEND, fname)
        if not os.path.exists(path):
            continue
        # 只对 git 认为有改动的文件报警, 避免 "touch 过但内容没变" 的误报;
        # git 不可用时退回 mtime 判断
        try:
            import subprocess
            changed = subprocess.run(
                ["git", "diff", "--quiet", "HEAD", "--", "frontend/" + fname],
                cwd=ROOT, capture_output=True,
            ).returncode != 0
        except Exception:
            changed = True
        if not changed:
            continue
        mtime = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d")
        # 版本号约定以日期开头 (如 20261001a); 文件修改日期晚于版本日期 => 忘 bump
        vm = re.match(r"(\d{8})", ver)
        if vm and mtime > vm.group(1):
            warns.append(f"W3 {fname} 改于 {mtime}, 但 index.html 版本号还是 ?v={ver} (缓存不会刷新)")

    # ---------- 输出 ----------
    for e in errors:
        print("[ERROR]", e)
    for w in warns:
        print("[WARN] ", w)
    print(f"\nui_check: {len(errors)} error(s), {len(warns)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
