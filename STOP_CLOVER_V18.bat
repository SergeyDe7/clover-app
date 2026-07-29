@echo off
chcp 65001 > nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Stop-Clover.ps1"
timeout /t 2 /nobreak > nul
