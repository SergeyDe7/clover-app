# Runbook: усиление инфраструктуры Clover (nginx, systemd, привязка портов, заголовки)

> **Статус: подготовительный документ.** Ни одна команда отсюда не выполнялась
> при его составлении. Ни один сервис не перезапускался, ни один конфиг
> не изменялся. Всё выполняет **оператор вручную**.
>
> Дата обследования: **2026-08-31**, хост `192.168.155.15` (Debian 13,
> nginx 1.26.3, Node v22.23.2).

---

## 1. Топология «как есть»

### 1.1 Что слушает

`ss -ltnp` (без root имена процессов для части сокетов недоступны):

```
State   Local Address:Port   Process
LISTEN  127.0.0.1:5274       node  pid=1960026
LISTEN  0.0.0.0:22           —            (имя процесса не показано: требует root)
LISTEN  0.0.0.0:4100         node  pid=2676173
LISTEN  0.0.0.0:80           —            (имя процесса не показано: требует root)
LISTEN  127.0.0.1:40873      node  pid=2565072
LISTEN  0.0.0.0:443          —            (имя процесса не показано: требует root)
LISTEN  127.0.0.1:41443      node  pid=2527172
LISTEN  0.0.0.0:5273         node  pid=2676195
LISTEN  [::]:22              —            (имя процесса не показано: требует root)
```

Расшифровка по `ps -o pid,user,args`:

| Сокет | Процесс | Пользователь | Комментарий |
| --- | --- | --- | --- |
| `0.0.0.0:4100` | `/usr/bin/node src/server.js` | `clover` | Clover API, юнит `clover-api.service` |
| `0.0.0.0:5273` | `vite preview --host 0.0.0.0 --port 5273` | `clover` | Clover UI, юнит `clover-ui.service` |
| `127.0.0.1:5274` | `vite preview --host 127.0.0.1 --port 5274` | `clover` | **осиротевший процесс**, живёт 2 дня 07 часов, ни в одном юните не описан |
| `127.0.0.1:40873`, `127.0.0.1:41443` | `.cursor-server` | `clover` | инструментарий разработки, к Clover отношения не имеет |
| `:22` v4+v6 | sshd | root | см. `FIREWALL_RUNBOOK.md` |
| `:80`, `:443` | nginx | master root / worker www-data | принадлежность подтверждена заголовком `Server: nginx` в ответе и конфигурацией |

Ключевое: **и API, и UI слушают `0.0.0.0`**, то есть доступны на LAN-адресе
напрямую, минуя nginx. Проверено:

```
$ curl -sSI http://192.168.155.15:4100/api/health
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
...

$ curl -sSI http://192.168.155.15:5273/
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
```

Оба отвечают **по plain HTTP, без TLS**.

Сеть: единственный интерфейс `eth0` = `192.168.155.15/24`, шлюз
`192.168.155.1`, глобального IPv6 нет (только link-local `fe80::/64`).
Адрес приватный — значит, публичный доступ к `:443` обеспечивается
DNAT на шлюзе/периметре, вне этого хоста.

Важная деталь маршрутизации, которая понадобится дальше:

```
$ ip route get 192.168.155.15
local 192.168.155.15 dev lo src 192.168.155.15
```

Обращение nginx к собственному LAN-адресу идёт **через `lo`**, а не через
`eth0`.

### 1.2 systemd

`/etc/systemd/system/clover-api.service`:

```ini
[Service]
Type=simple
User=clover
Group=clover
WorkingDirectory=/opt/clover/clover-app/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
```

`/etc/systemd/system/clover-ui.service`:

```ini
[Service]
Type=simple
User=clover
Group=clover
WorkingDirectory=/opt/clover/clover-app
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run preview -- --host 0.0.0.0 --port 5273
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
```

Оба `active`. **UI действительно обслуживается `vite preview`** — подтверждено
трижды: `ExecStart` юнита, вывод `ps` (`vite preview --host 0.0.0.0 --port 5273`)
и блок `preview` в `vite.config.js`.

Пользователь `clover` (uid 988) входит в группу `sudo`
(`id clover` → `groups=988(clover),27(sudo)`). При `NoNewPrivileges=true`
в самом сервисе это не эксплуатируется, но интерактивный вход под `clover`
даёт root.

### 1.3 nginx

`/etc/nginx/sites-enabled/`: 4 симлинка.

| vhost | Слушает | Роль |
| --- | --- | --- |
| `clover-spb.ru` | `443 ssl` | основной сайт |
| `clover-order.ru` | `443 ssl` | 301 → `https://clover-spb.ru` |
| `cloverspb.ru` | `80` | 301 → `https://clover-spb.ru` (HTTPS-блок закомментирован — сертификата нет) |
| `dehydrated` | `80`, `server_name _` | ACME-челлендж + 301 всего остального на HTTPS |

В основном vhost `listen [::]:443 ssl;` **закомментирован** (строка 4), в
`dehydrated` закомментирован `listen [::]:80;`. Поэтому nginx слушает только
IPv4 — что и видно в `ss`.

TLS: `ssl_protocols TLSv1.2 TLSv1.3`, `ssl_ciphers HIGH:!aNULL:!MD5`,
`ssl_prefer_server_ciphers on` (в `nginx.conf` глобально стоит `off` —
vhost переопределяет). Сертификаты dehydrated:
`/dehydrated/certs/clover-spb.ru/{fullchain,privkey}.pem`. Каталог
`/dehydrated/certs` — `0700 root:root`. HTTP/2 **не включён**
(`listen 443 ssl;` без `http2`), OCSP stapling не настроен.
`server_tokens off` — задано глобально.

