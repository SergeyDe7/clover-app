@echo off
REM ASCII-only batch. Do not put Cyrillic in this file.
cd /d "%~dp0"
setlocal EnableExtensions

set "MODULE="

REM Prefer ASCII export name
if exist "Clover_module.bsl" set "MODULE=%~dp0Clover_module.bsl"

REM Or any Clover_*.bsl (matches Cyrillic names via wildcard, no Cyrillic in bat text)
if not defined MODULE (
  for %%F in (Clover_*.bsl) do (
    set "MODULE=%%~fF"
    goto :have_module
  )
)

:have_module
if not defined MODULE (
  echo.
  echo ERROR: module file not found in this folder.
  echo.
  echo Save the exported 1C module here as:
  echo   Clover_module.bsl
  echo.
  echo Then run APPLY_PATCH.bat again.
  echo.
  pause
  exit /b 1
)

echo Using module:
echo %MODULE%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Patch.ps1" -ModuleFile "%MODULE%"
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
  echo Patch finished with code %ERR%
)
pause
exit /b %ERR%
