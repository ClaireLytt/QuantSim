package com.quantsim.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import jakarta.validation.constraints.Size;

/** 每日挑战与好友房间的请求/响应。 */
public final class CompetitiveDtos {

    private CompetitiveDtos() {}

    // ---------- 每日挑战 ----------

    /** streak: 含今天在内的连续挑战天数 (今天没玩则按截止昨天计), 用于留存钩子展示。 */
    public record DailyToday(
            LocalDate date,
            String stockCode,
            String stockName,
            String market,
            boolean played,
            Long sessionId,
            boolean settled,
            int streak,
            String dailyRule) {}

    public record DailyBoardEntry(
            String username,
            String stockName,
            String stockCode,
            BigDecimal returnRate,
            // 同 LeaderboardEntry.isSelf: 脱敏后前端认不出自己, 后端标记
            boolean isSelf,
            // 完赛用时 (秒, 开局→结算): 异常快速的"完美局"是多账号偷跑的可见指纹 (审计创意26)
            Long durationSeconds) {}

    // ---------- 好友房间 ----------

    public record CreateRoomRequest(
            @Size(max = 10) String market,
            @Size(max = 10) String aiLevel,
            Boolean realRules) {}

    public record RoomMemberView(
            String username,
            boolean joined,
            boolean started,
            boolean done,
            int daysElapsed,
            int totalTicks,
            BigDecimal returnRate,
            // 同 DailyBoardEntry.isSelf: 身份判断由后端标记, 前端不要按 username 比对 (教训 #2/#4)
            boolean isSelf) {}

    public record RoomView(
            String code,
            String status,
            String stockName,
            String stockCode,
            String aiLevel,
            boolean realRules,
            int players,
            int maxPlayers,
            LocalDateTime expiresAt,
            boolean joined,
            Long mySessionId,
            boolean mySessionSettled,
            List<RoomMemberView> standings) {}
}
