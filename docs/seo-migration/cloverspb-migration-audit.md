# Аудит подготовки SEO-переезда cloverspb.ru → clover-spb.ru

Дата снимка: 2026-09-06. Режим: только чтение. DNS, nginx, SSL, production, БД, 1С и runtime Clover не изменялись.

## 1. Методика и границы

- Старый сайт исследован через `robots.txt`, обычный и gzip sitemap, главную, внутренние ссылки, страницы категорий, пагинацию, карточки товаров и информационные страницы.
- `https://cloverspb.ru/sitemap.xml` и указанный в robots `https://cloverspb.ru/sitemap.2518737.xml.gz` ответили 200 и содержат одинаковые 337 URL.
- Crawl выполнялся одним последовательным GET-потоком с User-Agent `CloverSeoMigrationAudit/1.0`, паузой 300 мс и жёстким лимитом 1000 URL. Итоговая очередь стабилизировалась на 910 адресах.
- Новый сайт исследован через live `robots.txt`, live sitemap, публичный read-only API каталога и HTTP-проверку построенных публичных маршрутов.
- Все 747 new routes, включая 688 product routes, проверены прямым последовательным GET; status/location и raw HTML metadata записаны отдельно от identity/name/hierarchy из `/api/public/catalog`. Все 127 уникальных 301 targets после этого повторно проверены отдельным GET с запретом автоматического redirect.
- Доступный поиск по `site:cloverspb.ru` и `site:clover-spb.ru` не вернул результатов. Это не доказывает отсутствие индексации; данные Google Search Console, Яндекс Вебмастера, MegaGroup analytics и access logs в этом запуске не предоставлены.
- Приватные `/lk`, API авторизации, БД и 1С не использовались как источники или цели.

## 2. Локальный Git baseline

- Ветка подготовки создана от свежего `origin/main`: `codex/cloverspb-seo-migration-prep`.
- Базовый commit: `140ecbb7b61b43851dc0925bdd2da349d63026f3`.
- Перед началом tracked worktree был чистым.
- Единственный заранее существовавший untracked-файл: `.cursor/rules/015-visible-secret-input.mdc`.
- Его SHA-256 перед работой: `265FABB1F076F6A3375A88F5FD9A90FCBFECE00AE28D36F14E48E7DF37F2BFD1`.
- Stash count перед работой: 0. Stash не создавался.

## 3. Production baseline, только чтение

- Сервер: `clover@192.168.155.15`.
- Репозиторий: `/opt/clover/clover-app`.
- Production branch/HEAD: `main` / `140ecbb7b61b43851dc0925bdd2da349d63026f3`.
- Production worktree: clean, tracking `origin/main`.
- nginx: `1.26.3-3+deb13u7` (`nginx/1.26.3`).
- ACME-клиент: `dehydrated 0.7.2-2`; Certbot отсутствует.
- nginx включает `/etc/nginx/conf.d/*.conf` и `/etc/nginx/sites-enabled/*`.
- Включены `clover-spb.ru`, `cloverspb.ru`, `clover-order.ru` и общий vhost `dehydrated` для HTTP-01 challenge.
- Активный `clover-spb.ru` слушает 443, обслуживает `clover-spb.ru` и `www.clover-spb.ru`, проксирует UI на `192.168.155.15:5273`, API и uploads на `192.168.155.15:4100`.
- Существующий `/etc/nginx/sites-available/cloverspb.ru` включён и слушает только 80. Он содержит blanket-редирект `https://clover-spb.ru$request_uri`; HTTPS-блок закомментирован. Этот файл существовал до аудита и не изменялся.
- SHA-256 прочитанных активных конфигураций: old-domain vhost `D753B228A104EB10C916645CD9E13C0BFB08CAD5EFC402E1E0655618FB66CD86`, new-domain vhost `0D4703844BC8EFF9307F6518C7AF3B683D8B5F4F88BCA1A2B3CB0C369B50205B`, dehydrated vhost `82057F8F321F581068449DD8891DE00E55FD3B7842C0F63C79D695FBF3AC9BB2`.
- Публичный старый домен сейчас указывает на MegaGroup, поэтому этот Clover vhost не получает обычный публичный трафик `cloverspb.ru`.
- Активные vhost-файлы принадлежат `root`, расположены в `/etc/nginx` и не являются ссылками на репозиторий. В `ops/nginx` есть пример/сниппеты для нового домена, но нет repo-managed old-domain vhost. Следовательно, активная конфигурация system-managed; репозиторий содержит лишь частичные образцы.
- `nginx -t` без sudo недоступен, passwordless sudo не настроен. Проверка не обходилась и не запускалась с паролем; это будущий обязательный gate.

