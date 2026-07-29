@echo off
chcp 65001 > nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Daily-Backup.ps1"
if errorlevel 1 (
  echo Backup failed. Send a screenshot.
) else (
  echo Backup created successfully.
)
pause
