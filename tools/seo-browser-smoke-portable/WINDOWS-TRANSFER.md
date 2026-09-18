# Windows transfer — portable SEO browser smoke

Windows browser smoke **PASS** on 2026-09-18 (`ui-20260918-BJ_YbAhT`, 21 pages).
Evidence: `tools/seo-browser-smoke-portable/evidence/`.
Do not run chrome-headless-shell on the production Linux host.

PowerShell 5.1: `Invoke-LoggedNode` captures native stdout so it cannot become `CLOVER_SEO_DIST`.

## What this archive contains

- Candidate **source** for branch `agent/fix-seo-locale-routes-on-main`
- Portable kit under `tools/seo-browser-smoke-portable/`
- Anonymized fixture `fixtures/storefront.json` (not production data)

It does **not** contain:

- a prebuilt candidate `dist/`
- `node_modules`
- production SQLite
- `server/.env` / secrets / cookies / PII

You build the candidate on the Windows machine.

## Identity

See `tools/seo-browser-smoke-portable/identity.json` in the unpacked tree.

## Windows dependencies

- Node.js **22+** (global `WebSocket`, `node:sqlite`)
- npm
- Installed **Chrome** or **Edge** (no browser download)
- Do not point `CLOVER_BROWSER_CHROME` at the Linux `chrome-headless-shell`

## Unpack

Unzip to a folder, for example `C:\clover-seo-smoke`.
The repo root is the folder that contains `package.json` and `tools\`.

```powershell
cd C:\clover-seo-smoke
Get-Content .\tools\seo-browser-smoke-portable\identity.json
```

## Chrome / Edge selection

`Run-SeoBrowserSmoke.ps1` picks the first existing path:

1. `%ProgramFiles%\Google\Chrome\Application\chrome.exe`
2. `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`
3. `%ProgramFiles%\Microsoft\Edge\Application\msedge.exe`
4. `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`

Override:

```powershell
$env:CLOVER_BROWSER_CHROME = "C:\Path\To\chrome.exe"
```

Throwaway profile: `%TEMP%\clover-seo-*-<pid>`. Only this process is started/stopped.

## JSON report path

Default:

`tools\seo-browser-smoke-portable\work\seo-browser-smoke-report.json`

Override with `CLOVER_SEO_SMOKE_REPORT`.

The report includes `console`, `pageerror`, and `requestfailed`.

## 1. Simple JS probe (required first)

No `npm install`. No candidate build.

```powershell
cd C:\clover-seo-smoke
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\seo-browser-smoke-portable\Run-SeoBrowserSmoke.ps1 -Phase simple
```

Expect: `SIMPLE_JS_PROBE: PASS` and `#root` text `js-ok`.

If this fails, stop. The candidate phase cannot be trusted on this machine.

## 2. Isolated candidate

```powershell
cd C:\clover-seo-smoke
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\seo-browser-smoke-portable\Run-SeoBrowserSmoke.ps1 -Phase candidate
```

The script:

- sets `CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1`
- seeds `tools\seo-browser-smoke-portable\work\fixture.sqlite`
- runs Vite as `node node_modules\vite\bin\vite.js build --outDir <work\dist>`  
  (not `npm run build -- --outDir`)
- generates sitemap + asserts enabled artifacts
- serves loopback HTML through the same locale-route renderer as preview
- checks home / catalog / product for `ru,en,uz,ky,tg,zh,ar`

Rebuild:

```powershell
$env:CLOVER_SEO_REBUILD = "1"
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\seo-browser-smoke-portable\Run-SeoBrowserSmoke.ps1 -Phase candidate
```

Do not edit source files to run this.
Do not copy production DB or dotenv onto the Windows machine.
