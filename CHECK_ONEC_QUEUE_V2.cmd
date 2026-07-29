@echo off
setlocal
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" (
  echo ERROR: Windows PowerShell was not found.
  echo Check file: ONEC_QUEUE_DIAGNOSTIC_LAUNCH_ERROR.txt
  >"%~dp0ONEC_QUEUE_DIAGNOSTIC_LAUNCH_ERROR.txt" echo Windows PowerShell was not found.
  pause
  exit /b 1
)
"%PS%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0_CHECK_ONEC_QUEUE_V2.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo ERROR: Diagnostic script failed. Code %RC%.
  >"%~dp0ONEC_QUEUE_DIAGNOSTIC_LAUNCH_ERROR.txt" echo Diagnostic script failed. Code %RC%.
)
echo.
echo Press any key to close this window.
pause >nul
exit /b %RC%
