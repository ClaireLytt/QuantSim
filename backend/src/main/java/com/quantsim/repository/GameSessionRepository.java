package com.quantsim.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import com.quantsim.entity.GameSession;

import jakarta.persistence.LockModeType;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<GameSession> findWithLockBySessionId(Long sessionId);

    /**
     * 收益榜 (2026-10 审计加固):
     *  - 只收打满全程 (daysElapsed ≥ minTicks) 或被强平的局 —— 否则"涨了秒结算/跌了弃局"
     *    可零成本摘樱桃刷榜;
     *  - 排除 advanced (杠杆/做空) 局 —— 高方差策略在 top-N 口径下必然统治普通局;
     *  - 每用户只留最佳一局 (not exists 组内最大, 平手取 sessionId 小者) —— 防一人多席。
     */
    @Query("""
            select s, u.username, st.name, st.code
            from GameSession s
            join User u on u.userId = s.userId
            join Stock st on st.stockId = s.stockId
            where s.status = :status
              and s.mode in ('CLASSIC', 'PORTFOLIO')
              and s.advanced = false
              and (s.liquidated = true or s.daysElapsed >= :minTicks)
              and (:season is null or s.season = :season)
              and u.username not like 'smoke\\_%' escape '\\'
              and u.username not like 'btncheck\\_%' escape '\\'
              and u.username not like 'shot\\_%' escape '\\'
              and not exists (
                  select 1 from GameSession s2
                  where s2.userId = s.userId
                    and s2.status = :status
                    and s2.mode in ('CLASSIC', 'PORTFOLIO')
                    and s2.advanced = false
                    and (s2.liquidated = true or s2.daysElapsed >= :minTicks)
                    and (:season is null or s2.season = :season)
                    and (s2.finalReturnRate > s.finalReturnRate
                         or (s2.finalReturnRate = s.finalReturnRate and s2.sessionId < s.sessionId)))
            order by s.finalReturnRate desc
            """)
    List<Object[]> findLeaderboard(GameSession.Status status, String season, int minTicks,
                                   Pageable pageable);

    /** 夏普榜: 风险调整后收益排序; 完赛/去杠杆/每人一席的加固口径与收益榜一致, 老对局无夏普不入榜。 */
    @Query("""
            select s, u.username, st.name, st.code
            from GameSession s
            join User u on u.userId = s.userId
            join Stock st on st.stockId = s.stockId
            where s.status = :status
              and s.mode in ('CLASSIC', 'PORTFOLIO')
              and s.advanced = false
              and (s.liquidated = true or s.daysElapsed >= :minTicks)
              and s.finalSharpe is not null
              and (:season is null or s.season = :season)
              and u.username not like 'smoke\\_%' escape '\\'
              and u.username not like 'btncheck\\_%' escape '\\'
              and u.username not like 'shot\\_%' escape '\\'
              and not exists (
                  select 1 from GameSession s2
                  where s2.userId = s.userId
                    and s2.status = :status
                    and s2.mode in ('CLASSIC', 'PORTFOLIO')
                    and s2.advanced = false
                    and (s2.liquidated = true or s2.daysElapsed >= :minTicks)
                    and s2.finalSharpe is not null
                    and (:season is null or s2.season = :season)
                    and (s2.finalSharpe > s.finalSharpe
                         or (s2.finalSharpe = s.finalSharpe and s2.sessionId < s.sessionId)))
            order by s.finalSharpe desc
            """)
    List<Object[]> findLeaderboardBySharpe(GameSession.Status status, String season, int minTicks,
                                           Pageable pageable);

    /** 稳定榜: 用户完赛局平均收益 (≥minGames 局才入榜), 奖励持续而非单局极值。行: [userId, username, avg, count]。 */
    @Query("""
            select s.userId, u.username, avg(s.finalReturnRate), count(s)
            from GameSession s
            join User u on u.userId = s.userId
            where s.status = :status
              and s.mode in ('CLASSIC', 'PORTFOLIO')
              and s.advanced = false
              and (s.liquidated = true or s.daysElapsed >= :minTicks)
              and (:season is null or s.season = :season)
              and u.username not like 'smoke\\_%' escape '\\'
              and u.username not like 'btncheck\\_%' escape '\\'
              and u.username not like 'shot\\_%' escape '\\'
            group by s.userId, u.username
            having count(s) >= :minGames
            order by avg(s.finalReturnRate) desc
            """)
    List<Object[]> findLeaderboardByAvg(GameSession.Status status, String season, int minTicks,
                                        long minGames, Pageable pageable);

    Optional<GameSession> findByUserIdAndChallengeDate(Long userId, java.time.LocalDate challengeDate);

    /** 偏差档案: 最近 60 局有诊断的已结算对局 (降序取最新, 调用方自行反转成时间升序画趋势)。
     *  注意不能用 Asc: Top60+Asc 取的是最早 60 局, 超过 60 局后档案会永久冻结在老数据上。 */
    List<GameSession> findTop60ByUserIdAndStatusAndBiasReportIsNotNullOrderByCreatedAtDesc(
            Long userId, GameSession.Status status);

    /** 风格罗盘: 最近 30 局已结算对局 (排除 INTRO 新手局——两笔教学局不代表风格)。 */
    List<GameSession> findTop30ByUserIdAndStatusAndModeNotOrderByCreatedAtDesc(
            Long userId, GameSession.Status status, String mode);

    /** 某用户玩过的全部每日挑战日期 (降序), 用于计算连续挑战 streak。 */
    @Query("""
            select s.challengeDate
            from GameSession s
            where s.userId = :userId and s.challengeDate is not null
            order by s.challengeDate desc
            """)
    List<java.time.LocalDate> findChallengeDatesDesc(Long userId);

    @Query("""
            select s, u.username, st.name, st.code
            from GameSession s
            join User u on u.userId = s.userId
            join Stock st on st.stockId = s.stockId
            where s.challengeDate = :date and s.status = :status
              and u.username not like 'smoke\\_%' escape '\\'
              and u.username not like 'btncheck\\_%' escape '\\'
              and u.username not like 'shot\\_%' escape '\\'
            order by s.finalReturnRate desc
            """)
    List<Object[]> findDailyBoard(java.time.LocalDate date, GameSession.Status status, Pageable pageable);

    /** 请求者在该挑战日是否仍有未结算对局 (昨日榜防剧透: 跨零点未打完的人不能先看答案)。 */
    boolean existsByUserIdAndChallengeDateAndStatus(Long userId, java.time.LocalDate challengeDate,
            GameSession.Status status);

    @Query("select distinct s.season from GameSession s where s.season is not null order by s.season desc")
    List<String> findSeasons();

    /** 我的交易人生: 已结算且有收益率的对局按时间升序, 用于累计净值曲线与胜率聚合 */
    List<GameSession> findByUserIdAndStatusAndFinalReturnRateIsNotNullOrderByCreatedAtAsc(
            Long userId, GameSession.Status status);

    @Query("""
            select s, st.name, st.code
            from GameSession s
            join Stock st on st.stockId = s.stockId
            where s.userId = :userId
            order by s.createdAt desc
            """)
    List<Object[]> findMyGames(Long userId, Pageable pageable);
}
