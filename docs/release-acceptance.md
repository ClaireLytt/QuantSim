# QuantSim 上线验收 & 灰度回滚手册（2026-10 bug 修复轮）

> 本轮范围：13 bug 修复（`4f1d279`）+ 回归套件与并发死锁修复（`d7d505e`）。
> 前序产出：风险评估、回归用例、PR 评审、`docs/bug-knowledge-base.md`、`tools/pr_guard.py`。
> 本文档是上线前综合验收：剩余风险、5 分钟冒烟、灰度策略、监控、应急回滚。
>
> **部署事实（决定回滚方式）**：后端由 `docker compose` **本地构建镜像**（非拉取版本 tag），
> 所以**没有"回退到上一个镜像 tag"这条路——回滚只能靠 git**（revert / checkout 上一个 tag 后重建）。
> 生产入口 `docker compose --profile prod up -d`（Caddy 自动 HTTPS）；健康检查 `/actuator/health`。

---

## 一、剩余风险总览（未覆盖的边缘场景）

按"还没被测试/修复兜住"的长尾排列：

| 级别 | 剩余风险 | 为什么还在 | 上线应对 |
|---|---|---|---|
| **中** | `REQUIRES_NEW` 连接占用放大 | 单房间请求峰值 2 连接；多房间同时过期强结时并发 × 2 可逼近 Hikari 默认池(10)。回归只测了功能正确性，**未压测连接峰值** | 灰度期盯 Hikari active 连接数；准备把池调到 20（见 SOP-4） |
| **中** | 测试前缀误伤真人 | 注册名恰为 `smoke_/btncheck_/shot_` 开头的真实用户，会从所有公开榜静默消失且无提示（过滤在数据层更隐蔽） | **上线前未加注册保留字**；监控"已结算对局数>0 但某榜返回 0 条"告警兜底 |
| **中** | 过滤前缀双源漂移 | 前缀存在于 `PublicNames.TEST_PREFIXES`(Java) + 5 段 JPQL，`pr_guard.py` 不校验 JPQL 侧 | 评审 checklist 已列；新增前缀时人工核对 5 处 |
| **低** | DST 周界偏移 | `qsWeekIndex` 按真实毫秒差算天数，有夏令时的时区（美股用户）周一切换点偏移 1 小时，与擂台倒计时口径短暂不一致 | **当前部署中国时区无影响**；出海前再修 |
| **低** | 零价防御掩盖脏数据真相 | `maxWholeShares` 零价返 0 → 前端显示"买不起一手"而非"行情异常"，排查误导 | 配数据质量告警（M-4）：入库后扫 `close<=0` |
| **低** | 限流清理竞态仍可丢 1 跳 | `putIfAbsent` 兜底后极端竞态仍可能漏记一次计数（注释已声明） | 单机兜底够用；多实例部署前换 Redis |
| **低** | `pr_guard.py` 启发式误报/漏报 | 正则无法精确识别语义（rooms 的 `username===me` 安全只因不脱敏） | 定位为"告警+人工确认"，不作硬门禁 |
| **信息** | 每日一猜"开局即扣名额"UX 变化 | 误触秒退也扣次数——这是防刷的**故意**权衡 | 产品知情；客服话术准备 |

**结论**：无高危残留；中危 3 条均有监控兜底，上线可行，灰度期重点验证连接池峰值。

---

## 二、上线后 5 分钟冒烟测试清单（可直接执行）

> 目标：5 分钟内确认核心链路与本轮修复点未崩。`$BASE` = 生产地址。
> 纯只读 + 一次性游客写，不污染真实数据（游客行会被限频，不入高价值榜）。

