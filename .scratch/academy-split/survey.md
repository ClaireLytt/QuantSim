# academy.js 拆分普查（Ticket 01 交付物，2026-10-24）

## 文件形态
- academy.js 为顶层脚本（无 IIFE 包裹，见文件头 1–2 行），顶层 const/function 进共享全局词法环境——与 app.js 拆分（4269ad1）同款搬移语义。

## 节边界（行号 = 拆分时点快照）
- K线猜涨跌 + 行情引擎：1160–1495（1496 起是「段位/成就渲染」）
- 富豪场：1958–2082（1958 节头注释自述「共用均衡引擎」）
- 期权入门沙盒：2083–2144（**自包裹 IIFE**，仅用 $ / t / cssVar，零跨节符号）
- 事件联动（学院本体）：2145–2229（含尾部 init 调用）

## 关键发现：猜涨跌 ↔ 富豪场 双向强耦合
- 正向：makeGuess 内直接调 richStakeOk（1417）、settleRichBet（1448/1463）、checkBankrupt（1473），富豪模式是 guess 状态机的一个 mode（guess.mode === "rich"）。
- 反向：startRich/exitRich/richReborn 直接改写 guess.playing/mode/score/streak（1980–2036），并调 newGuessRound/refreshGuessChart/refreshGuessStats（1987–1989）。
- **裁决（按 spec 预留条款缩小范围）：两块合并为一个文件 `guessgame.js` 拆出**，不做跨文件双向依赖。原 02/04 两票的拆分对象在 02 一并完成，04 保留收尾验证职责。

## 猜涨跌/富豪场 对学院本体的依赖（均为运行时调用，load 序 academy.js → guessgame.js 即安全）
- prog（成长进度对象，读写 guessTotal/guessHit/guessRecent/bestStreak/daily/wealth/wealthBest）
- addXp（1405 等）、awardBadge（1403/1404/2031）、hasGear（1378/1438）、save→经 prog 相关函数间接
- app.js：$ / toast / t / cssVar / qsTodayStr（1167 `const todayStr = qsTodayStr`）
- 学院反向引用 guess 的只有两类（均非 load 期阻断）：
  - 成就/装备 check 读 prog.bestStreak / prog.guessHit（167–168）——读的是共享 prog，不是 guess 符号，无需处理
  - 事件联动节与尾部 init（见下）

## 事件联动节逐行归属（监听回调内按行拆，guessgame.js 自建监听）
- qs:view 2186–2188：整个回调只有 guessChart.resize → **整体迁走**
- window resize 2190–2194：guessChart 行迁走；playChart/guideChart 行留守
- qs:theme 2196–2201：refreshGuessChart 行迁走；refreshPlay/renderGuideStep 留守
- qs:lang 2203–2221：refreshGuessStats + guess.playing 两行迁走；其余留守
- 尾部 init 2226 refreshGuessStats() → 迁到 guessgame.js 尾部
- 迁移后 academy.js 无任何 load 期对 guess 符号的引用 → 不需要 typeof 兜底

## 期权沙盒
- 2083–2144 原样搬入 `optsandbox.js`（自身就是 IIFE），零 glue。

## 切割线定稿
| 新文件 | 行区间 | 附加迁移 |
|---|---|---|
| guessgame.js | 1160–1495 + 1958–2082 | 事件联动 4 处 guess 行 + 尾部 refreshGuessStats() |
| optsandbox.js | 2083–2144 | 无 |

加载顺序：academy.js → guessgame.js → optsandbox.js（后两者互不依赖，顺序仅为可读性）。
