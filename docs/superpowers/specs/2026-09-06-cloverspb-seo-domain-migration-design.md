# SEO-переезд cloverspb.ru → clover-spb.ru: design spec

**Статус:** design only, production не изменён.
**Дата:** 2026-09-06.
**Evidence:** [`docs/seo-migration/cloverspb-migration-audit.md`](../../seo-migration/cloverspb-migration-audit.md), [`cloverspb-old-url-inventory.csv`](../../seo-migration/cloverspb-old-url-inventory.csv), [`cloverspb-new-url-inventory.csv`](../../seo-migration/cloverspb-new-url-inventory.csv), [`cloverspb-redirect-map.csv`](../../seo-migration/cloverspb-redirect-map.csv), [`cloverspb-unmatched.csv`](../../seo-migration/cloverspb-unmatched.csv).

## 1. Goals

Перевести `cloverspb.ru` и `www.cloverspb.ru` с MegaGroup на отдельный redirect-only контур Clover так, чтобы каждый одобренный legacy URL выполнял один постоянный redirect непосредственно на релевантный конечный `https://clover-spb.ru/...` URL. Сохранить максимум доступных SEO-сигналов и пользовательского intent без blanket homepage redirect, chains, loops и скрытых fuzzy product substitutions.

Успех означает:

- все утверждённые `EXACT` и `HIGH` строки карты обслуживаются одинаково по HTTP/HTTPS и apex/www;
- target отвечает 200 без собственного redirect;
- `REVIEW` не активируется автоматически;
- неизвестные и доказанно удалённые URL получают честный 404/410;
- текущий Clover storefront, `/lk`, API `:4100`, UI `:5273`, БД и 1С остаются изолированы;
- cutover имеет предварительную проверку, наблюдаемость и быстрый DNS/nginx rollback.

## 2. Non-goals

Эта подготовка и будущий redirect-контур не должны:

- проксировать old domain в React/UI/API Clover;
- менять текущие маршруты, каталог, цены, delivery, checkout, LK, PWA, DB или 1С;
- автоматически создавать отсутствующие новые content pages;
- считать похожие названия доказательством идентичности товара;
- переносить MegaGroup private key;
- менять NS без доказанной необходимости;
- выполнять DNS/nginx/SSL mutation без отдельного разрешения;
- решать обнаруженный вопрос raw HTML metadata скрытой runtime-правкой. Если rendered SEO gate не проходит, это отдельная задача.

## 3. Current topology

Сейчас авторитетные NS старого домена — MegaGroup. Apex и www указывают на `185.32.58.162`, где HTTPS-контент старого магазина доступен с валидным сертификатом. Новая production-точка `clover-spb.ru` указывает на `185.233.93.129` и через nginx проксирует UI на `192.168.155.15:5273`, API/uploads на `192.168.155.15:4100`.

На Clover server уже существует system-managed `/etc/nginx/sites-available/cloverspb.ru`, включённый только на 80 и выполняющий blanket path-preserving redirect. Он публично не активен для старого домена из-за текущего DNS и не соответствует целевой map policy. HTTPS-блок old domain закомментирован. ACME обслуживается `dehydrated 0.7.2-2`; Certbot отсутствует.

Активные vhost-файлы не repo-managed. В будущем исходники генератора, map и шаблон vhost должны появиться в `ops/nginx/legacy-domain/`, а production-файлы должны устанавливаться только из проверенного commit с checksum.

## 4. Old/new URL inventory

Старый bounded inventory зафиксирован построчно в `docs/seo-migration/cloverspb-old-url-inventory.csv` и содержит 910 публично связанных URL:

- 1 homepage;
- 14 info/service pages;
- 50 sitemap categories;
- 276 sitemap products с 200;
- 1 внутренний product URL с 404;
- 16 пагинаций с canonical на базовую категорию;
- 552 технических MegaGroup aliases `/prev` и `/next` с 301.

