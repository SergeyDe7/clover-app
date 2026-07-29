@echo off
chcp 65001 > nul
title Clover 1C patch
cd /d "%~dp0"

if not exist "Clover_ОбменКлиент.bsl" (
  echo Сначала выгрузите модуль в файл:
  echo   %~dp0Clover_ОбменКлиент.bsl
  echo
  echo Откройте ИНСТРУКЦИЯ_КОНФИГУРАТОР.txt — части A-D.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Patch.ps1" -ModuleFile "%~dp0Clover_ОбменКлиент.bsl"
echo.
pause
