# QuantSim one-click launcher: start the backend, open the browser when ready
# Usage: double-click start.bat, or run .\start.ps1 in PowerShell
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