Новый inventory зафиксирован построчно в `docs/seo-migration/cloverspb-new-url-inventory.csv` и содержит 747 публичных маршрутов:

- homepage, `/catalog`, `/contacts`;
- 8 categories и 48 subcategories;
- 688 products из read-only `/api/public/catalog`.

Для old inventory status/canonical/title/H1 получены последовательным bounded GET. Все 747 new routes также проверены прямым GET; `status`, `current_location`, `raw_title`, `raw_h1` и `canonical` отделены от product identity/иерархии/title/H1 из public catalog API. Поэтому API-derived имя невозможно принять за server-rendered metadata.

Источником truth для будущего redirect generator служит reviewed CSV, а не повторное fuzzy matching во время deploy. Search Console, Яндекс Вебмастер, analytics и access logs должны дополнить inventory перед freeze, если доступ будут предоставлен.

## 5. Redirect matching policy

Порядок приоритета фиксирован:

1. Homepage → homepage.
2. Info page → доказанный эквивалентный public info page.
3. Category/subcategory → точная либо семантически эквивалентная current category/subcategory.
4. Product → current product только при доказанной identity.
5. Отсутствующий product → максимально близкая category/subcategory с тем же search intent.
6. Без разумного relevant target → 404/410, а не homepage.

Confidence contract:

- `EXACT`: homepage/contact equivalence, уникальный с обеих сторон public article/SKU или точное нормализованное product/category name.
- `HIGH`: доказанная category equivalence либо product-to-category fallback. Fuzzy product-to-product никогда не является HIGH сам по себе.
- `REVIEW`: неоднозначная identity, технический alias, пагинация или неизвестная query semantics.
- `NO_MATCH`: релевантная destination не доказана.

## 6. Exact-vs-category fallback rules

Product redirect на product разрешается только когда:

- старый article и новый public code однозначны с обеих сторон; либо
- полное нормализованное имя совпадает, включая значимые размер/объём/количество; и
- target присутствует в public catalog и отвечает прямым 200.

Повторяющийся article, конфликт размера/цвета/комплектации или только высокая token similarity переводит строку в `REVIEW`. Найденный дубликат article `0565` не получает product mapping.

Product-to-category fallback получает HIGH только если родительская старая категория подтверждена внутренней ссылкой и имеет однозначный current category equivalent. Верхнеуровневая категория не должна случайно превращаться в первую подкатегорию. Несколько старых продуктов могут законно вести в одну category target; это отмечается как ожидаемый duplicate target.

## 7. Unmatched URL handling

На production generator принимает только строки с `action=301` и отдельно утверждённые per-row `410`. Discovery-рекомендация `action=410` сама по себе не является утверждением: production freeze требует decision log с доказательством permanent removal. `REVIEW` никогда не компилируется в redirect автоматически.

- Existing old 404 сохраняется как 404.
- Доказанно удалённый контент без replacement получает 410.
- Неизвестный path по умолчанию получает 404.
- `/registraciya` и связанные login/recovery routes не направляются в `/lk`, потому что private LK запрещён как SEO target.
- 552 `/prev`/`/next` aliases остаются REVIEW: их текущий MegaGroup redirect не превращает их в content pages.
- 16 pagination URL остаются REVIEW до подтверждения исторического трафика и path/query policy, несмотря на canonical к base category.

## 8. Nginx architecture

Рассмотрены три подхода:

1. **Рекомендуемый: repo-generated `map` + отдельный old-domain vhost.** Компактный, проверяемый и подходит для сотен exact paths.
2. Сгенерированные exact `location =` blocks. Проще читать по одной строке, но создают большой vhost и усложняют diff/install.
3. Redirect logic в Node/React. Отклонён: смешивает redirect-only домен с Clover runtime и увеличивает regression surface.

Целевая структура:

```text
ops/nginx/legacy-domain/
  cloverspb.ru.redirect.conf.template
  cloverspb-path-redirects.map
  cloverspb-query-redirects.map
  cloverspb-path-gone.map
  cloverspb-query-gone.map
scripts/seo/
  generate-cloverspb-nginx-map.mjs
  verify-cloverspb-redirect-map.mjs
```

