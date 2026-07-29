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
  Write-Host "Задача '$TaskName' удалена (если существовала)."
  exit 0
}

# Сборка frontend, если нет dist (нужно для preview на сервере)
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

Write-Host "Готово: задача Планировщика '$TaskName' запускает Clover при старте Windows."
Write-Host "Ручной старт: $StartScript"
Write-Host "Ручной стоп:  $StopScript"
Write-Host "Удаление автозапуска: powershell -File tools\Install-CloverWindowsService.ps1 -Remove"
Write-Host "Проверка: tools\Health-Check.ps1"
