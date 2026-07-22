$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Проверка Clover Server..." -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/health" -Method Get
    Write-Host "Сервер работает:" $response.service -ForegroundColor Green
    Write-Host "Время сервера:" $response.time
} catch {
    Write-Host "Сервер не отвечает на порту 4000." -ForegroundColor Red
    Write-Host "Сначала запустите START_CLOVER.bat"
}

Write-Host ""
Read-Host "Нажмите Enter"
