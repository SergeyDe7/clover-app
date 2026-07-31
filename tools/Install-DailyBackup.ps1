#Requires -RunAsAdministrator
param(
  [string]$TaskName = "CloverDailyBackup",
  [string]$Time = "03:15",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$BackupScript = Join-Path $Root "tools\Daily-Backup.ps1"

if (-not (Test-Path $BackupScript)) {
  throw "Не найден $BackupScript"
}

if ($Remove) {
  schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  Write-Host "Задача Планировщика '$TaskName' удалена (если существовала)."
  exit 0
}

if ($Time -notmatch '^\d{2}:\d{2}$') {
  throw "Параметр -Time должен быть в формате HH:mm, например 03:15"
}

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$BackupScript`""
schtasks /Create /TN $TaskName /TR $action /SC DAILY /ST $Time /RU SYSTEM /RL HIGHEST /F | Out-Null

Write-Host "Готово: ежедневный backup Clover в Планировщике '$TaskName' в $Time."
Write-Host "Скрипт: $BackupScript"
Write-Host "Копии также в D:\Clover-Backups или C:\Clover-Backups (см. Daily-Backup.ps1)."
Write-Host "Ручной запуск: powershell -File tools\Daily-Backup.ps1"
Write-Host "Удаление: powershell -File tools\Install-DailyBackup.ps1 -Remove"
Write-Host "Примечание: при старте сервера уже есть ensureDailyBackup (первый запуск за день)."