**Куда проксирует nginx** (`clover-spb.ru`):

| location | Назначение |
| --- | --- |
| `/assets/` | `alias /opt/clover/clover-app/dist/assets/` — статика с диска |
| `/fonts/` | `alias /opt/clover/clover-app/dist/fonts/` — статика с диска |
| `~* ^/(favicon\.png\|favicon-32\.png\|apple-touch-icon\.png\|icon-.*\.png\|icons\.svg)$` | `proxy_pass http://192.168.155.15:5273` |
| `= /index.html`, `= /sw.js`, `= /manifest.webmanifest`, `= /robots.txt`, `= /sitemap.xml` | `proxy_pass http://192.168.155.15:5273` |
| `/` | `proxy_pass http://192.168.155.15:5273` |
| `/api/` | `proxy_pass http://192.168.155.15:4100` |
| `/uploads/` | `proxy_pass http://192.168.155.15:4100` |

**Обратить внимание: upstream — `192.168.155.15`, а не `127.0.0.1`.**
Это прямо влияет на план перевода API на loopback (§3).

Отдельного `location /api/one-c` нет — обмен с 1С, если бы он шёл через nginx,
попадал бы под общий `/api/`.

Загруженные модули включают `ngx_http_headers_more_filter_module.so`
(`/etc/nginx/modules-enabled/50-mod-http-headers-more-filter.conf`) — это
пригодится в §5.

### 1.4 Итог: доступен ли API снаружи nginx

Да. `:4100` и `:5273` подняты на `0.0.0.0`, отвечают `200` на LAN-адресе по
HTTP. Дополнительно `vite preview` сам проксирует API: в `vite.config.js`
блок `preview.proxy` перенаправляет `/api` и `/uploads` на
`http://127.0.0.1:4100`. То есть **`:5273` — вторая дверь к API**, помимо
`:4100` и nginx.

Межсетевого экрана на хосте нет (см. `FIREWALL_RUNBOOK.md`), поэтому
ограничение доступа сейчас держится только на периметре ДЦ/шлюза.

---

## 2. Как 1С на самом деле достаёт Clover — определяем до любых изменений

Это решающий вопрос: от ответа зависит, можно ли вообще переводить API на
loopback.

### 2.1 Доказательства

**(1) Модуль 1С обращается по IP и порту напрямую.**
`one_c_patches/price_types/ВСТАВИТЬ_В_КОНЕЦ_МОДУЛЯ.txt`:

```bsl
Функция Clover_ХостAPI() Экспорт
	Возврат "192.168.155.15";
...
	Возврат 4100;
```

`one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt` — семь вызовов вида:

```bsl
Соединение = Новый HTTPСоединение("192.168.155.15", 4100);
Соединение = Новый HTTPСоединение("192.168.155.15", 4100, , , , 120);
```

Третий/четвёртый параметры (пользователь/пароль прокси) и параметр защищённого
соединения не заданы → это **обычный HTTP на порт 4100**, без TLS и без nginx.

**(2) Это боевой контур, а не тестовый.** `VLAVKA` — рабочая база: в
`server/.env` заданы `ONEC_ALLOWED_DATABASES=TEST,VLAVKA` и
`ONEC_PROD_EXCHANGE_ENABLED=true`; `docs/technical/PROD_CONTOUR.md` фиксирует
«Расширение в рабочей 1С (VLAVKA) — сделано» и заголовок
`X-Clover-Database: VLAVKA`.

**(3) Через nginx этот трафик не проходил ни разу.** В журналах доступа
основного vhost — текущем `/var/log/nginx/clover-order.access.log` и **всех
14 ротированных** `.gz` — **ноль** обращений, содержащих `one-c`:

```
$ zgrep -c one-c /var/log/nginx/clover-order.access.log.*.gz
... .2.gz:0 ... .3.gz:0 ... (и так все) ...
```

**(4) Документация проекта описывает ровно эту схему.**
`docs/deploy/FIREWALL.md`: «TCP 4100 | Backend API + `/api/one-c` | ПК
пользователей, 1С TEST». `docs/deploy/CHECKLIST.md`: «1С TEST должна
достучаться до `http://<IP>:4100/api/one-c/...` с заголовком ключа».
`one_c_patches/price_types/ИНСТРУКЦИЯ_ВСТАВКА_СЕЙЧАС.txt`: «Проверьте
`Clover_ХостAPI()` = 192.168.155.15 и порт 4100».

### 2.2 Вывод

> **1С подключается напрямую к `192.168.155.15:4100`, а не через nginx.**
>
> **`HOST=127.0.0.1` в текущем виде СЛОМАЕТ обмен с 1С.** Кроме того, это
> сломает и сам сайт: nginx проксирует на `192.168.155.15:4100` и
> `192.168.155.15:5273`, а не на loopback.

Состояние аутентификации обмена: `ONEC_API_KEY` в `server/.env` **задан**,
длина 54 символа (значение не выводилось). Порог в `oneCAuthRequired`
(`server/src/server.js:718`) — 24 символа, значит режим ключа активен и
локальный обход выключен (`ONEC_ALLOW_LOCAL_WITHOUT_KEY=false`). Маршруты
`/api/one-c/*` без правильного `X-Clover-Key` отдают `401`.

Это не отменяет проблему: **остальной** `/api/*` (в том числе `/api/auth/*`)
доступен с LAN по открытому HTTP, и ключ обмена ходит по сети в открытом виде.

### 2.3 План миграции, который ничего не ломает

Четыре фазы. Каждая проверяется до перехода к следующей.

#### Фаза 1 — перевести nginx на loopback (безопасно, 1С не затрагивает)

