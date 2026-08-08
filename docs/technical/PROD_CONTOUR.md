# Prod-контур Clover ↔ рабочая 1С

Подготовка рядом с уже работающим **TEST**. Установка расширения в VLAVKA — только после backup и явного «да».

## Состояние сейчас

- Флаги на DC включены:
  - `ONEC_PROD_EXCHANGE_ENABLED=true`
  - `ONEC_ALLOWED_DATABASES=TEST,VLAVKA`
  - `ONEC_DEFAULT_EXCHANGE_DATABASE=TEST`
- Обычная кнопка менеджера по умолчанию ставит заказ в очередь **TEST**.
- В ЛК «Заказы» при prod: селект **Контур передачи** (TEST / VLAVKA) + подтверждение для VLAVKA.
- Расширение в **VLAVKA** на PC1: `X-Clover-Database: VLAVKA`.
- Пилотные заказы в VLAVKA — пройдены.
- Выгрузки **номенклатуры / контрагентов / цен** принимаются из любой базы в allowlist (в т.ч. **VLAVKA**).

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

## Включение (уже применено на DC)

```env
ONEC_PROD_EXCHANGE_ENABLED=true
ONEC_ALLOWED_DATABASES=TEST,VLAVKA
ONEC_DEFAULT_EXCHANGE_DATABASE=TEST
```

В расширении **рабочей** 1С: `X-Clover-Database: VLAVKA`.

## Не смешивать

- TEST и VLAVKA не забирают чужие `ready`.
- Последняя успешная выгрузка номенклатуры/контрагентов **перезаписывает** каталог поиска в Clover. Для рабочей витрины выгружайте из **VLAVKA**.
