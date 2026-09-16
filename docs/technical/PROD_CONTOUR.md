# Prod-контур Clover ↔ рабочая 1С

Подготовка рядом с уже работающим **TEST**. Установка расширения в VLAVKA — только после backup и явного «да».

## Состояние сейчас

- Рабочий обмен владельца — **VLAVKA-only** (TEST сейчас не используется):
  - `ONEC_PROD_EXCHANGE_ENABLED=true`
  - `ONEC_ALLOWED_DATABASES=VLAVKA`
  - `ONEC_DEFAULT_EXCHANGE_DATABASE=VLAVKA`
  - inbound: `ONEC_VLAVKA_EXCHANGE_API_KEY` (TEST key не требуется, пока TEST нет в allowlist)
- TEST — необязательный отдельный контур: добавляйте в allowlist и ключ только при явном включении.
- В ЛК «Заказы» при prod: селект **Контур передачи** отражает allowlist.
- Расширение в **VLAVKA** на PC1: `X-Clover-Database: VLAVKA`.
- Пилотные заказы в VLAVKA — пройдены.
- Выгрузки **номенклатуры / контрагентов / цен** принимаются из баз в allowlist.

## Что уже сделано в коде

1. Allowlist баз + флаг prod.
2. Очередь / pull / ACK / цены scoped по `exchange.database` и заголовку 1С.
3. `products-preview` / `clients-preview` / sale-prices / purchase-prices — из TEST и VLAVKA.
4. UI: контур в бейдже заказа, статус на вкладке 1С, выбор контура при передаче.

## Чеклист

| Шаг | Действие | Статус |
|-----|----------|--------|
| A–B | Backup VLAVKA + Clover (+ `.env`) | сделано |
| C | Код prod на DC + smoke TEST | сделано |
| D | Флаг в `.env` | сделано |
| E | Расширение в рабочей 1С (VLAVKA) | сделано |
| F | Пилот: 1 заказ → ACK → сверка | сделано |
| G | Каталог/цены из VLAVKA в Clover | **сделано** (выгрузка + поиск в ЛК) |

## Включение (VLAVKA-only — текущий путь)

```env
ONEC_PROD_EXCHANGE_ENABLED=true
ONEC_ALLOWED_DATABASES=VLAVKA
ONEC_DEFAULT_EXCHANGE_DATABASE=VLAVKA
ONEC_VLAVKA_EXCHANGE_API_KEY=...   # required; real value only in server/.env
# ONEC_TEST_EXCHANGE_API_KEY — only if TEST is later re-enabled in allowlist
```

Dual-contour (optional later): `ONEC_ALLOWED_DATABASES=TEST,VLAVKA` + оба inbound ключа.

В расширении **рабочей** 1С: `X-Clover-Database: VLAVKA`.

## Не смешивать

- TEST и VLAVKA не забирают чужие `ready`.
- У каждого **разрешённого** контура **свой** inbound exchange credential. Cross-use → 403, без mutation. `ONEC_API_KEY` не даёт multi-contour inbound authority.
- TEST key не требуется, если TEST отсутствует в `ONEC_ALLOWED_DATABASES`.
- Последняя успешная выгрузка номенклатуры/контрагентов **перезаписывает** каталог поиска в Clover. Для рабочей витрины выгружайте из **VLAVKA**.
