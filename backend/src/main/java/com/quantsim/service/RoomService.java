package com.quantsim.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.quantsim.config.GameProperties;
import com.quantsim.dto.CompetitiveDtos.RoomMemberView;
import com.quantsim.dto.CompetitiveDtos.RoomView;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.entity.AiLevel;
import com.quantsim.entity.GameSession;
import com.quantsim.entity.Market;
import com.quantsim.entity.Room;
import com.quantsim.entity.RoomMember;
import com.quantsim.entity.Stock;
import com.quantsim.entity.User;
import com.quantsim.exception.BusinessException;
import com.quantsim.exception.NotFoundException;
import com.quantsim.repository.GameSessionRepository;
import com.quantsim.repository.RoomMemberRepository;
import com.quantsim.repository.RoomRepository;
import com.quantsim.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * 好友房间 (异步对战): 建房时随机固化 (标的, 起始日), 成员各自开局同一隐藏行情。
 * 状态迁移惰性触发: 每次查看房间时评估「全员完成 -> SETTLED」与「到期 -> 强制结算」。
 * 防剧透: 房间未结算前不下发任何人的收益率。
 */
@Service
@RequiredArgsConstructor
public class RoomService {

    private static final String CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int CODE_LEN = 6;
    private static final int EXPIRE_HOURS = 48;

    private final RoomRepository roomRepository;
    private final RoomMemberRepository memberRepository;
    private final GameSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final GameService gameService;
    private final MarketDataService marketData;
    private final GameProperties props;

    @Transactional
    public RoomView create(Long userId, String market, String aiLevel) {
        AiLevel level = aiLevel == null || aiLevel.isBlank()
                ? AiLevel.NORMAL : parseAiLevel(aiLevel);
        Market m = market == null || market.isBlank() ? null : parseMarket(market);

        long[] pick = gameService.pickDeterministic(m, ThreadLocalRandom.current());
        LocalDate startDate = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();

        Room room = new Room();
        room.setCreatorUserId(userId);
        room.setStockId(pick[0]);
        room.setStartDate(startDate);
        room.setAiLevel(level.name());
        room.setExpiresAt(LocalDateTime.now().plusHours(EXPIRE_HOURS));
        room = saveWithUniqueCode(room);

        RoomMember member = new RoomMember();
        member.setRoomId(room.getRoomId());
        member.setUserId(userId);
        memberRepository.save(member);

        return view(userId, room.getCode());
    }

    /**
     * 好友同题挑战: 把"我刚玩完的那局"变成房间 —— 同标的同隐藏窗口, 朋友盲打同题,
     * 发起者的已结算成绩直接挂进战况表。只允许单股非竞技局 (竞技局禁止套娃)。
     */
    @Transactional
    public RoomView createChallenge(Long userId, Long sessionId) {
        GameSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("对局不存在: " + sessionId));
        if (!java.util.Objects.equals(session.getUserId(), userId)) {
            throw new NotFoundException("对局不存在: " + sessionId);
        }
        if (session.getStatus() != GameSession.Status.SETTLED) {
            throw new BusinessException("结算后才能发起同题挑战");
        }
        if ("PORTFOLIO".equals(session.getMode()) || BlindDates.blind(session)) {
            throw new BusinessException("该模式的对局不支持发起同题挑战");
        }
        AiLevel level = AiLevel.NORMAL;
        for (AiLevel l : AiLevel.values()) {
            if (l.getModel().equals(session.getAiModel())) {
                level = l;
                break;
            }
        }
        Room room = new Room();
        room.setCreatorUserId(userId);
        room.setStockId(session.getStockId());
        room.setStartDate(session.getStartDate());
        room.setAiLevel(level.name());
        room.setExpiresAt(LocalDateTime.now().plusHours(EXPIRE_HOURS));
        room = saveWithUniqueCode(room);