nginx работает на этом же хосте, поэтому `127.0.0.1` для него эквивалентен.
В `/etc/nginx/sites-available/clover-spb.ru` заменить во **всех** блоках:

```nginx
proxy_pass http://192.168.155.15:5273;   →   proxy_pass http://127.0.0.1:5273;
proxy_pass http://192.168.155.15:4100;   →   proxy_pass http://127.0.0.1:4100;
```

Проверка: `sudo nginx -t && sudo systemctl reload nginx`, затем §7.
После этой фазы API всё ещё на `0.0.0.0`, 1С работает как работала.

#### Фаза 2 — ограничить `:4100` межсетевым экраном, а не привязкой

Самый дешёвый и наименее рискованный шаг: оставить `HOST=0.0.0.0`, но
разрешить входящие на `:4100` только с `lo` и с конкретного IP сервера 1С.
Ровно это описано в `FIREWALL_RUNBOOK.md`. Так закрывается весь LAN, кроме
одного нужного узла, и **ни строчки в 1С менять не надо**.

Для этого нужно узнать IP машины 1С. Способы (выполняет оператор):

```bash
# по журналу API (нужны права на journal)
sudo journalctl -u clover-api --since "7 days ago" | grep -i 'one-c'

# по активным соединениям в момент обмена
sudo ss -tnp state established '( sport = :4100 )'

# по журналу аудита Clover — действие one-c.auth.denied пишет ip
#   (маршрут /api/admin/... в UI менеджера, вкладка обмена)
```

#### Фаза 3 — перевести 1С на HTTPS через nginx (подготовка к loopback)

Только после фазы 2, отдельной задачей и на базе `TEST`:

1. В модуле 1С заменить
   `Новый HTTPСоединение("192.168.155.15", 4100)` на
   ```bsl
   Соединение = Новый HTTPСоединение("clover-spb.ru", 443, , , , 60,
       Новый ЗащищенноеСоединениеOpenSSL);
   ```
2. Проверить с машины 1С **до** правки модуля, что путь вообще рабочий:
   ```
   curl -sSI https://clover-spb.ru/api/one-c/queue-status -H "X-Clover-Key: <ключ>"
   ```
3. Два подводных камня, из-за которых фаза 3 может не поехать:
   - **hairpin NAT.** `clover-spb.ru` резолвится в публичный адрес. Машина 1С
     находится в той же сети `192.168.155.0/24`. Если шлюз не умеет
     возврат трафика на себя, обращение изнутри LAN на публичный IP не дойдёт.
     Обходной путь — запись в `hosts` машины 1С:
     `192.168.155.15  clover-spb.ru`, но тогда сертификат должен совпасть по
     имени (совпадёт) и nginx должен принимать соединение по LAN-адресу
     (принимает, слушает `0.0.0.0:443`).
   - **Доверие к цепочке Let's Encrypt** в хранилище сертификатов Windows на
     машине 1С. Если платформа ругается на сертификат, `ЗащищенноеСоединениеOpenSSL`
     нужно создавать с явным сертификатом УЦ.
4. Прогнать полный цикл обмена на `TEST`: `queue-status`, `test-order`,
   `orders/{id}/ack`, `price-types`, `sale-prices`. Только затем `VLAVKA`.
5. Убедиться, что обращения появились в `/var/log/nginx/clover-order.access.log`
   (сейчас их там ноль — это и будет критерием, что 1С пошла через nginx):
   ```
   sudo grep -c 'one-c' /var/log/nginx/clover-order.access.log
   ```

#### Фаза 4 — только теперь loopback

Хост и порт выбираются в `server/src/server.js:356-357`:

```js
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || "0.0.0.0";
```

и применяются в `app.listen(port, host, ...)` (`server/src/server.js:6984`).
В `server/.env` уже есть строка `HOST=0.0.0.0`. Изменение:

```diff
-HOST=0.0.0.0
+HOST=127.0.0.1
```

затем `sudo systemctl restart clover-api`.

Условия входа в фазу 4 (все обязательны):
- фаза 1 выполнена и проверена (иначе сайт ляжет мгновенно);
- фаза 3 выполнена, обмен с `VLAVKA` идёт через nginx не менее недели без
  сбоев, и это видно в журнале nginx;
- в `/var/log/nginx/clover-order.access.log` есть обращения `one-c`,
  а на `:4100` их больше нет.

Откат фазы 4: вернуть `HOST=0.0.0.0`, `sudo systemctl restart clover-api`.
Занимает секунды.

---

## 3. Заодно: `:5273` тоже надо убрать с `0.0.0.0`

`clover-ui.service` жёстко задаёт `--host 0.0.0.0`. Если UI переезжает на
nginx (§4), юнит просто выключается и вопрос снимается. Если по каким-то
причинам `vite preview` остаётся, поменять в юните на `--host 127.0.0.1`
одновременно с фазой 1 (nginx уже будет ходить на loopback).

Осиротевший `vite preview --host 127.0.0.1 --port 5274` (pid 1960026, живёт
двое суток) в юнитах не описан — его следует остановить как мусор:
`sudo kill 1960026`. Слушает только loopback, поэтому срочности нет.

---

## 4. Перевод UI с `vite preview` на статику из nginx

### 4.1 Зачем

- `vite preview` — сервер для локального просмотра сборки, не для боя:
  однопоточный Node, без ограничений на скорость, без нормальной обработки
  ошибок.
- `vite.config.js` задаёт `preview.cors: true`, из-за чего **каждый** ответ
  UI содержит `Access-Control-Allow-Origin: *`. Проверено на `/`,
  `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/robots.txt`,
  `/favicon.png` и на прямом `http://192.168.155.15:5273/`.
