#!/usr/bin/env python3
"""变更行覆盖率门禁: 交叉 JaCoCo 报告与 git diff, 只看本次改动触碰的可执行行。

为什么只看变更行: 项目整体覆盖率是继承来的数字, agent 推不动; 变更行覆盖率
是它自己能负责的数字 (CONSTRAINTS.md 的口径)。不重跑测试——直接读 mvn test
已产出的 jacoco.xml, 跑两遍测试只为拿数字是让人弃用门禁的最快方式。

跑法 (先 cd backend && mvn -B test 产出报告):
    python tools/coverage_guard.py [--base origin/main] [--min 80] [--strict]
退出码: 默认只警告 (观察期, 见 CONSTRAINTS.md), --strict 时低于阈值退 1;
jacoco.xml 缺失退 2 (guard 跑不起来不得当通过)。
"""
import argparse
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JACOCO = ROOT / "backend/target/site/jacoco/jacoco.xml"
SRC_PREFIX = "backend/src/main/java/"


def changed_lines(base: str) -> dict[str, set[int]]:
    """返回 {java源文件相对路径: 新增/修改的行号集合}。"""
    mb = subprocess.run(["git", "merge-base", base, "HEAD"], capture_output=True,
                        text=True, cwd=ROOT)
    if mb.returncode != 0:
        print(f"coverage-guard: no merge base against {base}", file=sys.stderr)
        sys.exit(2)
    diff = subprocess.run(
        ["git", "diff", "--unified=0", mb.stdout.strip(), "--", f"{SRC_PREFIX}**/*.java"],
        capture_output=True, text=True, cwd=ROOT).stdout
    out: dict[str, set[int]] = {}
    cur = None
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            cur = line[6:]
        elif line.startswith("@@") and cur:
            # @@ -a,b +c,d @@ -> 新文件起始行 c, 行数 d (省略时 1)
            plus = line.split("+")[1].split(" ")[0]
            start, _, cnt = plus.partition(",")
            n = int(cnt) if cnt else 1
            out.setdefault(cur, set()).update(range(int(start), int(start) + n))
    return out


def jacoco_lines() -> dict[str, dict[int, bool]]:
    """返回 {java源文件相对路径: {行号: 是否被覆盖}} (只含可执行行)。"""
    if not JACOCO.exists():
        print(f"coverage-guard: {JACOCO} not found, run `cd backend && mvn -B test` first",
              file=sys.stderr)
        sys.exit(2)
    cov: dict[str, dict[int, bool]] = {}
    for pkg in ET.parse(JACOCO).getroot().iter("package"):
        for sf in pkg.iter("sourcefile"):
            path = f"{SRC_PREFIX}{pkg.get('name')}/{sf.get('name')}"
            cov[path] = {int(l.get("nr")): int(l.get("ci")) > 0 for l in sf.iter("line")}
    return cov


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--min", type=float, default=80.0)
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    changed, cov = changed_lines(args.base), jacoco_lines()
    total = covered = 0
    misses: list[str] = []
    for f, lines in changed.items():
        file_cov = cov.get(f)
        if file_cov is None:
            continue  # 报告里没有 = 无可执行行 (纯注释/接口) 或未编译, 不计
        for n in sorted(lines):
            if n in file_cov:  # 只计可执行行, 跳过空行/注释/声明
                total += 1
                if file_cov[n]:
                    covered += 1
                else:
                    misses.append(f"{f}:{n}")

    if total == 0:
        print("coverage-guard: no executable changed lines, nothing to check")
        return
    pct = covered / total * 100
    print(f"coverage-guard: changed-line coverage {covered}/{total} = {pct:.1f}% (min {args.min}%)")
    if pct < args.min:
        print("uncovered changed lines:", file=sys.stderr)
        for m in misses[:40]:
            print(f"  {m}", file=sys.stderr)
        if args.strict:
            sys.exit(1)
        print("coverage-guard: WARN only (observation period, see CONSTRAINTS.md)", file=sys.stderr)


if __name__ == "__main__":
    main()
