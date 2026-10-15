# run_mvn_test.sh 接入文档（v2.0.0）

后台任务 / CI 跑后端测试的统一入口。核心承诺：**退出码永远是 mvn 的原生退出码**（极端矛盾场景兜底见下），不被管道末端命令吞掉。

## 1. 用法与入参

```bash
bash tools/run_mvn_test.sh [日志文件] [尾行数]
# 示例 (CI 实际用法, working-directory: backend):
bash ../tools/run_mvn_test.sh target/mvn-test.log 60
```

| 参数/环境变量 | 默认 | 说明 |
|---|---|---|
| $1 日志文件 | /tmp/quantsim-mvn-test.log | 全量输出 tee 到此；目录不存在自动创建并 WARN |
| $2 尾行数 | 30 | 终端只展示末 N 行；必须正整数，否则 exit 3 |
| MVN_CMD | mvn | 替身注入口（回归套件用） |
| QS_MAX_LOG_MB | 10 | 旧日志超限自动轮转为 `<log>.1` |

**退出码表**：mvn 原生码（正常）；`1` 矛盾兜底（见 §3）；`2` 非 bash 环境；`3` 入参非法；`4` 并发锁冲突。

## 2. 锁机制

- 粒度：**按日志文件**（`<log>.lock/` 目录锁，mkdir 原子性，零依赖无需 flock）。
- 冲突：同一日志被并发调用时第二个调用 exit 4 并打印持有者 pid。
- 自愈：持有者 pid 已死（强杀/崩溃残留）→ 下一次调用自动回收锁（回归 T8/T10 锁定该行为）。
- 已知边界：bash 前台管道运行期信号 trap 挂起，`kill -9` 可能残留锁——由自愈机制兜底，日志因 tee 持续落盘不丢失。

## 3. 质量门禁接入

脚本输出三个机器可读通道：

```
MVN_EXIT=1                 # maven 原生退出码 —— 门禁判定唯一依据
SCRIPT_EXIT=1              # 脚本最终退出码 (= MVN_EXIT; 仅"退出码0但日志含 BUILD FAILURE/TEST FAILED"的矛盾场景强制为 1)
QS_RESULT_JSON={"tool":"run_mvn_test","version":"2.0.0","mvnExit":1,"scriptExit":1,"level":"P1","testsRun":92,"failures":4,"errors":0,"durationSec":118,"log":"target/mvn-test.log","commit":"abc1234"}
```

分级规则（对齐 `docs/quality-gates.md` §4.4）：
- **P0** 构建/环境失败（mvn 非 0 且无测试计数）→ 阻断
- **P1** 测试失败（failures+errors > 0）→ 阻断
- **P2** 构建通过但 WARNING > 50 条 → 只告警不阻断（exit 0），人工评估
- **OK** 通过

CI 解析示例：`grep -oP '(?<=^QS_RESULT_JSON=).*' log | jq .level`。门禁只读 `mvnExit`；`scriptExit` 供脚本链路诊断。

## 4. 回归套件（改脚本必跑，已入 CI 前置步骤）

```bash
bash tools/test_run_mvn_test.sh   # 20 用例, 标准化 PASS/FAIL 清单, ALL PASS 才允许提交
```

用例清单：T1 成功透传+JSON / T2 失败透传+P1+失败数高亮 / T3 构建失败 P0 / T4 矛盾兜底 /
T5 非法入参 ×2 / T6 目录自建+日志落盘 / T7 日志轮转+备份 / T8 失效锁回收+活锁冲突 /
T9 超长输出截断仍透传 / T10 强杀自愈+日志保留 / T11 对照组（裸管道吞码的存在性证据，防修复被回退）。

## 5. Windows 开发者注意

`.gitattributes` 已强制 `*.sh` LF。若本地编辑器把脚本转成 CRLF（症状：Linux CI 报 `$'\r': command not found`），执行 `git add --renormalize <file>` 归位。
