@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_CHECK_ONEC_QUEUE.ps1"
echo.
echo Нажмите любую клавишу, чтобы закрыть окно.
pause >nul