## 4. Текущее публичное DNS

### Старый домен

- `cloverspb.ru A 185.32.58.162`.
- `www.cloverspb.ru A 185.32.58.162`.
- AAAA для apex и www не обнаружены.
- NS: `ns.megagroup.ru`, `ns1.megagroup.ru`, `ns2.megagroup.ru`.
- SOA primary: `ns.megagroup.ru`.
- MX: priority 10, `mxs.oml.ru`.
- Наблюдаемый TTL зоны/основных ответов: 43200 секунд; кешированный A во время одного запроса имел остаток 39567 секунд.
- Регистраторский доступ к RU-CENTER сам по себе не доказывает возможность менять записи зоны, пока авторитетны NS MegaGroup.

### Новый домен

- `clover-spb.ru A 185.233.93.129`.
- AAAA не обнаружен.
- `www.clover-spb.ru CNAME clover-spb.ru`.
- NS: `ns1.jino.ru`, `ns2.jino.ru`, `ns3.jino.ru`, `ns4.jino.ru`.
- Предлагаемый будущий web target для старого apex/www: `185.233.93.129`.

### Вывод по NS

`NAMESERVER CHANGE REQUIRED: UNKNOWN` до проверки возможностей управления зоной MegaGroup. Предпочтительный вариант — оставить NS и изменить только web A-записи. Если MegaGroup не разрешает это, потребуется отдельный, более рискованный план переноса всей зоны в RU-CENTER с предварительной репликацией всех A/MX/TXT/CAA и иных записей.

## 5. Текущее HTTP/HTTPS/www поведение

- `http://cloverspb.ru/` → один 301 на `https://cloverspb.ru/` → 200.
- `http://www.cloverspb.ru/` → один 301 на `https://cloverspb.ru/` → 200.
- `https://cloverspb.ru/` → 200 без редиректа.
- `https://www.cloverspb.ru/` → один 301 на `https://cloverspb.ru/` → 200.
- Все четыре старых варианта обслуживаются `185.32.58.162` (MegaGroup).
- `http://clover-spb.ru/` и `http://www.clover-spb.ru/` → один 301 на `https://clover-spb.ru/` → 200.
- `https://clover-spb.ru/` → 200.
- `https://www.clover-spb.ru/` → 200 без HTTP-редиректа и сохраняет www URL.
- Оба новых HTTPS-варианта обслуживаются `185.233.93.129`.

## 6. Публичные сертификаты

- MegaGroup сейчас отдаёт для `cloverspb.ru` и `www.cloverspb.ru` валидный Let's Encrypt сертификат с SAN обоих имён, периодом `2026-08-21` — `2026-11-19`, TLS 1.3; SHA-256 fingerprint `BB:E9:EB:BA:B8:47:1F:DF:F4:12:03:B6:73:CD:CD:96:72:8E:AD:27:C2:DF:89:4D:89:AA:52:26:23:16:8C:44`.
- Новый домен отдаёт валидный Let's Encrypt сертификат с SAN `clover-spb.ru` и `www.clover-spb.ru`, периодом `2026-08-12` — `2026-11-10`, TLS 1.3; SHA-256 fingerprint `0B:59:F8:39:39:A1:49:3F:61:08:45:D0:66:DE:BD:55:94:08:C0:32:8F:F7:C7:E6:69:D2:E8:EE:64:91:13:43`.
- На Clover server активный new-domain vhost указывает на `/dehydrated/certs/clover-spb.ru/...`.
- На Clover server активного HTTPS-блока для old-domain нет. Наличие готового old-domain private key/cert на диске не проверено из-за прав и не предполагается.
- Нельзя считать публичный MegaGroup certificate переносимым: private key не читался и не должен экспортироваться в рамках этой миграции.

## 7. Инвентарь старого сайта

