# Portable SEO locale-route browser smoke (Windows)

Do **not** run chrome-headless-shell on the production Linux host. This kit uses a
local Chrome or Edge profile on the workstation.

It does **not** use production SQLite, cookies, or secrets.
Do not edit source files to run it.

Full Windows transfer notes: `WINDOWS-TRANSFER.md`.

Windows browser smoke **PASS** (`ui-20260918-BJ_YbAhT`, 21 pages).
Evidence: `evidence/seo-browser-smoke-report.windows.json`.
The original transfer zip did not include a prebuilt candidate dist.

## 1. Simple JS page (required first)

From the candidate repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\seo-browser-smoke-portable\Run-SeoBrowserSmoke.ps1 -Phase simple
```

Expect `SIMPLE_JS_PROBE: PASS` and `root` text `js-ok`.

JSON report: `tools\seo-browser-smoke-portable\work\seo-browser-smoke-report.json`

## 2. Isolated candidate (HTTP + settled DOM)

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\seo-browser-smoke-portable\Run-SeoBrowserSmoke.ps1 -Phase candidate
```

The script sets `CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1`, seeds `work/fixture.sqlite`,
builds with Vite `--outDir` (not `npm run build -- --outDir`), generates sitemap,
asserts enabled artifacts, then runs Chrome/Edge.

## Chrome / Edge

First existing path wins: Chrome, then Edge. Override with `CLOVER_BROWSER_CHROME`.
Throwaway profile: `%TEMP%\clover-seo-*-<pid>`.

## What the candidate phase checks

- Home, catalog, and fixture product for `ru,en,uz,ky,tg,zh,ar`
- Initial HTML and settled DOM (`lang` / `dir`)
- Self-canonical, reciprocal hreflang, `x-default` on the matching `/ru/...` URL
- Chinese URL `/zh/`, `lang`/`hreflang` `zh-CN`
- Arabic `dir=rtl`
- Unknown paths stay 404

Language-switch delay is **not** claimed fixed.