- `preview.proxy` открывает второй путь к API через `:5273`.
- Лишний сетевой хоп: nginx → HTTP → Node → диск, вместо nginx → диск.

### 4.2 Что раздавать

`/opt/clover/clover-app/dist` (`775 clover:clover`, «прочие» имеют `r-x`,
значит worker `www-data` прочитает). Содержимое:

```
index.html  sw.js  offline.html  manifest.webmanifest  robots.txt  sitemap.xml
favicon.png  favicon-32.png  apple-touch-icon.png  clover-logo.png
icon-192.png  icon-512.png  icon-maskable-192.png  icon-maskable-512.png  icons.svg
assets/   fonts/   storefront/
```

### 4.3 Как устроена маршрутизация — от этого зависит `try_files`

Точка входа одна: `dist/index.html`. `src/main.jsx` рендерит `RootShell`,
который спрашивает `shouldRenderStorefront()` из
`src/screens/storefront/mode.js`:

```js
export function shouldRenderStorefront() {
  if (isCabinetPath(window.location.pathname)) return false;   // /lk и /lk/*
  if (isStoreHost()) return true;                              // hostname ∈ VITE_STORE_HOSTS
  if (isStorefrontPreviewPath()) return true;                  // /vitrina*
  return false;
}
```

Решение принимается **в браузере**, по `window.location.hostname` и пути.
`hostName()` срезает префикс `www.`. Значения берутся из `.env.production`
на этапе сборки:

```
VITE_PUBLIC_BASE_URL=https://clover-spb.ru
VITE_CABINET_PATH=/lk
VITE_STORE_HOSTS=clover-spb.ru
```

Клиентские маршруты, которых нет на диске и которые обязаны отдавать
`index.html`:

- витрина: `/`, `/catalog/*`, `/product/*`, `/cart`, `/checkout`,
  `/contacts`, `/install-app`, а также превью `/vitrina/*`;
- кабинет: `/lk`, `/lk/*`.

Следствие для nginx: **достаточно одного `try_files $uri /index.html`**,
отдельного блока под `/lk` не нужно — тот же `index.html` сам решит, что
рендерить. Отдельный блок под `/lk` понадобится только для кэш-заголовков,
потому что это HTML-документ и он не должен кэшироваться.

Многохостовость сохраняется автоматически: `clover-order.ru` и `cloverspb.ru`
и так делают 301 на `clover-spb.ru`, `www.` срезается в браузере. Единственное,
что исчезнет, — список `allowedHosts` из `vite.config.js` (vite preview отдавал
403 на незнакомый `Host`); nginx такой проверки не делает, и это улучшение,
а не потеря.

### 4.4 Блок nginx

Заменяет **все** проксирующие на `:5273` location'ы (`/`, `= /index.html`,
`= /sw.js`, `= /manifest.webmanifest`, `= /robots.txt`, `= /sitemap.xml`,
регулярку с иконками) и уточняет `/assets/`, `/fonts/`.
`/api/` и `/uploads/` **остаются проксируемыми на API** — их не трогать.

```nginx
    root /opt/clover/clover-app/dist;
    index index.html;

    # ---- Хэшированные ассеты Vite: имя меняется при каждой сборке ----
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location /fonts/ {
        try_files $uri =404;
        expires 1y;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location /storefront/ {
        try_files $uri =404;
        expires 30d;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=2592000" always;
        access_log off;
    }

    # ---- Иконки и статика с фиксированными именами ----
    location ~* ^/(favicon\.png|favicon-32\.png|apple-touch-icon\.png|clover-logo\.png|icon-.*\.png|icons\.svg)$ {
        try_files $uri =404;
        expires 7d;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=604800" always;
        access_log off;
    }

    # ---- Документы и служебные файлы: без кэша ----
    location = /index.html {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location = /sw.js {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Service-Worker-Allowed "/" always;
    }

    location = /offline.html {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location = /manifest.webmanifest {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=3600, must-revalidate" always;
    }

    location = /robots.txt {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=86400" always;
    }

    location = /sitemap.xml {
        try_files $uri =404;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "public, max-age=86400" always;
    }

    # ---- Кабинет: тот же index.html, но это HTML-документ → без кэша ----
    location ^~ /lk {
        try_files $uri /index.html;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    # ---- SPA-fallback для витрины и всего остального ----
    location / {
        try_files $uri $uri/ /index.html;
        include /etc/nginx/snippets/clover-security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }
```

Три момента, которые легко упустить:

1. **`try_files $uri =404` в `/assets/`, а не fallback на `index.html`.**
   Это воспроизводит защиту из `vite.config.js` (плагин
   `noAssetSpaFallback`). Если отсутствующий хэшированный файл отдать как
   HTML, браузер получит HTML вместо CSS/JS — в комментарии к плагину прямо
   описан симптом: «только текст без оформления + 2 логотипа» на телефоне.
2. **`location ^~ /lk`** с модификатором `^~`, иначе регулярка с иконками
   имеет более высокий приоритет для части путей.
3. **`add_header` в каждом блоке сбрасывает унаследованные** — поэтому во
   всех блоках стоит `include` со снипетом заголовков (§5).

### 4.5 Кэш-заголовки: сверка с текущим поведением

Снипет из `vite.config.js` (`cloverPreviewCacheHeaders`) задаёт сейчас:

| Путь | vite preview | предлагаемый nginx |
| --- | --- | --- |
| `/`, `/index.html`, `/sw.js` | `no-cache, no-store, must-revalidate` + `Pragma`/`Expires` | то же |
| `/manifest.webmanifest` | `public, max-age=3600, must-revalidate` | то же |
| `/robots.txt`, `/sitemap.xml` | `public, max-age=86400` | то же |
| `/assets/*`, `/fonts/*` | `public, max-age=31536000, immutable` | то же |