- Всего публично связанных URL в bounded inventory: 910.
- Каноническая главная: 1.
- Информационные/служебные публичные страницы: 14.
- Категории и подкатегории из sitemap: 50, все отвечают 200.
- Товарные URL из sitemap: 276, все отвечают 200.
- Дополнительный внутренний товарный URL, уже отвечающий 404: 1.
- Отдельные paginated category URL: 16, отвечают 200 и canonical указывает на базовую категорию.
- MegaGroup navigation aliases `/prev` и `/next`: 552, отвечают 301. Это не самостоятельные товары и не кандидаты на автоматический migration redirect.
- Status distribution: 357 × 200, 552 × 301, 1 × 404.
- У product/category content pages canonical в HTML в основном отсутствует; 16 явных canonical обнаружены на пагинации и указывают на базовые category URL.

## 8. Инвентарь нового сайта

- Всего обнаружено 747 публичных URL/маршрутов.
- Главная: 1.
- Публичная info page `/contacts`: 1.
- Каталог `/catalog`: 1.
- Верхнеуровневые категории: 8.
- Подкатегории: 48.
- Публичные товары из `/api/public/catalog`: 688.
- Live sitemap содержит 10 URL; он не перечисляет все 688 product routes и все 48 subcategory routes.
- `robots.txt` разрешает public crawl и запрещает `/lk`, `/api/`, `/vitrina/lk`.
- Raw HTML главной, `/catalog`, representative category и product route отвечает 200, но содержит одинаковый общий `<title>` и не содержит server-rendered H1 или canonical. Page-specific metadata добавляются клиентским JavaScript (`src/screens/storefront/seo.js`). Это существующий SEO-риск: до cutover требуется rendered inspection в Google Search Console/Яндекс Вебмастере; возможная SSR/prerender/runtime-коррекция является отдельным change scope.

## 9. Результат focused review redirect matching

- Повторный crawl старых 910 и новых 747 URL не выполнялся. Рабочей основой были CSV из commit `8ec0b42dd2e5a550dced0ad07448b8c93fee3936`.
- 910 старых URL сведены к 342 уникальным содержательным сущностям: 1 главная, 14 info, 50 category и 277 product. Отдельные решения не требуются для 552 legacy navigation aliases и 16 pagination URL.
- Все 552 alias URL наследуют решение фактической старой цели из `current_location`; все 16 pagination URL наследуют решение базовой категории из `canonical`.
- Для 22 товаров из REVIEW использовались article/model, нормализованное название, тип, размер/объём, фасовка, материал/цвет и категория. Итог: 10 EXACT product, 4 HIGH product и 8 HIGH category fallback. Конфликтующие fuzzy-кандидаты не использовались как товарные цели.
- Для 23 ранее NO_MATCH товаров доказан наиболее узкий актуальный раздел того же назначения; они переведены в HIGH category fallback. Единственный старый товарный URL, уже отвечавший 404, оставлен 404.
- `EXACT`: 313 (до focused review: 104).
  - Главная: 1; info: 1; category: 17; product: 95; alias: 188; pagination: 11.
- `HIGH`: 585 (до focused review: 181).
  - Info: 2; category: 33; product: 181; alias: 364; pagination: 5.
- `REVIEW`: 0 (до focused review: 574 confidence / 590 action, включая 16 NO_MATCH pagination rows).
- `NO_MATCH`: 12 (до focused review: 51): 11 info без публичного эквивалента и 1 старый URL со статусом 404.
- Итоговые действия: 898 × 301, 11 × 410 candidate, 1 × 404 candidate.
- Один дублированный старый артикул `0565` используется двумя различными товарами; оба по-прежнему направлены только в релевантную category fallback.

## 10. Автоматическая валидация карты

- Изменены решения для 613 строк. Их 301-цели дедуплицированы до 138 URL и проверены targeted GET с отключённым автоматическим redirect; массовый recheck 747 новых URL не выполнялся.
- Все 138 ответили прямым 200.
- Target redirects/chains: 0.
- Redirect loops: 0.
- Invalid targets: 0.
- Target на старом домене: 0.
- Target в `/lk`, `/api`, `/auth`, `/login`: 0.
- Target на localhost/private IP/1C internal URL: 0.
- Дублированные old paths: 0.
- Повторно используемые target URL: 37 групп, 195 строк, максимум 17 старых URL на одну category target. Это ожидаемые category fallbacks, а не коллизии старых URL.
- Blanket homepage redirect: отсутствует. На homepage направлена только старая homepage.
- Pagination variants не содержат query и наследуют доказанную цель своей явной canonical category; самостоятельными контентными сущностями они не считаются.

