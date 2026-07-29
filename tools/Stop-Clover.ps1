$ErrorActionPreference = "SilentlyContinue"
$Root = (Split-Path $PSScriptRoot -Parent).ToLowerInvariant()
$Stopped = New-Object System.Collections.Generic.HashSet[int]

function Stop-Tree([int]$ProcessId) {
  if ($ProcessId -le 0 -or $Stopped.Contains($ProcessId)) { return }
  & taskkill.exe /PID $ProcessId /T /F | Out-Null
  $Stopped.Add($ProcessId) | Out-Null
}

$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @("node.exe", "cmd.exe", "powershell.exe") -and
  $_.CommandLine -and
  $_.CommandLine.ToLowerInvariant().Contains($Root)
})
foreach ($process in $processes) { Stop-Tree ([int]$process.ProcessId) }

function Test-CloverPort([int]$Port) {
  try {
    if ($Port -in @(4000, 4100)) {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      return $health.service -eq "clover-server"
    }
    $page = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
    return $page.StatusCode -eq 200 -and $page.Content -match '(?i)clover'
  } catch { return $false }
}

foreach ($port in @(4000, 4100, 5173, 5273)) {
  if (-not (Test-CloverPort $port)) { continue }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) { Stop-Tree ([int]$listener.OwningProcess) }
}

Start-Sleep -Seconds 2
Write-Host "Clover processes stopped: $($Stopped.Count)"
