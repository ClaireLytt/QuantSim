# QuantSim 一键启动: 启动后端, 就绪后自动打开浏览器
# 用法: 双击 start.bat, 或在 PowerShell 里执行 .\start.ps1
$backend = Join-Path $PSScriptRoot "backend"
$url = "http://localhost:8080"

function Test-Backend {
    try {
        $null = Invoke-WebRequest "$url/api/leaderboard" -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

if (Test-Backend) {
    Write-Host "后端已在运行, 直接打开页面 $url"
    Start-Process $url
    exit 0
}

Write-Host "正在启动后端 (首次启动需下载依赖, 可能较慢)..."
$proc = Start-Process -FilePath "mvn.cmd" -ArgumentList "spring-boot:run" `
    -WorkingDirectory $backend -PassThru

$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
        Write-Host "后端启动失败, 请查看弹出窗口的日志 (常见原因: MySQL 未启动)" -ForegroundColor Red
        exit 1
    }
    if (Test-Backend) {
        Start-Process $url
        Write-Host "游戏已就绪: $url (关闭 mvn 窗口即停止后端)"
        exit 0
    }
}

Write-Host "等待超时, 后端仍未就绪, 请查看 mvn 窗口日志" -ForegroundColor Red
exit 1
