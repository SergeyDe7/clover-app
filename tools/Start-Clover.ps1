param([switch]$OpenBrowser)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Test-CloverServer {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:4100/api/health" -TimeoutSec 3
    return $response.ok -eq $true -and $response.service -eq "clover-server"
  } catch { return $false }
}

function Test-CloverFrontend {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5273/" -TimeoutSec 3
    return $response.StatusCode -eq 200 -and $response.Content -match '(?i)clover'
  } catch { return $false }
}

if (-not (Test-CloverServer)) {
  $serverCommand = "cd /d `"$Root\server`" && npm start >> `"$Logs\server.log`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $serverCommand -WindowStyle Minimized | Out-Null
}

$serverReady = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  if (Test-CloverServer) { $serverReady = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $serverReady) { throw "Clover Server did not start on port 4100. See logs\server.log" }

$DistIndex = Join-Path $Root "dist\index.html"
if (-not (Test-Path $DistIndex)) {
  Write-Host "dist missing - running npm run build..."
  Push-Location $Root
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed. See console output." }
  } finally {
    Pop-Location
  }
}

if (-not (Test-CloverFrontend)) {
  $frontCommand = "cd /d `"$Root`" && npm run preview -- --host 0.0.0.0 --port 5273 >> `"$Logs\frontend.log`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", $frontCommand -WindowStyle Minimized | Out-Null
}

$frontReady = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  if (Test-CloverFrontend) { $frontReady = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $frontReady) { throw "Clover frontend did not start on port 5273. See logs\frontend.log" }

if ($OpenBrowser) { Start-Process "http://localhost:5273/" }
Write-Host "Clover V18 is running: http://localhost:5273/"
