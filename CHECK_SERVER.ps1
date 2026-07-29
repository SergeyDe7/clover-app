$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Проверка Clover Server..." -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4100/api/health" -Method Get -TimeoutSec 5
    if ($response.ok -ne $true -or $response.service -ne "clover-server") {
      throw "Неожиданный ответ сервера."
    }
    Write-Host "Сервер работает:" $response.service -ForegroundColor Green
    Write-Host "Версия:" $response.version
    Write-Host "Время сервера:" $response.time
} catch {
    Write-Host "Сервер Clover не отвечает на порту 4100." -ForegroundColor Red
    Write-Host "Сначала запустите START_CLOVER.bat"
}

Write-Host ""
Read-Host "Нажмите Enter"
