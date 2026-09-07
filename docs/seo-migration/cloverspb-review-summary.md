# Сводка focused review SEO-переезда cloverspb.ru → clover-spb.ru

Дата: 2026-09-07. Основа: артефакты commit `8ec0b42dd2e5a550dced0ad07448b8c93fee3936`. Полный повторный crawl не выполнялся; production, DNS, nginx, SSL, runtime, БД и 1С не изменялись.

## Итог

- Всего старых URL: 910.
- Уникальных содержательных legacy entities: 342 — 1 homepage, 14 info, 50 categories, 277 products.
- Схлоплено несамостоятельных URL: 568 — 552 MegaGroup aliases `/prev`/`/next` и 16 pagination pages с явным canonical.
- Готовые 301: 898.
- Confidence после review: 313 EXACT, 585 HIGH, 0 REVIEW, 12 NO_MATCH.
- Кандидаты: 1 × 404 и 11 × 410.
- Blanket redirect на homepage отсутствует: homepage получает только старая homepage.

## Как схлоплены повторяющиеся URL

Каждый alias наследует цель фактической старой страницы из `current_location`. Каждая pagination page наследует цель базовой старой категории из `canonical`. Поэтому 568 технических URL не создают 568 отдельных SEO-решений.

## Результат по содержательным сущностям

- Info: 3 из 14 имеют 301; 11 не имеют доказанного публичного эквивалента и оставлены кандидатами 410 до решения человека.
- Categories: 50 из 50 имеют 301; нерешённых категорий нет.
- Products: 276 из 277 имеют 301; один дополнительно обнаруженный старый URL уже отвечает 404 и оставлен кандидатом 404.
- REVIEW product queue закрыта без повышения конфликтующих fuzzy-кандидатов: 10 exact product targets, 4 high product targets и 8 category fallbacks.
- Из прежних product NO_MATCH 23 направлены в наиболее узкую актуальную категорию того же назначения, а не на главную и не на случайный товар.

## Проверка новых 301-целей

613 вновь повышенных строк используют 138 уникальных целей. Все 138 проверены targeted GET с ручным запретом перехода по redirects:

- direct HTTP 200: 138 из 138;
- invalid/private/internal targets: 0;
- redirect chains: 0;
- цели на `/lk`, `/api`, `/auth`, `/login`: 0.

## Решения, которые действительно остаются человеку

Остаётся 11 решений одного типа: утвердить 410 или сначала создать релевантную публичную страницу. Автоматически 410 не утверждался.

Приоритет 1 — страницы, влияющие на коммерческие и юридические ожидания:

- `/dostavka`
- `/oplata`
- `/usloviya-vozvrata`
- `/registraciya/agreement`
- `/registraciya/policy`

Приоритет 2 — содержательные/маркетинговые страницы:

- `/o-nas`
- `/aktsii`
- `/optovikam`

Приоритет 3 — устаревшие публичные account routes, для которых приватный `/lk` запрещён как SEO-цель:

- `/registraciya`
- `/registraciya/forgot_password`
- `/registraciya/register`

## Следующий gate

Владелец продукта/SEO принимает 11 решений по info pages. После этого карту можно использовать как вход для отдельной repo-managed реализации redirect rules с обязательными staging-проверками; DNS cutover, сертификат и nginx остаются отдельными подтверждаемыми действиями.
