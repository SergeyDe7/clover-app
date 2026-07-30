# Архитектура Clover 4.0.4

## Продукт

Clover принимает клиентские заказы, позволяет менеджерам и администраторам их обрабатывать и передаёт заказы в **1С УНФ** через pull-очередь (только база **TEST** в текущем контуре).

## Роли

| Роль | Основные сценарии |
|------|-------------------|
| Клиент | Вход, матрица товаров, корзина, адреса, заказ, история |
| Менеджер | Клиенты, цены, заказы, статусы, постановка в очередь 1С |
| Администратор | Пользователи, права, интеграции, среды, аудит |

## Стек

- Frontend: React + Vite + PWA (`src/`)
- Backend: Node.js (`server/src/server.js`)
- БД: SQLite (`server/data/clover.sqlite`, не в Git)
- Секреты: `server/.env` (не в Git; образец — `server/.env.example`)
- ОС разработки: Windows 10
- Репозиторий: GitHub

## Порты (локально, проверено)

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:5273/ |
| Backend health | http://localhost:4100/api/health |

## Ключевые модули backend

| Файл | Назначение |
|------|------------|
| `server/src/server.js` | HTTP API, auth, маршруты `/api/one-c`, admin exchange |
| `server/src/exchange.js` | Статусы обмена, валидация, payload заказа |
| `server/src/oneC.js` | Исходящие вызовы к 1С (health/draft) |
| `server/src/oneCPriceSync.js` | Закупочные цены, проверка имени базы TEST |
| `server/src/oneCProducts.js` / `oneCClients.js` | Номенклатура и контрагенты |
| `server/src/db.js` | Доступ к SQLite |
| `server/src/backups.js` | Серверные резервные копии |

## Критический контур заказа

```text
Клиент создаёт заказ
  → неизменяемый Clover ID
  → менеджер: «Передать в 1С TEST» (status ready)
  → 1С TEST забирает GET/POST /api/one-c/test-order
  → 1С создаёт «Заказ покупателя»
  → ACK POST /api/one-c/orders/:orderId/ack (Clover ID + номер документа)
  → status sent, заказ уходит из очереди
```

Обязательные свойства: нет дублей, точный ACK, идемпотентность, TEST ≠ production, аудит этапов.
