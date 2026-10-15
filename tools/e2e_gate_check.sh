#!/bin/bash
# e2e_gate_check.sh —— run_mvn_test.sh + 质量门禁 端到端故障注入验证 (真实 mvn 链路)。
# 场景: S1 编译失败 / S2 全绿 / S3 用例失败 / S4 并发锁 / S5 JSON 流转 / S6 信号中断
#       / S7 CRLF 门禁 / S8 高危域加签设施 / S9 回归用例自动执行设施
# 用法: bash tools/e2e_gate_check.sh   (QS_E2E_FULL=1 时 S2 跑全量测试, 需 DB; 默认跑免 DB 快路径)
# 约束: 不改 run_mvn_test.sh 核心逻辑; 注入文件用 trap 保证清理, 不污染工作区。
set -u
if [ -z "${BASH_VERSION:-}" ]; then echo "需要 bash"; exit 2; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUT="$ROOT/tools/run_mvn_test.sh"
TMP="$(mktemp -d)"
INJ_DIR="$ROOT/backend/src/test/java/com/quantsim"
INJ_FILES=("$INJ_DIR/E2eBrokenInjectionTest.java" "$INJ_DIR/E2eFailingInjectionTest.java")
cleanup() { rm -f "${INJ_FILES[@]}"; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

pass=0; fail=0; skip=0
P() { echo "PASS [$1] $2"; pass=$((pass+1)); }
F() { echo "FAIL [$1] $2"; fail=$((fail+1)); }
S() { echo "SKIP [$1] $2"; skip=$((skip+1)); }
json_of() { grep -oE '^QS_RESULT_JSON=.*' <<<"$1" | head -1 | cut -d= -f2-; }
jget() { PYTHONIOENCODING=utf-8 python -c "import json,sys;print(json.loads(sys.argv[1])['$2'])" "$1" 2>/dev/null; }

# 快速 mvn 替身: 真 mvn 但限定单测试类 (提速; 编译阶段仍是全量, 能暴露编译错误)
make_mvn_single() { # $1=测试类
  printf '#!/bin/bash\nexec mvn -Dtest=%s -Dsurefire.failIfNoSpecifiedTests=true "$@"\n' "$1" > "$TMP/mvn_single"
  chmod +x "$TMP/mvn_single"
}

echo "=== QuantSim 门禁端到端注入验证 $(date '+%F %T') @ $(git -C "$ROOT" rev-parse --short HEAD) ==="
[ -n "$(git -C "$ROOT" status --porcelain)" ] && echo "[WARN] 工作区不干净, 注入文件清理依赖 trap, 请勿中途强杀"

# ---------- S1 编译失败 -> MVN_EXIT 非 0, 分级 P0, 摘要含编译错误 ----------
cat > "${INJ_FILES[0]}" <<'EOF'
package com.quantsim;
class E2eBrokenInjectionTest { 这不是合法的Java代码 }
EOF
make_mvn_single RateLimiterTest
out=$(cd "$ROOT/backend" && MVN_CMD="$TMP/mvn_single" bash "$SUT" "$TMP/s1.log" 15 2>&1); code=$?
rm -f "${INJ_FILES[0]}"
j=$(json_of "$out")
[ "$code" -ne 0 ] && grep -q "MVN_EXIT=$code" <<<"$out" \
  && P "S1" "编译失败透传非0 (exit=$code)" || F "S1" "exit=$code out尾: $(tail -2 <<<"$out")"
[ "$(jget "$j" level)" = "P0" ] && P "S1" "JSON 分级 P0" || F "S1" "level=$(jget "$j" level)"
grep -q "COMPILATION" <<<"$out" && P "S1" "摘要含编译错误行" || F "S1" "摘要缺编译错误"

# ---------- S2 全部通过 -> 放行 + 统计 ----------
if [ "${QS_E2E_FULL:-0}" = "1" ]; then
  out=$(cd "$ROOT/backend" && bash "$SUT" "$TMP/s2.log" 15 2>&1); code=$?
else
  make_mvn_single RateLimiterTest   # 纯单元测试类, 免 DB, 代表"全部指定用例通过"路径
  out=$(cd "$ROOT/backend" && MVN_CMD="$TMP/mvn_single" bash "$SUT" "$TMP/s2.log" 15 2>&1); code=$?
fi
j=$(json_of "$out")
[ "$code" -eq 0 ] && P "S2" "门禁放行 (exit=0)" || F "S2" "exit=$code"
tr=$(jget "$j" testsRun)
[ "${tr:-0}" -gt 0 ] && [ "$(jget "$j" failures)" = "0" ] \
  && P "S2" "统计可解析 testsRun=$tr failures=0" || F "S2" "统计异常: $j"

# ---------- S3 用例失败(编译成功) -> 阻断, 分级 P1, 失败数>0 ----------
cat > "${INJ_FILES[1]}" <<'EOF'
package com.quantsim;
import org.junit.jupiter.api.Test;
/** E2E 注入: 必失败用例 (验证门禁阻断), 由 e2e_gate_check.sh 创建并清理 */
class E2eFailingInjectionTest {
    @Test void mustFail() { org.junit.jupiter.api.Assertions.fail("E2E 注入的必失败用例"); }
}
EOF
make_mvn_single E2eFailingInjectionTest
out=$(cd "$ROOT/backend" && MVN_CMD="$TMP/mvn_single" bash "$SUT" "$TMP/s3.log" 15 2>&1); code=$?
rm -f "${INJ_FILES[1]}"
j=$(json_of "$out")
[ "$code" -ne 0 ] && P "S3" "测试失败阻断 (exit=$code)" || F "S3" "未阻断"
[ "$(jget "$j" level)" = "P1" ] && P "S3" "JSON 分级 P1" || F "S3" "level=$(jget "$j" level)"
[ "$(jget "$j" failures)" = "1" ] && P "S3" "失败数=1 可解析" || F "S3" "failures=$(jget "$j" failures)"

# ---------- S4 并发: 同日志双进程, 恰一个 exit 4; 日志无交错 ----------
printf '#!/bin/bash\necho one-writer-start; sleep 4; echo "[INFO] Tests run: 1, Failures: 0, Errors: 0"; echo "[INFO] BUILD SUCCESS"\n' > "$TMP/slow"
chmod +x "$TMP/slow"
MVN_CMD="$TMP/slow" bash "$SUT" "$TMP/s4.log" 50 > "$TMP/s4a.out" 2>&1 & pa=$!
sleep 1
MVN_CMD="$TMP/slow" bash "$SUT" "$TMP/s4.log" 50 > "$TMP/s4b.out" 2>&1 & pb=$!
wait $pa; ca=$?; wait $pb; cb=$?
if { [ $ca -eq 0 ] && [ $cb -eq 4 ]; } || { [ $ca -eq 4 ] && [ $cb -eq 0 ]; }; then
  P "S4" "并发恰一成功一冲突 (a=$ca b=$cb)"
else F "S4" "退出码 a=$ca b=$cb (期望 0/4)"; fi
[ "$(grep -c 'one-writer-start' "$TMP/s4.log")" = "1" ] \
  && P "S4" "日志单写者无交错" || F "S4" "日志出现多写者"

# ---------- S5 JSON 流转: CI 消费方视角稳定解析 ----------
for k in mvnExit testsRun failures log level; do
  v=$(jget "$j" "$k")
  [ -n "$v" ] && P "S5" "字段 $k=$v" || F "S5" "字段 $k 缺失"
done

# ---------- S6 信号中断: TERM 后日志保留 + 下次调用自愈 (bash 前台管道 trap 挂起为已知边界) ----------
printf '#!/bin/bash\necho s6-start; sleep 30\n' > "$TMP/slow6"; chmod +x "$TMP/slow6"
MVN_CMD="$TMP/slow6" bash "$SUT" "$TMP/s6.log" 5 > "$TMP/s6.out" 2>&1 & p6=$!
sleep 2; kill -TERM $p6 2>/dev/null; sleep 1; kill -9 $p6 2>/dev/null; pkill -f "$TMP/slow6" 2>/dev/null
wait $p6 2>/dev/null
[ -s "$TMP/s6.log" ] && P "S6" "中断后日志保留" || F "S6" "日志丢失"
printf '#!/bin/bash\necho ok; echo "[INFO] BUILD SUCCESS"\n' > "$TMP/slow6"
out=$(MVN_CMD="$TMP/slow6" bash "$SUT" "$TMP/s6.log" 5 2>&1)
[ $? -eq 0 ] && P "S6" "残锁自愈, 状态可继续上报" || F "S6" "自愈失败: $(tail -1 <<<"$out")"

# ---------- S7 CRLF 门禁: gitattributes 生效 + 已跟踪 .sh 无 \r ----------
attr=$(git -C "$ROOT" check-attr eol -- tools/run_mvn_test.sh | awk '{print $NF}')
[ "$attr" = "lf" ] && P "S7" "check-attr eol=lf 生效" || F "S7" "eol=$attr"
crlf_hits=0
while IFS= read -r f; do
  git -C "$ROOT" show ":$f" | grep -q $'\r' && { echo "  CRLF: $f"; crlf_hits=$((crlf_hits+1)); }
done < <(git -C "$ROOT" ls-files '*.sh')
[ "$crlf_hits" -eq 0 ] && P "S7" "库内全部 .sh 无 CRLF" || F "S7" "$crlf_hits 个 .sh 含 CRLF"

# ---------- S8 高危域加签设施 (资产/榜单/结算改动需双人评审) ----------
if [ -f "$ROOT/.github/CODEOWNERS" ]; then
  miss=0
  for f in FeeCalculator TradeEngine PointsService BlindDates db/migration; do
    grep -q "$f" "$ROOT/.github/CODEOWNERS" || { echo "  CODEOWNERS 缺: $f"; miss=$((miss+1)); }
  done
  [ "$miss" -eq 0 ] && P "S8" "CODEOWNERS 覆盖高危域文件" || F "S8" "缺 $miss 项"
  echo "  [NOTE] 强制生效还需 GitHub 分支保护勾选 'Require review from Code Owners' (仓库设置, 脚本无法验证)"
else
  F "S8" "缺 .github/CODEOWNERS —— quality-gates §5 的加签规则尚未落地设施"
fi

# ---------- S9 回归用例自动执行设施 ----------
grep -q "run_mvn_test.sh" "$ROOT/.github/workflows/ci.yml" \
  && P "S9" "CI 后端测试走包装脚本" || F "S9" "CI 未接包装脚本"
grep -q "test_run_mvn_test.sh" "$ROOT/.github/workflows/ci.yml" \
  && P "S9" "CI 含包装脚本自测前置" || F "S9" "CI 缺自测前置"
reg=$(grep -rlE '回归 \((审计|T-)|kb #' "$ROOT/backend/src/test/java" | wc -l)
[ "$reg" -ge 3 ] && P "S9" "历史 bug 回归用例在测试集内 ($reg 个文件含回归标注, mvn test 全量执行)" \
  || F "S9" "回归标注用例过少 ($reg)"

echo "================================"
echo "结果: PASS=$pass FAIL=$fail SKIP=$skip"
[ "$fail" -eq 0 ] && exit 0 || exit 1