## 11. Артефакты

- Полный old inventory: [`cloverspb-old-url-inventory.csv`](./cloverspb-old-url-inventory.csv), 910 data rows; SHA-256 `C667ACF5AB6FD25277888CA77C435411BB72F0F73CE9AEC24E2F3B1607F7FE12`.
- Полный new inventory: [`cloverspb-new-url-inventory.csv`](./cloverspb-new-url-inventory.csv), 747 data rows; SHA-256 `CF207BC7216D613629BEC4AD628582390E3309225E37BDF3FB6030B6A501FCD9`.
- Полная карта: [`cloverspb-redirect-map.csv`](./cloverspb-redirect-map.csv), 910 data rows.
- Оставшаяся очередь no-match: [`cloverspb-unmatched.csv`](./cloverspb-unmatched.csv), 12 data rows.
- Сводка focused review: [`cloverspb-review-summary.md`](./cloverspb-review-summary.md).
- SHA-256 карты после focused review: `4F0A590FB2864535342C8854A721DEDD3F9444FFE6080C2428AD4327B2C2E221`.
- SHA-256 unmatched после focused review: `FC8BB2057A496E9780E2699DBE3688EBA519D4767F7135C05AB74CFE2E719BAC`.
- 11 строк с `action=410` являются рекомендациями, а не утверждёнными production decisions; каждая требует отдельного подтверждения permanent removal либо решения о создании публичного контента.

## 12. Блокеры перед cutover

1. Принять 11 содержательных решений по info URL: утвердить 410 либо создать релевантную публичную страницу и заменить target.
2. Получить Search Console, Яндекс Вебмастер, analytics/access-log inventory для приоритетных URL и query semantics.
3. Подтвердить возможность менять A/TXT в текущей MegaGroup DNS-зоне либо спроектировать полный NS migration.
4. До A-record cutover выпустить и установить отдельный сертификат для `cloverspb.ru` + `www.cloverspb.ru`, предпочтительно через DNS-01; без этого cutover запрещён.
5. Подтвердить через rendered URL inspection, что новые product/category routes получают уникальные title/H1/self-canonical; при провале STOP и отдельная SEO-runtime задача.
6. Сгенерировать repo-managed nginx map/vhost, stage его изолированно и пройти `nginx -t`, Host-header/`--resolve` tests и Clover regression.
7. Получить отдельное явное разрешение на DNS-cutover.

## 13. Официальные SEO-источники

- [Google Search Central: Site Moves and Migrations](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) — точное URL mapping, server-side permanent redirects, отсутствие chains, реальные 404/410 для удалённого контента, новый sitemap, мониторинг и длительное сохранение redirects.
- [Google Search Console: Change of Address](https://support.google.com/webmasters/answer/9370220) — использовать после включения redirects и подтверждения ownership старого/нового доменов и вариантов www.
- [Яндекс Вебмастер: переезд сайта](https://yandex.ru/support/webmaster/ru/yandex-indexing/moving) — подтвердить оба адреса, проверить новый сайт, включить redirects и затем подать заявку на переезд.
- [Яндекс Вебмастер: смена структуры](https://yandex.ru/support/webmaster/ru/recommendations/changing-site-structure) — вести отсутствующие страницы в релевантный раздел, а не в нерелевантную главную, либо отдавать 404.
- [Яндекс Вебмастер: Sitemap](https://yandex.ru/support/webmaster/ru/indexing-options/sitemap) — поддерживать доступный актуальный sitemap и сообщить об обновлении.

## 14. Итог аудита

Focused review закрыл все повторяющиеся alias/pagination решения и все товарные REVIEW/NO_MATCH без нерелевантных homepage fallback. Карта пригодна для следующего human decision gate по 11 info URL и последующей gated-реализации, но не для немедленного cutover. Текущее состояние production, DNS, nginx и SSL оставлено без изменений.
