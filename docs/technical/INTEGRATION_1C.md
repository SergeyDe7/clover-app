# Интеграция Clover ↔ 1С УНФ

## Режим

Прод-контур на DC: `ONEC_PROD_EXCHANGE_ENABLED=true`.
Allowlist задаётся явно через `ONEC_ALLOWED_DATABASES` (**TEST не добавляется автоматически**).

Текущий рабочий путь владельца — **VLAVKA-only**:
`ONEC_ALLOWED_DATABASES=VLAVKA`, `ONEC_DEFAULT_EXCHANGE_DATABASE=VLAVKA`.
TEST — необязательный отдельный контур: включайте в allowlist и выдавайте `ONEC_TEST_EXCHANGE_API_KEY` только если TEST снова нужен.

Установка расширения и пилот: [`VLAVKA_EXTENSION_INSTALL.md`](./VLAVKA_EXTENSION_INSTALL.md), обзор: [`PROD_CONTOUR.md`](./PROD_CONTOUR.md).

Очередь: 1С **сама забирает** заказ из Clover (pull), затем подтверждает ACK.

## Auth (SEC-001 contour binding)

Входящие маршруты `/api/one-c/*`: **authenticated credential → server-owned contour**.
Requested `database` never chooses authority.

- `X-Clover-Key` или `Authorization: Bearer` = contour exchange key:
  - `ONEC_TEST_EXCHANGE_API_KEY` → только **TEST** (требуется, только если TEST в allowlist)
  - `ONEC_VLAVKA_EXCHANGE_API_KEY` → только **VLAVKA** (требуется, если VLAVKA в allowlist)
- Если оба заголовка заданы и значения различаются — отказ (400), без silent priority.
- Optional `X-Clover-Database` / body / query contour must match the authenticated contour (иначе 403). Missing contour uses the authenticated contour.
- Auth responses **не** раскрывают `allowedDatabases` / `prodEnabled`.
- `ONEC_API_KEY` — **только outbound** Clover → 1C (черновики/health). Не авторизует inbound multi-contour.
- Local bypass `ONEC_ALLOW_LOCAL_WITHOUT_KEY=true`: только TEST-only, loopback, non-prod; never VLAVKA / multi-contour / VLAVKA-only.
- Legacy inbound via `ONEC_API_KEY` только с явным `ONEC_LEGACY_INBOUND_KEY_CONTOUR=TEST|VLAVKA` (OFF by default; forbidden when prod/VLAVKA enabled).

Ключи **не** публиковать в Git, чат и скриншоты.

## Маршруты

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/one-c/queue-status` | Снимок очереди (`ready` + `sending`) |
| GET | `/api/one-c/purchase-price-request` | Запрос свежих закупочных цен |
| POST | `/api/one-c/purchase-prices` | Приём цен из 1С |
| GET/POST | `/api/one-c/test-order` | Claim следующего `ready` → `sending` |
| POST | `/api/one-c/orders/:orderId/ack` | Подтверждение с номером документа 1С |
| POST | `/api/one-c/orders/accepted` | Ручная смена состояния в 1С → бизнес-статус `Принят` |
| POST | `/api/one-c/products-preview` | Выгрузка номенклатуры (TEST или VLAVKA) |
| POST | `/api/one-c/clients-preview` | Выгрузка контрагентов (TEST или VLAVKA) |

Менеджер (UI):

- проверка / постановка / сброс — `/api/admin/exchange/...`
- кнопка **«Передать в 1С»** + при prod селект контура (TEST / VLAVKA)

## Статусы `exchange.status`

| Статус | Смысл |
|--------|--------|
| `not_sent` | Не в очереди |
| `ready` | В очереди выбранного контура (TEST или VLAVKA) |
| `sending` | Выдан 1С (claim), ждёт ACK |
| `sent` | Создан в 1С, ACK принят |
| `draft` | Черновик через отдельный draft-путь |
| `error` | Ошибка |

Lease claim: если ACK не пришёл за 15 минут, `sending` снова становится `ready`.
Возврат в очередь выполняется на pull/snapshot **и** фоновым timer (~30 с, `ONEC_CLAIM_REQUEUE_INTERVAL_MS`, минимум 5 с) — без ожидания следующего запроса 1С. Audit: `one-c.claim.expired-requeue`.

## Правила ACK

- База из allowlist (`X-Clover-Database: TEST` или `VLAVKA`), совпадает с контуром заказа.
- Обязателен номер документа 1С.
- Сверка номера заказа Clover.
- Повтор того же receipt — идемпотентен.
- Чужой номер документа — отказ (409).
- Принимается из статусов `ready` или `sending`.
- Заказ снимается с очереди **только после** успешного ACK.

## Статус «Принят» из 1С

После ACK менеджер вручную меняет **СостояниеЗаказа** в документе 1С.
1С вызывает `POST /api/one-c/orders/accepted` с телом:

```json
{ "orderNumber": "…", "documentNumber": "…", "oneCState": "Обработан" }
```

Правила:

- База из allowlist + ключ обмена; контур должен совпадать с заказом.
- `exchange.status` должен быть `sent` (иначе 409).
- Бизнес-статус Clover: только `Новый` → `Принят`; уже продвинутые статусы не откатываются.
- При создании документа из Clover состояние в 1С **не** заполняется (патч модуля + подписки: `one_c_patches/empty_queue_and_comment/ИНСТРУКЦИЯ_СТАТУС_ПРИНЯТ.txt`).

## Расширение 1С

Файлы `.cfe` лежат рядом с проектом (папка `Clover\`), не внутри `clover-app`.  
Актуальный рабочий пакет на дату 29.07.2026: `CloverExchange_FINAL_WORKING_29_07_2026.cfe` (факт наличия файла; версия, установленная в конкретной базе 1С, проверяется в конфигураторе).

Шаблон исходников в репозитории: `one_c_extension_source/`, `one_c_extension_ready/`.

## Подтверждённые E2E (TEST), 29.07.2026

| Clover ID | Документ 1С | Итог |
|-----------|-------------|------|
| `CL-260728-152400-536` | НФНФ-003276 | PASS |
| `CL-260729-170806-989` (`139e3559-…`) | НФНФ-003277 | PASS |

## Диагностика

- `CHECK_ONEC_QUEUE_V2.cmd` — проверка доступности очереди без ACK.
- `Clover_1C_Diagnostic/` — диагностический пакет.
- Автотесты: в `server/` — `npm run check`, `npm run test:onec`, `npm run test:v18`.

Не нажимать получение заказа повторно без анализа предыдущего результата.
