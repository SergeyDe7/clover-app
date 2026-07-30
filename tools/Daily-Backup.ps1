$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Server = Join-Path $Root "server"
$driveD = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.Name -eq "D:\" -and $_.IsReady } | Select-Object -First 1
$ExternalRoot = if ($driveD) { "D:\Clover-Backups" } else { "C:\Clover-Backups" }
New-Item -ItemType Directory -Force -Path $ExternalRoot | Out-Null
Push-Location $Server
try {
  & node "scripts\create-scheduled-backup.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Backup command failed" }
} finally { Pop-Location }
$latest = Get-ChildItem (Join-Path $Server "backups") -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { Copy-Item $latest.FullName (Join-Path $ExternalRoot $latest.Name) -Force }
Get-ChildItem $ExternalRoot -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
