$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$resultPath = Join-Path $root 'ONEC_QUEUE_DIAGNOSTIC_RESULT.txt'
$envPath = Join-Path $root 'server\.env'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Clover -> 1C TEST queue diagnostic')
$lines.Add(('Time: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
$lines.Add('The secret exchange key is not written to this report.')
$lines.Add('')

try {
    if (-not (Test-Path $envPath)) {
        throw "Не найден файл server\.env. Диагностику нужно запускать из папки clover-app."
    }

    $key = $null
    foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
        if ($line -match '^\s*ONEC_API_KEY\s*=\s*(.*)\s*$') {
            $key = $Matches[1].Trim().Trim('"').Trim("'")
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($key)) {
        throw 'В server\.env не найден ONEC_API_KEY.'
    }

    $url = 'http://localhost:4100/api/one-c/test-order?database=TEST'
    $headers = @{ 'X-Clover-Key' = $key }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers $headers -Method Get -TimeoutSec 30
        $statusCode = [int]$response.StatusCode
        $body = [string]$response.Content
    }
    catch {
        $statusCode = 0
        $body = $_.Exception.Message
        if ($_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode.value__ } catch {}
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                }
            } catch {}
        }
    }

    $lines.Add(('HTTP status: ' + $statusCode))
    $lines.Add('Response:')
    $lines.Add($body)
}
catch {
    $lines.Add('DIAGNOSTIC ERROR:')
    $lines.Add($_.Exception.Message)
}

[System.IO.File]::WriteAllLines($resultPath, $lines, (New-Object System.Text.UTF8Encoding($true)))
Write-Host ''
Write-Host 'Диагностика завершена. Ключ обмена в отчёт не записан.' -ForegroundColor Green
Write-Host $resultPath
Start-Process notepad.exe -ArgumentList ('"' + $resultPath + '"')
