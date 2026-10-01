"""PostToolUse hook 入口: 前端文件被 Write/Edit 后自动跑 ui_check.py。

stdin 为 Claude Code 的 hook JSON。非前端文件直接放行 (exit 0);
体检发现 ERROR 时把报告写到 stderr 并 exit 2 —— 阻断性反馈会直接喂回模型,
让它立即修复, 不必等人工测试。WARN 不阻断 (exit 0), 由定期巡检处理。
"""
import json
import os
import subprocess
import sys


def main():
    # Windows 控制台默认 GBK, 强制 UTF-8 防乱码
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0  # 拿不到输入就放行, hook 绝不能误伤正常编辑
    f = str((data.get("tool_input") or {}).get("file_path", "")).replace("\\", "/")
    if "/frontend/" not in f:
        return 0
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = subprocess.run(
        [sys.executable, os.path.join(root, "tools", "ui_check.py")],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        sys.stderr.write("[ui_check] 前端体检未通过, 请立即修复:\n" + r.stdout + r.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
