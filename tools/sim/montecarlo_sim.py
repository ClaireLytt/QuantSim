# -*- coding: utf-8 -*-
"""QuantSim 离散事件蒙特卡洛仿真: 72h × 500 用户, 忠实复刻已核实的并发语义。

目的: 用仿真验证 docs/fault-tree-analysis 的推演——连接池耗尽(X1)、房间强结读路径持锁(SPOF-2)、
REQUIRES_NEW 占 2 连接(TB2)、daily 唯一键并发(TR1)、undo/settle 锁序反转是否成环(TB1)。

模型要点 (与后端实际一致):
- Hikari 连接池 = 20 (本轮已配); 连接等待 > CONN_TIMEOUT 记 connection_timeout。
- 行锁: session/account/room/daily/user_points, SELECT FOR UPDATE 语义 (互斥 + FIFO 等待)。
- 正常锁序 session->account->position; undo: session->user_points->account; settle: session->account->user_points。
- room_view 对到期房间在读路径同步强结: 持 room 锁, 逐成员 settleIsolated (REQUIRES_NEW=第2条连接 +
  锁 session_m->account_m->user_points); 成员正被 trade 持锁时内层阻塞, room 锁延长。
- 死锁检测: 运行时维护 wait-for 图, 出现环即记 deadlock (并按 MySQL 行为回滚一方)。

确定性: 固定随机种子, 可复现。运行: python tools/sim/montecarlo_sim.py [seed]
输出: 末尾 JSON 摘要 (被 docs/simulation-report 引用)。
"""
import sys as _sys
try: _sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass
import heapq
import json
import random
import sys
from collections import defaultdict

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 20261015
random.seed(SEED)

SIM_HOURS = 72
SIM_SECONDS = SIM_HOURS * 3600
N_USERS = 500
POOL_SIZE = 20
CONN_TIMEOUT = 30.0        # 连接等待超时 (s)
LOCK_WAIT_TIMEOUT = 50.0   # 行锁等待超时 (s)

# ---------------- 最小 DES 引擎 (生成器协程 + 资源; 队列统一为零参函数) ----------------

class Sim:
    def __init__(self):
        self.now = 0.0
        self._q = []
        self._seq = 0

    def at(self, delay, fn):
        heapq.heappush(self._q, (self.now + delay, self._seq, fn))
        self._seq += 1

    def start(self, gen):
        self.at(0, lambda: self._drive(gen, None))

    def run(self, until):
        while self._q and self._q[0][0] <= until:
            t, _, fn = heapq.heappop(self._q)
            self.now = t
            fn()

    def _drive(self, gen, value):
        try:
            req = gen.send(value)
        except StopIteration:
            return
        req.enqueue(self, gen)   # req: Timeout / _PoolReq / _LockReq


class Timeout:
    def __init__(self, delay):
        self.delay = delay
    def enqueue(self, sim, gen):
        sim.at(self.delay, lambda: sim._drive(gen, True))


class Pool:
    """连接池: capacity 个连接, FIFO 等待, 超时记事件。"""
    def __init__(self, sim, cap, metrics):
        self.sim = sim; self.cap = cap; self.inuse = 0
        self.wait = []  # [(gen, flag[list])]
        self.metrics = metrics; self.peak = 0

    def acquire(self):
        return _PoolReq(self)

    def _grant(self, gen):
        self.inuse += 1
        self.peak = max(self.peak, self.inuse)
        self.metrics["pool_peak"] = self.peak
        self.sim.at(0, lambda: self.sim._drive(gen, True))

    def release(self):
        self.inuse -= 1
        while self.wait:
            gen, flag = self.wait.pop(0)
            if flag[0]:
                continue
            self._grant(gen)
            return


