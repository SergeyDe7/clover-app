#Requires -Version 5.1
# ASCII-only for Windows PowerShell 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$ModuleFile
)

$ErrorActionPreference = "Stop"

function Decode-Utf8B64([string]$b64) {
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

$ModuleFile = [System.Environment]::ExpandEnvironmentVariables($ModuleFile).Trim().Trim('"')
if (-not [System.IO.Path]::IsPathRooted($ModuleFile)) {
  $ModuleFile = Join-Path (Get-Location).Path $ModuleFile
}

if (-not (Test-Path -LiteralPath $ModuleFile)) {
  throw ("File not found: " + $ModuleFile)
}

$fullPath = (Resolve-Path -LiteralPath $ModuleFile).Path
$backup = "$fullPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $fullPath -Destination $backup -Force

$bytes = [System.IO.File]::ReadAllBytes($fullPath)
$utf8 = New-Object System.Text.UTF8Encoding $false
$utf16 = [System.Text.Encoding]::Unicode
$mode = "utf8"

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
  $text = $utf16.GetString($bytes, 2, $bytes.Length - 2)
  $mode = "utf16bom"
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  $text = $utf8.GetString($bytes, 3, $bytes.Length - 3)
  $mode = "utf8bom"
} elseif ($bytes.Length -gt 4 -and $bytes[1] -eq 0 -and $bytes[3] -eq 0) {
  $text = $utf16.GetString($bytes)
  $mode = "utf16bom"
} else {
  $text = $utf8.GetString($bytes)
  $mode = "utf8"
}

$original = $text
$changes = New-Object System.Collections.Generic.List[string]

function Apply-Replace([ref]$src, [string]$old, [string]$new, [string]$label) {
  if ([string]::IsNullOrEmpty($old)) { return }
  if ($src.Value.IndexOf($old) -lt 0) { return }
  $count = 0
  $pos = 0
  while (($i = $src.Value.IndexOf($old, $pos)) -ge 0) {
    $count++
    $pos = $i + $old.Length
  }
  $src.Value = $src.Value.Replace($old, $new)
  [void]$changes.Add("$label x$count")
}

# Base64 UTF-8 payloads (generated)
$oldPrefix = Decode-Utf8B64 "0KLQvtCy0LDRgNGLINC/0LXRgNC10LTQsNC90YssINC90L4g0LfQsNC60LDQtyDQvdC1INGB0L7Qt9C00LDQvTog"
$oldTitle  = Decode-Utf8B64 "0KLQvtCy0LDRgNGLINC/0LXRgNC10LTQsNC90YssINC90L4g0LfQsNC60LDQtyDQvdC1INGB0L7Qt9C00LDQvQ=="
$oldApi1   = Decode-Utf8B64 "0J3QtdGCINC30LDQutCw0LfQvtCyLCDQv9C+0YHRgtCw0LLQu9C10L3QvdGL0YUg0LIg0L7Rh9C10YDQtdC00Ywg0LTQu9GPIDHQoSBURVNULg=="
$oldApi2   = Decode-Utf8B64 "0J3QtdGCINC30LDQutCw0LfQvtCyLCDQv9C+0YHRgtCw0LLQu9C10L3QvdGL0YUg0LIg0L7Rh9C10YDQtdC00Ywg0LTQu9GPIDFDIFRFU1Qu"
$newShort  = Decode-Utf8B64 "0J3QtdGCINC90L7QstGL0YUg0LfQsNC60LDQt9C+0LI="

$oldCloverLine  = Decode-Utf8B64 "ICsg0KHQuNC80LLQvtC70Ysu0J/QoSArICJbQ0xPVkVSOiI="
$newCloverLine  = ' + "" + "[CLOVER_SKIP:"'
$oldCloverLine2 = Decode-Utf8B64 "0KHQuNC80LLQvtC70Ysu0J/QoSArICJbQ0xPVkVSOiI="
$newCloverLine2 = '"" + "[CLOVER_SKIP:"'
$oldCloverLit   = '"[CLOVER:" +'
$newCloverLit   = '"" + "'

$oldAddr = Decode-Utf8B64 "0JDQtNGA0LXRgSDQtNC+0YHRgtCw0LLQutC4OiAi"
$newAddr = Decode-Utf8B64 "0JDQtNGA0LXRgdCU0L7RgdGC0LDQstC60LjQodC70YPQttC10LHQvdC+OiAi"

