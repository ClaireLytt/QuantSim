#!/usr/bin/env bash
# 本地镜像 CI 的轻量子集 (retro 2026-10-25: PR #11 首跑三连红全是"本地绿 CI 红"口径差) ——
# ruff(全范围) / eslint(前端+冒烟工具) / ui_check / bump --check 四项秒级检查一次跑齐。
# 跑法: bash tools/ci_local.sh   (任何 tools/*.py / 前端 / 依赖类改动后, 推送前必过)
# 不含 mvn test / smoke (分钟级, 按 CLAUDE.md 闭环表按需跑); 退出码非 0 = 有红。
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

run() {
  echo "== $1"
  shift
  "$@" || { echo "   ^^ FAILED"; fail=1; }
}

run "ruff (data-pipeline + tools, CI 同口径)" ruff check --config data-pipeline/pyproject.toml data-pipeline tools
run "eslint (frontend + ui_smoke, CI 同口径)" npm --prefix tools/ui_smoke run lint --silent
run "ui_check" python tools/ui_check.py
run "bump_assets --check (资源指纹)" python tools/bump_assets.py --check

if [ "$fail" -ne 0 ]; then
  echo "ci_local: 有未通过项, 修复后再推送"
  exit 1
fi
echo "ci_local: 全部通过"
