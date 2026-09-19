# Повторный Windows smoke после правки sanitizer

Предыдущий полный цикл (согласие, навигация, revoke, mock-заказы, layout, production OFF/ON) остаётся PASS, если эти файлы не менялись. Повторять его не нужно.

Обязательно повторить только:

- `sensitive_url_title_referrer` — должен сохраниться `yclid=12345678901234567890` и `utm_campaign=ok_campaign`; phone/email/`utm_source=9211234567` не должны уйти в hit
- рекламная атрибуция click id (`yclid` / `ymclid` / `ysclid` / `gclid`) и связанная регрессия sanitizer
- `network_guard` — любой реальный host Метрики / beacon = FAIL

Не запускать Chrome на Linux. Не слать в `mc.yandex.ru` и альтернативные домены.

Windows-harness diff предыдущего прогона лежит в
`tools/metrika-browser-smoke-portable/evidence/windows-harness-run-metrika-browser-smoke.diff`
и уже учтён в launcher этого архива.

```powershell
cd <unpacked-candidate>
# Node 22 + npm ci по lockfile, системный Chrome/Edge, временный профиль
$env:CLOVER_METRIKA_SMOKE_ONLY = "sensitive_url_title_referrer,network_guard"
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\metrika-browser-smoke-portable\Run-MetrikaBrowserSmoke.ps1
```

Локальная проверка без браузера (до launcher):

```powershell
node .\server\scripts\verify-yandex-metrika-url-sanitizer.mjs
```