Поведение сохраняется. Побочно исчезает дублирование `Cache-Control`, которое
сейчас наблюдается на `/manifest.webmanifest` и `/robots.txt` (директива
`expires` и `add_header Cache-Control` выставляют заголовок дважды).

### 4.6 Переключение и откат

```bash
# 0. свежая сборка на диске
cd /opt/clover/clover-app && npm run build
ls -la dist/index.html dist/assets | head

# 1. резервная копия конфига (в каталоге nginx уже есть такие .bak)
sudo cp /etc/nginx/sites-available/clover-spb.ru \
        /etc/nginx/sites-available/clover-spb.ru.bak-$(date +%Y%m%d-%H%M%S)

# 2. правка конфига по §4.4 + §5

# 3. проверка синтаксиса и мягкая перезагрузка
sudo nginx -t && sudo systemctl reload nginx

# 4. проверки по §7

# 5. только когда всё зелёное — гасим vite preview
sudo systemctl disable --now clover-ui.service
```

Откат:

```bash
sudo systemctl enable --now clover-ui.service
sudo cp /etc/nginx/sites-available/clover-spb.ru.bak-<штамп> \
        /etc/nginx/sites-available/clover-spb.ru
sudo nginx -t && sudo systemctl reload nginx
```

Порядок важен: `clover-ui.service` гасится **последним**, чтобы откат
сводился к возврату конфига. Пока юнит жив, откат занимает секунды.

---

## 5. Заголовки безопасности

### 5.1 Что объявлено сейчас

В `clover-spb.ru`, на уровне `server` (строки 19-23), пять директив, все
с флагом `always`:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

Content-Security-Policy нет вообще.

### 5.2 Где они теряются

nginx наследует `add_header` от родительского уровня **только если в блоке
нет ни одной собственной директивы `add_header`**. Как только блок объявляет
свою — все унаследованные отбрасываются. В текущем конфиге собственный
`add_header` объявляют **девять** блоков:

| location | строка `add_header` | что теряет |
| --- | --- | --- |
| `/assets/` | 33 | все 5 |
| `/fonts/` | 40 | все 5 |
| `~* ^/(favicon\.png\|...)$` | 53 | все 5 |
| `= /index.html` | 61 | все 5 |
| `= /sw.js` | 69 | все 5 |
| `= /manifest.webmanifest` | 78 | все 5 |
| `= /robots.txt` | 87 | все 5 |
| `= /sitemap.xml` | 96 | все 5 |
| `/uploads/` | 146 | все 5 |

Наследуют (собственного `add_header` не объявляют) только два: `location /`
и `location /api/`.

### 5.3 Проверено запросами

```
$ curl -sSI --resolve clover-spb.ru:443:127.0.0.1 https://clover-spb.ru/
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Permissions-Policy: camera=(), microphone=(), geolocation=()

$ curl -sSI ... https://clover-spb.ru/lk
(те же пять — обслуживается через location /)

$ curl -sSI ... https://clover-spb.ru/index.html
Content-Type: text/html;charset=utf-8
Access-Control-Allow-Origin: *
Cache-Control: no-cache, no-store, must-revalidate
        ← ни одного заголовка безопасности

$ curl -sSI ... https://clover-spb.ru/sw.js
        ← ни одного

$ curl -sSI ... https://clover-spb.ru/manifest.webmanifest
$ curl -sSI ... https://clover-spb.ru/robots.txt
$ curl -sSI ... https://clover-spb.ru/favicon.png
$ curl -sSI ... https://clover-spb.ru/assets/App-CzzYcLTr.js
        ← ни одного
```

Уточнение к распространённому предположению: **HTML-документ по `/` и `/lk`
заголовки получает** — эти пути обслуживает `location /`, у которого своего
`add_header` нет. Теряют заголовки другие вещи, и по-своему неприятные:

- `/index.html` — тот же самый документ по явному адресу. Его запрашивают
  service worker при обновлении и часть клиентов напрямую;
- `/sw.js` — код service worker'а, без `nosniff` и без `X-Frame-Options`;
- **`/uploads/*` — файлы, загруженные пользователями.** Отсутствие
  `X-Content-Type-Options: nosniff` именно здесь опаснее всего: браузер может
  сам «додумать» тип загруженного файла и выполнить его как HTML/скрипт
  в origin приложения;
- весь `/assets/*` и `/fonts/*`.

Отдельно: **на `/api/*` заголовки дублируются**, потому что их выставляет
и helmet в приложении (`server/src/server.js:389`,
`app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))`),
и nginx:

```
$ curl -sSI ... https://clover-spb.ru/api/health
Referrer-Policy: no-referrer                       ← helmet
Strict-Transport-Security: max-age=31536000; ...   ← helmet
X-Content-Type-Options: nosniff                    ← helmet
X-Frame-Options: SAMEORIGIN                        ← helmet
X-Frame-Options: SAMEORIGIN                        ← nginx
X-Content-Type-Options: nosniff                    ← nginx
Referrer-Policy: strict-origin-when-cross-origin   ← nginx (конфликтует с helmet)
Strict-Transport-Security: max-age=31536000; ...   ← nginx
Permissions-Policy: camera=(), microphone=(), ...  ← nginx
```

Два разных значения `Referrer-Policy` в одном ответе — поведение зависит от
браузера. Это надо развести: либо `proxy_hide_header` на стороне nginx для
дублей, либо убрать соответствующие middlewares у helmet. Простейший вариант
без правки кода — в `location /api/`:

