# Windows — browser smoke для Метрики (mock only)

Не запускать chrome-headless-shell на production Linux.
Не слать трафик на `mc.yandex.ru`. Isolated TEST_MODE-сборка обязана
грузить только `/__clover_metrika_mock.js`.

Работать **на Windows**, не в Remote SSH. Alias `clover` — только чтение
текущего candidate (включая незакоммиченные файлы), не `HEAD` и не свежий `main`.

## Что переносить

С Linux-источника:

```powershell
ssh clover "node /opt/clover/worktrees/metrika-consent-banner-compact/tools/metrika-browser-smoke-portable/pack-candidate.mjs"
```

Скрипт пишет архив в `/tmp/clover-metrika-candidate-*` и
`IDENTITY.json` / `SHA256SUMS` / `MANIFEST.json`.
Скопировать архив и checksums:

```powershell
New-Item -ItemType Directory -Force C:\clover-metrika-smoke | Out-Null
scp clover:/tmp/clover-metrika-candidate-*/metrika-consent-banner-compact-candidate.tar.gz C:\clover-metrika-smoke\
scp clover:/tmp/clover-metrika-candidate-*/ARCHIVE.sha256 C:\clover-metrika-smoke\
scp clover:/tmp/clover-metrika-candidate-*/SHA256SUMS C:\clover-metrika-smoke\
scp clover:/tmp/clover-metrika-candidate-*/IDENTITY.json C:\clover-metrika-smoke\
scp clover:/tmp/clover-metrika-candidate-*/WINDOWS-RUN.md C:\clover-metrika-smoke\
```

Не копировать `.env`, рабочие БД, секреты, `node_modules`.

Распаковать в отдельную папку и сверить checksums с `SHA256SUMS`.
`IDENTITY.json` должен показывать ветку `agent/metrika-consent-banner-compact`,
HEAD `73341869c1f3b6733c82d3b43044ae753c4abf32`, грязное дерево и SHA файлов
баннера — не чистый `origin/main` без незакоммиченных правок.

## Зависимости

- Node.js 22+
- Локальный Chrome или Edge
- После распаковки: `npm ci` (launcher делает это сам, если нет `node_modules`)
- Не указывать `CLOVER_BROWSER_CHROME` на Linux chrome-headless-shell

## Запуск

```powershell
cd C:\clover-metrika-smoke\candidate
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\metrika-browser-smoke-portable\Run-MetrikaBrowserSmoke.ps1
```

Launcher:

1. Проверяет Node и Chrome/Edge.
2. Собирает off-live TEST_MODE, production OFF и production ON **локально**.
3. Поднимает isolated HTTP на `127.0.0.1` с mock API заказов.
4. Открывает временный профиль браузера.
5. Блокирует `mc.yandex.ru` / `yandex.ru/metrika` — любой запрос = FAIL.
6. Пишет JSON в `tools/metrika-browser-smoke-portable/evidence/scenarios/`
   и PNG `consent-prompt-{ru|ar}-{390|1280}.png`.

Production-mode ON проверяется только на localhost. Hostname-allowlist
в доставляемом коде не отключается: на `127.0.0.1` счётчик не грузится.

`VITE_STORE_HOSTS=127.0.0.1,localhost` задаёт launcher, чтобы витрина
вообще открылась. Это не отключает `PRODUCTION_ANALYTICS_HOSTS`.

## Ручной запасной чеклист

Если launcher недоступен — те же пункты вручную, но отчёт без JSON/PNG
не считается `METRIKA_BROWSER_SMOKE_PASS`.

1. `http://127.0.0.1:…/` — баннер, счётчик не грузится.
2. Каталог / вход / корзина доступны под баннером.
3. «Отклонить» — нет `mc.yandex.ru`, нет mock init.
4. Reload — баннер не возвращается.
5. «Настройки аналитики» — можно разрешить.
6. После «Разрешить» только `/__clover_metrika_mock.js`.
7. `/lk` `/auth` `/admin` — без событий; возврат на витрину — новый init/hit.
8. Отзыв / неизвестная version — без SDK.
9. Mock-заказ: успех = одна цель; ошибка/повтор номера = без лишних целей.
10. `/ar/` — `dir=rtl`, кнопки доступны, нет overflow.
11. Реальные заказы не создавать.

Снимки и JSON класть в `tools/metrika-browser-smoke-portable/evidence/`.

Mock PASS не доказывает, что настоящий `tag.js` перестаёт слать auto-beacon
после `destruct`. Это поле всегда `NOT VERIFIED`.
