# Витрина clover-spb.ru

## Статус
- Код витрины в одном репозитории с ЛК.
- UI витрины:
  - Host `clover-spb.ru` / `www.clover-spb.ru` — всегда;
  - путь `/vitrina…` — превью на любом хосте (в т.ч. `clover-order.ru`).
- `clover-order.ru/` (корень) всегда ЛК.

## Какие товары на сайте
На витрине только товары с:
1. `active !== false` (показывать клиентам);
2. `showOnStorefront === true` (**явный выбор**);
3. при включённой настройке — связь с 1С.

Управление:
- Админ → Ещё → **Витрина сайта** — список галочек + тексты/вид цен;
- или карточка товара → **На витрине сайта**.

## API
- `GET /api/public/catalog` — каталог (без логина);
- `GET /api/public/catalog/:code` — карточка;
- `POST /api/public/orders` — гостевой заказ по сайтовым ценам;
- `GET/PUT /api/admin/storefront` — настройки витрины (только admin).

## DNS
Сейчас ориентир:
- `clover-order.ru` — этот сервер (ЛК + превью `/vitrina`);
- `clover-spb.ru` — после переноса A-записи сюда станет основной витриной.

## Превью до DNS
https://clover-order.ru/vitrina  
локально: http://127.0.0.1:5273/vitrina