```nginx
        proxy_hide_header Referrer-Policy;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header Strict-Transport-Security;
        include /etc/nginx/snippets/clover-security-headers.conf;
```

### 5.4 Исправление: общий снипет

Каталог `/etc/nginx/snippets/` уже существует (`0755 root:root`, сейчас в нём
`fastcgi-php.conf` и `snakeoil.conf`). Создать в нём
`clover-security-headers.conf`:

```nginx
# Подключается include'ом в КАЖДЫЙ location, где есть собственный add_header,
# иначе nginx отбросит унаследованные заголовки уровня server.
add_header X-Frame-Options            "SAMEORIGIN"                                  always;
add_header X-Content-Type-Options     "nosniff"                                     always;
add_header Referrer-Policy            "strict-origin-when-cross-origin"             always;
add_header Strict-Transport-Security  "max-age=31536000; includeSubDomains"         always;
add_header Permissions-Policy         "camera=(), microphone=(), geolocation=()"    always;
add_header Cross-Origin-Opener-Policy "same-origin"                                 always;
add_header X-Permitted-Cross-Domain-Policies "none"                                 always;
```

и добавить `include` во все девять блоков из §5.2 (в §4.4 он уже проставлен).
На уровне `server` пять исходных директив тоже заменить на этот же `include` —
чтобы значение хранилось в одном месте.

Флаг `always` обязателен: без него заголовок не попадёт в ответы `4xx`/`5xx`,
а страница ошибки — тоже HTML-документ.

**Альтернатива для этого хоста.** Модуль `headers-more` загружен
(`ngx_http_headers_more_filter_module.so`). `more_set_headers` не подчиняется
правилу сброса наследования, поэтому одна декларация на уровне `server`
покрыла бы все location'ы:

```nginx
    more_set_headers "X-Frame-Options: SAMEORIGIN";
    more_set_headers "X-Content-Type-Options: nosniff";
    more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";
    more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains";
    more_set_headers "Permissions-Policy: camera=(), microphone=(), geolocation=()";
```

Это короче и надёжнее против будущих правок, но привязывает конфиг к
стороннему модулю. Рекомендация: основной путь — снипет с `include`;
`more_set_headers` держать как запасной, если снипет где-то забудут подключить.

### 5.5 Referrer-Policy, X-Content-Type-Options, защита от фреймов

| Заголовок | Значение | Обоснование для Clover |
| --- | --- | --- |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | В путях кабинета встречаются идентификаторы заказов (`/lk/...`). При переходе на внешний ресурс (Яндекс.Карты, `t.me`, `max.ru` из контактов и настроек) полный URL уходить не должен. Значение уже выбрано верно — задача в том, чтобы оно доезжало **везде**. |
| `X-Content-Type-Options` | `nosniff` | Критично для `/uploads/*` (файлы от пользователей) и для `/assets/*`. |
| `X-Frame-Options` | `SAMEORIGIN` | Против кликджекинга на формах кабинета. |
| `Content-Security-Policy: frame-ancestors 'self'` | — | Современный эквивалент `X-Frame-Options`; в отличие от него, работает и при вложенных фреймах. Ставить **вместе** с `X-Frame-Options`, пока живы старые клиенты. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Изолирует контекст просмотра от окон, открытых через `window.open`. |

Про `Access-Control-Allow-Origin: *` — сейчас его добавляет `vite preview`
(`preview.cors: true`) на все ответы UI. После §4 он исчезнет сам собой,
потому что nginx его не выставляет. Проверить это отдельным пунктом в §7.

### 5.6 Content-Security-Policy

#### Что приложение реально загружает

Обследование `index.html`, `dist/` и `src/`:

| Тип ресурса | Источники | Откуда известно |
| --- | --- | --- |
| Скрипты | `/assets/index-*.js` (`type="module" crossorigin`) — свои; **два инлайновых `<script>`** в `index.html`: скрипт boot-splash и `application/ld+json` | `dist/index.html` |
| Стили | `/assets/*.css` — свои; **один инлайновый `<style>`** (4737 байт) в `index.html`; React проставляет `style=""` атрибуты | `dist/index.html`, `src/**` |
| Шрифты | **Только свои**: `dist/fonts/manrope*.woff2` + `manrope.css`. Внешних CDN шрифтов нет | `ls dist/fonts` |
| Изображения | свои `/assets`, `/uploads`, `/storefront`; `data:` и `blob:` (`src/shared/productPhoto.js`, `src/shared/appHelpers.js`, `src/screens/manager/ManagerBackup.jsx`); **`https://static-maps.yandex.ru`** — статическая карта в контактах | `src/shared/yandexMaps.js:120` (`yandexStaticMapSrc`) |
| Фреймы | **`https://yandex.ru/map-widget/v1/`** — виджет карты | `src/shared/yandexMaps.js:132`, `src/screens/storefront/pages/ContactsPage.jsx:52` |
| XHR/fetch | только свой origin (`/api`, `/uploads`) | `vite.config.js`, `src/**` |
| Service worker | `/sw.js`, кэширует `/offline.html`, `/manifest.webmanifest`, иконки | `dist/sw.js` |
| Внешняя аналитика / трекеры | **не обнаружены** | поиск по `src/` и `dist/index.html` |

Хэши инлайновых блоков текущей сборки (`dist/index.html`, тег
`clover-ui-build` от 2026-08-31):

