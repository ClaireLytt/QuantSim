#!/usr/bin/env bash
# 后台/CI 安全跑 mvn test: 返回 mvn 的原生退出码, 不被管道末端 tail 吞掉。
# 背景 (issue_recode/1.md 2026-10-16): `mvn -B test 2>&1 | tail` 的 $? 是 tail 的 0,
# 构建失败被后台任务当成"通过"——两轮 58/62 个 error 的失败都被报成 exit 0。
#
# 用法: tools/run_mvn_test.sh [日志文件] [尾行数]
#   MVN_CMD 环境变量可注入替身命令 (单测用), 默认 mvn。
#   退出码 = mvn 原生退出码。

# ---- 防御: PIPESTATUS 是 bash 特性, sh/dash 没有; 被 `sh script.sh` 调起时立即明错 ----
if [ -z "${BASH_VERSION:-}" ]; then
  echo "[run_mvn_test] 需要 bash (PIPESTATUS 不被 sh/dash 支持), 请用: bash $0" >&2
  exit 2
fi
set -u  # 不开 set -e: mvn 失败要走摘要分支而不是立刻退出

LOG="${1:-/tmp/quantsim-mvn-test.log}"
TAIL_N="${2:-30}"
MVN_CMD="${MVN_CMD:-mvn}"

# tee 落全量日志, tail 只给终端看尾部; 真实判定永远用 PIPESTATUS[0]
"$MVN_CMD" -B test 2>&1 | tee "$LOG" | tail -n "$TAIL_N"
mvn_exit=${PIPESTATUS[0]}

# 日志: 打印原生退出码, 后台任务通知/人工都以这一行为准
echo "MVN_EXIT=$mvn_exit (log: $LOG)"

if [ "$mvn_exit" -ne 0 ]; then
  echo "===== mvn 失败摘要 (完整输出见 $LOG) ====="
  # 失败用例清单 + 总计行; grep 可能无命中 (如编译错误), 都兜底不让摘要自身改变退出码
  grep -E '^\[ERROR\].*(FAILURE!|<<<)' "$LOG" | head -20 || true
  grep -E 'Tests run:.*(Failures|Errors)' "$LOG" | tail -3 || true
  grep -E '^\[ERROR\] (COMPILATION|Failed to execute goal)' "$LOG" | head -5 || true
fi

exit "$mvn_exit"
