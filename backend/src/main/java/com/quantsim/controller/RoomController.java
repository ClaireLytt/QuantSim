package com.quantsim.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.quantsim.config.CurrentUser;
import com.quantsim.dto.CompetitiveDtos.CreateRoomRequest;
import com.quantsim.dto.CompetitiveDtos.RoomView;
import com.quantsim.dto.GameDtos.StartGameResponse;
import com.quantsim.service.RoomService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/** 好友房间 (路径受 AuthFilter 保护, 需登录)。 */
@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService roomService;

    @PostMapping
    public RoomView create(@Valid @RequestBody(required = false) CreateRoomRequest body,
                           HttpServletRequest http) {
        CreateRoomRequest req = body == null ? new CreateRoomRequest(null, null) : body;
        return roomService.create(CurrentUser.idOrNull(http), req.market(), req.aiLevel());
    }

    @PostMapping("/{code}/join")
    public RoomView join(@PathVariable String code, HttpServletRequest http) {
        return roomService.join(CurrentUser.idOrNull(http), code);
    }

    @GetMapping("/{code}")
    public RoomView view(@PathVariable String code, HttpServletRequest http) {
        return roomService.view(CurrentUser.idOrNull(http), code);
    }

    @PostMapping("/{code}/play")
    public StartGameResponse play(@PathVariable String code, HttpServletRequest http) {
        return roomService.play(CurrentUser.idOrNull(http), code);
    }
}
