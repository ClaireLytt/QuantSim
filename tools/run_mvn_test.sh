#!/bin/bash
# run_mvn_test.sh —— 后台/CI 安全跑 mvn test
# 职责: 透传 mvn 原生退出码 (PIPESTATUS, 不被管道末端吞掉) + 失败摘要 + 审计可观测。
# 用法: bash tools/run_mvn_test.sh [日志文件] [尾行数]
#   环境变量: MVN_CMD 替身命令(自测注入, 默认 mvn); QS_MAX_LOG_MB 日志轮转阈值(默认 10)。
# 退出码: 正常=MVN 原生码; 2=环境不符; 3=入参非法; 4=并发锁冲突; 1=退出码与日志矛盾兜底。
VERSION="2.0.0"

# ---- 环境防御: PIPESTATUS 为 bash 特性 ----
if [ -z "${BASH_VERSION:-}" ]; then
  echo "[ERROR] 需要 bash (PIPESTATUS 不被 sh/dash 支持): bash $0" >&2
  exit 2
fi
set -euo pipefail

# ---- 日志分级 ----
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log_info()  { echo "[INFO  $(ts)] $*"; }
log_warn()  { echo "[WARN  $(ts)] $*"; }
log_error() { echo "[ERROR $(ts)] $*" >&2; }

# ---- 入参校验 ----
LOG="${1:-/tmp/quantsim-mvn-test.log}"
TAIL_N="${2:-30}"
if ! [[ "$TAIL_N" =~ ^[1-9][0-9]*$ ]]; then
  log_error "尾行数必须是正整数, 收到: '$TAIL_N'"
  exit 3
fi
LOG_DIR=$(dirname -- "$LOG")
if [ ! -d "$LOG_DIR" ]; then
  log_warn "日志目录不存在, 自动创建: $LOG_DIR"
  mkdir -p -- "$LOG_DIR" || { log_error "无法创建日志目录: $LOG_DIR"; exit 3; }
fi
MVN_CMD="${MVN_CMD:-mvn}"

# ---- 审计头 ----
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "n/a")
log_info "run_mvn_test v$VERSION | 执行者=$(whoami 2>/dev/null || echo n/a) | commit=$GIT_SHA"
log_info "入参: LOG=$LOG TAIL_N=$TAIL_N MVN_CMD=$MVN_CMD"

# ---- 文件锁 (按日志文件粒度, mkdir 原子性, 无 flock 依赖) ----
LOCK_DIR="${LOG}.lock"
STAGE="初始化"
cleanup() { rmdir -- "$LOCK_DIR" 2>/dev/null || true; }
if ! mkdir -- "$LOCK_DIR" 2>/dev/null; then
  holder=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    log_warn "发现失效锁 (持有者 pid=$holder 已退出), 回收重试"
    rm -rf -- "$LOCK_DIR"
    mkdir -- "$LOCK_DIR" || { log_error "锁回收后仍无法获取: $LOCK_DIR"; exit 4; }
  else
    log_error "并发冲突: $LOG 正被 pid=${holder:-?} 占用 (锁: $LOCK_DIR)"
    exit 4
  fi
fi
echo $$ > "$LOCK_DIR/pid"
# 中断保护: 打印阶段、保留日志、释放锁; EXIT 兜底释放锁
trap 'log_error "收到中断信号, 阶段=[$STAGE], 日志已保留: $LOG"; cleanup; exit 130' INT TERM
trap 'cleanup' EXIT

# ---- 日志轮转 ----
MAX_MB="${QS_MAX_LOG_MB:-10}"
if [ -f "$LOG" ]; then
  size=$(wc -c < "$LOG")
  if [ "$size" -gt $((MAX_MB * 1024 * 1024)) ]; then
    log_warn "旧日志 ${size}B 超 ${MAX_MB}MB, 轮转为 ${LOG}.1"
    mv -f -- "$LOG" "${LOG}.1"
  fi
fi

# ==== 核心管道 (保持 v1 逻辑不变): PIPESTATUS[0] 为唯一判定源 ====
STAGE="mvn 执行"
start_ts=$(date +%s)
set +e  # mvn 失败要走摘要分支, 此区关闭 -e; pipefail 不影响 PIPESTATUS 取值
"$MVN_CMD" -B test 2>&1 | tee "$LOG" | tail -n "$TAIL_N"
mvn_exit=${PIPESTATUS[0]}
set -e
duration=$(( $(date +%s) - start_ts ))

# ---- 结果解析与双重校验 ----
STAGE="结果解析"
summary_line=$(grep -E 'Tests run: [0-9]+, Failures: [0-9]+, Errors: [0-9]+' "$LOG" | tail -1 || true)
tests_run=$(sed -E 's/.*Tests run: ([0-9]+).*/\1/'   <<<"$summary_line" 2>/dev/null || echo 0)
failures=$(sed -E 's/.*Failures: ([0-9]+).*/\1/'     <<<"$summary_line" 2>/dev/null || echo 0)
errors=$(sed -E 's/.*Errors: ([0-9]+).*/\1/'         <<<"$summary_line" 2>/dev/null || echo 0)
[ -n "$summary_line" ] || { tests_run=0; failures=0; errors=0; }
build_failure_in_log=false
grep -qE 'BUILD FAILURE|TEST FAILED' "$LOG" && build_failure_in_log=true

script_exit=$mvn_exit
if [ "$mvn_exit" -eq 0 ] && [ "$build_failure_in_log" = true ]; then
  # 兜底: 退出码说成功但日志有失败标记 —— 不信任退出码, 按失败处理
  log_error "矛盾: MVN_EXIT=0 但日志含 BUILD FAILURE/TEST FAILED, 按失败兜底"
  script_exit=1
fi

# ---- 分级 ----
if [ "$script_exit" -eq 0 ]; then
  warn_count=$(grep -c '^\[WARNING\]' "$LOG" || true)
  if [ "${warn_count:-0}" -gt 50 ]; then level="P2"; log_warn "构建通过但 WARNING ${warn_count} 条, 建议排查 (不阻断)"; else level="OK"; fi
elif [ $((failures + errors)) -gt 0 ]; then
  level="P1"  # 测试失败: 阻断
else
  level="P0"  # 构建/环境失败: 阻断
fi

# ---- 失败摘要 (非 OK 且非 P2 时) ----
if [ "$script_exit" -ne 0 ]; then
  echo "===== 失败摘要 [$level] 失败用例 $((failures + errors))/$tests_run (完整日志: $LOG) ====="
  grep -E '^\[ERROR\].*(FAILURE!|<<<)' "$LOG" | head -20 || true
  [ -n "$summary_line" ] && echo "$summary_line"
  grep -E '^\[ERROR\] (COMPILATION|Failed to execute goal)' "$LOG" | head -5 || true
fi

# ---- 可解析输出: 两个独立变量 + JSON 结果块 (门禁只读 MVN_EXIT) ----
echo "MVN_EXIT=$mvn_exit"
echo "SCRIPT_EXIT=$script_exit"
printf 'QS_RESULT_JSON={"tool":"run_mvn_test","version":"%s","mvnExit":%s,"scriptExit":%s,"level":"%s","testsRun":%s,"failures":%s,"errors":%s,"durationSec":%s,"log":"%s","commit":"%s"}\n' \
  "$VERSION" "$mvn_exit" "$script_exit" "$level" "$tests_run" "$failures" "$errors" "$duration" "$LOG" "$GIT_SHA"

exit "$script_exit"