        RoomMember member = new RoomMember();
        member.setRoomId(room.getRoomId());
        member.setUserId(userId);
        member.setSessionId(session.getSessionId()); // 发起者不再重打, 挂既有成绩
        memberRepository.save(member);
        return view(userId, room.getCode());
    }

    private Room saveWithUniqueCode(Room room) {
        for (int attempt = 0; attempt < 5; attempt++) {
            room.setCode(randomCode());
            try {
                return roomRepository.saveAndFlush(room);
            } catch (DataIntegrityViolationException e) {
                // 房间码撞唯一约束, 换一个再试
            }
        }
        throw new BusinessException("房间码生成失败, 请重试");
    }

    private String randomCode() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        StringBuilder sb = new StringBuilder(CODE_LEN);
        for (int i = 0; i < CODE_LEN; i++) {
            sb.append(CODE_ALPHABET.charAt(r.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    @Transactional
    public RoomView join(Long userId, String code) {
        Room room = roomRepository.findWithLockByCode(normalize(code))
                .orElseThrow(() -> new NotFoundException("房间不存在: " + code));
        if (room.getStatus() == Room.Status.SETTLED) {
            throw new BusinessException("房间已结算, 无法加入");
        }
        if (LocalDateTime.now().isAfter(room.getExpiresAt())) {
            throw new BusinessException("房间已过期");
        }
        if (memberRepository.findByRoomIdAndUserId(room.getRoomId(), userId).isEmpty()) {
            if (memberRepository.countByRoomId(room.getRoomId()) >= room.getMaxPlayers()) {
                throw new BusinessException("房间已满");
            }
            RoomMember member = new RoomMember();
            member.setRoomId(room.getRoomId());
            member.setUserId(userId);
            memberRepository.save(member);
        }
        return view(userId, room.getCode());
    }

    /** 成员开局 (或返回已有对局的描述), 幂等。 */
    @Transactional
    public StartGameResponse play(Long userId, String code) {
        Room room = roomRepository.findWithLockByCode(normalize(code))
                .orElseThrow(() -> new NotFoundException("房间不存在: " + code));
        RoomMember member = memberRepository.findByRoomIdAndUserId(room.getRoomId(), userId)
                .orElseThrow(() -> new BusinessException("请先加入房间"));
        if (member.getSessionId() != null) {
            return gameService.describe(member.getSessionId());
        }
        if (room.getStatus() == Room.Status.SETTLED) {
            throw new BusinessException("房间已结算");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        StartGameResponse res = gameService.startGameAt(user, room.getStockId(), room.getStartDate(),
                parseAiLevel(room.getAiLevel()), "ROOM", null);
        member.setSessionId(res.sessionId());
        memberRepository.save(member);
        return res;
    }

    @Transactional
    public RoomView view(Long userId, String code) {
        Room room = roomRepository.findWithLockByCode(normalize(code))
                .orElseThrow(() -> new NotFoundException("房间不存在: " + code));
        List<RoomMember> members = memberRepository.findByRoomIdOrderByJoinedAtAsc(room.getRoomId());
        Map<Long, GameSession> sessions = members.stream()
                .filter(m -> m.getSessionId() != null)
                .map(m -> sessionRepository.findById(m.getSessionId()).orElse(null))
                .filter(s -> s != null)
                .collect(Collectors.toMap(GameSession::getSessionId, s -> s));

        evaluateTransitions(room, members, sessions);

        boolean settledRoom = room.getStatus() == Room.Status.SETTLED;
        Map<Long, String> usernames = userRepository.findAllById(
                        members.stream().map(RoomMember::getUserId).toList()).stream()
                .collect(Collectors.toMap(User::getUserId, User::getUsername));

        List<RoomMemberView> standings = new ArrayList<>();
        Long mySessionId = null;
        boolean mySettled = false;
        boolean joined = false;
        for (RoomMember m : members) {
            GameSession s = m.getSessionId() == null ? null : sessions.get(m.getSessionId());
            boolean done = s != null && s.getStatus() == GameSession.Status.SETTLED;
            standings.add(new RoomMemberView(
                    usernames.getOrDefault(m.getUserId(), "?"),
                    true, s != null, done,
                    s == null ? 0 : s.getDaysElapsed(), props.getTotalTicks(),
                    settledRoom && s != null ? s.getFinalReturnRate() : null));
            if (m.getUserId().equals(userId)) {
                joined = true;
                mySessionId = m.getSessionId();
                mySettled = done;
            }
        }
        // 已结算按收益率排序展示
        if (settledRoom) {
            standings.sort((a, b) -> {
                if (a.returnRate() == null) return 1;
                if (b.returnRate() == null) return -1;
                return b.returnRate().compareTo(a.returnRate());
            });
        }

        // 标的匿名: 房间未结算前不暴露是哪只股票, 结算时揭晓
        Stock stock = marketData.load(room.getStockId()).stock();
        return new RoomView(room.getCode(), room.getStatus().name(),
                settledRoom ? stock.getName() : BlindDates.MASK_NAME,
                settledRoom ? stock.getCode() : BlindDates.MASK_CODE,
                room.getAiLevel(),
                members.size(), room.getMaxPlayers(), room.getExpiresAt(),
                joined, mySessionId, mySettled, standings);
    }

    /** 惰性状态迁移: 全员完成 -> SETTLED; 到期 -> 强制结算未完成对局后 SETTLED。 */
    private void evaluateTransitions(Room room, List<RoomMember> members, Map<Long, GameSession> sessions) {
        if (room.getStatus() == Room.Status.SETTLED) {
            return;
        }
        boolean expired = LocalDateTime.now().isAfter(room.getExpiresAt());
        if (expired) {
            for (RoomMember m : members) {
                GameSession s = m.getSessionId() == null ? null : sessions.get(m.getSessionId());
                if (s != null && s.getStatus() == GameSession.Status.IN_PROGRESS) {
                    try {
                        gameService.settle(s.getSessionId());
                        sessions.put(s.getSessionId(),
                                sessionRepository.findById(s.getSessionId()).orElse(s));
                    } catch (BusinessException e) {
                        // 并发下已被结算, 忽略
                    }
                }
            }
            room.setStatus(Room.Status.SETTLED);
            roomRepository.save(room);
            return;
        }
        // 至少两人才按"全员完成"结算: 同题挑战房的发起者自带已结算成绩,
        // 单成员即判 allDone 会让房间创建瞬间封盘, 朋友没法加入 (单人房走过期结算)
        boolean allDone = members.size() >= 2 && members.stream().allMatch(m -> {
            GameSession s = m.getSessionId() == null ? null : sessions.get(m.getSessionId());
            return s != null && s.getStatus() == GameSession.Status.SETTLED;
        });
        if (allDone) {
            room.setStatus(Room.Status.SETTLED);
            roomRepository.save(room);
        }
    }

    private String normalize(String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException("房间码不能为空");
        }
        return code.trim().toUpperCase();
    }

    private AiLevel parseAiLevel(String raw) {
        try {
            return AiLevel.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知 AI 难度: " + raw);
        }
    }

    private Market parseMarket(String raw) {
        try {
            return Market.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("未知市场: " + raw);
        }
    }
}
