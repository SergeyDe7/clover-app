$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path $PSScriptRoot -Parent
$Logs = Join-Path $Root "logs"
$LogPath = Join-Path $Logs "health-check.log"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Write-HealthLog([string]$Message) {
  try {
    Add-Content -Path $LogPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
  } catch {}
}

# Do not allow two scheduled checks to overlap.
$mutex = New-Object System.Threading.Mutex($false, "Global\CloverV18HealthCheck")
$lockTaken = $false
try {
  $lockTaken = $mutex.WaitOne(0)
  if (-not $lockTaken) { exit 0 }

  function Test-CloverServer {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:4100/api/health" -TimeoutSec 5
      return $response.ok -eq $true -and $response.service -eq "clover-server"
    } catch { return $false }
  }

  function Test-CloverFrontend {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5273/" -TimeoutSec 5
      return $response.StatusCode -eq 200 -and $response.Content -match '(?i)clover'
    } catch { return $false }
  }

  $serverOk = Test-CloverServer
  $frontendOk = Test-CloverFrontend

  # A single short network/process delay must not trigger a restart.
  if (-not $serverOk -or -not $frontendOk) {
    Start-Sleep -Seconds 5
    $serverOk = Test-CloverServer
    $frontendOk = Test-CloverFrontend
  }

  if ($serverOk -and $frontendOk) {
    Write-HealthLog "OK"
    exit 0
  }

  Write-HealthLog "Service check failed twice. Starting missing Clover component."
  $startScript = Join-Path $PSScriptRoot "Start-Clover.ps1"
  if (Test-Path $startScript -PathType Leaf) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $startScript
  } else {
    Write-HealthLog "Start-Clover.ps1 is missing."
  }
} catch {
  Write-HealthLog "Health check error: $($_.Exception.Message)"
} finally {
  if ($lockTaken) {
    try { $mutex.ReleaseMutex() } catch {}
  }
  $mutex.Dispose()
}
