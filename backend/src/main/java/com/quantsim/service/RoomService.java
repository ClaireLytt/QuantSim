package com.quantsim.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

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
import lombok.extern.slf4j.Slf4j;

/**
 * 好友房间 (异步对战): 建房时随机固化 (标的, 起始日), 成员各自开局同一隐藏行情。
 * 状态迁移惰性触发: 每次查看房间时评估「全员完成 -> SETTLED」与「到期 -> 强制结算」。
 * 防剧透: 房间未结算前不下发任何人的收益率。
 */
@Slf4j
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
    private final GameStartService gameStart;
    private final MarketDataService marketData;
    private final GameProperties props;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /** 战况表排序: 收益率降序, 未开局 (returnRate=null) 的成员垫底。包级可见供契约单测。
     *  必须用 nullsLast 组合而非手写 if-return: 曾经双 null 时 compare(a,b)=compare(b,a)=1
     *  违反反对称契约, 列表一旦走 TimSort (>=32 元素) 就会抛 IllegalArgumentException。 */
    static final java.util.Comparator<RoomMemberView> STANDINGS_ORDER = java.util.Comparator.comparing(
            RoomMemberView::returnRate,
            java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder()));

    @Transactional
    public RoomView create(Long userId, String market, String aiLevel, boolean realRules) {
        AiLevel level = aiLevel == null || aiLevel.isBlank()
                ? AiLevel.NORMAL : parseAiLevel(aiLevel);
        Market m = market == null || market.isBlank() ? null : parseMarket(market);
        // 与 GameService.startGame 同口径: 真实规则 (T+1/涨跌停) 只对 A股有意义
        if (realRules && m != Market.STOCK) {
            throw new BusinessException("真实规则仅支持 A股市场, 请先选择 A股");
        }

        long[] pick = gameStart.pickDeterministic(m, ThreadLocalRandom.current());
        LocalDate startDate = marketData.load(pick[0]).prices().get((int) pick[1]).getTradeDate();

        Room room = new Room();
        room.setCreatorUserId(userId);
        room.setStockId(pick[0]);
        room.setStartDate(startDate);
        room.setAiLevel(level.name());
        room.setRealRules(realRules);
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
        if (sessionId == null) {
            // 调用方的错给 400 业务提示, 别让 findById(null) 炸成 500 刷 error 日志
            throw new BusinessException("缺少 sessionId");
        }
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
        AiLevel level = AiLevel.fromModel(session.getAiModel());
        Room room = new Room();
        room.setCreatorUserId(userId);
        room.setStockId(session.getStockId());
        room.setStartDate(session.getStartDate());
        room.setAiLevel(level.name());
        // 继承源对局的真实规则: 发起者的成绩是按这套规则打出来的, 挑战者必须同规则
        room.setRealRules(session.isRealRules());
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
            String code = randomCode();
            // INSERT IGNORE: 撞码返回 0 行而不是抛唯一键冲突, 事务保持干净, 换码重试即可
            int inserted = roomRepository.insertIgnore(code, room.getCreatorUserId(), room.getStockId(),
                    room.getStartDate(), room.getAiLevel(), room.getMaxPlayers(), room.isRealRules(),
                    room.getExpiresAt());
            if (inserted > 0) {
                return roomRepository.findByCode(code).orElseThrow();
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
        if (LocalDateTime.now().isAfter(room.getExpiresAt())) {
            // 与 join 同款校验: 过期但还没人 view (惰性迁移未触发) 的房间不能再开局,
            // 否则刚开的 day-0 对局会在下一次 view 被立即强结成 0% 挂上战况表
            throw new BusinessException("房间已过期");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        StartGameResponse res = gameStart.startGameAt(user, room.getStockId(), room.getStartDate(),
                parseAiLevel(room.getAiLevel()), "ROOM", room.isRealRules(), null);
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
                    settledRoom && s != null ? s.getFinalReturnRate() : null,
                    m.getUserId().equals(userId)));
            if (m.getUserId().equals(userId)) {
                joined = true;
                mySessionId = m.getSessionId();
                mySettled = done;
            }
        }
        // 已结算按收益率排序展示
        if (settledRoom) {
            standings.sort(STANDINGS_ORDER);
        }

        // 标的匿名: 房间未结算前不暴露是哪只股票, 结算时揭晓
        Stock stock = marketData.load(room.getStockId()).stock();
        return new RoomView(room.getCode(), room.getStatus().name(),
                settledRoom ? stock.getName() : BlindDates.MASK_NAME,
                settledRoom ? stock.getCode() : BlindDates.MASK_CODE,
                room.getAiLevel(),
                room.isRealRules(),
                members.size(), room.getMaxPlayers(), room.getExpiresAt(),
                joined, mySessionId, mySettled, standings);
    }

    /** 惰性状态迁移: 全员完成 -> SETTLED; 到期 -> 强制结算未完成对局后 SETTLED。 */
    /** 与 GameService.computeAndStoreBias 同一序列化口径; 诊断是增值信息, 序列化失败回填 null 不拖垮强结。 */
    private String toJsonOrNull(Object report) {
        if (report == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(report);
        } catch (Exception e) {
            return null;
        }
    }

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
                        // settleIsolated 走 REQUIRES_NEW: 失败只回滚该成员 (见 GameService 注释)
                        var result = gameService.settleIsolated(s.getSessionId());
                        // 不能 findById 回读: 该实体已在父事务一级缓存里, 读到的是结算前的
                        // 旧托管实例 (REQUIRES_NEW 的更新对本事务不可见; MySQL REPEATABLE READ
                        // 下连 refresh 重查也只能看到本事务快照)。因此内层事务改过的列必须
                        // **全部**用结算结果回填托管实体: Hibernate 默认非 dynamic-update,
                        // 父事务提交会按内存值写回整行, 漏回填哪列哪列就被旧快照抹掉
                        // (曾漏 biasReport 导致强结成员的诊断报告被静默清成 NULL)。
                        s.setStatus(GameSession.Status.SETTLED);
                        s.setFinalReturnRate(result.returnRate());
                        s.setFinalSharpe(result.risk() == null ? null : result.risk().sharpe());
                        s.setBiasReport(toJsonOrNull(result.biasReport()));
                    } catch (BusinessException e) {
                        // 并发下已被结算属预期; 其余失败 (如行情缺失) 留日志供线上告警 (回归评估 M-2)
                        log.warn("[room] 成员对局 {} 强制结算失败: {}", s.getSessionId(), e.getMessage());
                    } catch (RuntimeException e) {
                        // 任何单成员失败 (如 NotFoundException/数据异常) 都不允许拖垮房间迁移:
                        // 异常逃出去会回滚 view 事务, 房间永远迁不到 SETTLED, 每次访问 500
                        // (bug-knowledge-base #3 的症状以另一异常类型复活)。REQUIRES_NEW 的
                        // 隔离只对被 catch 住的异常生效。
                        log.error("[room] 成员对局 {} 强制结算异常", s.getSessionId(), e);
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
        return Enums.parse(raw, AiLevel.class, " AI 难度");
    }

    private Market parseMarket(String raw) {
        return Enums.parse(raw, Market.class, "市场");
    }
}
