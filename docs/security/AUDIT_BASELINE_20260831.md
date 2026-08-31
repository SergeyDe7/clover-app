# Clover — baseline перед security hardening (2026-08-31)

Снимок состояния репозитория и проверок **до** внесения любых изменений ветки
`security/audit-hardening-20260831`. Всё, что здесь зафиксировано как FAIL или WARN,
существовало до начала работ; такие пункты не считаются регрессиями.

## Git

| Параметр | Значение |
| --- | --- |
| Базовый коммит | `bbf14b36483d6666c790cba892ceadc10fc24c90` |
| Базовая ветка | `main` (совпадает с `origin/main`) |
| Рабочая ветка | `security/audit-hardening-20260831` |
| Untracked на момент старта | `.cursor/rules/040-surgical-edits.mdc`, `.tmp/`, `tmp/` — принадлежат пользователю, не трогаются и не коммитятся |

## Окружение

| Компонент | Версия |
| --- | --- |
| Node.js | v22.23.2 |
| npm | 12.0.2 |
| Express | 5.2.1 |
| zod | 4.4.3 |
| jsonwebtoken | 9.0.3 |
| bcryptjs | 3.0.3 |
| helmet | 8.3.0 |

## Frontend build

```
npm run build
```

**PASS.** Сборка проходит, 18 чанков, самый крупный — `vendor-xlsx` 421 kB.

## ESLint

```
npx eslint .
```

**33 проблемы: 5 ошибок, 28 предупреждений.** Это baseline, а не регрессия.

| Файл | Правило | Статус |
| --- | --- | --- |
| `src/shared/SharedPanels.jsx:495` | `no-dupe-else-if` | настоящий баг, исправляется в этой ветке (фаза 23) |
| `src/shared/appHelpers.js:6948` | `no-useless-escape` | baseline, вне scope |
| `src/shared/productCatalogOrder.js:428` | `no-unused-vars` (`buildFamilyBlockAnchors`) | baseline, вне scope |
| `src/shared/productCatalogOrder.js:445` | `no-unused-vars` (`compareGrouped`) | baseline, вне scope |
| прочее (28) | `react-refresh/only-export-components` | baseline, вне scope |

## Карта маршрутов API

121 маршрут в `server/src/server.js`. Распределение по защите на момент baseline:

| Защита | Кол-во | Комментарий |
| --- | --- | --- |
| `authRequired` + `roleRequired("manager")` | 66 | из них большинство — `/api/admin/*` |
| `authRequired` + `roleRequired("admin")` | 5 | только `/api/admin/storefront*` |
| `authRequired` + `roleRequired("client")` | 7 | |
| `authRequired` без роли | 9 | |
| Без аутентификации | 34 | `/api/public/*`, `/api/auth/*`, `/api/one-c/*` (закрыты отдельным `oneCAuthRequired`), passkey-ceremony |

Ключевое наблюдение baseline: **`staffHasFeature` из `server/src/roles.js` не вызывается
в `server.js` ни разу** — вкладки менеджера (`permissions.tabs`) ограничивают только UI.

## Функциональный baseline

Проверки выполняются существующими скриптами `server/scripts/verify-*.mjs` (55 штук).
`server/src/db.js:20` уважает переменную `DB_PATH`, поэтому все проверки в этой ветке
запускаются на временной БД и никогда не пишут в `server/data/clover.sqlite`.

| Область | Скрипт baseline | Статус |
| --- | --- | --- |
| AUTH | `verify-manager-permissions.mjs`, `verify-staff-access-vault.mjs` | см. отчёт фазы |
| CLIENT | `verify-client-management.mjs`, `verify-client-provision.mjs`, `verify-client-self-matrix.mjs` | см. отчёт фазы |
| MANAGER | `verify-manager-tabs-smoke.mjs`, `verify-manager-notifications.mjs` | см. отчёт фазы |
| ADMIN | `verify-order-status-roles.mjs` | см. отчёт фазы |
| PUBLIC STOREFRONT | `verify-pr37-storefront-live.mjs`, `verify-storefront-*.mjs` | см. отчёт фазы |
| ORDERS | `verify-orders-hardening.mjs`, `verify-order-payload.mjs`, `verify-order-trash.mjs` | см. отчёт фазы |
| 1C | `verify-onec-claim-auth.mjs`, `verify-onec-prod-contour.mjs`, `verify-onec-products.mjs` | см. отчёт фазы |
| BACKUP | `verify-db-preservation.mjs` | см. отчёт фазы |

## Секреты в отслеживаемом дереве

Проверены все env-подобные файлы под контролем версий. Значения не выводились —
классификация по длине, набору символов и наличию placeholder-слов.

| Файл | Вердикт |
| --- | --- |
| `.env.production` | SAFE — только публичные `VITE_*` |
| `server/.env.example` | SAFE — все секретные ключи пустые |
| `docs/deploy/server.env.datacenter.example` | SAFE — placeholder-значения |
| `releases/dc-prep-ac44dcf/server.env.template` | SAFE — placeholder-значения |
| `releases/dc-prep-ac44dcf/server.env.for-dc` | SAFE — placeholder-значения |
| `releases/clover-dc-prep-ac44dcf-for-andrey.zip` | SAFE — внутри те же два файла с placeholder-значениями |

Это **опровергает** предварительный вывод аудита о «реальных секретах в публичном
репозитории»: значения оказались подчёркивание-разделёнными английскими словами
вида «замените меня», а не рабочим материалом. Ротация по этой причине не требуется;
runbook ротации всё равно готовится как процедура на будущее.

`server/.env` с рабочими значениями в git не отслеживается и в этой ветке не изменяется.
