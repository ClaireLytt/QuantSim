package com.quantsim.dto;

import java.time.LocalDateTime;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(min = 2, max = 50) String username,
            @NotBlank @Size(min = 6, max = 72) String password) {}

    public record LoginRequest(
            @NotBlank @Size(max = 50) String username,
            @NotBlank @Size(max = 72) String password) {}

    /** 当前登录用户; 未登录时 me 接口返回 user=null。 */
    public record UserInfo(Long userId, String username, LocalDateTime createdAt) {}

    public record MeResponse(UserInfo user) {}

    public record ProgressRequest(@NotBlank @Size(max = 65000) String progressJson) {}

    public record ProgressResponse(String progressJson, LocalDateTime updatedAt) {}
}
