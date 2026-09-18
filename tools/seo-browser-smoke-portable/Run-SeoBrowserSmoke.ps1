param(
  [ValidateSet("simple", "candidate")]
  [string]$Phase = "simple"
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..")
Set-Location $repo

$work = Join-Path $here "work"
New-Item -ItemType Directory -Force -Path $work | Out-Null
$env:CLOVER_SEO_SMOKE_REPORT = Join-Path $work "seo-browser-smoke-report.json"

if (-not $env:CLOVER_BROWSER_CHROME) {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) {
      $env:CLOVER_BROWSER_CHROME = $path
      break
    }
  }
}
if (-not $env:CLOVER_BROWSER_CHROME) {
  Write-Error "Chrome/Edge not found. Install Chrome or Edge, or set CLOVER_BROWSER_CHROME. Do not use the production Linux chrome-headless-shell."
}

Write-Host "Using $($env:CLOVER_BROWSER_CHROME) phase=$Phase"
Write-Host "JSON report: $($env:CLOVER_SEO_SMOKE_REPORT)"

function Invoke-LoggedNode {
  param([Parameter(Mandatory = $true)][string[]]$ArgumentList)
  # Capture native stdout so it does not become PowerShell function output.
  $output = & node @ArgumentList
  $code = $LASTEXITCODE
  if ($null -ne $output) {
    Write-Host (($output | ForEach-Object { "$_" }) -join [Environment]::NewLine)
  }
  if ($code -ne 0) { exit $code }
}

function Prepare-CandidateDist {
  $dist = Join-Path $work "dist"
  if ($env:CLOVER_SEO_DIST) { $dist = $env:CLOVER_SEO_DIST }
  $dist = [System.IO.Path]::GetFullPath($dist)
  $index = Join-Path $dist "index.html"
  if ((Test-Path $index) -and $env:CLOVER_SEO_REBUILD -ne "1") {
    Write-Host "Using existing candidate dist: $dist"
    return $dist
  }
  Write-Host "Building isolated candidate dist (fixture DB only; no production DB/secrets)"
  $env:CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1"
  $env:DB_PATH = Join-Path $work "fixture.sqlite"
  $env:SITEMAP_OUT = Join-Path $dist "sitemap.xml"
  $env:PUBLIC_ROUTE_MANIFEST_OUT = Join-Path $dist "public-route-manifest.json"
  Invoke-LoggedNode -ArgumentList @((Join-Path $here "seed-fixture-db.mjs"))
  $vite = Join-Path $repo "node_modules\vite\bin\vite.js"
  if (-not (Test-Path $vite)) {
    Write-Error "node_modules/vite missing. From the repo root run: npm ci"
  }
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  # Do not use `npm run build -- --outDir`: extra args attach to generate-sitemap.
  Invoke-LoggedNode -ArgumentList @($vite, "build", "--outDir", $dist, "--emptyOutDir")
  Invoke-LoggedNode -ArgumentList @((Join-Path $repo "server\scripts\generate-sitemap.mjs"))
  Invoke-LoggedNode -ArgumentList @((Join-Path $repo "server\scripts\assert-locale-route-release.mjs"), "--dist", $dist, "--db", $env:DB_PATH, "--expect", "enabled")
  return $dist
}

if ($Phase -eq "candidate") {
  $dist = Prepare-CandidateDist
  $env:CLOVER_SEO_DIST = [System.IO.Path]::GetFullPath($dist)
}

$nodeArgs = @("tools/seo-browser-smoke-portable/run.mjs")
if ($Phase -eq "candidate") { $nodeArgs += "--candidate" }
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "JSON report saved: $($env:CLOVER_SEO_SMOKE_REPORT)"
