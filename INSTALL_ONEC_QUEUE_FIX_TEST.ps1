$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OrderNumber = "CL-260728-152400-536"
$ExpectedTotal = 210
$ExpectedOriginalServerSha256 = "d358dd62711a5cc83515c7527fe68a50efa91c3ae0238e4dd14c230550dcdf17"
$ExpectedPatchedServerSha256 = "79967439ce1e11741337e457c00597f14a721acf62510aa8804fbaf9e5a95591"
$LogPath = Join-Path $PackageRoot "INSTALL_ONEC_QUEUE_FIX_RESULT.txt"
$TargetRoot = $null
$BackupRoot = $null
$InstalledServer = $false
$DatabaseChanged = $false

function Write-Log([string]$Message) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  Write-Host $Message
}

function Find-CloverRoot {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $candidates = @(
    (Join-Path $desktop "Clover\clover-app"),
    (Join-Path $env:USERPROFILE "Desktop\Clover\clover-app"),
    "C:\Users\Lonovo\Desktop\Clover\clover-app",
    "C:\Users\Lenovo\Desktop\Clover\clover-app"
  ) | Select-Object -Unique

  foreach ($candidate in $candidates) {
    if (
      (Test-Path -LiteralPath (Join-Path $candidate "server\src\server.js")) -and
      (Test-Path -LiteralPath (Join-Path $candidate "server\data\clover.sqlite"))
    ) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "Папка Clover не найдена. Ожидалась папка Desktop\Clover\clover-app."
}

function Stop-Clover([string]$Root) {
  $stopScript = Join-Path $Root "tools\Stop-Clover.ps1"
  if (Test-Path -LiteralPath $stopScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) { throw "Не удалось остановить Clover." }
  } else {
    $stopBat = Join-Path $Root "STOP_CLOVER_V18.bat"
    if (Test-Path -LiteralPath $stopBat) {
      & cmd.exe /d /c ('"{0}"' -f $stopBat) | ForEach-Object { Write-Log $_ }
      if ($LASTEXITCODE -ne 0) { throw "Не удалось остановить Clover." }
    } else {
      throw "Не найден штатный скрипт остановки Clover."
    }
  }
  Start-Sleep -Seconds 2
}

function Start-Clover([string]$Root) {
  $startScript = Join-Path $Root "tools\Start-Clover.ps1"
  if (Test-Path -LiteralPath $startScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) { throw "Clover не запустился после обновления." }
  } else {
    $startBat = Join-Path $Root "START_CLOVER_V18.bat"
    if (Test-Path -LiteralPath $startBat) {
      & cmd.exe /d /c ('"{0}"' -f $startBat) | ForEach-Object { Write-Log $_ }
      if ($LASTEXITCODE -ne 0) { throw "Clover не запустился после обновления." }
    } else {
      throw "Не найден штатный скрипт запуска Clover."
    }
  }
}

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    if ($trimmed -match ('^{0}\s*=\s*(.*)$' -f [regex]::Escape($Name))) {
      $value = $Matches[1].Trim()
      if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return ""
}

