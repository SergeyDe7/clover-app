@echo off
chcp 65001 > nul
title Установка Clover Server

echo.
echo Проверка Node.js...
node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<13)){console.error('Нужен Node.js 22.13 или новее.'); process.exit(1)}; console.log('Node.js', process.versions.node, '- подходит')"
if errorlevel 1 (
  echo.
  echo Установите Node.js 22 LTS или 24 LTS и повторите.
  pause
  exit /b 1
)

cd /d "%~dp0server"

if not exist ".env" (
  copy ".env.example" ".env" > nul
  echo Создан server\.env
)

echo.
echo Установка зависимостей сервера...
call npm install
if errorlevel 1 (
  echo.
  echo Установка не завершилась. Пришлите скриншот ошибки.
  pause
  exit /b 1
)

echo.
echo Сервер установлен.
echo Тестовый менеджер: manager@clover.local
echo Пароль: Clover123!
echo.
pause
