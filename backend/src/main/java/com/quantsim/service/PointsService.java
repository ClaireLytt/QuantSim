package com.quantsim.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.entity.PointsLedger;
import com.quantsim.entity.UserPoints;
import com.quantsim.exception.BusinessException;
import com.quantsim.repository.PointsLedgerRepository;
import com.quantsim.repository.UserPointsRepository;

import lombok.RequiredArgsConstructor;

/**
 * 积分系统 (服务端权威): 签到/结算/连胜/每日任务攒分, 转盘与商城消费,
 * 道具计数在服务端扣减 —— 前端只做展示, 改本地存档刷不了分。
 * 规则: 签到+10 / 结算基础分当日前 3 局 50、之后 10 / 胜AI+30 / 赢基准+20 /
 * 连胜加成 10×min(N,5) (N≥2) / 每日任务: 首局结算+30, 首次回测+20, 每日挑战+40。
 * 所有余额变动经 {@link #credit} 记入 points_ledger 流水 (守恒审计 + 大额兑换资格)。
 */
@Service
@RequiredArgsConstructor
public class PointsService {

    // 盲盒返利区间 [MIN, MIN+SPAN-1]: 期望值必须低于售价 (曾因 100~1000 配 500 售价
    // 成为正期望印钞机, 见 2026-10 策略单一化审计 A1); PointsEconomyTest 钉死 EV < 价格
    static final int BLINDBOX_MIN = 50;
    static final int BLINDBOX_SPAN = 751; // 返利 50~800, EV=425 < 500

    /** 连胜加成封顶 (10×min(N,CAP)): 无上限时连胜是无界积分放大器 (审计 A6) */
    static final int STREAK_CAP = 5;

    /** 结算基础分: 当日前 N 局全额, 之后衰减 (基础分无日顶可被刷局脚本白拿, 审计创意3) */
    static final int SETTLE_FULL_GAMES_PER_DAY = 3;
    static final int SETTLE_BASE = 50;
    static final int SETTLE_BASE_DECAYED = 10;

    /** 大额兑换门槛: 达到该价的奖品要求非盲盒净收入 ≥ 奖品价 (流水表口径) */
    static final int BIG_TICKET_THRESHOLD = 4800;

    /** 自选限笔补偿: 开局自限 ≤10 笔的局结算 +15 —— 限制无补偿时"从不勾选限笔"是支配选择
     *  (审计创意21)。每日挑战的限笔是规则强加, 不计此加成。 */
    static final int SELF_LIMIT_MAX_TRADES = 10;
    static final int SELF_LIMIT_BONUS = 15;

    /** 商城目录: 奖品 id -> 积分价。实物类为虚拟演示, 道具类入账道具计数。 */
    private static final Map<String, Integer> CATALOG = Map.ofEntries(
            Map.entry("blindbox", 500), Map.entry("coffee", 800),
            Map.entry("credit10", 1000), Map.entry("video", 1500),
            Map.entry("credit50", 4800), Map.entry("earbuds", 8000),
            Map.entry("watch", 20000), Map.entry("iphone", 100000),
            Map.entry("peek", 300), Map.entry("undo", 400), Map.entry("fast", 200),
            // 重生逆袭礼包: 纯扣分的单局增益 (效果在前端单局内生效, 不入道具计数)
            Map.entry("rb_fund", 300), Map.entry("rb_year", 200), Map.entry("rb_eye", 150));

    /** 转盘奖池: [kind, value] (pts=积分数, item=道具名) */
    private static final List<String[]> WHEEL = List.of(
            new String[] {"pts", "20"}, new String[] {"item", "peek"},
            new String[] {"pts", "50"}, new String[] {"item", "undo"},
            new String[] {"pts", "100"}, new String[] {"item", "fast"},
            new String[] {"pts", "200"}, new String[] {"pts", "30"});

    private final UserPointsRepository repository;
    private final PointsLedgerRepository ledgerRepository;

    /** 余额变动的唯一入口: 改余额 + 记流水 (delta=0 不记)。 */
    private void credit(UserPoints p, int delta, String reason) {
        if (delta == 0) {
            return;
        }
        p.setBalance(p.getBalance() + delta);
        PointsLedger entry = new PointsLedger();
        entry.setUserId(p.getUserId());
        entry.setDelta(delta);
        entry.setReason(reason);
        ledgerRepository.save(entry);
    }

    /** 跨零点滚动每日状态: 任务位与结算局数一起归零 (两者共用 taskDate)。 */
    private void touchDay(UserPoints p) {
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        if (!today.equals(p.getTaskDate())) {
            p.setTaskDate(today);
            p.setTaskFlags(0);
            p.setSettleCount(0);
        }
    }

    public record PointsState(int balance, int peek, int undo, int fast, int winStreak,
                              boolean signedToday, boolean spunToday, int taskFlags,
                              int signInStreak) {}

    public record SpinResult(String kind, String value, int wheelIndex, PointsState state) {}

