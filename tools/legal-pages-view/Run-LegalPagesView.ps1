# Real React legal-page view. No Metrika ON, no orders, no deploy.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here "..\..")
Set-Location $root

Write-Host "preflight: node"
node --version
if ($LASTEXITCODE -ne 0) { throw "Node.js 22+ is required" }

$vite = Join-Path $root "node_modules\vite\bin\vite.js"
if (-not (Test-Path $vite)) {
  Write-Host "preflight: npm ci (no node_modules in the transfer)"
  npm ci
}

$chromeCandidates = @(
  $env:CLOVER_BROWSER_CHROME,
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(X86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $chromeCandidates) {
  throw "Chrome/Edge not found. Install a local browser or set CLOVER_BROWSER_CHROME."
}
Write-Host "preflight: browser $($chromeCandidates[0])"
Write-Host "Static HTML in tools/legal-pages-view/pages is not this check."

node .\tools\legal-pages-view\run-legal-pages-view.mjs --keep-open
exit $LASTEXITCODE