```
script (boot-splash)          sha256-i1AaylWXyfCtd3skr3KNP41iQICj1Cg/EqpfurvuOwM=
script (application/ld+json)  sha256-CnQb76kJnH9H3LjdLlhuKwbv4XcGozS2wg6qxY02bjc=
style  (инлайновый, 4737 б)   sha256-NAPNc1GZVmd9WL0f3Iery5HsXtOkecHo8//FLF/Fou0=
```

**Хэши меняются при каждом изменении `index.html`.** Держать их в конфиге
nginx означает ломать сайт при каждой правке шапки. Поэтому на первом этапе
для `style-src` берём `'unsafe-inline'`, а хэши скриптов используем — их
всего два и они меняются редко.

#### Шаг 1 — Report-Only, ничего не блокирует

Добавить в блок `server` (и в снипет, чтобы не терялось в location'ах):

```nginx
add_header Content-Security-Policy-Report-Only "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'sha256-i1AaylWXyfCtd3skr3KNP41iQICj1Cg/EqpfurvuOwM=' 'sha256-CnQb76kJnH9H3LjdLlhuKwbv4XcGozS2wg6qxY02bjc='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://static-maps.yandex.ru; font-src 'self'; connect-src 'self'; frame-src https://yandex.ru https://*.yandex.ru; worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; upgrade-insecure-requests" always;
```

Тот же текст в читаемом виде:

```
default-src   'self'
base-uri      'self'
object-src    'none'
frame-ancestors 'self'
form-action   'self'
script-src    'self' 'sha256-i1Aayl…' 'sha256-CnQb76…'
style-src     'self' 'unsafe-inline'
img-src       'self' data: blob: https://static-maps.yandex.ru
font-src      'self'
connect-src   'self'
frame-src     https://yandex.ru https://*.yandex.ru
worker-src    'self'
manifest-src  'self'
media-src     'self' blob:
upgrade-insecure-requests
```

#### Шаг 2 — сбор нарушений

Отдельного приёмника отчётов в приложении **нет**: маршрута вида
`/api/csp-report` в `server/src/server.js` не существует, поэтому `report-uri`
в политике выше не указан — он бы просто давал 404 в логах. Сбор на первом
этапе ручной:

1. Пройти в браузере с открытой консолью полный сценарий:
   витрина → каталог → карточка товара → корзина → оформление → контакты
   (страница с картой!) → `/lk` → вход → заказы → менеджерские вкладки
   (загрузка фото, выгрузка XLSX, резервные копии).
2. Собрать все сообщения `Content Security Policy` из консоли.
3. Проверить установку PWA и работу офлайн-режима — service worker
   и `manifest` под отдельными директивами.
4. Повторить на мобильном Safari и Chrome: `blob:`/`data:` в фото и
   виджет карты ведут себя по-разному.

Если позже понадобится автоматический сбор, добавить в приложение маршрут
`POST /api/public/csp-report` и дописать в политику
`report-uri /api/public/csp-report; report-to csp`.

#### Шаг 3 — перевод в блокирующий режим

Держать Report-Only **не менее двух недель**, покрыв полный цикл работы
менеджеров (включая обмен с 1С и месячную отчётность). Когда нарушений нет:

1. Переименовать заголовок `Content-Security-Policy-Report-Only` →
   `Content-Security-Policy`, значение не менять.
2. `sudo nginx -t && sudo systemctl reload nginx`.
3. Первые сутки держать наготове откат — вернуть суффикс `-Report-Only`
   и перезагрузить nginx.

#### Шаг 4 — ужесточение (позже, отдельной задачей)

- Убрать `'unsafe-inline'` из `style-src`: вынести инлайновый `<style>`
  из `index.html` в отдельный хэшированный файл. Мешают ещё и `style=""`
  атрибуты React — для них нужен либо `'unsafe-hashes'`, либо отказ от
  инлайновых стилей в компонентах.
- Заменить хэши скриптов на nonce, генерируемый nginx
  (`ngx_http_sub_module` или переход на серверный рендеринг `index.html`).
  До тех пор — **после каждой сборки сверять хэши** (§7.4).

---

## 6. Сводка предлагаемых изменений

| # | Изменение | Файл | Риск | Откат |
| --- | --- | --- | --- | --- |
| 1 | `proxy_pass` на `127.0.0.1` | `sites-available/clover-spb.ru` | низкий | восстановить `.bak` |
| 2 | Снипет заголовков + `include` в 9 блоков | `snippets/clover-security-headers.conf` | низкий | восстановить `.bak` |
| 3 | `proxy_hide_header` для дублей на `/api/` | `sites-available/clover-spb.ru` | низкий | восстановить `.bak` |
| 4 | CSP в режиме Report-Only | там же | нулевой (не блокирует) | убрать строку |
| 5 | Статика вместо `vite preview` | там же + `systemctl disable clover-ui` | средний | `systemctl enable --now clover-ui` + `.bak` |
| 6 | CSP в блокирующем режиме | там же | средний | вернуть `-Report-Only` |
| 7 | Ограничение `:4100` по firewall | см. `FIREWALL_RUNBOOK.md` | средний | сброс правил |
| 8 | 1С на HTTPS через nginx | модуль 1С | высокий | вернуть модуль 1С |
| 9 | `HOST=127.0.0.1` | `server/.env` | **высокий — только после 1, 8** | вернуть `0.0.0.0`, рестарт |

Рекомендуемый порядок: 1 → 2 → 3 → 4 → 5 → 6 → 7 → (пауза, наблюдение) → 8 → 9.
Пункты 1-6 можно сделать за одно окно, каждый со своей проверкой.

---

## 7. Проверка

### 7.1 Синтаксис и перезагрузка

```bash
sudo nginx -t
sudo systemctl reload nginx     # reload, не restart: соединения не рвутся
sudo systemctl status nginx --no-pager
```

`nginx -t` при подготовке этого документа выполнить **не удалось — требует
sudo**: чтение `/dehydrated/certs/` (`0700 root:root`) под учётной записью
обследования запрещено, тест падает на `cannot load certificate`. Оператор
обязан прогнать его от root **до** `reload`.

### 7.2 Заголовки во всех точках, где они терялись

```bash
for u in / /index.html /lk /sw.js /manifest.webmanifest /robots.txt /sitemap.xml \
         /favicon.png /offline.html; do
  echo "=== $u"
  curl -sSI "https://clover-spb.ru$u" | grep -iE \
   'HTTP/|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Strict-Transport|Permissions-Policy|Content-Security|Cache-Control|Access-Control'
done

# хэшированный ассет — имя брать из свежей сборки
ASSET=$(basename "$(ls /opt/clover/clover-app/dist/assets/index-*.js | head -1)")
curl -sSI "https://clover-spb.ru/assets/$ASSET" | grep -iE \
 'HTTP/|X-Frame|X-Content|Referrer|Strict-Transport|Permissions|Content-Security|Cache-Control'

# uploads — здесь nosniff важнее всего; путь взять реальный из каталога товара
curl -sSI "https://clover-spb.ru/uploads/<реальный-файл>" | grep -iE \
 'HTTP/|X-Content-Type-Options|Cache-Control'
```

Критерии приёмки:

- на **каждом** из перечисленных URL присутствуют все пять заголовков
  безопасности плюс `Content-Security-Policy-Report-Only`;
- `Access-Control-Allow-Origin` **отсутствует** на UI-путях (после §4);
- `Cache-Control` встречается **один раз**, а не два;
- на `/api/health` каждый заголовок ровно один раз, `Referrer-Policy`
  имеет единственное значение;
- `/assets/<несуществующий>.js` → `404`, а не `200` с HTML.

### 7.3 Функциональные проверки

```bash
# API жив
curl -fsS https://clover-spb.ru/api/health | head -c 200; echo

# 1С-контур не задет (ключ подставить, значение не логировать)
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "X-Clover-Key: <ключ>" -H "X-Clover-Database: TEST" \
  https://clover-spb.ru/api/one-c/queue-status

# без ключа обязан быть 401
curl -sS -o /dev/null -w '%{http_code}\n' https://clover-spb.ru/api/one-c/queue-status

# 1С по её текущему адресу продолжает работать (до фаз 3-4)
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.155.15:4100/api/health

# SPA-маршруты отдают index.html, а не 404
for p in /catalog /product/test /cart /checkout /contacts /lk /lk/orders /vitrina; do
  printf '%-16s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code}' https://clover-spb.ru$p)"
done
```

Ручной чек-лист в браузере: витрина открывается со стилями и шрифтами;
карта в «Контактах» рисуется; `/lk` пускает в кабинет; PWA обновляется
(в DevTools → Application → Service Workers новый worker активируется);
менеджерские вкладки работают; фото товаров грузятся.

### 7.4 После каждой пересборки UI

`npm run build` меняет имена файлов в `dist/assets/` и может изменить
инлайновые блоки в `index.html`. Если CSP уже включена с хэшами:

```bash
cd /opt/clover/clover-app
node -e '
const fs=require("fs"),c=require("crypto");
const h=fs.readFileSync("dist/index.html","utf8");
for (const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g))
  console.log("script", (m[1].trim()||"(inline)"), "sha256-"+c.createHash("sha256").update(m[2]).digest("base64"));
'
```

Сверить с тем, что стоит в конфиге. Не совпало — обновить конфиг **до**
того, как новая сборка уедет в бой, иначе страница загрузится без
boot-скрипта.

### 7.5 Откат

```bash
# конфиг nginx
sudo cp /etc/nginx/sites-available/clover-spb.ru.bak-<штамп> \
        /etc/nginx/sites-available/clover-spb.ru
sudo nginx -t && sudo systemctl reload nginx

# вернуть vite preview
sudo systemctl enable --now clover-ui.service
sudo systemctl status clover-ui --no-pager

# вернуть привязку API
sudo sed -n '/^HOST=/p' /opt/clover/clover-app/server/.env   # проверить текущее
# правкой файла вернуть HOST=0.0.0.0
sudo systemctl restart clover-api
curl -fsS http://192.168.155.15:4100/api/health
```

Полный откат всех пунктов §6 занимает менее пяти минут и не требует
восстановления данных.

---

## 8. Что осталось непроверенным

- **`nginx -t`** — не проверено, требует sudo: чтение `/dehydrated/certs/`
  (`0700 root:root`) закрыто, тест падает на загрузке сертификата.
- **`ss -ltnp` по `:22`, `:80`, `:443`** — имена процессов не показаны,
  требует root. Принадлежность nginx выведена из конфигурации и ответа
  `Server: nginx`, принадлежность `:22` — из `/etc/ssh/sshd_config` и
  факта прослушивания в v4 и v6.
- **`journalctl -u clover-api`** — не проверено, требует sudo
  («No journal files were opened due to insufficient permissions»).
  Поэтому фактический IP машины 1С по журналу подтвердить не удалось; вывод
  §2 опирается на исходники модуля 1С, документацию проекта и отсутствие
  обращений `one-c` в журналах nginx.
- **Настройка `trust proxy` в Express** не проверялась. При прямом доступе
  к `:4100` заголовок `X-Forwarded-For` может подделываться, что влияет на
  корректность `req.ip` в журнале аудита. Вынести в отдельную задачу.
- Содержимое сертификатов, срок их действия и работа обновления dehydrated
  не проверялись — каталог закрыт.
