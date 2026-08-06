# Prod-контур Clover ↔ рабочая 1С

Подготовка рядом с уже работающим **TEST**. Установка расширения в VLAVKA и включение флагов — только после backup и явного «да».

## Состояние сейчас (безопасный режим)

- Обмен разрешён только базе `TEST` (`X-Clover-Database: TEST`).
- `ONEC_PROD_EXCHANGE_ENABLED=false` — **не включать** без отдельного «да».
- `ONEC_ALLOWED_DATABASES=TEST`
- Очередь заказов хранит `exchange.database` (старые заказы без поля = TEST).
- В кабинете менеджера (вкладка 1С): бейдж «Контур заказов: только 1С TEST».

## Что уже сделано в коде

1. Allowlist баз + флаг prod.
2. Очередь / pull / ACK / цены scoped по `exchange.database` и заголовку 1С.
3. Выгрузки номенклатуры/контрагентов (`products-preview`, `clients-preview`) пока **только TEST**.
4. UI: контур в бейдже заказа и статус на вкладке 1С.

## Что делать дальше

| Шаг | Действие | «Да» нужно? |
|-----|----------|-------------|
| A–B | Backup VLAVKA + Clover (+ `.env`) | сделано |
| C | Код prod на DC + `restart clover-api` + smoke TEST | сейчас |
| D | Включить флаг в `.env` | **да** |
| E | Расширение в рабочей 1С (VLAVKA) | **да** |
| F | Пилот: 1 заказ → ACK → сверка | **да** |

## Включение (шаблон — не выполнять без «да»)

```env
ONEC_PROD_EXCHANGE_ENABLED=true
ONEC_ALLOWED_DATABASES=TEST,VLAVKA
ONEC_DEFAULT_EXCHANGE_DATABASE=TEST
```

Затем: `sudo systemctl restart clover-api.service`.

В расширении **рабочей** 1С: `X-Clover-Database: VLAVKA`. Пока default=TEST, обычная кнопка менеджера не уводит заказы в VLAVKA случайно.

## Не смешивать

- TEST и VLAVKA не забирают чужие `ready`.
- Каталог Clover (products-preview) пока только из TEST.
