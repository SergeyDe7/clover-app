@echo off
chcp 65001 > nul
title Clover - исправление очереди 1С TEST
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_ONEC_QUEUE_FIX_TEST.ps1"
exit /b %ERRORLEVEL%
