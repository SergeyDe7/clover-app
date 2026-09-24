# SEO `/ru/`: сканируемый HTML и внутренние ссылки — 24.09.2026

## Проверенные исходные факты

- База ветки: `2dde2e0ea64572336c5926bf01e701d5b384e7fa`.
- На production перед этой работой был опубликован тот же commit; `clover-api` и `clover-ui` были активны.
- Оба legacy URL из PR #159 уже отвечали точным `301`, их русские назначения — `200` с self-canonical.
- Все 56 русских category URL из sitemap отвечали `200`, но первоначальный HTML содержал пустой `#root`; H1 и товарные переходы появлялись только после React.
- До изменения category/product переходы в отрисованном каталоге были кнопками без `href`.

## Изменение-кандидат

- Только индексируемые русские catalog/product routes получают первоначальный semantic snapshot: `main`, `h1`, описание и обычные `a[href]`.
- Ссылки строятся только из indexable route manifest. Пустые категории реестра и facet URL в них не попадают.
- Иерархия snapshot: каталог → категории; категория → подкатегории и непосредственные товары; подкатегория → товары; товар → индексируемый родитель.
- После старта React snapshot удаляется, затем приложение монтируется в тот же `#root`.
- В русской React-витрине безопасные category/product переходы имеют настоящие `href`, но обычный левый клик остаётся SPA-переходом. Новая вкладка, средняя кнопка и modifier-click сохраняют нативное поведение.
- На остальных языках новые детальные crawlable links и initial snapshot не добавляются. Языковые маршруты, canonical и hreflang не отключаются.

## Проверки кандидата

- `test:seo-crawlable-links` — PASS.
- Полный SEO/i18n Stage 7 — PASS: route contract, HTTP HTML, JSON-LD embed, sitemap XML, RTL static, cache isolation.
- Browser smoke на локальном Chrome — PASS: 28 URL (7 языков × home/catalog/category/product).
- Legacy redirects GET/HEAD и конечные `200` — PASS.
- Catalog progressive render — PASS.
- Targeted ESLint — 0 errors; 8 существующих Fast Refresh warnings.
- `git diff --check` — без ошибок whitespace.

Известные baseline-сбои, не созданные этим изменением: `verify-storefront-catalog-tree-ui.mjs` содержит устаревшее ожидание CSS grid, а `verify-storefront-group-tiles-ui.mjs` — устаревшее source-regex ожидание для `HomePage`.

## Установка и откат

Установка в рамках этой задачи не выполнялась. После commit/push/PR/merge и отдельного подтверждения на production:

1. Повторно зафиксировать live SHA, состояние Git, health и службы; full target SHA должен быть доступен в object DB production checkout.
2. Из target SHA извлечь `scripts/linux/run-target-deploy.sh` во внешний staging и выполнить `prepare <target-sha>`. `prepare` не переключает live source/dist и не перезапускает службы.
3. Проверить manifest подготовленного артефакта и только после отдельного подтверждения выполнить `promote <prepared-dir> <target-sha>`.
4. Внутренние проверки `promote` выполняются внутри deploy-транзакции; их провал должен автоматически вернуть предыдущие source SHA и UI dist.
5. После успешного `promote` отдельно проверить health, главную, `/ru/catalog`, русскую категорию и товар, оба legacy `301` GET/HEAD, конечные `200`, canonical, raw H1 и raw `a[href]`. Эта внешняя post-check уже не запускает автоматический rollback: при её провале нужен явный ручной откат через тот же pinned deploy flow на зафиксированный предыдущий SHA/LKG, затем повторная проверка. Исходная точка этой ветки для локального отката — `2dde2e0ea64572336c5926bf01e701d5b384e7fa`.

База данных и 1С этим изменением не затрагиваются.
