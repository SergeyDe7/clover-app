@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"

if not exist "_clover_onec_queue_update\Install-Update.ps1" (
  echo ERROR: update files are missing.
  echo Extract the complete ZIP into the clover-app folder and run this file again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_clover_onec_queue_update\Install-Update.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo UPDATE FAILED. Previous code was restored automatically.
  echo Send a screenshot and INSTALL_ONEC_QUEUE_RESULT.txt.
  pause
  exit /b %RESULT%
)

echo.
echo UPDATE INSTALLED SUCCESSFULLY.
echo Clover has been started. The browser should open automatically.
pause
endlocal