`map` определяется в `http` context через repo-managed include. Runtime lookup остаётся exact и не отбрасывает query молча: no-query решения компилируются по нормализованному `$uri`, а отдельно утверждённые query-bearing решения — по полному `$request_uri` в отдельной map. Validator приводит scheme/host case, www, dot segments, unreserved percent-encoding и единственный trailing slash к collision key только для поиска дублей; исходный approved request variant сохраняется для генерации. Encoded/decoded или slash-вариант компилируется как alias только при доказанном одинаковом legacy response/canonical и отдельной строке решения. Любой неутверждённый query, alternate encoding или slash-вариант получает default 404, а не path-only redirect.

Концептуальный vhost:

```nginx
map $uri $cloverspb_path_redirect_target {
    default "";
    include /etc/nginx/maps/cloverspb-path-redirects.map;
}

map $request_uri $cloverspb_query_redirect_target {
    default "";
    include /etc/nginx/maps/cloverspb-query-redirects.map;
}

map $uri $cloverspb_path_gone {
    default 0;
    include /etc/nginx/maps/cloverspb-path-gone.map;
}

map $request_uri $cloverspb_query_gone {
    default 0;
    include /etc/nginx/maps/cloverspb-query-gone.map;
}

server {
    listen 80;
    server_name cloverspb.ru www.cloverspb.ru;

    location ^~ /.well-known/acme-challenge/ {
        alias /var/www/dehydrated/.well-known/acme-challenge/;
        try_files $uri =404;
    }

    location / {
        if ($cloverspb_query_redirect_target != "") { return 301 $cloverspb_query_redirect_target; }
        if ($cloverspb_query_gone = 1) { return 410; }
        if ($args != "") { return 404; }
        if ($cloverspb_path_redirect_target != "") { return 301 $cloverspb_path_redirect_target; }
        if ($cloverspb_path_gone = 1) { return 410; }
        return 404;
    }
}
```

Точная синтаксическая форма должна быть подтверждена `nginx -t` на установленной версии 1.26.3. Никакой `proxy_pass` в old-domain vhost не допускается. Old-domain access/error logs отделяются от Clover logs.

## 9. HTTP and HTTPS behavior

HTTP и HTTPS old domain используют один и тот же compiled redirect map и ведут сразу в конечный `https://clover-spb.ru/...` target. Запрещена цепочка `http old → https old → https new`.

ACME challenge location обрабатывается до redirect logic и возвращает только challenge file либо 404. HTTPS server включается только после наличия валидного old-domain certificate. HTTP server можно stage/test до DNS cutover, но любой install/reload является отдельной production mutation.

Expected matrix после cutover:

- mapped URL: 301, exact `Location`, затем target 200, 1 hop;
- explicit gone: 410;
- current old 404/unknown: 404;
- REVIEW: не redirect; default 404 до отдельного решения.

## 10. www behavior

`cloverspb.ru` и `www.cloverspb.ru` обслуживаются одним redirect-only vhost и одинаковой map. Оба host variation должны вести непосредственно на non-www `https://clover-spb.ru/...` target за один hop.

Текущее `https://www.clover-spb.ru/` отвечает 200 без nginx canonical redirect. Миграция old domain не меняет это поведение. Все generated targets всё равно используют только `https://clover-spb.ru`.

## 11. SSL/certificate strategy

New-domain certificate не заменяется и не расширяется. Для old domain нужен отдельный certificate с SAN `cloverspb.ru` и `www.cloverspb.ru`.

Предпочтительная схема — получить сертификат до web A cutover через DNS-01 в авторитетной MegaGroup zone. Это требует доказанной возможности добавить `_acme-challenge` TXT и отдельного review dehydrated hook/credentials; секреты не попадают в Git или логи.

