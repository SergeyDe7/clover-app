# I18N Stage 1–8: переносимый verifier на Windows

Дата проверки: 2026-09-24.

## Назначение

Stage 1–8 должны запускаться из обычного Windows worktree без исторического
`/opt/clover`, Linux-команды `rm` и абсолютного пути к чужой установке
Playwright. Все проверки используют временную SQLite и временный build output.
Production, рабочая БД и 1С не участвуют.

## Browser runtime Stage 7

В корне закреплён `playwright-core`. Отдельный Chromium не скачивается.
`server/scripts/playwrightRuntime.mjs` выбирает браузер в следующем порядке:

1. `PLAYWRIGHT_CHROMIUM_PATH`;
2. установленный Chrome или Edge на Windows;
3. системный Chrome/Chromium на macOS/Linux;
4. Playwright channel из `PLAYWRIGHT_CHANNEL` (по умолчанию `chrome`).

Старый внешний Playwright остаётся поддержан через
`PLAYWRIGHT_MODULE_ROOT`. Linux-библиотеки для явно заданного браузера можно
передать через `PLAYWRIGHT_CHROME_LIBS`.

## Команды закрытия

```powershell
node server/scripts/verify-i18n-stage-1.mjs
node server/scripts/verify-i18n-stage-2.mjs
node server/scripts/verify-i18n-stage-3-core.mjs
node server/scripts/verify-i18n-stage-3-persistence.mjs
node server/scripts/verify-i18n-stage-3-system-ui.mjs
node server/scripts/verify-i18n-stage-3-2.mjs
node server/scripts/verify-i18n-stage-4.mjs
node server/scripts/verify-i18n-stage-5-1-categories.mjs
node server/scripts/verify-i18n-stage-5-2-a-info-pages.mjs
node server/scripts/verify-i18n-stage-5-2-b-seo.mjs
node server/scripts/verify-i18n-stage-6-1-language-preference.mjs
node server/scripts/verify-i18n-stage-6-2-language-selector.mjs
node server/scripts/verify-i18n-stage-7-jsonld-html-embed.mjs
node server/scripts/verify-i18n-stage-7-routing-seo-rtl.mjs
node server/scripts/verify-i18n-stage-7-locale-switch-consistency.mjs
Set-Location server
npm run test:i18n-stage-8-azure
```

Stage 8 использует mock provider. Успех этой команды не подтверждает реальный
Azure Translator и не разрешает включение провайдера.

## Защитные свойства

- URL-файлы преобразуются через `fileURLToPath`.
- SQLite закрывается до удаления временного каталога; Windows cleanup имеет
  ограниченный retry.
- Stage 4 проверяет LF-нормализованную временную копию tracked JSON-артефакта,
  не ослабляя byte-level проверку production importer.
- Исторические commit/dependency freeze удалены из timeless verifier'ов;
  scope конкретной доставки контролируется Git review.
- Каталог проверяется на уникальность ключей и обязательные Stage-ключи, а не
  на устаревающий абсолютный размер.

## Откат

До коммита — удалить worktree. После коммита — revert атомарного коммита.
Изменений БД, 1С, production и внешних сервисов для отката нет.
