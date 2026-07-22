@echo off
chcp 65001 > nul
title Clover

if not exist "%~dp0server\node_modules" (
  echo Сначала запустите INSTALL_SERVER.bat
  pause
  exit /b 1
)

start "Clover Server" cmd /k "cd /d ""%~dp0server"" && npm run dev"
timeout /t 2 /nobreak > nul
start "Clover Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo Запущены два окна:
echo 1. Clover Server - порт 4000
echo 2. Clover Frontend - порт 5173
echo.
echo Откройте: http://localhost:5173/
timeout /t 3 /nobreak > nul
start "" "http://localhost:5173/"