Если DNS-01 недоступен, cutover не начинается, пока не спроектирован способ без certificate-gap. HTTP-01 после A switch создаёт окно, когда HTTPS попадает на сервер без валидного сертификата, поэтому сценарий «сначала A, затем когда-нибудь сертификат» запрещён. Альтернатива должна обеспечить предварительно валидный cert либо согласованную provider-side ACME validation; иначе `STATUS=STOP`.

Перед активацией:

- certificate SAN содержит оба old host;
- срок и issuer прочитаны через public handshake/openssl;
- private key permissions ограничены;
- old vhost ссылается только на old certificate paths;
- current `clover-spb.ru` certificate path/checksum не изменён.

## 12. DNS cutover strategy

Текущие факты: old apex/www A = `185.32.58.162`, AAAA нет, NS MegaGroup, MX `mxs.oml.ru`, TTL 43200. Proposed target A = `185.233.93.129`.

Предпочтительный минимальный cutover при доступной MegaGroup DNS zone:

1. За 24–48 часов снизить TTL old apex/www до 300 отдельным разрешённым изменением.
2. Не менять NS, MX и прочие записи.
3. После всех prechecks изменить apex A и www A на `185.233.93.129`.
4. Не добавлять AAAA, пока IPv6 endpoint не доказан.
5. Проверять authoritative и несколько recursive resolvers до завершения propagation.

Если current NS не позволяют редактировать records, NS migration рассматривается отдельным проектом: полный zone export/inventory, recreation в RU-CENTER, prevalidation, TTL plan и rollback. Нельзя менять только NS, не восстановив все необходимые records. До проверки доступа итог: `NAMESERVER CHANGE REQUIRED=UNKNOWN`.

## 13. DNS rollback strategy

Перед cutover сохраняются authoritative ответы, TTL, NS, SOA, apex/www A, MX/TXT/CAA и скрин/экспорт панели. При сбое минимального A-cutover:

1. Вернуть apex/www A на `185.32.58.162`.
2. Проверить authoritative answers и публичное MegaGroup HTTPS behavior.
3. Отключить только staged old-domain redirect vhost при необходимости.
4. Не трогать `clover-spb.ru`, его certificate, UI/API, DB или 1С.

Если когда-либо одобрен NS migration, rollback NS допускается только после проверки, что прежняя MegaGroup zone всё ещё активна; иначе возврат NS может привести к NXDOMAIN/потере MX.

## 14. SEO validation

До cutover автоматический validator обязан подтвердить:

- schema и uniqueness old paths;
- каждый 301 target имеет host `clover-spb.ru`, HTTPS, прямой 200 и не ведёт в `/lk`, `/api`, auth, private IP или old domain;
- нет chains/loops;
- `REVIEW` отсутствует в compiled map;
- unknown не ведётся на homepage;
- representative homepage/info/category/subcategory/exact-product/product-to-category/404/410/query/www cases.

Отдельный critical gate: rendered URL inspection новых product/category routes должен показать уникальные title, H1 и self-canonical. Raw HTML сейчас содержит общий title и не содержит H1/canonical, потому metadata создаются client-side. Если Google/Яндекс rendered inspection не подтверждает нужные элементы, DNS-cutover останавливается и открывается отдельный SEO-runtime PR.

## 15. Google/Yandex migration considerations

Google:

- подтвердить ownership domain properties старого и нового домена и relevant www variants;
- после live redirects использовать Change of Address;
- загрузить актуальный new sitemap, сохранить redirects минимум год и мониторить старые/новые URL;
- ожидать временные ranking fluctuations и повышенный crawl.

Яндекс:

- добавить и подтвердить оба адреса в Вебмастере;
- проверить новый адрес и redirects;
- затем подать заявку «Индексирование → Переезд сайта»;
- отправить новый sitemap на переобход и мониторить «Страницы в поиске»/ошибки обхода.

Оба поисковика требуют аналогичные page-to-page redirects и не поддерживают blanket unrelated homepage mapping как качественную миграцию.

## 16. Robots/sitemap/canonical implications

