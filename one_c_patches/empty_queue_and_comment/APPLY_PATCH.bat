@echo off
chcp 65001 > nul
title Clover 1C patch
cd /d "%~dp0"

if not exist "Clover_ObmenKlient.bsl" if not exist "Clover_ОбменКлиент.bsl" (
  echo First export the module to this folder as:
  echo   Clover_ObmenKlient.bsl
  echo or:
  echo   Clover_ОбменКлиент.bsl
  echo See INSTRUKCIYA / parts A-D.
  pause
  exit /b 1
)

set "MODULE=Clover_ObmenKlient.bsl"
if exist "Clover_ОбменКлиент.bsl" set "MODULE=Clover_ОбменКлиент.bsl"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Patch.ps1" -ModuleFile "%~dp0%MODULE%"
echo.
pause