function Test-Queue([string]$Root) {
  $headers = @{}
  $apiKey = Get-EnvValue (Join-Path $Root "server\.env") "ONEC_API_KEY"
  if ($apiKey) { $headers["X-Clover-Key"] = $apiKey }

  $response = Invoke-RestMethod `
    -Uri "http://127.0.0.1:4100/api/one-c/queue-status?database=TEST" `
    -Headers $headers `
    -TimeoutSec 10

  if ($response.ok -ne $true) { throw "Диагностика очереди не вернула ok=true." }
  if ([string]$response.database -ne "TEST") { throw "Диагностика вернула не базу TEST." }
  if ([string]$response.queue.nextOrderNumber -ne $OrderNumber) {
    throw "После установки первым в очереди оказался другой заказ: $($response.queue.nextOrderNumber)."
  }

  Write-Log "Проверка API пройдена: заказ $OrderNumber первый в очереди 1С TEST."
}

function Restore-Backup([string]$Root, [string]$Backup) {
  if (-not $Backup -or -not (Test-Path -LiteralPath $Backup)) { return }
  Write-Log "Выполняется автоматический откат..."
  try { Stop-Clover $Root } catch { Write-Log "Предупреждение при остановке перед откатом: $($_.Exception.Message)" }

  $targetServer = Join-Path $Root "server\src\server.js"
  $backupServer = Join-Path $Backup "server.js"
  if (Test-Path -LiteralPath $backupServer) {
    Copy-Item -LiteralPath $backupServer -Destination $targetServer -Force
  }

  $dataDirectory = Join-Path $Root "server\data"
  foreach ($name in @("clover.sqlite", "clover.sqlite-wal", "clover.sqlite-shm")) {
    $target = Join-Path $dataDirectory $name
    $source = Join-Path $Backup $name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $target -Force }
  }

  try {
    Start-Clover $Root
    Write-Log "Откат выполнен, исходная версия Clover запущена."
  } catch {
    Write-Log "Откат файлов выполнен, но Clover не запустился: $($_.Exception.Message)"
  }
}

Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
Write-Log "Clover 1C Queue Fix V3. Только база 1С TEST."
Write-Log "Заказ: $OrderNumber, ожидаемая сумма: $ExpectedTotal руб."
Write-Log "Кнопки обмена установщик не нажимает и запрос получения заказа не выполняет."

try {
  $TargetRoot = Find-CloverRoot
  Write-Log "Найдена папка Clover: $TargetRoot"

  $patchedServer = Join-Path $PackageRoot "payload\server\src\server.js"
  $repairScript = Join-Path $PackageRoot "repair-order.mjs"
  if (-not (Test-Path -LiteralPath $patchedServer)) { throw "В пакете отсутствует server.js." }
  if (-not (Test-Path -LiteralPath $repairScript)) { throw "В пакете отсутствует repair-order.mjs." }

  $targetServer = Join-Path $TargetRoot "server\src\server.js"
  $currentServerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetServer).Hash.ToLowerInvariant()
  $packageServerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $patchedServer).Hash.ToLowerInvariant()
  if ($packageServerHash -ne $ExpectedPatchedServerSha256) {
    throw "Контрольная сумма пакета не совпала. Архив повреждён; установка остановлена."
  }
  if ($currentServerHash -notin @($ExpectedOriginalServerSha256, $ExpectedPatchedServerSha256)) {
    throw "Текущая версия server.js отличается от проверенного архива. Установка остановлена без изменений."
  }
  Write-Log "Версия backend распознана; контрольные суммы проверены."

  $nodeVersion = (& node -p "process.versions.node").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $nodeVersion) { throw "Node.js не найден." }
  Write-Log "Node.js: $nodeVersion"

  Stop-Clover $TargetRoot

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $BackupRoot = Join-Path $TargetRoot "backups\before-onec-queue-404-fix-$timestamp"
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

  Copy-Item -LiteralPath (Join-Path $TargetRoot "server\src\server.js") -Destination (Join-Path $BackupRoot "server.js") -Force
  foreach ($name in @("clover.sqlite", "clover.sqlite-wal", "clover.sqlite-shm")) {
    $source = Join-Path $TargetRoot "server\data\$name"
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $BackupRoot $name) -Force
    }
  }
  Write-Log "Резервная копия создана: $BackupRoot"

  Copy-Item -LiteralPath $patchedServer -Destination (Join-Path $TargetRoot "server\src\server.js") -Force
  $InstalledServer = $true

  & node --check (Join-Path $TargetRoot "server\src\server.js")
  if ($LASTEXITCODE -ne 0) { throw "Синтаксическая проверка server.js не пройдена." }
  Write-Log "Новый backend установлен и прошёл проверку синтаксиса."

  $databasePath = Join-Path $TargetRoot "server\data\clover.sqlite"
  & node $repairScript $databasePath $OrderNumber | ForEach-Object { Write-Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "Безопасное восстановление заказа в очереди завершилось ошибкой (код $LASTEXITCODE)." }
  $DatabaseChanged = $true

  Start-Clover $TargetRoot
  Test-Queue $TargetRoot

  $targetLog = Join-Path $TargetRoot "INSTALL_ONEC_QUEUE_FIX_RESULT.txt"
  Write-Log "SUCCESS: исправление установлено. Заказ готов к получению только в 1С TEST."
  Write-Log "Следующее действие: открыть 1С TEST и один раз выполнить получение заказа."
  Copy-Item -LiteralPath $LogPath -Destination $targetLog -Force

  Start-Process "http://localhost:5273/"
  Write-Host ""
  Write-Host "ГОТОВО. Заказ $OrderNumber стоит первым в очереди 1С TEST." -ForegroundColor Green
  Write-Host "Не нажимайте повторно кнопки очереди в Clover. Теперь можно один раз получить заказ в 1С TEST." -ForegroundColor Yellow
  Write-Host "Отчёт: $targetLog"
  Write-Host ""
  pause
  exit 0
} catch {
  $message = $_.Exception.Message
  Write-Log "ERROR: $message"
  if ($TargetRoot -and $BackupRoot -and ($InstalledServer -or $DatabaseChanged)) {
    Restore-Backup $TargetRoot $BackupRoot
  }
  Write-Host ""
  Write-Host "Установка отменена. Исходные файлы восстановлены." -ForegroundColor Red
  Write-Host "Отправьте файл: $LogPath"
  Write-Host ""
  pause
  exit 1
}
