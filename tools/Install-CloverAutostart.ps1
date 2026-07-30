#Requires -RunAsAdministrator
param(
  [string]$TaskName = "CloverAutostart",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$StartScript = Join-Path $Root "tools\Start-Clover.ps1"
$StopScript = Join-Path $Root "tools\Stop-Clover.ps1"

if (-not (Test-Path $StartScript)) {
  throw "Не найден $StartScript"
}

if ($Remove) {
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  Write-Host "Задача Планировщика '$TaskName' удалена (если существовала)."
  exit 0
}

$DistIndex = Join-Path $Root "dist\index.html"
if (-not (Test-Path $DistIndex)) {
  Write-Host "Сборка frontend (npm run build)..."
  Push-Location $Root
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
  } finally {
    Pop-Location
  }
}

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
schtasks /Create /TN $TaskName /TR $action /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null

Write-Host "Готово: создана задача Планировщика Windows '$TaskName' (не Windows Service / NSSM)."
Write-Host "Ручной старт: START_CLOVER_V18.bat"
Write-Host "Ручной стоп:  STOP_CLOVER_V18.bat"
Write-Host "Удаление: powershell -File tools\Install-CloverAutostart.ps1 -Remove"
Write-Host "Проверка: tools\Health-Check.ps1"
