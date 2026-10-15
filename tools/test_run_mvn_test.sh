#!/bin/bash
# run_mvn_test.sh 回归套件 v2: 一键全量, 标准化 PASS/FAIL 清单。
# 覆盖: 退出码透传/摘要/JSON/入参校验/目录自建/日志轮转/并发锁/矛盾兜底/中断信号。
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$HERE/run_mvn_test.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fails=0; total=0

make_fake_mvn() { # $1=退出码 $2=输出
  printf '#!/bin/bash\nprintf '\''%%s\\n'\'' "%s"\nexit %s\n' "$2" "$1" > "$TMP/fakemvn"
  chmod +x "$TMP/fakemvn"
}
run_sut() { MVN_CMD="$TMP/fakemvn" bash "$SUT" "$@" 2>&1; }
check() { # $1=名 $2=期望退出码 $3=实际退出码 $4=输出 $5=必含子串("":跳过)
  total=$((total+1))
  if [ "$3" -ne "$2" ]; then echo "FAIL [$1] exit got=$3 want=$2"; fails=$((fails+1))
  elif [ -n "$5" ] && ! grep -qF -- "$5" <<<"$4"; then echo "FAIL [$1] 输出缺少: $5"; fails=$((fails+1))
  else echo "PASS [$1]"; fi
}

# T1 成功透传 0 + JSON OK
make_fake_mvn 0 '[INFO] Tests run: 92, Failures: 0, Errors: 0
[INFO] BUILD SUCCESS'
out=$(run_sut "$TMP/t1.log" 5); check "T1 成功透传0"       0 $? "$out" "MVN_EXIT=0"
check "T1 JSON结果块"                                     0 0  "$out" '"level":"OK"'

# T2 用例失败: 透传 1 + P1 + 摘要含计数
make_fake_mvn 1 '[ERROR] com.quantsim.FooTest.bar -- FAILURE!
[ERROR] Tests run: 92, Failures: 4, Errors: 0
[INFO] BUILD FAILURE'
out=$(run_sut "$TMP/t2.log" 5); code=$?
check "T2 用例失败透传1"   1 $code "$out" "MVN_EXIT=1"
check "T2 分级P1"          1 $code "$out" '"level":"P1"'
check "T2 摘要高亮失败数"  1 $code "$out" "失败用例 4/92"

# T3 构建失败(无测试计数): P0
make_fake_mvn 1 '[ERROR] COMPILATION ERROR
[INFO] BUILD FAILURE'
out=$(run_sut "$TMP/t3.log" 5); check "T3 构建失败P0" 1 $? "$out" '"level":"P0"'

# T4 矛盾兜底: 退出码 0 但日志 BUILD FAILURE -> SCRIPT_EXIT=1
make_fake_mvn 0 '[INFO] BUILD FAILURE'
out=$(run_sut "$TMP/t4.log" 5); code=$?
check "T4 矛盾兜底exit=1"  1 $code "$out" "SCRIPT_EXIT=1"
check "T4 保留原生MVN_EXIT" 1 $code "$out" "MVN_EXIT=0"

# T5 入参非法: 尾行数非正整数 -> 3
make_fake_mvn 0 ok
out=$(run_sut "$TMP/t5.log" abc); check "T5 非法尾行数exit=3" 3 $? "$out" "正整数"
out=$(run_sut "$TMP/t5.log" 0);   check "T5 尾行数0拒绝"      3 $? "$out" "正整数"

# T6 日志目录不存在: 自动创建 + WARN
out=$(run_sut "$TMP/no/such/dir/t6.log" 5); code=$?
check "T6 目录自建"        0 $code "$out" "自动创建"
[ -f "$TMP/no/such/dir/t6.log" ] && echo "PASS [T6 日志落盘]" || { echo "FAIL [T6 日志落盘]"; fails=$((fails+1)); }; total=$((total+1))

# T7 日志轮转: 预置超限旧日志 -> 产生 .1 备份
make_fake_mvn 0 '[INFO] BUILD SUCCESS'
head -c 1200000 /dev/zero | tr '\0' 'x' > "$TMP/t7.log"
out=$(QS_MAX_LOG_MB=1 MVN_CMD="$TMP/fakemvn" bash "$SUT" "$TMP/t7.log" 5 2>&1); code=$?
check "T7 轮转执行"        0 $code "$out" "轮转"
[ -f "$TMP/t7.log.1" ] && echo "PASS [T7 备份存在]" || { echo "FAIL [T7 备份存在]"; fails=$((fails+1)); }; total=$((total+1))

# T8 并发锁: 先持锁再调 -> 4; 失效锁(死pid)自动回收 -> 0
mkdir "$TMP/t8.log.lock"; echo 999999 > "$TMP/t8.log.lock/pid"  # 死 pid, 应被回收
out=$(run_sut "$TMP/t8.log" 5); check "T8 失效锁回收" 0 $? "$out" "回收"
mkdir "$TMP/t8b.log.lock"; echo $$ > "$TMP/t8b.log.lock/pid"    # 活 pid(本套件), 应冲突
out=$(run_sut "$TMP/t8b.log" 5); check "T8 活锁冲突exit=4" 4 $? "$out" "并发冲突"
rm -rf "$TMP/t8b.log.lock"

# T9 超大输出截断后仍透传码 (非文本判定)
make_fake_mvn 3 "$(printf 'line%d\n' $(seq 1 500))"
out=$(run_sut "$TMP/t9.log" 5); check "T9 长输出透传3" 3 $? "$out" "MVN_EXIT=3"

# T10 中断自愈: 强杀留下的残锁, 下一次调用必须自动回收并成功
# (bash 语义: 前台管道运行期信号 trap 被挂起, 强杀下锁可能残留 —— 依赖 T8 的死 pid 回收兜底)
cat > "$TMP/fakemvn" <<'EOF'
#!/bin/bash
echo slow-start; sleep 30
EOF
chmod +x "$TMP/fakemvn"
MVN_CMD="$TMP/fakemvn" bash "$SUT" "$TMP/t10.log" 5 > "$TMP/t10.out" 2>&1 &
pid=$!; sleep 2; kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
pkill -f "$TMP/fakemvn" 2>/dev/null; sleep 1
make_fake_mvn 0 '[INFO] BUILD SUCCESS'
out=$(run_sut "$TMP/t10.log" 5)
check "T10 强杀后下次调用自愈" 0 $? "$out" "MVN_EXIT=0"
[ -f "$TMP/t10.log" ] && echo "PASS [T10 中断日志保留]" || { echo "FAIL [T10 中断日志丢失]"; fails=$((fails+1)); }; total=$((total+1))

# T11 对照组: 裸管道写法确实吞码 (bug 存在性证据, 防本修复被回退)
make_fake_mvn 1 '[INFO] BUILD FAILURE'
"$TMP/fakemvn" 2>&1 | tail -30 > /dev/null
total=$((total+1))
if [ $? -eq 0 ]; then echo "PASS [T11 对照组: 裸管道吞码]"; else echo "FAIL [T11 对照组未复现]"; fails=$((fails+1)); fi

echo "================================"
echo "结果: $((total-fails))/$total PASS, $fails FAIL"
[ "$fails" -eq 0 ] && exit 0 || exit 1
