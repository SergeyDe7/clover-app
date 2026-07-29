#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$ModuleFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ModuleFile)) {
  throw "Файл не найден: $ModuleFile"
}

$backup = "$ModuleFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $ModuleFile -Destination $backup -Force

# Read as bytes then detect UTF-8 / UTF-16 LE
$bytes = [System.IO.File]::ReadAllBytes($ModuleFile)
$utf8 = New-Object System.Text.UTF8Encoding $false
$utf16 = [System.Text.Encoding]::Unicode
if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
  $text = $utf16.GetString($bytes, 2, $bytes.Length - 2)
  $encoding = $utf16
  $writeBom = $true
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  $text = $utf8.GetString($bytes, 3, $bytes.Length - 3)
  $encoding = $utf8
  $writeBom = $true
} else {
  $text = $utf8.GetString($bytes)
  $encoding = $utf8
  $writeBom = $false
}

$original = $text
$changes = @()

function Replace-All([string]$src, [string]$old, [string]$new, [string]$label) {
  if ($src.Contains($old)) {
    $count = ([regex]::Matches($src, [regex]::Escape($old))).Count
    $script:changes += "$label : $count"
    return $src.Replace($old, $new)
  }
  return $src
}

# 1) Short empty-queue user messages (common variants)
$text = Replace-All $text `
  'Товары переданы, но заказ не создан: ' `
  '' `
  'Убран префикс «Товары переданы...»'

# If code builds long exception text for 404, prefer short message constants
$text = Replace-All $text `
  'Нет заказов, поставленных в очередь для 1С TEST.' `
  'Нет новых заказов' `
  'Текст пустой очереди (старый API)'

$text = Replace-All $text `
  'Нет заказов, поставленных в очередь для 1C TEST.' `
  'Нет новых заказов' `
  'Текст пустой очереди (латиница C)'

# Soften typical template if present as one string
$text = Replace-All $text `
  'Товары переданы, но заказ не создан' `
  'Нет новых заказов' `
  'Заголовок ошибки пустой очереди'

# 2) Comment field: stop appending CLOVER uuid / address into document comment
# Common concatenation patterns (best-effort; safe no-op if absent)
$commentPatterns = @(
  @{
    Old = ' + Символы.ПС + "[CLOVER:"'
    New = ' + "" + "[CLOVER_SKIP:"'
    Label = 'Отключена склейка [CLOVER:] через перевод строки'
  },
  @{
    Old = 'Символы.ПС + "[CLOVER:"'
    New = '"" + "[CLOVER_SKIP:"'
    Label = 'Отключена склейка [CLOVER:]'
  },
  @{
    Old = '"[CLOVER:" +'
    New = '"" + "'
    Label = 'Убран литерал [CLOVER:'
  },
  @{
    Old = 'Адрес доставки: "'
    New = 'АдресДоставкиСлужебно: "'
    Label = 'Помечен служебный префикс адреса в комментарии'
  }
)

foreach ($p in $commentPatterns) {
  $before = $text
  $text = Replace-All $text $p.Old $p.New $p.Label
}

# Stronger: if there is an explicit multi-line comment assembly, try known template
$oldBlock = @"
Заказ Clover №
"@

# Prefer keeping only order.comment from JSON — if module sets Comment = comment + uuid + address,
# rewrite frequent Russian templates:
$templates = @(
  @{
    Old = 'Комментарий = Комментарий + Символы.ПС + "[CLOVER:" + ИдентификаторClover + "]"';
    New = '// Clover patch: UUID не пишем в комментарий документа' + [Environment]::NewLine + '// ' + 'Комментарий = Комментарий + Символы.ПС + "[CLOVER:" + ИдентификаторClover + "]"';'
    Label = 'Закомментирована строка UUID в комментарии'
  },
  @{
    Old = 'Комментарий = Комментарий + Символы.ПС + "Адрес доставки: " + АдресДоставки;'
    New = '// Clover patch: адрес не пишем в комментарий документа' + [Environment]::NewLine + '// ' + 'Комментарий = Комментарий + Символы.ПС + "Адрес доставки: " + АдресДоставки;'
    Label = 'Закомментирована строка адреса в комментарии'
  }
)

foreach ($t in $templates) {
  if ($text.Contains($t.Old)) {
    $text = $text.Replace($t.Old, $t.New)
    $changes += $t.Label
  }
}

if ($text -eq $original) {
  Write-Host "ВНИМАНИЕ: автоматические замены не сработали."
  Write-Host "Файл сохранён без изменений логики (backup всё равно создан)."
  Write-Host "Backup: $backup"
  Write-Host "Откройте выгруженный модуль в Блокноте и пришлите @dsd фрагмент около строки с «Товары переданы» и «CLOVER» — сделаем точечный патч."
  exit 2
}

if ($writeBom -and $encoding -eq $utf16) {
  $outBytes = $utf16.GetPreamble() + $utf16.GetBytes($text)
  [System.IO.File]::WriteAllBytes($ModuleFile, $outBytes)
} elseif ($writeBom -and $encoding -eq $utf8) {
  $outBytes = $utf8.GetPreamble() + $utf8.GetBytes($text)
  [System.IO.File]::WriteAllBytes($ModuleFile, $outBytes)
} else {
  [System.IO.File]::WriteAllBytes($ModuleFile, $encoding.GetBytes($text))
}

Write-Host "OK. Патч применён к: $ModuleFile"
Write-Host "Backup: $backup"
Write-Host "Изменения:"
$changes | ForEach-Object { Write-Host " - $_" }
Write-Host ""
Write-Host "Дальше: в конфигураторе загрузите этот файл обратно в модуль (см. ИНСТРУКЦИЯ_КОНФИГУРАТОР.txt)."
