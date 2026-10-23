# Spec: 指标双实现对拍单测（pandas vs Spark 口径防漂移）

Triage: `ready-for-agent`

## Problem Statement

数据管道里同一套行情指标（pct_change / ma5 / ma20 / volatility，含"窗口不满输出 NULL"规则）存在两份刻意的实现：常规管道走 PySpark，场景采集走 pandas。两者只靠注释互相锚定口径（"与 Spark 口径一致"）。任何一边改动 round 位数、窗口 min_periods、除零处理时，另一边不会被编译器或测试拦住——口径漂移只会在入库数据对不上时才被发现，而那时脏数据已经进了 `daily_indicator`，玩家看到的均线/波动率在两类标的间不一致。

## Solution

加一个对拍（parity）单测：同一份确定性合成行情喂给两份实现，断言四个指标列逐行相等（含 NULL 位置）。此后任何一边的口径改动若未同步另一边，`python -m pytest` 立即红。零生产代码改动——slim-down 轮已确认两份实现本体不动（跨引擎收敛被否）。

## User Stories

1. As a pipeline developer, I want a parity test between the pandas and Spark indicator implementations, so that an unsynchronized change to either side fails CI instead of corrupting `daily_indicator`.
2. As a pipeline developer, I want the test to cover the "window not full → NULL" rule, so that min_periods regressions are caught, not just mean-value math.
3. As a pipeline developer, I want the test to cover rounding scales (2 for MA, 4 for pct/volatility), so that a silent round() change on one side fails.
4. As a pipeline developer, I want the test to cover the prev_close=0 division guard, so that the Spark-side Infinity fix (pr_guard 第 6 类) is pinned by a test.
5. As a game player, I want hidden scenario stocks and regular stocks to show indicators computed under one口径, so that MA/volatility readings are comparable across game modes.
6. As a repo maintainer, I want the test to run inside the existing `python -m pytest` entry, so that the CLAUDE.md closed-loop verification command stays unchanged.
7. As a repo maintainer, I want the test deterministic and network-free (synthetic data, no AKShare, no MySQL), so that it runs in CI without the pipeline's external dependencies.
8. As a reviewer, I want a failing-then-passing demonstration (mutate one side locally → test red; revert → green), so that the test is proven to actually guard the seam.
9. As a future contributor reading the test, I want its docstring to say why two implementations exist and must agree, so that I don't "fix" the duplication by deleting one side.

## Implementation Decisions

- 只新增一个测试文件，放入 data-pipeline 现有 tests 目录；不修改两份实现本体（slim-down 裁决：跨引擎不收敛）。
- 对拍输入为确定性合成序列，长度 ≥ 25 天（覆盖 ma20 窗口不满→满的边界），并包含一个 prev_close=0 的构造行以覆盖除零保护分支。
- 比较口径：pandas 侧 NaN 与 Spark 侧 NULL 统一映射为 None 再比较；数值按字符串化或 `pytest.approx` 精确位比较，确保 round 位数差异可检出。
- Spark 侧在测试内起 `local[1]` SparkSession（session 级 fixture，模块内复用，控制测试时长）；pyspark 已是管道的既有依赖，不新增依赖。
- 若测试环境无法起 Spark（如 CI 缺 JDK），用 pytest skip 并带明确原因标注，而不是静默通过——skip 可见，假绿不可见。
- 测试注释遵循仓规：中文、写"为什么"（两份实现为何并存、对拍防什么）。

## Testing Decisions

- 好测试 = 只验外部行为：给定同一 OHLCV 输入，两份实现的指标输出相等。不断言任何内部实现（窗口对象、DataFrame 结构）。
- 被测模块：常规管道的 Spark 指标计算与场景采集的 pandas 指标计算。
- Prior art：`data-pipeline/tests/test_mock_data.py`、`tests/test_config.py`（纯函数、无外部服务的 pytest 风格）。
- 不 mock 任何一侧——对拍的意义就是跑真实现。

## Acceptance Criteria

1. **测试通过（证 Stories 1–7）**：`cd data-pipeline && python -m pytest -q`，期望尾部 `N passed`（N ≥ 现有 2 个文件的用例数 + 新增用例数），无 failed；若 Spark 不可用则新用例显示 `skipped` 且 reason 可读。
2. **真的在守口径（证 Story 8）**：演示一次红绿——临时把 pandas 侧某个 round 位数改掉，`python -m pytest` 对拍用例 FAILED（贴输出）；还原后 passed（贴输出）。两段输出同附完成报告。
3. **NULL 边界被覆盖（证 Story 2）**：测试断言中可见"第 1–4 行 ma5 为 None / 第 1–19 行 ma20 为 None"性质的检查（评审者读测试源码确认，引用行号）。
4. **除零分支被覆盖（证 Story 4）**：合成数据含 prev_close=0 行，且断言该行 pct_change 两侧均为 None（同上，读源码引用行号）。
5. **改动面（证 Story 6）**：`git diff --stat` 仅含新增测试文件（及本 spec/tickets）；两份实现文件零改动。
6. **提交规范**：英文 `test:` 前缀提交，无 AI 署名。

全部标准以命令输出原文为证据；未跑 = 未完成。

## Out of Scope

- 收敛两份指标实现或三处 upsert SQL（slim-down 裁决：不做）。
- 把对拍扩展到 train_predictor 的特征工程。
- CI 工作流文件改动（测试挂在现有 pytest 入口下即可）。
- backend 侧 `IndicatorMath` 与管道口径的对拍（另一个缝，需要时另开 spec）。

## Further Notes

- 来源：/slim-down data-pipeline 调查轮。该轮确认模块无死代码、无超长文件、CLAUDE.md 相关规则全部有效；唯一风险项即本 spec 针对的口径漂移。
- Spark 本地 session 启动约需数秒，是该模块测试时长的主要成本；如嫌慢可给用例加 `-m slow` 标记的后续优化，但默认不做（CLAUDE.md：保持简单）。
