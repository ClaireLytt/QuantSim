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

    public record DailyToday(
            LocalDate date,
            String stockCode,
            String stockName,
            String market,
            boolean played,
            Long sessionId,
            boolean settled) {}

    public record DailyBoardEntry(
            String username,
            String stockName,
            String stockCode,
            BigDecimal returnRate) {}

    // ---------- 好友房间 ----------

    public record CreateRoomRequest(
            @Size(max = 10) String market,
            @Size(max = 10) String aiLevel) {}

    public record RoomMemberView(
            String username,
            boolean joined,
            boolean started,
            boolean done,
            int daysElapsed,
            int totalTicks,
            BigDecimal returnRate) {}

    public record RoomView(
            String code,
            String status,
            String stockName,
            String stockCode,
            String aiLevel,
            int players,
            int maxPlayers,
            LocalDateTime expiresAt,
            boolean joined,
            Long mySessionId,
            boolean mySessionSettled,
            List<RoomMemberView> standings) {}
}