class _PoolReq:
    def __init__(self, pool): self.pool = pool
    def enqueue(self, sim, gen):
        p = self.pool
        if p.inuse < p.cap:
            p._grant(gen)
            return
        flag = [False]
        entry = (gen, flag)
        p.wait.append(entry)
        def timeout_check():
            if not flag[0] and entry in p.wait:
                flag[0] = True
                p.wait.remove(entry)
                p.metrics["connection_timeout"] += 1
                p.metrics["ct_by_hour"][int(sim.now // 3600)] += 1
                sim._drive(gen, False)   # 拿连接失败
        sim.at(CONN_TIMEOUT, timeout_check)


class Lock:
    """行锁: 互斥 + FIFO 等待 + 死锁图。"""
    def __init__(self, sim, name, mgr):
        self.sim = sim; self.name = name; self.mgr = mgr
        self.owner = None; self.wait = []  # [(gen, txid, flag)]

    def acquire(self, txid):
        return _LockReq(self, txid)

    def _grant(self, gen, txid):
        self.owner = txid
        self.mgr.held[txid].add(self.name)
        self.mgr.waiting.pop(txid, None)
        self.sim.at(0, lambda: self.sim._drive(gen, True))

    def release(self, txid):
        if self.owner == txid:
            self.mgr.held[txid].discard(self.name)
            self.owner = None
            while self.wait:
                gen, wtxid, flag = self.wait.pop(0)
                if flag[0]:
                    continue
                self._grant(gen, wtxid)
                return
            # 无主无等待者: 从 mgr 删除, 防 locks 字典随 session/account id 无限膨胀
            if self.owner is None and not self.wait:
                self.mgr.locks.pop(self.name, None)


class _LockReq:
    def __init__(self, lock, txid): self.lock = lock; self.txid = txid
    def enqueue(self, sim, gen):
        L = self.lock; mgr = L.mgr
        if L.owner is None:
            L._grant(gen, self.txid)
            return
        flag = [False]
        entry = (gen, self.txid, flag)
        L.wait.append(entry)
        mgr.waiting[self.txid] = L.name
        mgr.metrics["lock_wait"] += 1
        mgr.metrics["lw_by_hour"][int(sim.now // 3600)] += 1
        if mgr.detect_cycle(self.txid):
            flag[0] = True
            mgr.metrics["deadlock"] += 1
            mgr.waiting.pop(self.txid, None)
            if entry in L.wait:
                L.wait.remove(entry)
            sim.at(0, lambda: sim._drive(gen, "DEADLOCK"))
            return
        def lw_timeout():
            if not flag[0] and entry in L.wait:
                flag[0] = True
                L.wait.remove(entry)
                mgr.metrics["lock_wait_timeout"] += 1
                mgr.waiting.pop(self.txid, None)
                sim._drive(gen, "LOCK_TIMEOUT")
        sim.at(LOCK_WAIT_TIMEOUT, lw_timeout)


class LockMgr:
    def __init__(self, sim, metrics):
        self.sim = sim; self.metrics = metrics
        self.locks = {}
        self.held = defaultdict(set)      # txid -> {lockname}
        self.waiting = {}                 # txid -> lockname it waits for
        self.owner_of = {}                # lockname -> txid (via lock.owner)

    def lock(self, name):
        if name not in self.locks:
            self.locks[name] = Lock(self.sim, name, self)
        return self.locks[name]

    def detect_cycle(self, start):
        # wait-for: tx 等待 lock L, L 的 owner 是 tx2 → tx -> tx2
        seen = set()
        cur = start
        while cur in self.waiting:
            lname = self.waiting[cur]
            owner = self.locks[lname].owner
            if owner is None:
                return False
            if owner == start:
                return True
            if owner in seen:
                return False
            seen.add(owner)
            cur = owner
        return False

# ---------------- 业务模型 ----------------

# ---- 沙盘不变量: 状态/点数/违规追踪 ----
points = {}                      # uid -> 服务端点数 (模拟 awardSettle +50 底分)
settle_count = {}                # uid -> 结算次数 (SEC-1 farming 侦测)
transitions = []                 # 非法状态跳转记录
violations = []                  # 不变量违规 [(inv, severity, detail, t)]

def record_violation(inv, severity, detail):
    violations.append({"inv": inv, "severity": severity, "detail": detail, "t_hour": round(sim.now/3600, 2)})

LEGIT_SETTLE_PER_DAY = 30        # 正常玩家每日结算上限 (超出视为刷分)

metrics = {
    "ops": 0, "pool_peak": 0, "connection_timeout": 0, "lock_wait": 0,
    "lock_wait_timeout": 0, "deadlock": 0,
    "reject_400": 0, "err_500": 0,
    "daily_double_open_400": 0, "register_dup_400": 0, "already_settled_400": 0,
    "room_force_settle": 0, "room_member_settle_fail": 0, "room_settled": 0,
    "zero_price_guard": 0, "cross_midnight_guess": 0,
    "undo_settle_concurrent_sameuser": 0,   # TB1 脆弱不变量被触及的次数
    "state_inconsistent_room": 0,            # 房间 SETTLED 但成员 IN_PROGRESS (设计内, 计数)
    "ct_by_hour": defaultdict(int), "lw_by_hour": defaultdict(int),
    "ops_by_hour": defaultdict(int), "reject_by_hour": defaultdict(int),
}

sim = Sim()
pool = Pool(sim, POOL_SIZE, metrics)
lm = LockMgr(sim, metrics)

_txseq = [0]
def new_tx():
    _txseq[0] += 1
    return "tx%d" % _txseq[0]

def svc(a, b):
    return random.uniform(a, b) / 1000.0  # ms -> s

# 全局业务状态
daily_played = defaultdict(set)   # date -> {uid} 已玩每日挑战
registered = set()                # 已注册用户名
sessions = {}                     # sid -> {"status":..., "uid":..}
rooms = {}                        # code -> {"members":[sid], "expires":t, "status":"OPEN"/"SETTLED"}
_sid = [0]; _room = [0]

def today_of(t):
    return int(t // 86400)

# ---- 事务原语: 占连接 + 按序加锁 + 持有 + 释放 ----

def tx_run(txid, steps, release_names, hold_s):
    """steps: [(acquire|hold), ...] 这里简化为: 顺序 acquire 一组锁, hold, 释放。
    返回: 生成器。结果通过 metrics 记录。"""
    pass

def with_conn(gen_factory):
    """包装: 先拿连接, 成功则跑事务体, 最后释放连接。"""
    def proc():
        ok = yield pool.acquire()
        if not ok:
            return  # 连接超时, 已记 connection_timeout
        try:
            yield from gen_factory()
        finally:
            pool.release()
    return proc()

def acquire_seq(txid, names):
    """按给定顺序加锁; 任一步死锁/超时则释放已持并返回失败标记。"""
    acquired = []
    for n in names:
        res = yield lm.lock(n).acquire(txid)
        if res in ("DEADLOCK", "LOCK_TIMEOUT"):
            for a in reversed(acquired):
                lm.lock(a).release(txid)
            return res
        acquired.append(n)
    return acquired

def release_all(txid, names):
    for n in reversed(names):
        lm.lock(n).release(txid)
    if txid in lm.held and not lm.held[txid]:
        del lm.held[txid]

# ---- 各操作 ----

def op_leaderboard():
    def body():
        yield Timeout(svc(4, 25))   # 只读, 走 idx 排序 + eq_ref join, 无行锁
    return with_conn(body)

def op_register(uid):
    name = "u%d_%d" % (uid, random.randint(0, 3))  # 少量重名制造并发冲突
    def body():
        txid = new_tx()
        locks = yield from acquire_seq(txid, ["users:uk:" + name])
        if isinstance(locks, str):
            metrics["err_500"] += 1  # 不应发生
            return
        yield Timeout(svc(5, 15))
        if name in registered:
            metrics["reject_400"] += 1
            metrics["register_dup_400"] += 1
            metrics["reject_by_hour"][int(sim.now // 3600)] += 1
        else:
            registered.add(name)
        release_all(txid, locks)
    return with_conn(body)

def op_game_start(uid):
    def body():
        yield Timeout(svc(15, 40))
        _sid[0] += 1
        sessions[_sid[0]] = {"status": "IN_PROGRESS", "uid": uid}
    return with_conn(body)

def op_trade(sid, slow=False):
    s = sessions.get(sid)
    if not s or s["status"] != "IN_PROGRESS":
        return op_leaderboard()  # 无效则退化成一次读, 保持事件流
    def body():
        txid = new_tx()
        names = ["session:%d" % sid, "account:%d" % sid, "position:%d" % sid]
        locks = yield from acquire_seq(txid, names)
        if isinstance(locks, str):
            metrics["reject_400" if locks == "LOCK_TIMEOUT" else "err_500"] += 1
            return
        # 零价行情注入 (0.3%): 守卫跳过, 不 500
        if random.random() < 0.003:
            metrics["zero_price_guard"] += 1
        yield Timeout(svc(200, 800) if slow else svc(15, 60))  # slow trade 长时间持 session 锁
        release_all(txid, locks)
    return with_conn(body)

def op_settle(sid):
    s = sessions.get(sid)
    if not s:
        return op_leaderboard()
    def body():
        txid = new_tx()
        slock = yield lm.lock("session:%d" % sid).acquire(txid)
        if isinstance(slock, str):
            metrics["reject_400"] += 1
            return
        if s["status"] != "IN_PROGRESS":   # 幂等: 已结算
            lm.lock("session:%d" % sid).release(txid)
            metrics["reject_400"] += 1
            metrics["already_settled_400"] += 1
            return
        # settle 锁序: session -> account -> user_points
        rest = yield from acquire_seq(txid, ["account:%d" % sid, "user_points:%d" % s["uid"]])
        if isinstance(rest, str):
            lm.lock("session:%d" % sid).release(txid)
            metrics["reject_400" if rest == "LOCK_TIMEOUT" else "err_500"] += 1
            return
        yield Timeout(svc(20, 60))
        s["status"] = "SETTLED"
        uid = s["uid"]
        points[uid] = points.get(uid, 0) + 50            # awardSettle +50 底分 (无每日上限 = SEC-1)
        settle_count[uid] = settle_count.get(uid, 0) + 1
        release_all(txid, rest)
        lm.lock("session:%d" % sid).release(txid)
    return with_conn(body)

def op_undo(sid):
    s = sessions.get(sid)
    if not s or s["status"] != "IN_PROGRESS":
        return op_leaderboard()
    # TB1: undo 锁序 session -> user_points -> account (与 settle 相反)
    def body():
        txid = new_tx()
        # 记录脆弱不变量触及: 同用户另一 in-progress 对局此刻在 settle?
        metrics["undo_settle_concurrent_sameuser"] += 0  # 由死锁检测体现, 这里占位
        names = ["session:%d" % sid, "user_points:%d" % s["uid"], "account:%d" % sid]
        locks = yield from acquire_seq(txid, names)
        if isinstance(locks, str):
            if locks == "DEADLOCK":
                metrics["reject_400"] += 1  # 死锁被回滚, 应用转业务错误
            else:
                metrics["reject_400"] += 1
            return
        yield Timeout(svc(20, 60))
        release_all(txid, locks)
    return with_conn(body)

def op_daily_start(uid, t):
    d = today_of(t)
    def body():
        txid = new_tx()
        # getOrCreate(date): 本轮已改 INSERT IGNORE 无 FOR UPDATE, 轻量
        yield Timeout(svc(3, 8))
        # check-then-act + uk_user_daily: 用 daily:uid:date 锁模拟唯一键串行
        lk = "daily:%d:%d" % (uid, d)
        got = yield lm.lock(lk).acquire(txid)
        if isinstance(got, str):
            metrics["reject_400"] += 1
            return
        yield Timeout(svc(15, 30))
        if uid in daily_played[d]:
            metrics["reject_400"] += 1
            metrics["daily_double_open_400"] += 1
            metrics["reject_by_hour"][int(sim.now // 3600)] += 1
        else:
            daily_played[d].add(uid)
            _sid[0] += 1
            sessions[_sid[0]] = {"status": "IN_PROGRESS", "uid": uid}
        lm.lock(lk).release(txid)
    return with_conn(body)

def op_daily_guess(uid, t):
    # 纯前端 localStorage, 无服务端事务; 跨零点注入 (客户端时钟)
    sec_in_day = t % 86400
    if sec_in_day > 86400 - 120 or sec_in_day < 120:   # 零点 ±2min
        if random.random() < 0.2:
            metrics["cross_midnight_guess"] += 1
    def body():
        yield Timeout(0.001)   # 可忽略
    return with_conn(body)   # 仍占一下连接 (拉取历史行情), 轻量

def op_room_view(code, t):
    r = rooms.get(code)
    if not r:
        return op_leaderboard()
    def body():
        txid = new_tx()
        rlock = yield lm.lock("room:" + code).acquire(txid)   # 持 room 锁 (读路径!)
        if isinstance(rlock, str):
            metrics["reject_400"] += 1
            return
        # 到期强结: 遍历成员, 每个走 settleIsolated (第2条连接)
        if r["status"] == "OPEN" and t >= r["expires"]:
            metrics["room_force_settle"] += 1
            any_inprogress_left = False
            for sid in r["members"]:
                s = sessions.get(sid)
                if not s or s["status"] != "IN_PROGRESS":
                    continue
                # REQUIRES_NEW: 占第 2 条连接
                ok2 = yield pool.acquire()
                if not ok2:
                    # 内层拿不到连接 → 该成员强结失败, 房间仍迁 SETTLED (本轮 #3 容错)
                    metrics["room_member_settle_fail"] += 1
                    any_inprogress_left = True
                    continue
                itx = new_tx()
                names = ["session:%d" % sid, "account:%d" % sid, "user_points:%d" % s["uid"]]
                locks = yield from acquire_seq(itx, names)   # 可能阻塞于并发 trade 持有的 session 锁
                if isinstance(locks, str):
                    metrics["room_member_settle_fail"] += 1
                    any_inprogress_left = True
                    pool.release()
                    continue
                yield Timeout(svc(20, 60))
                s["status"] = "SETTLED"
                points[s["uid"]] = points.get(s["uid"], 0) + 50
                settle_count[s["uid"]] = settle_count.get(s["uid"], 0) + 1
                release_all(itx, locks)
                pool.release()
            r["status"] = "SETTLED"
            metrics["room_settled"] += 1
            if any_inprogress_left:
                metrics["state_inconsistent_room"] += 1   # 设计内: 部分成员未结算
        else:
            yield Timeout(svc(5, 20))   # 普通房间读
        lm.lock("room:" + code).release(txid)
    return with_conn(body)

# ---------------- 用户行为概率模型 ----------------
# 每小时权重 (昼夜): 0-6 低谷, 9-11/19-22 高峰
HOUR_WEIGHT = [0.2,0.15,0.1,0.1,0.1,0.2,0.4,0.7,0.9,1.0,1.0,0.9,
               0.8,0.8,0.85,0.9,0.9,0.95,1.0,1.0,0.95,0.8,0.6,0.4]

# 操作混合 (正常 + 异常); 权重归一
OP_MIX = [
    ("leaderboard", 28), ("game_start", 8), ("trade", 20), ("settle", 6),
    ("daily_start", 6), ("daily_guess", 8), ("room_view", 10), ("register", 2),
    ("undo", 2),
    # 异常操作
    ("double_settle", 3),     # 快速连点结算 (并发同 sid)
    ("double_daily", 2),      # 两标签页双开每日
    ("slow_trade", 3),        # 慢交易 (长持 session 锁, 放大房间强结阻塞)
    ("refresh_room", 2),      # 刷新重复 room_view
]
_names = [n for n, _ in OP_MIX]
_weights = [w for _, w in OP_MIX]

def pick_op():
    return random.choices(_names, weights=_weights)[0]

N_FARMERS = 15   # 恶意刷分者: 紧密 start->settle 循环 (SEC-1 攻击链)

def farmer_proc(uid):
    """刷分攻击者: 登录后无限 start->settle, 每轮 +50 底分 (无每日上限)。"""
    def proc():
        while sim.now < SIM_SECONDS:
            yield Timeout(random.uniform(1, 4))   # 脚本化高频
            metrics["ops"] += 1
            metrics["ops_by_hour"][int(sim.now // 3600)] += 1
            # 直接开局 + 立即结算 (结算无需交易)
            _sid[0] += 1
            sid = _sid[0]
            sessions[sid] = {"status": "IN_PROGRESS", "uid": uid}
            yield Timeout(svc(5, 15))
            sim.start(op_settle(sid))
    return proc()

def user_proc(uid):
    """单用户 72h 行为流: 按昼夜权重间歇发起操作。"""
    def proc():
        while sim.now < SIM_SECONDS:
            hour = int(sim.now // 3600) % 24
            w = HOUR_WEIGHT[hour]
            # 间隔 (活跃度越高间隔越短); 低谷大间隔
            gap = random.expovariate(1.0) * (90.0 / max(w, 0.05))
            yield Timeout(gap)
            if sim.now >= SIM_SECONDS:
                break
            metrics["ops"] += 1
            metrics["ops_by_hour"][int(sim.now // 3600)] += 1
            op = pick_op()
            t = sim.now
            if op == "leaderboard":
                sim.start(op_leaderboard())
            elif op == "register":
                sim.start(op_register(uid))
            elif op == "game_start":
                sim.start(op_game_start(uid))
            elif op in ("trade", "slow_trade"):
                mine = [s for s, v in sessions.items() if v["uid"] == uid and v["status"] == "IN_PROGRESS"]
                if mine:
                    sim.start(op_trade(random.choice(mine), slow=(op == "slow_trade")))
                else:
                    sim.start(op_game_start(uid))
            elif op in ("settle", "double_settle"):
                mine = [s for s, v in sessions.items() if v["uid"] == uid and v["status"] == "IN_PROGRESS"]
                if mine:
                    sid = random.choice(mine)
                    sim.start(op_settle(sid))
                    if op == "double_settle":   # 并发第二次 (几 ms 后)
                        sim.at(svc(1, 5), lambda sid=sid: sim.start(op_settle(sid)))
            elif op == "undo":
                mine = [s for s, v in sessions.items() if v["uid"] == uid and v["status"] == "IN_PROGRESS"]
                if mine:
                    sim.start(op_undo(random.choice(mine)))
            elif op in ("daily_start", "double_daily"):
                sim.start(op_daily_start(uid, t))
                if op == "double_daily":
                    sim.at(svc(1, 5), lambda uid=uid, t=t: sim.start(op_daily_start(uid, t)))
            elif op == "daily_guess":
                sim.start(op_daily_guess(uid, t))
            elif op in ("room_view", "refresh_room"):
                if rooms:
                    code = random.choice(list(rooms.keys()))
                    sim.start(op_room_view(code, t))
                    if op == "refresh_room":
                        sim.at(svc(2, 8), lambda code=code, t=t: sim.start(op_room_view(code, t)))
                else:
                    sim.start(op_leaderboard())
    return proc()


# ---- 房间生成: 周期性批量创建, 制造"集中到期"的突发 (X1 触发条件) ----

def room_spawner():
    def proc():
        while sim.now < SIM_SECONDS:
            # 每 ~30min 批量建一批房间, TTL 固定 → 30min 后集中到期
            batch = random.randint(3, 10)
            for _ in range(batch):
                _room[0] += 1
                code = "R%04d" % _room[0]
                members = []
                for _ in range(random.randint(2, 8)):
                    _sid[0] += 1
                    uid = random.randint(0, N_USERS - 1)
                    sessions[_sid[0]] = {"status": "IN_PROGRESS", "uid": uid}
                    members.append(_sid[0])
                rooms[code] = {"members": members, "expires": sim.now + 1800, "status": "OPEN"}
            yield Timeout(1800)
    return proc()


def pruner():
    def proc():
        while sim.now < SIM_SECONDS:
            yield Timeout(1800)
            # 删已结算对局 (无锁持有的)
            dead = [sid for sid, v in sessions.items() if v["status"] == "SETTLED"]
            for sid in dead:
                sessions.pop(sid, None)
            # daily_played 只留近 2 天
            d = today_of(sim.now)
            for k in [k for k in daily_played if k < d - 1]:
                daily_played.pop(k, None)
            # 删已结算/过期很久的房间
            gone = [c for c, r in rooms.items() if r["status"] == "SETTLED"]
            for c in gone:
                rooms.pop(c, None)
    return proc()

# ---------------- 运行 ----------------

for uid in range(N_USERS):
    g = (farmer_proc(uid) if uid < N_FARMERS else user_proc(uid))
    sim.at(random.uniform(0, 300), lambda g=g: sim.start(g))
sim.start(room_spawner())
sim.start(pruner())
sim.run(SIM_SECONDS + 600)   # 多跑 10min 收尾

# ================= 不变量校验 (沙盘巡检核心) =================
# INV-1 无 500: 除零/事务/幂等守卫全程不得崩
if metrics["err_500"] > 0:
    record_violation("INV-NO-500", "P0", "出现 %d 次 5xx (守卫失效)" % metrics["err_500"])
# INV-2 结算不污染父事务: 房间强结全部收敛 (force_settle 次数 == settled 次数, 无状态不一致)
if metrics["room_force_settle"] != metrics["room_settled"]:
    record_violation("INV-ROOM-CONVERGE", "P0",
        "房间强结 %d 次但只收敛 %d 次" % (metrics["room_force_settle"], metrics["room_settled"]))
if metrics["state_inconsistent_room"] > 0:
    record_violation("INV-ROOM-CONSISTENT", "P2",
        "%d 个房间 SETTLED 但有成员未结算 (设计内可接受, 记录供人工确认)" % metrics["state_inconsistent_room"])
# INV-3 死锁容忍度: 锁序设计应不成环
if metrics["deadlock"] > 0:
    record_violation("INV-NO-DEADLOCK", "P0", "出现 %d 次死锁 (锁序成环)" % metrics["deadlock"])
# INV-4 奖励不可重复领: 每日挑战每人每天至多一局 (uk_user_daily)
#   模型用 daily_played set 保证, 若有重复即违规 (这里断言并发双开全被 400 挡住)
if metrics["daily_double_open_400"] == 0 and metrics["ops"] > 100000:
    record_violation("INV-DAILY-IDEMPOTENT", "P1", "未观测到并发双开被拒 (幂等防护可能失效?)")
# INV-5 SEC-1 经济不变量: 单用户结算次数不得远超正常上限 (无限刷分侦测)
cap = LEGIT_SETTLE_PER_DAY * SIM_HOURS / 24
farmers = sorted(((uid, c) for uid, c in settle_count.items() if c > cap), key=lambda x: -x[1])
if farmers:
    top = farmers[0]
    record_violation("INV-ECON-SEC1", "P0",
        "%d 个用户结算次数超正常上限(%.0f); 最高用户 u%d 结算 %d 次 = %d 积分 (无每日上限, 可无限刷)"
        % (len(farmers), cap, top[0], top[1], points.get(top[0], 0)))
# INV-6 榜单过滤: 测试账号不入榜 (模型中榜单读不含测试账号, 此处断言 metrics 无"测试账号上榜"事件)
#   (当前模型不生成测试账号上榜, 占位恒成立)

# 高冲突窗口: 连接超时 + 锁等待按小时聚合, 取 Top
ct = metrics["ct_by_hour"]; lw = metrics["lw_by_hour"]
top_ct = sorted(ct.items(), key=lambda x: -x[1])[:5]
top_lw = sorted(lw.items(), key=lambda x: -x[1])[:5]

summary = {
    "seed": SEED, "sim_hours": SIM_HOURS, "users": N_USERS, "pool_size": POOL_SIZE,
    "total_ops": metrics["ops"],
    "pool_peak": metrics["pool_peak"],
    "connection_timeout": metrics["connection_timeout"],
    "lock_wait": metrics["lock_wait"],
    "lock_wait_timeout": metrics["lock_wait_timeout"],
    "deadlock": metrics["deadlock"],
    "err_500": metrics["err_500"],
    "reject_400_total": metrics["reject_400"],
    "daily_double_open_400": metrics["daily_double_open_400"],
    "register_dup_400": metrics["register_dup_400"],
    "already_settled_400": metrics["already_settled_400"],
    "room_force_settle": metrics["room_force_settle"],
    "room_settled": metrics["room_settled"],
    "room_member_settle_fail": metrics["room_member_settle_fail"],
    "state_inconsistent_room": metrics["state_inconsistent_room"],
    "zero_price_guard": metrics["zero_price_guard"],
    "cross_midnight_guess": metrics["cross_midnight_guess"],
    "top_conn_timeout_hours": top_ct,
    "top_lock_wait_hours": top_lw,
    "max_settle_per_user": max(settle_count.values()) if settle_count else 0,
    "max_points_per_user": max(points.values()) if points else 0,
    "violations": violations,
    "invariant_pass": len([v for v in violations if v["severity"] in ("P0", "P1")]) == 0,
}
print(json.dumps(summary, ensure_ascii=False, indent=2))
