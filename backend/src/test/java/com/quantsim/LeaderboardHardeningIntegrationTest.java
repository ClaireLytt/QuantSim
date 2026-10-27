package com.quantsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantsim.dto.GameDtos.LeaderboardEntry;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.entity.UserPoints;
import com.quantsim.service.LeaderboardService;

/**
 * 排行榜加固 + 道具局加成归零的集成测试 (2026-10 审计创意 4/6/7/8/9/10):
 * 秒结算与杠杆局不入榜 / 强平局入榜 / 每用户一席 / 稳定榜均值 / daysElapsed 下发 /
 * 用过预知卡的局胜AI加成与连胜一并归零。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:mysql://${QUANTSIM_DB_HOST:127.0.0.1}:${QUANTSIM_DB_PORT:3306}/quantsim_test"
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8&createDatabaseIfNotExist=true",
        "quantsim.game.total-ticks=3",
        "quantsim.game.history-days=5",
        "quantsim.game.min-history-days=5",
        "quantsim.game.guest-start-per-minute=10000",
        "quantsim.auth.per-minute=10000",
        // 无摩擦资金数学: 利息/费用归零, 让"空仓 0% vs AI 满仓亏损"的胜负确定
        "quantsim.game.cash-rate-annual=0",
        "quantsim.game.borrow-rate-annual=0",
        "quantsim.fees.stock.commission-rate=0",
        "quantsim.fees.stock.min-commission=0",
        "quantsim.fees.stock.stamp-tax-rate=0",
})
class LeaderboardHardeningIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private LeaderboardService leaderboardService;

    private static final LocalDate DAY1 = LocalDate.of(2024, 1, 2);

    private User user(String name) {
        User u = new User();
        u.setUsername(name);
        return userRepository.save(u);
    }

    /** 直接落一条已结算对局 (绕过对局流程, 只测榜单查询口径)。 */
    private GameSession settled(User u, Stock st, String ret, int days,
                                boolean advanced, boolean liquidated) {
        GameSession s = new GameSession();
        s.setUserId(u.getUserId());
        s.setStockId(st.getStockId());
        s.setStartDate(DAY1);
        s.setCurrentTradeDate(DAY1.plusDays(days));
        s.setDaysElapsed(days);
        s.setInitialCash(new BigDecimal("100000"));
        s.setStatus(GameSession.Status.SETTLED);
        s.setFinalReturnRate(new BigDecimal(ret));
        s.setAdvanced(advanced);
        s.setLiquidated(liquidated);
        return sessionRepository.save(s);
    }

    @Test
    void 秒结算与杠杆局不入榜_完赛局入榜并带天数() {
        Stock st = seedStock("600001", "测试一", Market.STOCK);
        settled(user("cherry"), st, "0.50", 1, false, false);  // 摘樱桃: 没打满不入榜
        settled(user("honest"), st, "0.10", 3, false, false);  // 完赛 (total-ticks=3): 入榜
        settled(user("lever"), st, "0.90", 3, true, false);    // 杠杆局: 不入榜
        settled(user("boom"), st, "-0.80", 2, false, true);    // 强平局: 入榜
        List<LeaderboardEntry> rows = leaderboardService.topSessions(null, null, null);
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).returnRate()).isEqualByComparingTo("0.10");
        assertThat(rows.get(0).daysElapsed()).isEqualTo(3);
        assertThat(rows.get(1).returnRate()).isEqualByComparingTo("-0.80");
    }

    @Test
    void 每用户只留最佳一局() {
        Stock st = seedStock("600002", "测试二", Market.STOCK);
        User a = user("alice");
        settled(a, st, "0.10", 3, false, false);
        settled(a, st, "0.30", 3, false, false);
        settled(user("bob"), st, "0.20", 3, false, false);
        List<LeaderboardEntry> rows = leaderboardService.topSessions(null, null, null);
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).returnRate()).isEqualByComparingTo("0.30");
        assertThat(rows.get(1).returnRate()).isEqualByComparingTo("0.20");
    }

    @Test
    void 稳定榜按用户均值且三局起() {
        Stock st = seedStock("600003", "测试三", Market.STOCK);
        User a = user("steady");
        settled(a, st, "0.10", 3, false, false);
        settled(a, st, "0.20", 3, false, false);
        settled(a, st, "0.30", 3, false, false);
        User b = user("newbie"); // 只有 2 局, 样本不足不入稳定榜
        settled(b, st, "0.90", 3, false, false);
        settled(b, st, "0.90", 3, false, false);
        List<LeaderboardEntry> rows = leaderboardService.topSessions(null, "avg", null);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).returnRate()).isEqualByComparingTo("0.2000");
        assertThat(rows.get(0).games()).isEqualTo(3);
        assertThat(rows.get(0).daysElapsed()).isNull();
    }

    // ---------- 创意4: 道具局加成归零 ----------

    /** 阴跌行情 + AI 满仓看多: 空仓玩家必胜 AI 与持有基准, 胜负确定可断言加成。 */
    private void seedFallingStock() {
        Stock st = seedStock("600004", "阴跌股", Market.STOCK);
        for (int i = 0; i < 9; i++) {
            savePrice(st.getStockId(), DAY1.plusDays(i), new BigDecimal(100 - i * 5));
            savePrediction(st.getStockId(), DAY1.plusDays(i), AiLevel.NORMAL, "0.80");
        }
    }

    private long startGame(String username) {
        ResponseEntity<String> resp = postJson("/api/game/start",
                "{\"username\":\"" + username + "\",\"aiLevel\":\"NORMAL\"}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return json(resp).get("sessionId").asLong();
    }

    /** tick 到结算为止 (total-ticks=3)。 */
    private void playToSettle(long sid) {
        for (int i = 0; i < 3; i++) {
            ResponseEntity<String> resp = postJson("/api/game/" + sid + "/tick", "{}");
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            JsonNode body = json(resp);
            if (body.get("settled").asBoolean()) {
                return;
            }
        }
        throw new IllegalStateException("3 tick 后仍未结算");
    }

    @Test
    void 用过预知卡的局_胜AI加成与连胜归零() {
        seedFallingStock();
        // 第一局不用道具: 空仓胜 AI (+30) 胜持有 (+20), 连胜 1
        long sid1 = startGame("it_peek");
        playToSettle(sid1);
        User u = userRepository.findByUsername("it_peek").orElseThrow();
        UserPoints p1 = userPointsRepository.findById(u.getUserId()).orElseThrow();
        assertThat(p1.getWinStreak()).isEqualTo(1);
        int balanceAfterFirst = p1.getBalance();

        // 第二局用预知卡: itemUsed 置位, 同样胜 AI 却不发加成且连胜被重置
        UserPoints p = userPointsRepository.findById(u.getUserId()).orElseThrow();
        p.setItemPeek(1);
        userPointsRepository.save(p);
        long sid2 = startGame("it_peek");
        assertThat(postJson("/api/game/" + sid2 + "/peek", "{}").getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(sessionRepository.findById(sid2).orElseThrow().isItemUsed()).isTrue();
        playToSettle(sid2);
        UserPoints p2 = userPointsRepository.findById(u.getUserId()).orElseThrow();
        assertThat(p2.getWinStreak()).isZero();
        // 只拿基础分 50 (任务位首局已领, 当日第 2 局基础分仍全额)
        assertThat(p2.getBalance() - balanceAfterFirst).isEqualTo(50);
    }
}