```bash
BASE=https://your-domain        # 改成生产地址
fail() { echo "✗ $1"; FAILED=1; }

# 1) 健康检查 (容器编排也看这个)
curl -fs $BASE/actuator/health | grep -q '"status":"UP"' || fail "health 非 UP"

# 2) 四个公开榜能取 (本轮改了取数逻辑, 最可能回归)
curl -fs "$BASE/api/leaderboard" | grep -q '^\[' || fail "收益榜"
curl -fs "$BASE/api/leaderboard?sort=sharpe" | grep -q '^\[' || fail "夏普榜"
curl -fs "$BASE/api/leaderboard/points" | grep -q '^\[' || fail "积分榜"
curl -fs "$BASE/api/backtest/leaderboard" | grep -q '^\[' || fail "竞技场榜"

# 3) 脱敏生效 + 测试账号隔离 (本轮 P1): 榜上不应出现 smoke_/未脱敏邮箱
BOARD=$(curl -fs "$BASE/api/backtest/leaderboard")
echo "$BOARD" | grep -Eq 'smoke_|btncheck_|shot_' && fail "测试账号仍在榜"
# 未脱敏邮箱 = 含 @ 但不含 *** (脱敏后形如 cl***@163.com, 必须排除掉再判)
echo "$BOARD" | grep -oE '"username":"[^"]*@[^"]*"' | grep -vq '\*\*\*' && fail "邮箱未脱敏上榜"

# 4) 行情只读接口 (对局/回测依赖)
curl -fs "$BASE/api/backtest/stocks" | grep -q '^\[' || fail "股票列表"

# 5) 游客开局→结算全链路 (核心玩法, 验证事务/撮合未崩)
SID=$(curl -fs -X POST "$BASE/api/game/start" -H 'Content-Type: application/json' \
      -d '{"username":"smoke_golive","aiLevel":"EASY"}' | grep -o '"sessionId":[0-9]*' | cut -d: -f2)
[ -n "$SID" ] || fail "开局"
curl -fs -X POST "$BASE/api/game/$SID/settle" -H 'Content-Type: application/json' -d '{}' \
      | grep -q '"returnRate"' || fail "结算"

# 6) 受保护接口对游客 401 (AuthFilter 未误伤)
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/daily/today")
[ "$code" = "401" ] || fail "每日接口未返 401 (实为 $code)"

[ -z "$FAILED" ] && echo "✅ 冒烟全过" || echo "❌ 有失败项, 评估回滚"
```

> 前端层：浏览器开 `$BASE`，过登录门禁 → 对局页能开局、研究所能跑一个实验、擂台榜能加载
> （肉眼确认无裸 `Failed to fetch` / `NaN%` / `undefined`）。本地已有 `npm run smoke`/`crawl` 覆盖，
> 生产只做一次人工巡检即可。

---

## 三、灰度发布方案 & 回滚阈值

**部署形态提醒**：本项目是**单实例 compose 构建部署**，没有原生金丝雀/分批能力。灰度靠"**先小时段观察 + 可秒回滚**"实现，而非流量切分。

### 灰度步骤
1. **预发验证**：用生产库的**只读副本**或独立预发库跑完第二节冒烟 + `mvn -B test`(84) 全绿。
2. **低峰上线**：选当日最低峰时段 `docker compose --profile prod up -d --build` 滚动重建后端。
   - `start_period: 60s` + healthcheck 保证容器 UP 前不接流量。
3. **观察窗口**：
   - **前 10 分钟**：盯健康检查 + 5xx 比率 + 第四节关键字，冒烟脚本每 2 分钟跑一次。
   - **前 2 小时**：盯 Hikari 连接峰值、`/api/rooms/*` 与 `/api/daily/start` 的 500 率、LLM 配额。
   - **24 小时**：观察跨零点（每日一猜落库时机修复）与房间到期强结（`settleIsolated`）首次真实触发。

### 自动回滚触发条件（命中任一即回滚）
| 指标 | 阈值 | 对应风险 |
|---|---|---|
| `/actuator/health` 非 UP | 连续 3 次探活失败（45s） | 服务崩 |
| 整体 5xx 比率 | > 2%（持续 5 分钟） | 普遍回归 |
| `/api/rooms/*` 500 | 出现 ≥1 次 `UnexpectedRollbackException` | R3 事务隔离遗漏 |
| `/api/daily/start` 或 `/api/auth/register` 500 | > 0.5%（5 分钟） | 并发修复不全 |
| Hikari active 连接 | 持续触顶池上限且有 `connection timeout` | REQUIRES_NEW 占用放大 |
| 冒烟脚本 | 任一核心链路失败 | 核心功能坏 |

---

## 四、重点监控指标与告警关键字

> 现状：仅 `/actuator/health` + 文件日志，无 APM。以**日志关键字告警**为主（grep/日志平台）。

**日志关键字（出现即告警）**
- `UnexpectedRollbackException` / `rollback-only` —— R3 房间事务隔离的哨兵，**阈值 >0**。
- `Deadlock found when trying to get lock` —— 并发死锁（本轮修的 daily，及其他潜在路径）。
- `Communications link failure` / `Connection is not available` —— DB 连接/池耗尽（REQUIRES_NEW 占用放大预警）。
- `[room] 成员对局 .* 强制结算失败` —— 已埋的 warn（M-2），按频次看是否异常升高。
- `ArithmeticException` —— 除零防御的遗漏路径。
- `服务器内部错误` + 对应 request path —— 兜底 500 文案，定位未转业务异常的点。

