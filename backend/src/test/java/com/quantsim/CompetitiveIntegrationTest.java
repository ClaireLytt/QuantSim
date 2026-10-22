package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.Market;
import com.quantsim.entity.Room;
import com.quantsim.entity.Stock;

/**
 * 竞技层集成测试: 每日挑战确定性与限次 / 房间生命周期与防剧透 / 赛季筛选 / 新闻事件下发。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        // 断言无摩擦资金数学: 现金计息同样归零 (与费用归零同理)
        "quantsim.game.guest-start-per-minute=10000",
        // 游客回测限频的回归测试用低阈值 (本类其余用例不碰 backtest, 不会互相污染窗口)
        "quantsim.game.guest-backtest-per-minute=2",
        "quantsim.game.cash-rate-annual=0",
        "quantsim.game.borrow-rate-annual=0",
        "quantsim.auth.per-minute=10000",
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class CompetitiveIntegrationTest extends IntegrationTestSupport {

    /** 均匀 K 线 + probUp=0.5 (NORMAL 模型): 竞技断言不受 AI 行为干扰。 */
    private Stock seedStock(String code, LocalDate firstDay, int days) {
        return seedFlatStock(code, "测试股" + code, Market.STOCK, firstDay, days,
                "10.00", AiLevel.NORMAL, "0.5000");
    }

    // ---------- 用例 ----------

    @Test
    void dailyChallengeIsDeterministicAndOncePerDay() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        seedStock("000002", LocalDate.of(2024, 1, 1), 12);
        String alice = register("每日甲");
        String bob = register("每日乙");

        // 未登录 401
        assertThat(get("/api/daily/today", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // 两人看到同一题目
        JsonNode a = json(get("/api/daily/today", alice));
        JsonNode b = json(get("/api/daily/today", bob));
        assertThat(a.path("stockCode").asText()).isEqualTo(b.path("stockCode").asText());
        assertThat(a.path("played").asBoolean()).isFalse();

        // 两人开局: 同股同起始日
        JsonNode startA = json(postJson("/api/daily/start", "{}", alice));
        JsonNode startB = json(postJson("/api/daily/start", "{}", bob));
        assertThat(startA.path("stockCode").asText()).isEqualTo(startB.path("stockCode").asText());
        assertThat(startA.path("startDate").asText()).isEqualTo(startB.path("startDate").asText());
        assertThat(startA.path("mode").asText()).isEqualTo("DAILY");

        // 同一人当天第二局被拒
        ResponseEntity<String> again = postJson("/api/daily/start", "{}", alice);
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // 结算后进入每日榜, 且不进经典排行榜
        long sidA = startA.path("sessionId").asLong();
        postJson("/api/game/" + sidA + "/settle", "{}", alice);
        JsonNode board = json(get("/api/daily/leaderboard", alice));
        assertThat(board).hasSize(1);
        assertThat(board.get(0).path("username").asText()).isEqualTo("每日甲");
        JsonNode classic = json(get("/api/leaderboard", null));
        assertThat(classic.findValuesAsText("username")).doesNotContain("每日甲");
    }

    @Test
    void roomLifecycleWithHiddenReturnsAndSettle() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("房主");
        String bob = register("房客");

        // 建房
        JsonNode room = json(postJson("/api/rooms", "{\"aiLevel\":\"NORMAL\"}", alice));
        String code = room.path("code").asText();
        assertThat(code).hasSize(6);
        assertThat(room.path("status").asText()).isEqualTo("OPEN");

        // 加入 + 两人开局: 同股同起始日
        json(postJson("/api/rooms/" + code + "/join", "{}", bob));
        JsonNode playA = json(postJson("/api/rooms/" + code + "/play", "{}", alice));
        JsonNode playB = json(postJson("/api/rooms/" + code + "/play", "{}", bob));
        assertThat(playA.path("stockCode").asText()).isEqualTo(playB.path("stockCode").asText());
        assertThat(playA.path("startDate").asText()).isEqualTo(playB.path("startDate").asText());
        assertThat(playA.path("mode").asText()).isEqualTo("ROOM");
        // play 幂等: 再点返回同一对局
        assertThat(json(postJson("/api/rooms/" + code + "/play", "{}", alice))
                .path("sessionId").asLong()).isEqualTo(playA.path("sessionId").asLong());

        // 甲先结算: OPEN 期间收益率隐藏
        postJson("/api/game/" + playA.path("sessionId").asLong() + "/settle", "{}", alice);
        JsonNode view = json(get("/api/rooms/" + code, alice));
        assertThat(view.path("status").asText()).isEqualTo("OPEN");
        for (JsonNode m : view.path("standings")) {
            assertThat(m.path("returnRate").isNull()).isTrue();
        }

        // 乙结算 -> 全员完成 -> SETTLED, 收益率公开
        postJson("/api/game/" + playB.path("sessionId").asLong() + "/settle", "{}", bob);
        JsonNode settled = json(get("/api/rooms/" + code, bob));
        assertThat(settled.path("status").asText()).isEqualTo("SETTLED");
        for (JsonNode m : settled.path("standings")) {
            assertThat(m.path("returnRate").isNull()).isFalse();
        }
    }

    @Test
    void expiredRoomForceSettlesMembers() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("过期房主");
        JsonNode roomJson = json(postJson("/api/rooms", "{}", alice));
        String code = roomJson.path("code").asText();
        long sid = json(postJson("/api/rooms/" + code + "/play", "{}", alice)).path("sessionId").asLong();

        // 回拨到期时间
        Room room = roomRepository.findByCode(code).orElseThrow();
        room.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        roomRepository.save(room);

        JsonNode view = json(get("/api/rooms/" + code, alice));
        assertThat(view.path("status").asText()).isEqualTo("SETTLED");
        assertThat(sessionRepository.findById(sid).orElseThrow().getStatus().name()).isEqualTo("SETTLED");
    }

    /** 回归: challenge 缺 sessionId 是调用方的错, 必须 400 业务提示而非 findById(null) 炸 500。 */
    @Test
    void challengeWithoutSessionIdIs400Not500() {
        String alice = register("缺参甲");
        ResponseEntity<String> resp = postJson("/api/rooms/challenge", "{}", alice);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
    }

    /**
     * 回归: 房间到期强结后, settleIsolated (REQUIRES_NEW) 落库的 bias_report 不能被
     * view 父事务里的旧托管实体 (biasReport 快照=null) 在提交时整行 UPDATE 抹回 NULL。
     * 症状是诊断报告静默丢失且不可恢复 —— 必须直接断言 DB 列值。
     */
    @Test
    void expiredRoomForceSettleKeepsBiasReport() {
        // 波动行情 (而非均匀价): 持仓权益曲线才有非零波动, finalSharpe 才非空可断言
        Stock stock = seedStock("000001", "测试股000001", Market.STOCK);
        LocalDate firstDay = LocalDate.of(2024, 1, 1);
        for (int i = 0; i < 12; i++) {
            savePrice(stock.getStockId(), firstDay.plusDays(i),
                    new java.math.BigDecimal("10.00").add(java.math.BigDecimal.valueOf(i % 3)));
            savePrediction(stock.getStockId(), firstDay.plusDays(i), AiLevel.NORMAL, "0.5000");
        }
        String alice = register("强结诊断");
        JsonNode roomJson = json(postJson("/api/rooms", "{}", alice));
        String code = roomJson.path("code").asText();
        long sid = json(postJson("/api/rooms/" + code + "/play", "{}", alice)).path("sessionId").asLong();
        // 产生一笔成交, 让偏差诊断有内容可落库 (空交易也会落 JSON, 但有内容更接近真实)
        JsonNode st = json(get("/api/game/" + sid + "/status", alice));
        postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":" + st.path("currentPrice").asText()
                        + ",\"shares\":100}", alice);
        // 推进 2 天但不打满 (total-ticks=3): 权益曲线 ≥3 点, 夏普才可计算; 对局仍 IN_PROGRESS 等强结
        postJson("/api/game/" + sid + "/tick", "{}", alice);
        postJson("/api/game/" + sid + "/tick", "{}", alice);

        Room room = roomRepository.findByCode(code).orElseThrow();
        room.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        roomRepository.save(room);

        json(get("/api/rooms/" + code, alice)); // 触发到期强结
        // 结算写回的四列 (SettledColumns) 都必须在父事务提交后存活, 漏回填任何一列都会被旧快照抹掉
        var settledSession = sessionRepository.findById(sid).orElseThrow();
        assertThat(settledSession.getBiasReport())
                .as("强结成员的 bias_report 必须在父事务提交后仍存活")
                .isNotNull();
        assertThat(settledSession.getStatus()).isEqualTo(com.quantsim.entity.GameSession.Status.SETTLED);
        assertThat(settledSession.getFinalReturnRate())
                .as("强结成员的 final_return_rate 必须落库").isNotNull();
        assertThat(settledSession.getFinalSharpe())
                .as("强结成员的 final_sharpe 必须落库 (12 根 K 线足够算权益曲线)").isNotNull();
    }

    /** 回归 T-06: 同一账号并发双开每日挑战, 一成一败 (400 业务提示), 绝不 500。 */
    @Test
    void concurrentDailyStartYieldsBusinessErrorNot500() throws Exception {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String me = register("并发甲");
        int threads = 4;
        var pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        var barrier = new java.util.concurrent.CyclicBarrier(threads);
        var codes = java.util.Collections.synchronizedList(new java.util.ArrayList<Integer>());
        var tasks = new java.util.ArrayList<java.util.concurrent.Future<?>>();
        for (int i = 0; i < threads; i++) {
            tasks.add(pool.submit(() -> {
                try {
                    barrier.await();
                    codes.add(postJson("/api/daily/start", "{}", me).getStatusCode().value());
                } catch (Exception e) {
                    codes.add(-1);
                }
            }));
        }
        for (var f : tasks) f.get(20, java.util.concurrent.TimeUnit.SECONDS);
        pool.shutdown();
        // 恰好一个 200, 其余 400; 不允许任何 500/-1
        assertThat(codes).filteredOn(c -> c == 200).hasSize(1);
        assertThat(codes).allMatch(c -> c == 200 || c == 400);
    }

    /** 回归 T-02/T-14: 测试账号在分页前被 JPQL 排除, 不挤占真实玩家的 TOP N 名额。 */
    @Test
    void testAccountsDoNotOccupyBoardSlots() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        // 先结算一个 smoke_ 账号 (高分在前) 再结算一个真实玩家
        long smokeSid = json(postJson("/api/game/start",
                "{\"username\":\"smoke_99999999\",\"aiLevel\":\"EASY\"}", null)).path("sessionId").asLong();
        postJson("/api/game/" + smokeSid + "/settle", "{}", null);
        long realSid = json(postJson("/api/game/start",
                "{\"username\":\"真实玩家甲\",\"aiLevel\":\"EASY\"}", null)).path("sessionId").asLong();
        postJson("/api/game/" + realSid + "/settle", "{}", null);

        JsonNode board = json(get("/api/leaderboard", null));
        // smoke_ 账号既不占名额也不展示, 真实玩家一条不少
        assertThat(board.findValuesAsText("username")).containsExactly("真实玩家甲");
    }

    /** 回归 T-04: 用户名脱敏后前端认不出自己, 后端用 isSelf 标记; 游客请求全 false。 */
    @Test
    void dailyBoardMarksSelfForMaskedUser() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String me = register("ab@qq.com"); // 邮箱形态, 会被脱敏成 ***@qq.com
        long sid = json(postJson("/api/daily/start", "{}", me)).path("sessionId").asLong();
        postJson("/api/game/" + sid + "/settle", "{}", me);

        JsonNode board = json(get("/api/daily/leaderboard", me));
        assertThat(board).hasSize(1);
        assertThat(board.get(0).path("username").asText()).isEqualTo("***@qq.com"); // 短 local 全遮
        assertThat(board.get(0).path("isSelf").asBoolean()).isTrue();
        // 第二个注册用户看同一榜: 认不出别人, isSelf=false (daily 榜受 AuthFilter 保护, 需登录)
        String other = register("旁观乙");
        JsonNode otherView = json(get("/api/daily/leaderboard", other));
        assertThat(otherView.get(0).path("isSelf").asBoolean()).isFalse();
    }

    /**
     * 回归 T-03/T-05: 房间到期强结时某成员结算失败 (行情缺失), 只回滚该成员,
     * 房间仍迁 SETTLED, 不被 UnexpectedRollbackException 污染成 500; 重入幂等。
     */
    @Test
    void expiredRoomSettlesDespiteOneMemberFailing() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("强结甲");
        String bob = register("强结乙");
        JsonNode roomJson = json(postJson("/api/rooms", "{}", alice));
        String code = roomJson.path("code").asText();
        json(postJson("/api/rooms/" + code + "/join", "{}", bob));
        long sidA = json(postJson("/api/rooms/" + code + "/play", "{}", alice)).path("sessionId").asLong();
        long sidB = json(postJson("/api/rooms/" + code + "/play", "{}", bob)).path("sessionId").asLong();

        // 破坏乙所在当前交易日之后的行情, 让它推进/结算时行情缺失; 并回拨到期
        // (简单做法: 直接删掉该股所有价格, 两人都会失败, 验证房间仍能收敛)
        priceRepository.deleteAll();
        cacheManager.getCache("stockData").clear();
        Room room = roomRepository.findByCode(code).orElseThrow();
        room.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        roomRepository.save(room);

        // 第一次 view: 不抛 500, 房间迁 SETTLED
        ResponseEntity<String> view1 = get("/api/rooms/" + code, alice);
        assertThat(view1.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(view1).path("status").asText()).isEqualTo("SETTLED");
        // 第二次 view 幂等: 仍 200 SETTLED
        ResponseEntity<String> view2 = get("/api/rooms/" + code, bob);
        assertThat(view2.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(view2).path("status").asText()).isEqualTo("SETTLED");
    }

    /**
     * 回归 (审计 P1-6): 到期强结中某成员抛出非 BusinessException (如账户行缺失的
     * NotFoundException) 时, 异常不得逃出 view 事务 —— 否则房间永远迁不到 SETTLED,
     * 每次访问 500 (bug-knowledge-base #3 的症状以另一异常类型复活)。
     */
    @Test
    void expiredRoomSettlesDespiteMemberAccountMissing() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("缺账甲");
        String bob = register("缺账乙");
        String code = json(postJson("/api/rooms", "{}", alice)).path("code").asText();
        json(postJson("/api/rooms/" + code + "/join", "{}", bob));
        postJson("/api/rooms/" + code + "/play", "{}", alice);
        long sidB = json(postJson("/api/rooms/" + code + "/play", "{}", bob)).path("sessionId").asLong();

        // 删掉乙的账户行: 强结乙时 doSettle 抛 NotFoundException("账户不存在")
        accountRepository.findBySessionId(sidB).ifPresent(accountRepository::delete);
        Room room = roomRepository.findByCode(code).orElseThrow();
        room.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        roomRepository.save(room);

        // 不抛 500, 房间迁 SETTLED; 重入幂等
        ResponseEntity<String> view1 = get("/api/rooms/" + code, alice);
        assertThat(view1.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(view1).path("status").asText()).isEqualTo("SETTLED");
        ResponseEntity<String> view2 = get("/api/rooms/" + code, bob);
        assertThat(view2.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json(view2).path("status").asText()).isEqualTo("SETTLED");
    }

    /**
     * 回归 (审计 P1-8): 游客正式回测会 findOrCreate users 行并写公开擂台榜,
     * 必须与游客开局同款按 IP 限频 (教训 #10 修复时漏掉的入口); preview 不受限。
     */
    @Test
    void guestBacktestRunIsRateLimited() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String body = "{\"username\":\"游客刷库\",\"stockCode\":\"000001\",\"strategy\":\"BUY_HOLD\"}";
        // 限频阈值 2 (见类头 properties): 第 3 次正式回测被拒
        postJson("/api/backtest/run", body, null);
        postJson("/api/backtest/run", body, null);
        ResponseEntity<String> third = postJson("/api/backtest/run", body, null);
        assertThat(third.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(third).path("message").asText()).contains("频繁");
        // preview 只算不落库, 不占游客限频额度
        String preview = "{\"username\":\"游客刷库\",\"stockCode\":\"000001\",\"strategy\":\"BUY_HOLD\",\"preview\":true}";
        assertThat(json(postJson("/api/backtest/run", preview, null)).path("message").asText())
                .doesNotContain("频繁");
    }

    @Test
    void seasonFilterOnLeaderboard() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        ResponseEntity<String> start = postJson("/api/game/start",
                "{\"username\":\"赛季玩家\",\"aiLevel\":\"EASY\"}", null);
        long sid = json(start).path("sessionId").asLong();
        postJson("/api/game/" + sid + "/settle", "{}", null);

        JsonNode seasonsArr = json(get("/api/leaderboard/seasons", null));
        assertThat(seasonsArr.isArray()).isTrue();
        assertThat(seasonsArr.size()).isGreaterThanOrEqualTo(1);
        String current = seasonsArr.get(0).asText();

        // 当季能查到, 一个不存在的赛季查不到
        assertThat(json(get("/api/leaderboard?season=" + current, null)).size()).isEqualTo(1);
        assertThat(json(get("/api/leaderboard?season=1999-01", null)).size()).isZero();
    }

    @Test
    void tickDeliversNewsOnEventDate() {
        // 行情覆盖 2024-09-24 (内置 A股 事件日): 9 根 K 线, 起点只能落在 09-22/23,
        // 最多两次推进必然揭示 09-24
        seedStock("000001", LocalDate.of(2024, 9, 18), 9);
        long sid = json(postJson("/api/game/start",
                "{\"username\":\"新闻玩家\",\"aiLevel\":\"NORMAL\"}", null)).path("sessionId").asLong();

        boolean sawNews = false;
        for (int i = 0; i < 2 && !sawNews; i++) {
            JsonNode tick = json(postJson("/api/game/" + sid + "/tick", "{}", null));
            if (tick.path("news").size() > 0) {
                sawNews = true;
                JsonNode item = tick.path("news").get(0);
                assertThat(item.path("titleZh").asText()).isNotBlank();
                assertThat(item.path("titleEn").asText()).isNotBlank();
            }
            if (tick.path("settled").asBoolean()) {
                break;
            }
        }
        assertThat(sawNews).isTrue();
    }

    // ---------- 安全回归: 属主校验 / 冒名 / 日期脱敏 (2026-10 审计修复, 防回退) ----------

    @Test
    void sessionAccessControlBlocksOtherUsersAndGuests() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("对局主人");
        String bob = register("隔壁老王");
        long sid = json(postJson("/api/daily/start", "{}", alice)).path("sessionId").asLong();

        // 本人一切正常
        assertThat(get("/api/game/" + sid + "/status", alice).getStatusCode()).isEqualTo(HttpStatus.OK);
        // 其他登录用户 / 未登录者: 一律 404, 不泄露对局存在性
        assertThat(get("/api/game/" + sid + "/status", bob).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(get("/api/game/" + sid + "/status", null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postJson("/api/game/" + sid + "/tick", "{}", bob).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100}", null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postJson("/api/game/" + sid + "/settle", "{}", bob).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        // 对局没有被别人推进
        assertThat(sessionRepository.findById(sid).orElseThrow().getDaysElapsed()).isZero();
    }

    @Test
    void guestCannotImpersonateRegisteredUser() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        register("注册真身");

        ResponseEntity<String> resp = postJson("/api/game/start",
                "{\"username\":\"注册真身\"}", null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(json(resp).path("message").asText()).contains("已被注册");
        // 没有任何对局被记到真身名下
        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void loggedInStartIgnoresBodyUsername() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("会话身份");

        long sid = json(postJson("/api/game/start", "{\"username\":\"被顶替的人\"}", alice))
                .path("sessionId").asLong();
        Long aliceId = userRepository.findByUsername("会话身份").orElseThrow().getUserId();
        assertThat(sessionRepository.findById(sid).orElseThrow().getUserId()).isEqualTo(aliceId);
        // body 里的假名不会被创建成用户
        assertThat(userRepository.findByUsername("被顶替的人")).isEmpty();
    }

    @Test
    void dailyChallengeHidesRealDates() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("脱敏甲");
        JsonNode start = json(postJson("/api/daily/start", "{}", alice));
        long sid = start.path("sessionId").asLong();

        // 起始日被平移到虚拟纪元 (BlindDates.BASE), 而非 2024 年的真实日期
        assertThat(start.path("startDate").asText()).isEqualTo("2000-01-03");
        // 标的匿名: 进行中不暴露是哪只股票
        assertThat(start.path("stockCode").asText()).isEqualTo("???");

        JsonNode history = json(get("/api/game/" + sid + "/history", alice));
        assertThat(history.path("currentTradeDate").asText()).isEqualTo("2000-01-03");
        for (JsonNode k : history.path("klines")) {
            assertThat(k.path("tradeDate").asText()).doesNotStartWith("2024");
        }

        // 推进一天: 日期仍是虚拟纪元序列 (种子数据为连续日历日), 且竞技模式不下发新闻
        JsonNode tick = json(postJson("/api/game/" + sid + "/tick", "{}", alice));
        assertThat(tick.path("currentTradeDate").asText()).isEqualTo("2000-01-04");
        assertThat(tick.path("newBar").path("tradeDate").asText()).isEqualTo("2000-01-04");
        assertThat(tick.path("news")).isEmpty();
        assertThat(tick.path("status").path("currentTradeDate").asText()).startsWith("2000-");

        // 结算时揭晓真实标的
        JsonNode settle = json(postJson("/api/game/" + sid + "/settle", "{}", alice));
        assertThat(settle.path("stockCode").asText()).isEqualTo("000001");
        assertThat(settle.path("stockName").asText()).isNotEqualTo("神秘标的");
        // 结算后 today 接口也可见真身
        JsonNode after = json(get("/api/daily/today", alice));
        assertThat(after.path("stockCode").asText()).isEqualTo("000001");
    }

    /**
     * 防剧透全端点扫描 (属性测试): 竞技对局进行中, 任何会话相关响应的原始 JSON
     * 都不得出现真实日期 ("2024-") 或真实标的 (代码/名称)。
     * 新增端点天然被纳入扫描名单的维护点只有一处; 比逐字段断言更能挡住
     * "新字段忘脱敏" (CLAUDE.md 高危教训 #4 的回归通道)。
     */
    @Test
    void competitiveEndpointsNeverLeakRealDatesOrIdentity() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("脱敏扫描");
        long sid = json(postJson("/api/daily/start", "{}", alice)).path("sessionId").asLong();

        // 制造一笔成交 + 一张挂单, 让流水/挂单响应有内容可泄
        postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100}", alice);
        postJson("/api/game/" + sid + "/orders",
                "{\"orderType\":\"LIMIT_BUY\",\"price\":9.50,\"shares\":100}", alice);

        String[] endpoints = {
                "/api/game/" + sid + "/history",
                "/api/game/" + sid + "/status",
                "/api/game/" + sid + "/transactions",
                "/api/game/" + sid + "/orders",
                "/api/game/" + sid + "/news/upcoming",
                // 进行中调 bias 是 400 (未结算), 错误文案同样不得泄露
                "/api/game/" + sid + "/bias",
                "/api/daily/today",
        };
        for (String ep : endpoints) {
            String body = get(ep, alice).getBody();
            assertThat(body).as("进行中竞技响应泄露真实日期: " + ep).doesNotContain("2024-");
            assertThat(body).as("进行中竞技响应泄露真实代码: " + ep).doesNotContain("000001");
            assertThat(body).as("进行中竞技响应泄露真实名称: " + ep).doesNotContain("测试股");
        }
    }

    /**
     * 回归 (审计 P0-3): 结算复盘 journal 的日期必须保持脱敏 —— 结算只揭晓标的不揭晓窗口,
     * 否则"揭晓的 code + journal 真实日期"= 当日挑战完整答案, 可喂给未玩的同伙屠榜。
     */
    @Test
    void settledJournalKeepsDatesMasked() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("日志脱敏");
        long sid = json(postJson("/api/daily/start", "{}", alice)).path("sessionId").asLong();

        // 带理由的交易才会生成 journal 行; 手动交易只按当日收盘价 10.00 成交
        postJson("/api/game/" + sid + "/trade",
                "{\"direction\":\"BUY\",\"price\":10.00,\"shares\":100,\"reason\":\"测试理由\"}", alice);
        JsonNode settle = json(postJson("/api/game/" + sid + "/settle", "{}", alice));

        JsonNode journal = settle.path("journal");
        assertThat(journal.size()).isEqualTo(1);
        // 日期落在虚拟纪元 (2000-01-xx), 绝不能是种子数据的真实 2024 年日历日
        assertThat(journal.get(0).path("tradeDate").asText()).startsWith("2000-");
    }

    /**
     * 回归 (审计 P0-2): 昨日榜对"该日对局仍未结算"的请求者保持脱敏 ——
     * 跨零点没打完的人若从昨日榜拿到真实代码, 可去 lab 历史对齐窗口看"未来"再回来推进。
     */
    @Test
    void yesterdayBoardStaysMaskedForPlayerStillInProgress() {
        seedStock("000001", LocalDate.of(2024, 1, 1), 12);
        String alice = register("昨日已结");
        String bob = register("昨日未结");
        long settledSid = json(postJson("/api/daily/start", "{}", alice)).path("sessionId").asLong();
        postJson("/api/game/" + settledSid + "/settle", "{}", alice);
        long openSid = json(postJson("/api/daily/start", "{}", bob)).path("sessionId").asLong();

        // 把两局的挑战日改写成昨天, 模拟跨零点场景 (开局接口只能开"今天"的挑战)
        LocalDate yesterday = LocalDate.now(com.quantsim.service.GameService.GAME_ZONE).minusDays(1);
        for (long sid : new long[] {settledSid, openSid}) {
            var s = sessionRepository.findById(sid).orElseThrow();
            s.setChallengeDate(yesterday);
            sessionRepository.save(s);
        }

        // bob 的昨日局仍 IN_PROGRESS: 昨日榜对他必须继续隐藏标的
        JsonNode bobView = json(get("/api/daily/leaderboard?date=" + yesterday, bob));
        assertThat(bobView.size()).isEqualTo(1);
        assertThat(bobView.get(0).path("stockCode").asText()).isEqualTo("???");
        // alice 已结算: 昨日榜正常揭晓
        JsonNode aliceView = json(get("/api/daily/leaderboard?date=" + yesterday, alice));
        assertThat(aliceView.get(0).path("stockCode").asText()).isEqualTo("000001");
    }
}
