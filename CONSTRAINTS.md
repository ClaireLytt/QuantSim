# Constraints

Last reviewed: 2026-10-24 by ClaireLytt

本文件是全仓质量门槛的单一事实源：每条规则带数字、带产出裁决的命令。
`tools/floor_guard.mjs` 机械保护本文件自身——放宽阈值、删规则、加例外都会在 diff 里被点名。
**不允许为了让某次改动通过而削弱本文件。**

## Floor（永远强制，阻断级，`node tools/floor_guard.mjs` 检查）

- 不新增压制注释: `eslint-disable` / `# noqa` / `# type: ignore` / `@SuppressWarnings` / `nosemgrep` / `gitleaks:allow`
- 不新增未完成 stub: `not implemented` 抛错、空 `catch {}`、`raise NotImplementedError`
- 不跳过/删除测试: 新增 `.skip` / `@Disabled` / `@Ignore` / `@pytest.mark.skip`、删测试文件、删留存测试里的断言——除非 commit message 写明理由且走 Exceptions
- 源码不含密钥（CI 由 gitleaks 兜底，`--redact` 永不打印命中值）
- 本文件不为放行某次改动而削弱

## Enforced with numbers（数字门禁）

| Dimension | Rule | Checked by | Runs at | Mode |
|---|---|---|---|---|
| Floor | 上表五条，0 违规 | `node tools/floor_guard.mjs` | 任务收尾 + CI | **block** |
| 后端测试 | 0 failures / 0 errors | `cd backend && mvn -B test` | 任务收尾 + CI | **block**（既有） |
| 前端静态 | `ui_check.py` 0 error | `python tools/ui_check.py` | 每次编辑（hook）+ CI | **block**（既有） |
| 前端按钮 | 0 error | `cd tools/ui_smoke && npm run buttons` | 任务收尾 + CI | **block**（既有） |
| Python lint/测试 | ruff 0 error、pytest 全绿 | `ruff check` + `python -m pytest` | 任务收尾 + CI | **block**（既有） |
| 变更行覆盖率 | 变更的可执行行 ≥ 80% 被覆盖 | `python tools/coverage_guard.py`（读 JaCoCo + git diff，不重跑测试） | 任务收尾 + CI | warn（观察期至 2026-11-07，之后转 block `--strict`） |
| 安全: 密钥 | 0 命中 | gitleaks（CI job，`--redact`） | CI | **block** |
| 安全: 依赖 | 无 high 及以上漏洞 | osv-scanner（CI job，扫 pom.xml / requirements.txt / package-lock.json） | CI | warn（观察期同上） |
| 历史反面模式 | 无新增高置信命中 | `python tools/pr_guard.py` | 任务收尾 + CI | warn（既有，启发式有误报） |

数字的理由：变更行 80% = 高到逼出一条测试、低到放过配置行（技能默认值）；依赖漏洞卡 high 以上 = 以下多为噪音；
观察期两周 = Q2 决策「floor 阻断、其余先警告」，误报收敛后升级。

时间预算：编辑环秒级（hook 已是）；任务收尾 ≤ 90s（floor_guard + coverage_guard 都是秒级 diff 工具，
mvn test / buttons 按 CLAUDE.md 既有约定跑，不计入此预算）；CI 不限。

## Measured, not yet enforced（只记录方向，ratchet）

| Metric | Today (2026-10-24) | Direction |
|---|---|---|
| 后端整体行覆盖率 (JaCoCo) | 73.4% | must not fall（容差 0.5%，吸收无关文件漂移） |
| 后端整体分支覆盖率 (JaCoCo) | 56.1% | must not fall（容差 0.5%） |

> pom.xml 注释里"观测一个周期再定阈值"的 P2 债在此落地：数字只升不降，升了就更新本表。

## Exceptions（例外必须有主人和过期日）

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
| E1 | 不删留存测试断言 | backend/src/test/java/com/quantsim/TradingDepthIntegrationTest.java | 审计创意31 产品拍板 (2026-10-27): undo 的挂单回滚从 OPEN 改为 CANCELLED, 原 P1-5 断言随行为同步更新 (非删除弱化) | ClaireLytt | 2027-01-25 |

（空。新增一行 = floor_guard 会在 diff 里点名，必须在 PR 里讨论过。例外默认寿命 90 天。）
