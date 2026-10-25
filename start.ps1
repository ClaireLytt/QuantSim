# QuantSim one-click launcher: start the backend, open the browser when ready
# Usage: double-click start.bat, or run .\start.ps1 in PowerShell
$backend = Join-Path $PSScriptRoot "backend"
$url = "http://localhost:8080"

# 日常开发固定走专用 dev 库 (3308, 容器 quantsim-mysql-dev, 数据在 named volume 里持久化)。
# 为什么: 3306 常被其他项目容器占用; 3307 是集成测试库, mvn test 会清库——曾把真实账号清掉 (见 issue_recode/1.md)。
$env:QUANTSIM_DB_PORT = "3308"
$devDb = docker ps --filter "name=quantsim-mysql-dev" --format "{{.Names}}"
if (-not $devDb) {
    Write-Host "Starting dev database container (quantsim-mysql-dev on 3308)..."
    docker start quantsim-mysql-dev | Out-Null
    Start-Sleep -Seconds 8
}

function Test-Backend {
    try {
        $null = Invoke-WebRequest "$url/api/leaderboard" -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

if (Test-Backend) {
    Write-Host "Backend already running, opening $url"
    Start-Process $url
    exit 0
}

Write-Host "Starting backend (first run downloads dependencies and may be slow)..."
$proc = Start-Process -FilePath "mvn.cmd" -ArgumentList "spring-boot:run" `
    -WorkingDirectory $backend -PassThru

$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
        Write-Host "Backend failed to start. Check the mvn window log (common cause: MySQL not running, or wrong port - set QUANTSIM_DB_PORT if MySQL is not on 3306)" -ForegroundColor Red
        exit 1
    }
    if (Test-Backend) {
        Start-Process $url
        Write-Host "Game ready: $url (close the mvn window to stop the backend)"
        exit 0
    }
}

Write-Host "Timed out waiting for backend. Check the mvn window log" -ForegroundColor Red
exit 1
