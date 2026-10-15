# 质量门禁端到端故障注入验证报告（2026-10）

> 工具：`tools/e2e_gate_check.sh`（可重复执行，注入文件 trap 自动清理，不污染工作区）。
> 本轮执行：2026-10-16，commit `cb6e193` 基线，**23/23 PASS**。S1–S3 走真实 mvn（真编译/真测试），非替身模拟。

## 1. 场景结果（模板：场景 | 注入方法 | 预期 | 实际）

| 场景 | 注入方法 | 预期 | 实际 |
|---|---|---|---|
| S1 编译失败 | 写入非法 Java 测试文件后真跑 mvn | MVN_EXIT 非 0、级别 P0、摘要含 COMPILATION | ✅ exit=1 / P0 / 摘要命中 |
| S2 全部通过 | 真跑纯单元类（免 DB 快路径；`QS_E2E_FULL=1` 可切全量） | exit=0 放行、统计可解析 | ✅ testsRun=4, failures=0 |
| S3 用例失败 | 注入编译通过但断言必败的 JUnit 类，真跑 | 阻断、级别 P1、failures=1 | ✅ exit=1 / P1 / failures=1 |
| S4 并发调用 | 两进程同日志路径同时执行（慢替身考察锁） | 恰一个成功、另一个 exit=4、日志单写者 | ✅ a=0 b=4，日志标记行恰 1 次 |
| S5 JSON 流转 | 从 stdout 提取 `QS_RESULT_JSON=` 行用 python json 解析 | mvnExit/testsRun/failures/log/level 五字段齐 | ✅ 全部可解析 |
| S6 信号中断 | TERM+强杀运行中脚本 | 日志保留；残锁被下次调用自愈 | ✅（bash 前台管道 trap 挂起为已知边界，自愈兜底） |
| S7 CRLF 门禁 | `git check-attr` + 扫描库内全部 .sh 的 `\r` | eol=lf 生效、零 CRLF | ✅ |
| S8 高危域加签 | 核对 `.github/CODEOWNERS` 覆盖资产/结算/榜单/脱敏/迁移路径 | 设施存在且覆盖 | ✅（本轮补齐 CODEOWNERS 后通过；强制生效另见风险 R1） |
| S9 回归自动执行 | 核对 CI 走包装脚本 + 自测前置 + 回归标注用例在全量测试集内 | 三项设施齐备 | ✅（4 个测试文件含"回归(审计/T-/kb)"标注） |

## 2. CI 流水线接入校验清单（上线前逐项勾）

- [x] backend job 用 `bash ../tools/run_mvn_test.sh target/mvn-test.log 60`（非裸 mvn）
- [x] backend job 前置 `bash tools/test_run_mvn_test.sh`（包装脚本自身 20 用例回归）
- [x] 失败时上传 `mvn-test.log` 全量工件
- [x] `QS_RESULT_JSON` 可被标准 json 解析（S5），门禁判定只读 `mvnExit`
- [x] `.gitattributes` 强制 `*.sh` LF，库内零 CRLF（S7）
- [x] `.github/CODEOWNERS` 覆盖 quality-gates §5 高危域
- [ ] **GitHub 仓库设置**：分支保护勾选 *Require review from Code Owners*（仅能在网页操作，见 R1）
- [ ] 周期性重跑本套件：建议每次改动 tools/*.sh 或 ci.yml 后本地 `bash tools/e2e_gate_check.sh`

## 3. 风险清单：门禁机制的极限边界与兜底

| # | 边界 | 兜底 |
|---|---|---|
| R1 | CODEOWNERS 仅在 GitHub 分支保护开启后才**强制**；未开启时只是提示性 | 待仓库管理员网页勾选；在此之前依赖 PR 清单"风险域声明"自觉加签 |
| R2 | bash 前台管道运行期信号 trap 挂起：`kill -9` 瞬间锁可能残留 | 死 pid 自动回收（S6/T10 双验证）；日志经 tee 持续落盘不丢 |
| R3 | 双重校验的文本扫描依赖 Maven 输出格式（`BUILD FAILURE`/`Tests run:`）；Maven 大版本升级可能改格式 | 升级 Maven 后必跑 `e2e_gate_check.sh`（S1–S3 用真 mvn，格式变化即红） |
| R4 | P2 级（WARNING>50）只告警不阻断，可能温水积累 | 质量门禁 §4.4 要求放行留痕；周期人工 review WARNING 趋势 |
| R5 | 极端场景"mvn 退出 0 但构建实际失败"兜底依赖日志关键词，若 mvn 既退 0 又无失败字样则不可检 | 理论边界，无进一步兜底；靠后续冒烟层（smoke/buttons）捕获行为异常 |
| R6 | 锁按日志路径粒度：两个调用用**不同**日志路径时不互斥（设计如此，并行跑不同模块是合法场景） | 文档声明（run-mvn-test-guide §2），CI 内同 job 单日志路径 |
| R7 | S2 默认快路径只代表"指定用例全过"，非全量 | CI 真实执行的是全量 `mvn test`；本地要全量验证用 `QS_E2E_FULL=1` |

## 4. 使用方式

```bash
bash tools/e2e_gate_check.sh              # 默认: 免 DB 快路径, 约 2~4 分钟 (3 次真 mvn)
QS_E2E_FULL=1 bash tools/e2e_gate_check.sh  # S2 跑全量测试 (需 MySQL, 见 CLAUDE.md 测试前提)
```
退出码 0=全部 PASS；非 0 时按 FAIL 行逐项排查。注入的测试文件（`E2e*InjectionTest.java`）由 trap 清理，若强杀后残留，`git status` 可见并手动删除。
