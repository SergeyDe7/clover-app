@echo off
chcp 65001 > nul
title Clover 4.0.4

echo Этот файл не ставит Clover сам по себе.
echo.
echo Актуальная установка на сервер (без домена):
echo   1. Откройте docs\deploy\CHECKLIST.md
echo   2. Создайте server\.env из docs\deploy\server.env.datacenter.example
echo   3. Запуск: START_CLOVER_V18.bat
echo   4. Автозапуск: tools\Install-CloverAutostart.ps1  (от администратора)
echo.
echo Старый INSTALL_CLOVER_V18.bat в этом репозитории не используется.
echo.
pause
exit /b 1
