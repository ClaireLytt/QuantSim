"""前端资源缓存指纹自动化 (架构评审④): 人不再手动 bump ?v=。

为什么: 无构建架构靠 ?v= 手动失效缓存, index.html 因此成为全仓第一热点文件
(近 40 次提交改了 23 次, 大半是机械 bump), 忘 bump 还要靠 W3 事后报警。
本脚本把 "改了资源 → 失效缓存" 变成机制: 对 index.html / landing.html 里每个
src|href="X?v=Y" 的本地资源, 以内容 md5 前 4 位为指纹——指纹没变不动 (幂等,
日期不漂移), 变了写成 "今日日期+指纹" (保持 W3 的 8 位日期开头约定)。

跑法: python tools/bump_assets.py   (PostToolUse hook 在前端文件写入后自动跑;
      ui_check 的 W3 保留为兜底)
退出码: 0 = 无需改动或已写回; 配 --check 时有未 bump 项退 1 (CI 可卡)。
"""
import hashlib
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")
PAGES = ["index.html", "landing.html"]
REF = re.compile(r'((?:src|href)=")([\w./]+\.(?:js|css))\?v=(\w+)(")')


def fingerprint(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:4]


def main() -> int:
    check_only = "--check" in sys.argv
    today = date.today().strftime("%Y%m%d")
    stale = 0
    for page in PAGES:
        ppath = os.path.join(FRONTEND, page)
        if not os.path.exists(ppath):
            continue
        with open(ppath, encoding="utf-8") as f:
            html = f.read()

        def sub(m: re.Match) -> str:
            nonlocal stale
            fname, ver = m.group(2), m.group(3)
            apath = os.path.join(FRONTEND, fname)
            if not os.path.exists(apath):
                return m.group(0)
            fp = fingerprint(apath)
            if ver.endswith(fp):  # 指纹未变: 不动, 日期不漂移 (幂等)
                return m.group(0)
            stale += 1
            return f"{m.group(1)}{fname}?v={today}{fp}{m.group(4)}"

        new = REF.sub(sub, html)
        if new != html and not check_only:
            with open(ppath, "w", encoding="utf-8", newline="") as f:
                f.write(new)
            print(f"bump_assets: {page} 更新了 ?v= 指纹")
    if check_only and stale:
        print(f"bump_assets: {stale} 处资源内容已变但 ?v= 未更新", file=sys.stderr)
        return 1
    if not stale:
        print("bump_assets: 全部指纹已是最新")
    return 0


if __name__ == "__main__":
    sys.exit(main())
