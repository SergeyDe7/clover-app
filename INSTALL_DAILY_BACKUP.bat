@echo off
chcp 65001 > nul
title Clover daily backup
echo Установка ежедневного backup Clover (нужны права администратора)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Install-DailyBackup.ps1"
if errorlevel 1 (
  echo.
  echo Не удалось создать задачу. Запустите этот файл от имени администратора.
  pause
  exit /b 1
)
echo.
pause