    public record SettleAward(int earned, int winStreak) {}

    private UserPoints getOrCreate(Long userId) {
        // 首插探测必须用无锁读: SELECT ... FOR UPDATE 对不存在的行会拿 gap 锁,
        // 两个并发首登各持 gap 锁再 INSERT 会互相死锁 (冒烟日志实测)。
        // 流程: 无锁探测 -> INSERT IGNORE (撞主键静默跳过, 不污染事务) -> 加锁重读。
        if (repository.findById(userId).isEmpty()) {
            repository.insertIgnore(userId);
        }
        return repository.findWithLockByUserId(userId).orElseThrow();
    }

    private PointsState toState(UserPoints p) {
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        int flags = today.equals(p.getTaskDate()) ? p.getTaskFlags() : 0;
        return new PointsState(p.getBalance(), p.getItemPeek(), p.getItemUndo(), p.getItemFast(),
                p.getWinStreak(), today.equals(p.getLastSignIn()), today.equals(p.getLastSpin()), flags,
                p.getSignInStreak());
    }

    @Transactional
    public PointsState state(Long userId) {
        return toState(getOrCreate(userId));
    }

    /** 每日签到 +10 (幂等: 当天重复调用不重复加分)。 */
    @Transactional
    public PointsState signIn(Long userId) {
        UserPoints p = getOrCreate(userId);
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        if (!today.equals(p.getLastSignIn())) {
            // 昨日也签过则连续天数 +1, 断签 (或首签) 归 1
            p.setSignInStreak(today.minusDays(1).equals(p.getLastSignIn()) ? p.getSignInStreak() + 1 : 1);
            p.setLastSignIn(today);
            credit(p, 10, "signin");
        }
        return toState(repository.save(p));
    }

    /** 幸运转盘: 每日一次, 服务端随机 (防前端自选奖品)。 */
    @Transactional
    public SpinResult spin(Long userId) {
        UserPoints p = getOrCreate(userId);
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        if (today.equals(p.getLastSpin())) {
            throw new BusinessException("今天已经转过了, 明天再来");
        }
        p.setLastSpin(today);
        int idx = ThreadLocalRandom.current().nextInt(WHEEL.size());
        String[] prize = WHEEL.get(idx);
        if ("pts".equals(prize[0])) {
            credit(p, Integer.parseInt(prize[1]), "spin");
        } else {
            addItem(p, prize[1], 1);
        }
        return new SpinResult(prize[0], prize[1], idx, toState(repository.save(p)));
    }

    /** 商城兑换: 道具入计数, 实物为虚拟演示只扣分; 盲盒随机返 50~800 分 (负期望)。 */
    @Transactional
    public Map<String, Object> redeem(Long userId, String itemId) {
        Integer cost = CATALOG.get(itemId);
        if (cost == null) {
            throw new BusinessException("未知奖品: " + itemId);
        }
        UserPoints p = getOrCreate(userId);
        if (p.getBalance() < cost) {
            throw new BusinessException("积分不够, 再玩几局攒一攒");
        }
        // 大额兑换资格: 非盲盒净收入 ≥ 奖品价 (防任何经济漏洞被套现成高价奖品)
        if (cost >= BIG_TICKET_THRESHOLD && ledgerRepository.earnedExcludingBlindbox(userId) < cost) {
            throw new BusinessException("大额奖品需要用对局/任务攒下的积分兑换（盲盒返利不计入）");
        }
        credit(p, -cost, "redeem:" + itemId);
        int blindboxWin = 0;
        if ("blindbox".equals(itemId)) {
            blindboxWin = BLINDBOX_MIN + ThreadLocalRandom.current().nextInt(BLINDBOX_SPAN);
            credit(p, blindboxWin, "blindbox");
        } else if (CATALOG.containsKey(itemId) && isItem(itemId)) {
            addItem(p, itemId, 1);
        }
        return Map.of("blindboxWin", blindboxWin, "state", toState(repository.save(p)));
    }

    private boolean isItem(String id) {
        return "peek".equals(id) || "undo".equals(id) || "fast".equals(id);
    }

    private void addItem(UserPoints p, String kind, int n) {
        switch (kind) {
            case "peek" -> p.setItemPeek(p.getItemPeek() + n);
            case "undo" -> p.setItemUndo(p.getItemUndo() + n);
            case "fast" -> p.setItemFast(p.getItemFast() + n);
            default -> throw new BusinessException("未知道具: " + kind);
        }
    }

    /** 道具消耗 (peek/undo 由对局端点内部调用, fast 由前端显式调用)。 */
    @Transactional
    public PointsState consumeItem(Long userId, String kind) {
        UserPoints p = getOrCreate(userId);
        int left = switch (kind) {
            case "peek" -> p.getItemPeek();
            case "undo" -> p.getItemUndo();
            case "fast" -> p.getItemFast();
            default -> throw new BusinessException("未知道具: " + kind);
        };
        if (left <= 0) {
            throw new BusinessException("道具不足: 去积分商城兑换或转盘碰碰运气");
        }
        addItem(p, kind, -1);
        return toState(repository.save(p));
    }