$oldCommentUuid = Decode-Utf8B64 "0JrQvtC80LzQtdC90YLQsNGA0LjQuSA9INCa0L7QvNC80LXQvdGC0LDRgNC40LkgKyDQodC40LzQstC+0LvRiy7Qn9ChICsgIltDTE9WRVI6IiArINCY0LTQtdC90YLQuNGE0LjQutCw0YLQvtGAQ2xvdmVyICsgIl0iOw=="
$newCommentUuid = "// Clover patch: skip UUID in document comment"
$oldCommentAddr = Decode-Utf8B64 "0JrQvtC80LzQtdC90YLQsNGA0LjQuSA9INCa0L7QvNC80LXQvdGC0LDRgNC40LkgKyDQodC40LzQstC+0LvRiy7Qn9ChICsgItCQ0LTRgNC10YEg0LTQvtGB0YLQsNCy0LrQuDogIiArINCQ0LTRgNC10YHQlNC+0YHRgtCw0LLQutC4Ow=="
$newCommentAddr = "// Clover patch: skip address in document comment"

$textRef = [ref]$text

# 1) Collapse "Товары переданы...: <details>" to short message first
$longMsgStart = Decode-Utf8B64 "0KLQvtCy0LDRgNGLINC/0LXRgNC10LTQsNC90YssINC90L4g0LfQsNC60LDQtyDQvdC1INGB0L7Qt9C00LDQvTog"
if ($textRef.Value.IndexOf($longMsgStart) -ge 0) {
  $sb = New-Object System.Text.StringBuilder
  $i = 0
  $src = $textRef.Value
  $replaced = 0
  while ($i -lt $src.Length) {
    $p = $src.IndexOf($longMsgStart, $i)
    if ($p -lt 0) {
      [void]$sb.Append($src.Substring($i))
      break
    }
    [void]$sb.Append($src.Substring($i, $p - $i))
    [void]$sb.Append($newShort)
    $j = $p + $longMsgStart.Length
    while ($j -lt $src.Length -and $src[$j] -ne [char]34 -and $src[$j] -ne "`n" -and $src[$j] -ne "`r") { $j++ }
    $i = $j
    $replaced++
  }
  if ($replaced -gt 0) {
    $textRef.Value = $sb.ToString()
    [void]$changes.Add("collapse-long-empty-msg x$replaced")
  }
}

# 2) Exact phrase leftovers / API texts
Apply-Replace $textRef $oldTitle $newShort "empty-queue-title"
Apply-Replace $textRef $oldApi1 $newShort "empty-queue-api-cyr"
Apply-Replace $textRef $oldApi2 $newShort "empty-queue-api-lat"

# 3) Comment assembly
Apply-Replace $textRef $oldCloverLine $newCloverLine "disable-clover-concat-1"
Apply-Replace $textRef $oldCloverLine2 $newCloverLine2 "disable-clover-concat-2"
Apply-Replace $textRef $oldCloverLit $newCloverLit "disable-clover-literal"
Apply-Replace $textRef $oldAddr $newAddr "disable-address-literal"
Apply-Replace $textRef $oldCommentUuid $newCommentUuid "comment-out-uuid-assign"
Apply-Replace $textRef $oldCommentAddr $newCommentAddr "comment-out-address-assign"
$text = $textRef.Value

if ($text -eq $original) {
  Write-Host "WARNING: no automatic replacements matched."
  Write-Host ("Backup still created: " + $backup)
  Write-Host "Send the exported Clover_ObmenKlient.bsl to @dsd for a precise patch."
  exit 2
}

if ($mode -eq "utf16bom") {
  $outBytes = $utf16.GetPreamble() + $utf16.GetBytes($text)
} elseif ($mode -eq "utf8bom") {
  $outBytes = ([byte[]](0xEF, 0xBB, 0xBF)) + $utf8.GetBytes($text)
} else {
  $outBytes = $utf8.GetBytes($text)
}
[System.IO.File]::WriteAllBytes($fullPath, $outBytes)

Write-Host ("OK. Patched: " + $fullPath)
Write-Host ("Backup: " + $backup)
Write-Host "Changes:"
foreach ($c in $changes) { Write-Host (" - " + $c) }
Write-Host "Next: load this file back into the 1C module (instruction part F)."
