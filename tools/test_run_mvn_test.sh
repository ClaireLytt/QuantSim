#!/usr/bin/env bash
# run_mvn_test.sh 的自测: 用假 mvn 模拟 成功/构建失败/用例失败 三种场景,
# 断言包装脚本透传 mvn 原生退出码 (而不是 tail 的 0), 且失败时打印摘要。
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fails=0

make_fake_mvn() { # $1=退出码 $2=输出内容
  cat > "$TMP/fakemvn" <<EOF
#!/usr/bin/env bash
printf '%s\n' "$2"
exit $1
EOF
  chmod +x "$TMP/fakemvn"
}

check() { # $1=场景名 $2=期望退出码 $3=期望输出含
  out="$(MVN_CMD="$TMP/fakemvn" bash "$HERE/run_mvn_test.sh" "$TMP/log" 5 2>&1)"
  got=$?
  if [ "$got" -ne "$2" ]; then
    echo "FAIL [$1] 退出码 got=$got want=$2"; fails=$((fails+1))
  elif ! grep -q "$3" <<<"$out"; then
    echo "FAIL [$1] 输出缺少: $3"; fails=$((fails+1))
  else
    echo "PASS [$1] exit=$got"
  fi
}

# 场景1: mvn 成功 -> 包装脚本 0
make_fake_mvn 0 '[INFO] Tests run: 92, Failures: 0, Errors: 0
[INFO] BUILD SUCCESS'
check "成功透传 0" 0 "MVN_EXIT=0"

# 场景2: 用例失败 (mvn 退出 1) -> 修复前整条管道是 0, 修复后必须是 1 且带摘要
make_fake_mvn 1 '[ERROR] com.quantsim.FooTest.bar -- FAILURE!
[ERROR] Tests run: 92, Failures: 4, Errors: 0
[INFO] BUILD FAILURE'
check "用例失败透传 1" 1 "MVN_EXIT=1"
check "失败打印摘要" 1 "mvn 失败摘要"
check "摘要含总计行" 1 "Failures: 4"

# 场景3: 长输出被 tail 截断, 退出码仍透传 (证明不是靠读到失败字样判定)
make_fake_mvn 3 "$(printf 'line%d\n' $(seq 1 100))
[ERROR] Failed to execute goal org.apache.maven.plugins"
check "长输出截断后仍透传 3" 3 "MVN_EXIT=3"

# 场景4: 对照组 —— 复现原 bug 写法, 证明它确实返回 0 (回归的"修复前失败"证据)
make_fake_mvn 1 '[INFO] BUILD FAILURE'
"$TMP/fakemvn" 2>&1 | tail -30 > /dev/null
if [ $? -eq 0 ]; then echo "PASS [对照组] 原写法 'mvn | tail' 确实吞码返回 0 (bug 复现)"
else echo "FAIL [对照组] 原写法未复现吞码?"; fails=$((fails+1)); fi

echo "----"
if [ "$fails" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