    /** 兼容入口: 无自选限笔加成。 */
    @Transactional
    public SettleAward awardSettle(Long userId, boolean beatAi, boolean beatHold, boolean isDaily) {
        return awardSettle(userId, beatAi, beatHold, isDaily, false);
    }

    /** 结算入账: 基础 (当日前 3 局全额, 之后衰减) + 战胜加成 + 连胜加成 (封顶)
     *  + 自选限笔补偿 + 每日任务位。 */
    @Transactional
    public SettleAward awardSettle(Long userId, boolean beatAi, boolean beatHold, boolean isDaily,
                                   boolean selfLimited) {
        UserPoints p = getOrCreate(userId);
        touchDay(p);
        int earned = p.getSettleCount() < SETTLE_FULL_GAMES_PER_DAY ? SETTLE_BASE : SETTLE_BASE_DECAYED;
        p.setSettleCount(p.getSettleCount() + 1);
        if (beatAi) {
            earned += 30;
        }
        if (beatHold) {
            earned += 20;
        }
        p.setWinStreak(beatAi ? p.getWinStreak() + 1 : 0);
        if (p.getWinStreak() >= 2) {
            earned += 10 * Math.min(p.getWinStreak(), STREAK_CAP);
        }
        if (selfLimited) {
            earned += SELF_LIMIT_BONUS;
        }
        earned += claimTask(p, UserPoints.TASK_SETTLE, 30);
        if (isDaily) {
            earned += claimTask(p, UserPoints.TASK_DAILY, 40);
        }
        credit(p, earned, "settle");
        repository.save(p);
        return new SettleAward(earned, p.getWinStreak());
    }

    /** 重生逆袭「天命达成」+40 (每日首次)。对局在前端运行无法服务端复核,
     *  用任务位把上限封死在每日 40 分, 刷分收益与签到同级, 无套利空间。 */
    @Transactional
    public int awardReborn(Long userId) {
        UserPoints p = getOrCreate(userId);
        int earned = claimTask(p, UserPoints.TASK_REBORN, 40);
        credit(p, earned, "reborn");
        repository.save(p);
        return earned;
    }

    /** 今日任务宝箱 +30 (每日首次)。三项子任务里"完成 1 局结算"服务端可复核:
     *  结算时会点亮 TASK_SETTLE 位, 没点亮直接拒 —— 裸 POST 刷宝箱至少得真打一局。
     *  (猜涨跌在前端运行无法复核, 仍靠任务位封顶。) */
    @Transactional
    public int awardChest(Long userId) {
        UserPoints p = getOrCreate(userId);
        LocalDate today = LocalDate.now(GameService.GAME_ZONE);
        boolean settledToday = today.equals(p.getTaskDate()) && (p.getTaskFlags() & UserPoints.TASK_SETTLE) != 0;
        if (!settledToday) {
            throw new BusinessException("今日任务还没完成: 先结算一局再来开宝箱");
        }
        int earned = claimTask(p, UserPoints.TASK_CHEST, 30);
        credit(p, earned, "chest");
        repository.save(p);
        return earned;
    }

    /** 学堂通关奖励: 名场面首通 / 悬案首破各 +40 (每日各一次)。
     *  关卡在前端运行无法服务端复核, 与 awardReborn 同理用任务位封顶, 无刷分空间。 */
    @Transactional
    public int awardAcademy(Long userId, String kind) {
        int flag = switch (kind == null ? "" : kind) {
            case "famous" -> UserPoints.TASK_FAMOUS;
            case "case" -> UserPoints.TASK_CASE;
            default -> throw new BusinessException("未知学堂奖励类型: " + kind + "（可选 famous / case）");
        };
        UserPoints p = getOrCreate(userId);
        int earned = claimTask(p, flag, 40);
        credit(p, earned, "academy");
        repository.save(p);
        return earned;
    }

    /** 每日任务「跑一次回测」+20 (首次)。 */
    @Transactional
    public void awardBacktest(Long userId) {
        UserPoints p = getOrCreate(userId);
        int earned = claimTask(p, UserPoints.TASK_BACKTEST, 20);
        credit(p, earned, "backtest");
        repository.save(p);
    }

    /** 领当日任务位: 已领返回 0, 未领置位并返回奖励分。 */
    private int claimTask(UserPoints p, int flag, int reward) {
        touchDay(p);
        if ((p.getTaskFlags() & flag) != 0) {
            return 0;
        }
        p.setTaskFlags(p.getTaskFlags() | flag);
        return reward;
    }

    /** 积分榜 TOP N: [username, balance]。 */
    @Transactional(readOnly = true)
    public List<Object[]> board(int limit) {
        return repository.findPointsBoard(org.springframework.data.domain.PageRequest.of(0, limit));
    }
}
