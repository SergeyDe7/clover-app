@echo off
chcp 65001 > nul
REM Единая точка старта — делегирует в START_CLOVER_V18.bat (без дублирования логики).
call "%~dp0START_CLOVER_V18.bat"