**业务指标（定时探活脚本）**
- **榜单空窗哨兵**：已结算对局数 > 0 但某公开榜返回 0 条 → 直接捕获"过滤误杀全部"事故（M-3）。
- **5xx 比率按 path 聚合**：重点 `/api/rooms/*`、`/api/auth/register`、`/api/daily/start`（本轮刚从 500 改 400 的三条，残余 500 即回归）。
- **LLM 日配额**：`advisor.daily-limit`（默认 300）接近耗尽时预警，防被刷爆成本。
- **数据质量**：管道入库后 `SELECT COUNT(*) FROM daily_price WHERE close<=0` > 0 告警（零价防御触发=上游脏数据）。
- **Hikari 连接池**：active/idle/pending，峰值逼近上限即预警。

---

## 五、故障应急 SOP（回滚步骤）

> 核心原则：**本项目回滚靠 git 重建，不是切镜像 tag**。上线前先记下当前运行版本的上一个稳定 commit。

### SOP-0 上线前准备（必做）
```bash
git log --oneline -3                  # 记下本轮前的稳定点 (= 2ff23ab, 本轮改动前)
echo "ROLLBACK_TO=2ff23ab" >> deploy.env   # 写下回滚目标, 别临场翻 log
```

### SOP-1 快速回滚（代码回归，最常用）
```bash
# 1. 回退到上一个稳定 commit (不改历史, 用 revert 或 checkout 重建)
git checkout 2ff23ab          # 或: git revert 4f1d279 d7d505e  (保留历史)
# 2. 滚动重建后端 (healthcheck 保证 UP 前不接流量)
docker compose --profile prod up -d --build backend
# 3. 等健康检查转 UP
until curl -fs localhost:8080/actuator/health | grep -q UP; do sleep 3; done
# 4. 跑冒烟 (第二节) 确认回滚后链路正常
```
**预计耗时**：镜像重建 2–4 分钟 + 健康检查 ≤1 分钟。

### SOP-2 仅房间页 500（R3 遗漏，不想全回滚）
```bash
# 房间强结是惰性触发: 临时把正在 500 的房间置为 SETTLED 止血, 不等回滚
mysql -uroot -p$QUANTSIM_DB_PASSWORD quantsim \
  -e "UPDATE rooms SET status='SETTLED' WHERE status='OPEN' AND expires_at < NOW();"
# 再按 SOP-1 回滚代码
```

### SOP-3 DB 连接耗尽（REQUIRES_NEW 占用放大）
```bash
# 临时扩池, 不回滚代码 (application.yml 或环境变量覆盖)
# 在 docker-compose 的 backend.environment 加:
#   SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: "20"
docker compose --profile prod up -d backend
```

### SOP-4 测试账号误伤真人（真实用户名撞前缀被隐身）
```bash
# 临时措施: 该用户改名; 或从 PublicNames.TEST_PREFIXES + 5 段 JPQL 临时移除误伤的前缀后重建
# 根治: 注册入口加前缀保留字 (已列入 bug-knowledge-base 待办)
```

### SOP-5 数据污染回滚（历史测试数据入了库）
```bash
# 过滤只是不展示, 数据仍在。确认影响后清理 (先备份):
mysqldump -uroot -p$QUANTSIM_DB_PASSWORD quantsim > backup_$(date +%s).sql
mysql -uroot -p$QUANTSIM_DB_PASSWORD quantsim -e \
  "DELETE FROM game_sessions WHERE user_id IN (SELECT user_id FROM users WHERE username LIKE 'smoke\_%' ESCAPE '\\\\');"
```

### 回滚后动作
1. 冒烟脚本（第二节）全过才算回滚成功。
2. 在 `issue_recode/1.md` 记录故障现象、根因、回滚过程。
3. 复盘：对应 bug 补进 `pr_guard.py` 规则或回归用例，防再次引入。

---

**一句话验收结论**：本轮无高危残留，中危有监控兜底，可灰度上线；**上线期重点盯 Hikari 连接峰值与
`UnexpectedRollbackException`/`Deadlock` 两个关键字，回滚靠 git 重建（预置 `ROLLBACK_TO=2ff23ab`）。**