Old redirect host должен оставаться crawlable; нельзя закрывать redirects через `robots.txt`. Старый sitemap можно временно сохранить доступным для discovery, а затем перевести к migration-specific inventory согласно рекомендациям Search Console/Webmaster.

New `robots.txt` уже исключает `/lk` и `/api`; это сохраняется. Current sitemap содержит 10 URL и не отражает 688 public product routes/48 subcategories. Перед move нужно решить отдельным reviewed SEO change, какие stable/indexable routes включать. Нельзя автоматически публиковать весь API catalog без проверки canonical, availability и content quality.

Каждый индексируемый new target должен иметь self-referencing canonical на `https://clover-spb.ru/...`. Old canonical не заменяет HTTP redirect. Pagination и query variants остаются REVIEW до утверждения canonical/query policy.

## 17. Monitoring after migration

Минимальные интервалы: сразу после cutover, 15 минут, 1 час, 6 часов, 24 часа, ежедневно первую неделю, еженедельно 8–12 недель.

Контролируются:

- authoritative/recursive DNS и TLS expiry/SAN;
- полный redirect map, hop count, target 200;
- old-domain 404/410/top requested unknown paths;
- nginx old-domain 4xx/5xx и certificate renewals;
- new storefront health, `/lk`, API health, unauthorized `/api/one-c = 401`;
- Google Search Console indexing, Change of Address, crawl errors;
- Яндекс Вебмастер move/indexing/crawl errors;
- organic traffic and conversions по old/new landing pages.

Alert threshold и owner должны быть назначены до cutover. Real order/1C checks не выполняются без отдельного разрешения.

## 18. Rollback

Rollback package содержит:

- export/checksum current DNS и TTL;
- backup/checksum current `/etc/nginx/sites-available/cloverspb.ru` (`d753b228...` на дату аудита);
- checksum new-domain vhost и certificate metadata;
- staged config checksum и commit SHA;
- команды disable/restore только old-domain site;
- full redirect validation report.

Основной rollback — вернуть web DNS к `185.32.58.162` и восстановить/отключить только old-domain nginx config. DB rollback, Clover deploy rollback и 1С rollback не применяются к этой миграции.

## 19. Business/regression isolation

Old-domain vhost не содержит `proxy_pass`, не использует Clover env и не меняет routes/auth/IP/ports. New-domain vhost и dehydrated config не редактируются, кроме отдельно reviewed include/old certificate wiring.

Future regression matrix включает storefront, `/lk`, login/auth, client/manager/admin, catalog/product/cart/checkout, delivery zones/fees, matrices/UOM/prices/PWA/existing SEO pages, API health и unauthenticated `/api/one-c = 401`. Заказы и 1С не записываются. Любой regression или checksum drift даёт STOP.

## 20. Implementation steps

Исполнение проходит только по воротам:

- **GATE A:** repo-managed generator и frozen reviewed map.
- **GATE B:** automated schema/target/security/chain validation.
- **GATE C:** backup и stage old-domain nginx config на production без DNS cutover, только после отдельного разрешения.
- **GATE D:** `nginx -t`; при ошибке STOP без самостоятельного ремонта.
- **GATE E:** pre-cutover Host-header HTTP и certificate-ready `--resolve` HTTPS matrix; full Clover regression.
- **GATE F:** STOP и отдельное явное разрешение на DNS-cutover.
- **GATE G:** минимальное DNS-изменение пользователем/provider с записью before/after.
- **GATE H:** активировать заранее подготовленный old-domain SSL; если cert отсутствует, GATE G не начинается.
- **GATE I:** public post-cutover full-map redirect validation.
- **GATE J:** Clover regression и 1C endpoint/auth invariants без реального заказа.
- **GATE K:** Search Console/Яндекс move actions и длительный SEO monitoring.

Каждый gate сохраняет артефакты, checksum и явный PASS/STOP. Текущий запуск заканчивается до GATE A execution и не разрешает ни одного production mutation.
