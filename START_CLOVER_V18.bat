@echo off
chcp 65001 > nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Start-Clover.ps1" -OpenBrowser
if errorlevel 1 (
  echo.
  echo Clover did not start. Send a screenshot and files from the logs folder.
  pause
)
