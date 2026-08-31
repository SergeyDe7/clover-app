# Clover — Runbook по ротации секретов

Операционный документ для смены шести секретов Clover:
`JWT_SECRET`, `ONEC_PASSWORD`, `ONEC_API_KEY`, `SMTP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY`.

Все ссылки `файл:строка` проверены по текущему состоянию репозитория `/opt/clover/clover-app`.

---

## 0. Общие правила

**Единственное место хранения секретов в рантайме — `server/.env`.** Он в `.gitignore`
(`.gitignore:27`, `.gitignore:41`, `.gitignore:86`, с исключением `!server/.env.example` в `.gitignore:87`)
и **никогда не попадал в историю git** (проверено: `git log --all -- server/.env` пуст).

Значения читаются один раз при загрузке модулей через `import "dotenv/config"` (`server/src/server.js:1`).
Часть значений вычисляется на верхнем уровне модуля и кешируется в `const`
(например `jwtSecret` в `server/src/server.js:358`), поэтому **любая правка `server/.env`
требует перезапуска процесса API**. Правка «на горячую» не действует.

Перезапуск на этом хосте:

```bash
sudo systemctl restart clover-api
# либо полный цикл сборки UI + рестарт + health-check:
bash /opt/clover/clover-app/scripts/linux/restart-api-ui.sh
```

Базовая проверка живости после любого рестарта:

```bash
curl -fsS http://127.0.0.1:4100/api/health
# ожидаем {"ok":true,"service":"clover-server","version":"4.0.4","time":"..."}
```

Маршрут описан в `server/src/server.js:1714-1720`.

Перед каждой ротацией — резервная копия текущего `server/.env` с ограниченными правами:

```bash
cd /opt/clover/clover-app/server
cp -p .env "/opt/clover/backups/.env.$(date +%Y%m%d-%H%M%S)"
chmod 600 "/opt/clover/backups/.env."*
```

Никогда не выводите значения в чат, скриншоты, тикеты и логи. Для контроля используйте только длину:

```bash
awk -F= '/^JWT_SECRET=/{print "len=" length(substr($0, index($0,"=")+1))}' server/.env
```

---

## 1. `JWT_SECRET`

### 1.1 Где используется

| Файл:строка | Назначение |
| --- | --- |
| `server/src/server.js:358` | Чтение и `trim()` значения в модульную константу `jwtSecret` |
| `server/src/server.js:359-361` | Стартовый guard: процесс падает при невалидном значении |
| `server/src/server.js:591-606` | `signToken(user)` — подпись JWT (HS256, `expiresIn: "7d"`, `issuer: "clover-server"`, `audience: "clover-app"`) |
| `server/src/server.js:621-624` | `jwt.verify(token, jwtSecret, { issuer, audience })` внутри middleware `authRequired` |

Что ломается при неверном значении: **вся авторизация**. Любой запрос с `Authorization: Bearer <token>`
к маршрутам под `authRequired` вернёт `401`. Это ЛК клиента, весь блок `/api/admin/*`,
`/api/push/*` (`server/src/server.js:6849`, `6857`, `6868`) и т. д.

Дополнительная деталь: в payload есть `sessionEpoch: String(user.password_changed_at || "")`
(`server/src/server.js:597`), и `authRequired` сверяет его с текущим значением в БД
(`server/src/server.js:633-637`). Это даёт **точечный** отзыв сессий одного пользователя без
трогания `JWT_SECRET` — см. `/api/auth/logout-other-sessions` (`server/src/server.js:2070-2078`)
и смену пароля (`server/src/server.js:2039-2067`).

### 1.2 Кто ещё держит

Никто. Секрет симметричный и известен только серверу Clover. Клиенты хранят **выданные токены**,
а не секрет. Ни фронтенд, ни 1С, ни внешние сервисы копии не имеют.

### 1.3 Валидация на старте — точные ограничения

```js
const jwtSecret = String(process.env.JWT_SECRET || "").trim();
if (jwtSecret.length < 32 || /^(?:change-this.*|development-secret.*|clover-local-development-secret-change-before-production)$/i.test(jwtSecret)) {
  throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in server/.env.");
}
```

(`server/src/server.js:358-361`)

Требования:

- длина после `trim()` — **не менее 32 символов**;
- значение **не должно** начинаться с `change-this` или `development-secret` (регистр не важен)
  и не должно равняться `clover-local-development-secret-change-before-production`;
- нарушение = `throw` на старте, процесс не поднимется, `/api/health` не ответит.

### 1.4 Генерация нового значения

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Даёт 64 символа `base64url` — вдвое выше минимума и без символов, требующих кавычек в `.env`.

### 1.5 Процедура ротации

> **Blast radius: все пользователи разлогиниваются.** Немедленно после рестарта **каждый**
> ранее выданный токен (срок жизни 7 дней) перестаёт проходить `jwt.verify` и превращается в `401`.
> Все клиенты, менеджеры и админы обязаны войти заново. Механизма «двух секретов»
> (старый + новый одновременно) в коде **нет**: `jwt.verify` вызывается ровно с одним
> `jwtSecret` (`server/src/server.js:621`). Ротацию делать в окно минимальной нагрузки
> и предупреждать менеджеров заранее.

1. Предупредить пользователей/менеджеров о принудительном выходе.
2. Сделать бэкап `server/.env` (см. раздел 0).
3. Сгенерировать новое значение (1.4).
4. Отредактировать `server/.env`, заменив строку `JWT_SECRET=...`. Редактировать в редакторе,
   не через `echo >>` (иначе получите дубль ключа; `dotenv` возьмёт первый).
5. Проверить длину, не печатая значение:
   ```bash
   awk -F= '/^JWT_SECRET=/{print "len=" length(substr($0, index($0,"=")+1))}' /opt/clover/clover-app/server/.env
   ```
   Ожидаем `len=64`, и ровно одну строку в выводе.
6. Перезапустить API: `sudo systemctl restart clover-api`.
7. Верификация (1.6).

### 1.6 Верификация

```bash
# 1. Процесс поднялся (значит guard на строке 359 пройден)
curl -fsS http://127.0.0.1:4100/api/health

# 2. Старый токен теперь отвергается
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $OLD_TOKEN" \
  http://127.0.0.1:4100/api/push/status
# ожидаем 401

# 3. Новый логин работает и выдаёт рабочий токен
curl -s -X POST http://127.0.0.1:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<manager email>","password":"<пароль>"}'
# ожидаем 200 и поле token

# 4. Новый токен проходит authRequired
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $NEW_TOKEN" \
  http://127.0.0.1:4100/api/push/status
# ожидаем 200
```

Маршруты: `/api/auth/login` — `server/src/server.js:1991`, `/api/push/status` — `server/src/server.js:6849`.

Если сервис не поднялся, смотреть журнал — guard пишет понятное сообщение:

```bash
journalctl -u clover-api -n 50 --no-pager
# ищем: JWT_SECRET must be a unique secret of at least 32 characters in server/.env.
```

### 1.7 Откат

1. Восстановить бэкап `.env`:
   ```bash
   cp -p /opt/clover/backups/.env.<timestamp> /opt/clover/clover-app/server/.env
   ```
2. `sudo systemctl restart clover-api`.
3. Проверить `/api/health` и логин.

Откат возвращает старый секрет, но **не восстанавливает пользовательские сессии**: браузеры уже
получили `401` и стёрли токен. Пользователям всё равно потребуется вход. Считайте разлогин
необратимым побочным эффектом.

---

## 2. `ONEC_PASSWORD`

### 2.1 Где используется

| Файл:строка | Назначение |
| --- | --- |
| `server/src/oneC.js:76` | Чтение `process.env.ONEC_PASSWORD` в runtime-конфиг |
| `server/src/oneC.js:86` | Поле `password` в объекте конфигурации |
| `server/src/oneC.js:89` | `secretConfigured: Boolean(password \|\| apiKey)` — влияет на признак готовности |
| `server/src/oneC.js:145-150` | Формирование заголовка `Authorization: Basic base64(username:password)` в `buildOneCAuthHeaders` |
| `server/src/oneC.js:168-169` | Подстановка этих заголовков в `fetch` внутри `requestJson` |

Это **исходящая** аутентификация: Clover ходит в опубликованную базу 1С по HTTP Basic
(пара `ONEC_USERNAME` / `ONEC_PASSWORD`). Направление противоположно `ONEC_API_KEY` (раздел 3).

Что ломается при неверном значении: все исходящие вызовы в 1С отваливаются с `401`
от публикации 1С. Практически это `/api/admin/one-c/test` (`server/src/server.js:4875-4894`),
`/api/one-c/products-preview` (`server/src/server.js:4901`),
`/api/one-c/clients-preview` (`server/src/server.js:5641`) и любые операции чтения/записи
в режиме `mode: "real"`. В режиме `simulation` (`server/src/oneC.js:92`) внешние вызовы не идут,
поэтому неверный пароль там незаметен.

Косвенный эффект: `readyForWrite` в `publicOneCStatus` (`server/src/oneC.js:117-119`) считает
`secretConfigured`. Если оставить и `ONEC_PASSWORD`, и `ONEC_API_KEY` пустыми, панель менеджера
покажет «не готово к записи», хотя связь может быть настроена иначе.

### 2.2 Кто ещё держит

Учётная запись 1С на стороне сервера 1С:Предприятие (списки пользователей ИБ баз `TEST` / `VLAVKA`).
Смена значения **должна выполняться администратором 1С в самой базе** — Clover только использует
пароль, но не может его изменить. Это внешняя система: односторонняя правка `.env` ничего не даст.

### 2.3 Валидация на старте

**Нет.** Проверок длины/формата для `ONEC_PASSWORD` в коде нет — значение берётся «как есть»
(`server/src/oneC.js:76`, без `trim()`, в отличие от остальных секретов). Следствия:

- **пробел в конце строки в `.env` попадёт в пароль** и сломает Basic-авторизацию;
- ошибка проявится не на старте, а только при первом обращении к 1С.

### 2.4 Генерация нового значения

Пароль задаёт администратор 1С в свойствах пользователя ИБ. Ограничения — политики 1С,
не Clover. Рекомендуемая генерация без спецсимволов, ломающих `.env` и Basic-заголовок:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

В `server/.env` записывать без кавычек и без завершающих пробелов.

### 2.5 Процедура ротации

> **Blast radius: обмен «Clover → 1С» на время рассинхрона.** Пароль меняется в двух местах
> (пользователь ИБ 1С и `server/.env`), и между этими правками исходящие запросы получают `401`.
> Входящие маршруты `/api/one-c/*` при этом продолжают работать — они защищены `ONEC_API_KEY`,
> а не паролем.

1. Согласовать окно с администратором 1С.
2. Бэкап `server/.env`.
3. Администратор 1С меняет пароль пользователя ИБ и передаёт новое значение по защищённому каналу
   (не в чат, не в тикет).
4. Немедленно обновить `ONEC_PASSWORD` в `server/.env`.
5. `sudo systemctl restart clover-api`.
6. Верификация (2.6).

Порядок «сначала 1С, потом Clover» безопаснее обратного: окно недоступности короче, и вы не
получите ситуацию, когда `.env` уже содержит пароль, которого в 1С ещё нет.

### 2.6 Верификация

```bash
curl -fsS http://127.0.0.1:4100/api/health

# Проверка соединения из-под менеджера (требуется JWT менеджера)
curl -s -X POST http://127.0.0.1:4100/api/admin/one-c/test \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
# ожидаем {"ok":true, "result": {...}}
```

Маршрут — `server/src/server.js:4875-4894`; при ошибке пишется аудит `exchange.connection.error`
(`server/src/server.js:4891`).

Статус конфигурации без вызова 1С:

```bash
curl -s -H "Authorization: Bearer $MANAGER_TOKEN" \
  http://127.0.0.1:4100/api/admin/one-c/config
# смотрим runtime.secretConfigured === true и runtime.readyForWrite
```

(`server/src/server.js:4841-4853`, форма ответа — `server/src/oneC.js:96-122`; секрет в ответе не отдаётся,
только булев признак.)

### 2.7 Откат

1. Восстановить `.env` из бэкапа и перезапустить `clover-api`.
2. Попросить администратора 1С вернуть прежний пароль пользователя ИБ — **без этого откат
   неполон**, так как пароль живёт в двух местах.
3. Повторить `POST /api/admin/one-c/test`.

---

## 3. `ONEC_API_KEY`

### 3.1 Где используется

**Входящее направление (1С → Clover), основное:**

| Файл:строка | Назначение |
| --- | --- |
| `server/src/server.js:718` | Чтение `configuredKey` внутри `oneCAuthRequired` |
| `server/src/server.js:719-722` | Извлечение ключа из `X-Clover-Key` или из `Authorization: Bearer` |
| `server/src/server.js:724-728` | Сравнение `secureEqual` и `401` при несовпадении |
| `server/src/server.js:690-694` | `secureEqual` — `timingSafeEqual` с предварительной сверкой длины |
| `server/src/server.js:696-699` | `isPlaceholderSecret` — отбраковка placeholder-значений |
| `server/src/server.js:739-742` | `503`, если ключ не настроен и локальный bypass не разрешён |
| `server/src/server.js:3395` | `app.use("/api/one-c", oneCAuthRequired)` — покрывает **все** маршруты `/api/one-c/*` |

**Исходящее направление (Clover → 1С), дополнительное:**

| Файл:строка | Назначение |
| --- | --- |
| `server/src/oneC.js:77` | Чтение в runtime-конфиг |
| `server/src/oneC.js:142-144` | Добавление заголовка `X-Clover-Key` в исходящие запросы |

То есть **один и тот же ключ** используется в обе стороны: Clover проверяет им входящие запросы 1С
и сам подставляет его в свои запросы к расширению 1С.

Что ломается при неверном значении: весь обмен с 1С. Под `oneCAuthRequired` находятся
`/api/one-c/queue-status` (`server/src/server.js:3397`),
`/api/one-c/purchase-price-request` (`3408`), `/api/one-c/purchase-prices` (`3452`),
`/api/one-c/price-types` (`3473`, `3486`), `/api/one-c/sale-price-request` (`3519`),
`/api/one-c/sale-prices` (`3540`), `/api/one-c/test-order` (`3569-3570`),
`/api/one-c/orders/:orderId/ack` (`3572`), `/api/one-c/orders/accepted` (`3753`),
`/api/one-c/products-preview` (`4901`), `/api/one-c/clients-preview` (`5641`),
`/api/one-c/reconciliation/requests` (`6401`), `/api/one-c/reconciliation/:requestId/result` (`6407`).
Заказы перестают уходить и подтверждаться, цены не приезжают, акты сверки не возвращаются.

### 3.2 Кто ещё держит

**Ключ захардкожен в BSL-модуле HTTP-сервиса на стороне 1С.** Это критично для порядка ротации.

- `one_c_extension_source/HTTPService_CloverExchange_Module.bsl:7-10` — функция
  `ПолучитьКлючОбмена()`, в шаблоне возвращает `"CHANGE_ME_CLOVER_SECRET"`;
- `one_c_extension_ready/HTTPService_CloverExchange_Module.bsl:7-10` — то же;
- `one_c_extension_source/HTTPService_CloverExchange_Module.bsl:31-39` (и `:31-39` в `ready`) —
  `АвторизацияПройдена(Запрос)` сравнивает заголовок `X-Clover-Key` с этой константой;
- `one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt:8-9` и
  `one_c_patches/vlavka/ЗАГОЛОВКИ_VLAVKA.txt:4-5` — плейсхолдер `***REPLACE_WITH_ONEC_API_KEY***`;
- `one_c_patches/price_types/ПОЛНЫЙ_МОДУЛЬ_вставить_целиком.txt:1-2` — тот же плейсхолдер.

В репозитории **везде плейсхолдеры**, реального ключа в git нет — это подтверждают
`one_c_extension_ready/KEY_SETUP_REQUIRED.txt:1-3` («Ключ обмена хранится только в server\.env
и не записывается в исходники 1С») и предупреждение
`one_c_patches/vlavka/ИНСТРУКЦИЯ.txt:9` («После вставки верните `ПолучитьКлючОбмена()` из текущей
VLAVKA (ключ не в git)»). Но **в рабочих базах 1С (`TEST`, `VLAVKA`) реальное значение вписано прямо
в текст модуля**, и менять его нужно вручную в конфигураторе.

Практическое следствие: при накатывании патчей из `one_c_patches/` есть риск затереть рабочий ключ
плейсхолдером и уронить обмен. Это отдельный, уже задокументированный в инструкциях риск.

Контракт также описан в `docs/technical/INTEGRATION_1C.md:16-17`.

### 3.3 Валидация — точные ограничения

```js
if (configuredKey.length >= 24 && !isPlaceholderSecret(configuredKey)) {
```

(`server/src/server.js:724`)

```js
function isPlaceholderSecret(value) {
  return /^(?:change[_-]?me(?:[_-].*)?|secret|development-secret|clover-local-development-secret-change-before-production)$/i
    .test(String(value || "").trim());
}
```

(`server/src/server.js:696-699`)

Требования:

- длина после `trim()` — **не менее 24 символов**;
- значение не должно матчиться как placeholder: `change_me` / `change-me` / `changeme` и всё,
  что с них начинается через `_`/`-`, а также `secret`, `development-secret`,
  `clover-local-development-secret-change-before-production`.

**Важная ловушка.** Это **не** стартовый guard: невалидный ключ не роняет процесс. Условие на
строке 724 просто не выполняется, и управление уходит вниз, к ветке локального bypass
(`server/src/server.js:730-736`) и далее к `503` (`server/src/server.js:739-742`).
То есть при опечатке (ключ короче 24 символов) вы получите не `401 Неверный ключ обмена Clover.`,
а `503 Ключ обмена с 1С не настроен...` — при том что `/api/health` будет отвечать `200`.
**Различайте эти два кода при диагностике:** `401` = ключ настроен, но не совпал;
`503` = ключ на сервере не прошёл валидацию вовсе.

Смежный флаг: `ONEC_ALLOW_LOCAL_WITHOUT_KEY` (`server/src/server.js:731-732`, по умолчанию `false`).
Если он `true`, запросы с локальных адресов проходят без ключа. **Не используйте его как
«мостик» на время ротации** — это открывает обмен всему, что резолвится в локальный адрес хоста
(`localMachineAddresses()`, `server/src/server.js:705-713`).

### 3.4 Генерация нового значения

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Даёт 43 символа — с запасом над минимумом 24. `base64url` безопасен для HTTP-заголовка
`X-Clover-Key` и для строкового литерала BSL (нет кавычек и не-ASCII).

### 3.5 Процедура ротации

> **Blast radius: обмен с 1С полностью встаёт на время рассинхрона.**
> **Поддержки двух ключей одновременно в коде НЕТ.** В `oneCAuthRequired` читается ровно один
> `configuredKey` (`server/src/server.js:718`) и выполняется ровно одно сравнение
> `secureEqual(supplied, configuredKey)` (`server/src/server.js:725`). Нет ни `ONEC_API_KEY_PREVIOUS`,
> ни списка, ни grace-периода. Симметрично на стороне 1С: `АвторизацияПройдена` сравнивает
> с единственным значением `ПолучитьКлючОбмена()`
> (`one_c_extension_source/HTTPService_CloverExchange_Module.bsl:37-38`).
> **Требуется согласованное окно обслуживания.** Если нужен переход без простоя — это доработка кода
> (принимать массив ключей), а не операционный приём.

Порядок (окно ~5-10 минут, обе стороны недоступны в промежутке):

1. Назначить окно обслуживания и уведомить администратора 1С и менеджеров. Обмен в это время не идёт.
2. Убедиться, что очередь обмена пуста или не содержит критичных элементов:
   ```bash
   curl -s -H "X-Clover-Key: $CURRENT_KEY" -H 'X-Clover-Database: TEST' \
     http://127.0.0.1:4100/api/one-c/queue-status
   ```
3. Бэкап `server/.env`.
4. Сгенерировать новый ключ (3.4) и передать его администратору 1С по защищённому каналу.
5. Обновить `ONEC_API_KEY=` в `server/.env`.
6. `sudo systemctl restart clover-api`. С этого момента 1С со старым ключом получает `401`.
7. Администратор 1С в конфигураторе правит `ПолучитьКлючОбмена()` в модуле HTTP-сервиса
   расширения — **в каждой задействованной базе** (`TEST` и, если включён prod-контур,
   `VLAVKA`; список — `ONEC_ALLOWED_DATABASES`, см. `server/src/server.js:763`, `768`),
   сохраняет и обновляет публикацию.
8. Верификация (3.6). Только после успешной проверки закрывать окно.

Обратный порядок (сначала 1С) тоже допустим и даёт такое же по длительности окно; выбирайте тот,
где оператор быстрее — ключевое, что **простой неизбежен в любом случае**.

### 3.6 Верификация

```bash
# 1. Сервис жив
curl -fsS http://127.0.0.1:4100/api/health

# 2. Старый ключ отвергается
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-Clover-Key: $OLD_KEY" -H 'X-Clover-Database: TEST' \
  http://127.0.0.1:4100/api/one-c/queue-status
# ожидаем 401 (тело: {"error":"Неверный ключ обмена Clover."})

# 3. Новый ключ принимается
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-Clover-Key: $NEW_KEY" -H 'X-Clover-Database: TEST' \
  http://127.0.0.1:4100/api/one-c/queue-status
# ожидаем 200

# 4. Вариант с Bearer тоже поддерживается (server/src/server.js:719-721)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $NEW_KEY" -H 'X-Clover-Database: TEST' \
  http://127.0.0.1:4100/api/one-c/queue-status
# ожидаем 200
```

Заголовок `X-Clover-Database` обязателен: `requireOneCAllowedDatabase`
(`server/src/server.js:760-774`) вернёт `403` без него. `403` при верном ключе означает,
что авторизация прошла, а проблема в имени базы — это **не** повод откатывать ключ.

Если получили `503` — значит новое значение не прошло проверку строки 724
(скорее всего короче 24 символов или placeholder). Перепроверьте длину:

```bash
awk -F= '/^ONEC_API_KEY=/{print "len=" length(substr($0, index($0,"=")+1))}' /opt/clover/clover-app/server/.env
```

Обратное направление (Clover → 1С) проверяется тестом соединения:

```bash
curl -s -X POST http://127.0.0.1:4100/api/admin/one-c/test \
  -H "Authorization: Bearer $MANAGER_TOKEN" -H 'Content-Type: application/json' -d '{}'
```

Отказы авторизации фиксируются в аудите как `one-c.auth.denied` с полем `mode`
(`api-key` или `key-required`) — `server/src/server.js:726`, `738`.

### 3.7 Откат

1. Восстановить `server/.env` из бэкапа, `sudo systemctl restart clover-api`.
2. Администратор 1С возвращает прежнее значение в `ПолучитьКлючОбмена()` **во всех базах**,
   где уже успел его поменять, и переопубликовывает.
3. Повторить проверки из 3.6 старым ключом (ожидаем `200`).

Откат обязательно двусторонний: вернуть только `.env` недостаточно, обмен останется сломанным.

---

## 4. `SMTP_PASSWORD`

### 4.1 Где используется

| Файл:строка | Назначение |
| --- | --- |
| `server/src/mailer.js:5` | Чтение `process.env.SMTP_PASSWORD` в `smtpConfig()` |
| `server/src/mailer.js:9` | `configured: Boolean(host && port && user && pass && from)` |
| `server/src/mailer.js:38-41` | Передача в `nodemailer.createTransport({ auth: { user, pass } })` |
| `server/src/mailer.js:47-54` | Фактическая отправка `transporter.sendMail(...)` |

Что ломается при неверном значении: вся исходящая почта. Конкретно — письма подтверждения
регистрации (`server/src/server.js:1806`, `/api/auth/register`), повторная отправка подтверждения
(`/api/auth/resend-verification`, `server/src/server.js:1906`) и восстановление пароля
(`/api/auth/forgot-password`, `server/src/server.js:1938`). Новые клиенты не смогут подтвердить
почту и войти.

Важный нюанс отказа: если `SMTP_PASSWORD` **пустой**, `configured` становится `false`
(`server/src/mailer.js:9`) и `sendCloverMail` тихо возвращает
`{ sent: false, reason: "smtp_not_configured" }` (`server/src/mailer.js:29-31`) — **без исключения**.
Регистрация внешне пройдёт успешно, а письмо не уйдёт. Если пароль непустой, но неверный, —
будет реальная ошибка SMTP-аутентификации от `nodemailer`. Первый случай опаснее, потому что тише.

### 4.2 Кто ещё держит

Панель управления почтового провайдера / хостинга ящика `SMTP_USER`. Внешняя система: пароль
меняется там, Clover его только потребляет. Если провайдер использует app-password
(отдельный пароль приложения), старый app-password надо явно отозвать в консоли —
смена основного пароля аккаунта его не аннулирует автоматически.

### 4.3 Валидация на старте

**Нет.** Ни guard, ни проверка длины/формата. Единственная проверка — непустота в составе
`configured` (`server/src/mailer.js:9`). Значение читается без `trim()`
(`server/src/mailer.js:5`), поэтому **хвостовой пробел в `.env` попадёт в пароль**.

### 4.4 Генерация нового значения

Значение выдаёт провайдер (app-password) либо задаёт администратор ящика. Clover ограничений
не накладывает. Если провайдер разрешает произвольный пароль:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Если пароль содержит `#`, пробелы или кавычки — заключить значение в двойные кавычки в `.env`,
иначе `dotenv` обрежет его по комментарию.

### 4.5 Процедура ротации

> **Blast radius: только исходящая почта.** Существующие сессии, обмен с 1С и push не затрагиваются.
> Окно недоступности — интервал между сменой пароля у провайдера и рестартом API. В это время
> регистрации и сбросы пароля будут «проходить», но письма не уйдут. Лучше делать в нерабочее время.

1. Бэкап `server/.env`.
2. В консоли провайдера создать новый app-password (по возможности — **не отзывая старый сразу**;
   многие провайдеры позволяют иметь несколько активных, что даёт бесшовный переход).
3. Обновить `SMTP_PASSWORD` в `server/.env`.
4. `sudo systemctl restart clover-api`.
5. Верификация (4.6).
6. Только после успешной верификации — **отозвать старый app-password** в консоли провайдера.
   Этот шаг обязателен, иначе ротация бессмысленна.

### 4.6 Верификация

```bash
curl -fsS http://127.0.0.1:4100/api/health

# Признак конфигурации (секрет не отдаётся, только булевы флаги)
curl -s -H "Authorization: Bearer $MANAGER_TOKEN" \
  http://127.0.0.1:4100/api/admin/notifications
# в ответе status.email.smtpConfigured === true и status.email.configured === true
```

(`publicMailStatus` — `server/src/mailer.js:19-25`, оборачивается в
`publicManagerNotificationStatus` — `server/src/managerNotifications.js:247-272`,
поле `email` — `:253-259`; маршрут — `server/src/server.js:6812-6819`.)

Реальная отправка — тестовое уведомление менеджеру (`server/src/server.js:6835-6847`):

```bash
curl -s -X POST http://127.0.0.1:4100/api/admin/notifications/test \
  -H "Authorization: Bearer $MANAGER_TOKEN" -H 'Content-Type: application/json' -d '{}'
```

Затем убедиться, что письмо реально пришло на `MANAGER_NOTIFICATION_EMAIL`. Флаг `configured: true`
подтверждает только непустоту переменных, **не** валидность пароля — доверять можно лишь
фактически доставленному письму.

Ошибки SMTP смотреть в журнале:

```bash
journalctl -u clover-api -n 100 --no-pager | grep -i -E 'smtp|mail|EAUTH'
```

### 4.7 Откат

1. Если старый app-password ещё не отозван: вернуть прежнее значение в `.env`,
   `sudo systemctl restart clover-api`, повторить тест.
2. Если уже отозван: откат невозможен — выпустить ещё один новый app-password и повторить 4.5.
   Отсюда правило из шага 6: **отзывать старый пароль только после успешной верификации**.

---

## 5. `TELEGRAM_BOT_TOKEN`

### 5.1 Где используется

| Файл:строка | Назначение |
| --- | --- |
| `server/src/managerNotifications.js:60` | Чтение и `trim()` в `telegramConfig(settings)` |
| `server/src/managerNotifications.js:66-70` | `configured: Boolean(token && chatId)` |
| `server/src/managerNotifications.js:114-118` | Ранний выход `telegram_not_configured`, если не настроено |
| `server/src/managerNotifications.js:130-142` | `fetch("https://api.telegram.org/bot<token>/sendMessage")` |
| `server/src/managerNotifications.js:143-149` | Разбор ответа, `telegram_api_error` при неуспехе |

Что ломается при неверном значении: менеджеры перестают получать Telegram-уведомления
(новые заказы, события ЛК). Клиентская часть и обмен с 1С не затрагиваются вовсе.

Второй обязательный параметр — `TELEGRAM_MANAGER_CHAT_ID` (`server/src/managerNotifications.js:63`),
либо `managerTelegramChatId` из настроек (`:62`). **Chat ID не меняется при ротации токена** —
он привязан к чату, а не к боту. Менять его не нужно, если бот остаётся тем же.

### 5.2 Кто ещё держит

Telegram BotFather / серверы Telegram. Токен — единственный идентификатор бота; копии
у Clover и у Telegram. Никаких копий в 1С, фронтенде или service worker нет.

### 5.3 Валидация на старте

**Нет.** Никаких проверок длины или формата (`^\d+:[A-Za-z0-9_-]+$`) в коде нет. Значение только
`trim()`-ится (`server/src/managerNotifications.js:60`) и проверяется на непустоту в составе
`configured` (`:69`). Неверный токен обнаруживается лишь при вызове Telegram API, который вернёт
`401`, и Clover запишет `reason: "telegram_api_error"` (`server/src/managerNotifications.js:147`).

### 5.4 Генерация нового значения

Программно сгенерировать **нельзя** — токен выдаёт Telegram.

1. Открыть чат с [@BotFather](https://t.me/BotFather).
2. `/mybots` → выбрать бота Clover → **API Token** → **Revoke current token**.
3. BotFather немедленно выдаёт новый токен и **сразу отзывает старый**.

Формат: `<bot_id>:<35 символов>`, например `123456789:AA...`. Двоеточие в `.env` не требует
экранирования.

### 5.5 Процедура ротации

> **Blast radius: Telegram-уведомления менеджерам.**
> Ключевая особенность: **BotFather отзывает старый токен мгновенно** и не даёт периода
> сосуществования двух токенов. Между revoke и рестартом API уведомления не доставляются.
> Держите этот интервал минимальным — подготовьте открытый редактор `.env` заранее.
> Отсутствие уведомлений тихое: заказы создаются нормально, менеджер просто их не видит в Telegram.
> Предупредите менеджеров, чтобы в этот период смотрели ЛК.

1. Бэкап `server/.env`.
2. Предупредить менеджеров о кратком перерыве в Telegram-уведомлениях.
3. В BotFather выполнить revoke и получить новый токен.
4. **Сразу** обновить `TELEGRAM_BOT_TOKEN` в `server/.env`. `TELEGRAM_MANAGER_CHAT_ID` не трогать.
5. `sudo systemctl restart clover-api`.
6. Верификация (5.6).

### 5.6 Верификация

```bash
curl -fsS http://127.0.0.1:4100/api/health

# Признак настроенности
curl -s -H "Authorization: Bearer $MANAGER_TOKEN" \
  http://127.0.0.1:4100/api/admin/notifications
# в ответе status.telegram.tokenConfigured === true и status.telegram.configured === true
# (поле telegram — server/src/managerNotifications.js:260-266; chatId маскируется)

# Реальная отправка
curl -s -X POST http://127.0.0.1:4100/api/admin/notifications/test \
  -H "Authorization: Bearer $MANAGER_TOKEN" -H 'Content-Type: application/json' -d '{}'
```

(`server/src/server.js:6812-6847`.) Успех подтверждается **фактическим сообщением в чате менеджера**,
а не флагом `configured`. В ответе теста ищите `channel: "telegram", sent: true`; при
`reason: "telegram_api_error"` токен неверен, при `reason: "telegram_not_configured"` —
пустой токен или chat id.

### 5.7 Откат

Отката к предыдущему токену **не существует**: revoke в BotFather необратим, старое значение
мертво навсегда. Если новый токен не работает:

1. Проверить, что значение скопировано целиком, вместе с числовым префиксом до `:`, без пробелов:
   ```bash
   awk -F= '/^TELEGRAM_BOT_TOKEN=/{v=substr($0, index($0,"=")+1); print "len=" length(v), "has_colon=" (v ~ /:/)}' /opt/clover/clover-app/server/.env
   ```
2. Если значение испорчено — повторно выполнить revoke в BotFather и аккуратно перенести токен.
3. Пока чинится, откатить `.env` к бэкапу **бессмысленно** — старый токен уже недействителен.
   Единственный «откат» — привести в рабочее состояние новый токен.

---

## 6. `VAPID_PRIVATE_KEY`

### 6.1 Где используется

| Файл:строка | Назначение |
| --- | --- |
| `server/src/push.js:8` | Чтение и `trim()` в `config()` |
| `server/src/push.js:7` | Парный `VAPID_PUBLIC_KEY` |
| `server/src/push.js:9` | `VAPID_SUBJECT` (по умолчанию `mailto:admin@localhost`) |
| `server/src/push.js:11` | `enabled: Boolean(publicKey && privateKey && subject)` |
| `server/src/push.js:26-32` | `webpush.setVapidDetails(subject, publicKey, privateKey)` |
| `server/src/push.js:34-57` | `sendPushToSubscriptions` — фактическая рассылка |
| `server/src/push.js:18-24` | `publicPushStatus()` — отдаёт наружу **только** `publicKey` |

Что ломается при неверном значении: web-push перестаёт доставляться. Если ключи не образуют
корректную пару, push-сервисы (FCM/Mozilla/WNS) отвергнут запрос подписи. Затронуты
`/api/push/status` (`server/src/server.js:6849`), `/api/push/subscribe` (`:6857`) и рассылка
промо `/api/admin/push/promotion` (`:6875`).

**Приватный ключ никогда не покидает сервер:** `publicPushStatus` (`server/src/push.js:18-24`)
возвращает только `publicKey`.

### 6.2 Кто ещё держит

**Публичный** ключ пары уходит в браузеры. Приватный — нет.

- `src/serverApi.js:768` — клиент запрашивает `/push/status`;
- `src/shared/pushSync.js:44-47` — `pushManager.subscribe({ applicationServerKey: urlBase64ToUint8Array(status.publicKey) })`;
- `src/shared/SharedPanels.jsx:527` — то же в UI-панели подписки;
- `src/serverApi.js:772` — отправка подписки на `/push/subscribe`.

Существенно: `VAPID_PUBLIC_KEY` **не вшивается в бандл на этапе сборки**. Переменных `VITE_VAPID*`
в проекте нет (проверено по `src/`, `public/`, `index.html`, `vite.config.js`), и
`public/sw.js` VAPID не содержит вовсе. Ключ приходит по сети в рантайме, поэтому
**пересборка фронтенда при ротации не нужна**.

Третья сторона, хранящая привязку: **push-сервисы браузеров**. Каждая существующая
`PushSubscription` криптографически привязана к старому публичному ключу. Смена пары
делает **все существующие подписки нерабочими**.

### 6.3 Валидация на старте

**Нет.** Ни guard, ни проверка длины/формата. Единственная проверка — все три значения непусты
(`server/src/push.js:11`). Библиотека `web-push` проверит формат только при
`setVapidDetails` / `sendNotification`, то есть в момент первой отправки, а не на старте.
Корректная пара P-256: публичный — 87 символов `base64url`, приватный — 43 символа `base64url`.

### 6.4 Генерация нового значения

```bash
cd /opt/clover/clover-app/server
npx web-push generate-vapid-keys
```

`web-push` уже установлен локально (`server/node_modules/web-push`), сеть для генерации не нужна.
Команда печатает пару Public/Private.

> **Ключи меняются только парой.** `VAPID_PRIVATE_KEY` бессмыслен без соответствующего
> `VAPID_PUBLIC_KEY` — `setVapidDetails` (`server/src/push.js:30`) принимает оба, и несогласованная
> пара сломает подпись. Всегда обновляйте обе строки `.env` вместе.

### 6.5 Процедура ротации

> **Blast radius: все существующие push-подписки становятся мёртвыми.** Подписка в браузере
> привязана к `applicationServerKey` (`src/shared/pushSync.js:46`), то есть к старому публичному
> ключу. После смены пары push-сервис отвергнет отправку.
> Отдельная проблема: автоочистка подписок в `server/src/push.js:49-53` срабатывает **только** на
> HTTP `404` и `410`. Ошибка несоответствия VAPID — это `403`, поэтому мёртвые записи
> **не удаляются автоматически**, а лишь пишут ошибку в лог (`server/src/push.js:52`) при каждой
> рассылке. Требуется ручная очистка таблицы `push_subscriptions`.
> Пользователям придётся заново нажать «включить уведомления» в ЛК.

1. Бэкап `server/.env` и бэкап БД:
   ```bash
   cp -p /opt/clover/clover-app/server/data/clover.sqlite \
         "/opt/clover/backups/clover.sqlite.$(date +%Y%m%d-%H%M%S)"
   ```
   (путь к БД — `server/src/db.js:19-21`, по умолчанию `server/data/clover.sqlite`).
2. Сгенерировать новую пару (6.4).
3. Обновить в `server/.env` **обе** строки: `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`.
   `VAPID_SUBJECT` менять не требуется.
4. `sudo systemctl restart clover-api`.
5. Очистить устаревшие подписки (иначе рассылки будут вечно логировать `403`):
   ```bash
   sudo systemctl stop clover-api
   node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/opt/clover/clover-app/server/data/clover.sqlite');console.log(d.prepare('DELETE FROM push_subscriptions').run());"
   sudo systemctl start clover-api
   ```
   (таблица определена в `server/src/db.js:128-141`.)
6. Попросить пользователей заново включить уведомления в ЛК.
7. Верификация (6.6).

### 6.6 Верификация

```bash
curl -fsS http://127.0.0.1:4100/api/health

# Публичный ключ отдаётся клиенту и совпадает с новым
curl -s -H "Authorization: Bearer $USER_TOKEN" \
  http://127.0.0.1:4100/api/push/status
# ожидаем enabled === true, publicKey === новый публичный ключ, subscriptions: []
```

Далее — сквозная проверка через браузер:

1. Открыть ЛК на публичном домене (обязателен HTTPS), нажать включение push
   (`src/shared/SharedPanels.jsx:518-530`). Подписка создастся с новым `applicationServerKey`.
2. Отправить промо-push из панели менеджера (`POST /api/admin/push/promotion`,
   `server/src/server.js:6875-6884`):
   ```bash
   curl -s -X POST http://127.0.0.1:4100/api/admin/push/promotion \
     -H "Authorization: Bearer $MANAGER_TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"Проверка","body":"Тест после ротации VAPID"}'
   ```
   В ответе `result.sent` должен быть > 0, `result.failed` — 0.
3. Убедиться, что уведомление реально пришло на устройство.

### 6.7 Откат

1. Вернуть **обе** строки VAPID из бэкапа `.env`, `sudo systemctl restart clover-api`.
2. Если шаг 5 (очистка `push_subscriptions`) уже выполнен, старые подписки не восстановятся
   правкой `.env` — нужно восстановить БД из бэкапа:
   ```bash
   sudo systemctl stop clover-api
   cp -p /opt/clover/backups/clover.sqlite.<timestamp> /opt/clover/clover-app/server/data/clover.sqlite
   sudo systemctl start clover-api
   ```
   Восстановление БД откатит **все** данные на момент бэкапа, не только подписки. Оценивайте цену.
3. Более дешёвый путь: не откатывать, а довести ротацию до конца и попросить пользователей
   переподписаться. Push — не критичный для бизнеса канал, в отличие от восстановления всей БД.

---

## 7. Инвентаризация env-файлов под контролем версий

Список получен командой:

```bash
cd /opt/clover/clover-app && git ls-files | grep -iE '\.env|secret'
```

| Файл | Содержит секретные ключи | Вердикт |
| --- | --- | --- |
| `.env.production` | Нет. Только `VITE_PUBLIC_BASE_URL`, `VITE_CABINET_PATH`, `VITE_STORE_HOSTS` | **БЕЗОПАСНО** — публичные `VITE_*`, по определению попадают в бандл |
| `server/.env.example` | Имена всех переменных; `JWT_SECRET`, `ONEC_PASSWORD`, `ONEC_API_KEY`, `SMTP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY` — **пустые** | **БЕЗОПАСНО** — шаблон |
| `docs/deploy/server.env.datacenter.example` | `SMTP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY` пустые; `JWT_SECRET`, `ONEC_PASSWORD`, `ONEC_API_KEY` — плейсхолдеры | **БЕЗОПАСНО** — плейсхолдеры |
| `releases/dc-prep-ac44dcf/server.env.template` | То же | **БЕЗОПАСНО** — плейсхолдеры |
| `releases/dc-prep-ac44dcf/server.env.for-dc` | То же | **БЕЗОПАСНО** — плейсхолдеры |

### Как это проверено (без раскрытия значений)

Каждое непустое значение классифицировано по форме, а не по содержанию: длина, число символов `_`,
наличие цифр, регистр. Результат для трёх «боевых на вид» файлов:

- `JWT_SECRET` — длина 21-31, 3-5 подчёркиваний, без цифр, ВЕРХНИЙ регистр;
- `ONEC_PASSWORD` — длина 9-42, 1-7 подчёркиваний, без цифр, ВЕРХНИЙ регистр;
- `ONEC_API_KEY` — длина 23-30, 4-6 подчёркиваний, ВЕРХНИЙ регистр.

Это характерная форма плейсхолдера («слова через подчёркивание в верхнем регистре»), а не
криптографического материала: настоящий `base64url` из `crypto.randomBytes` имел бы смешанный
регистр, цифры и не имел бы подчёркиваний-разделителей. Дополнительно, значения `JWT_SECRET`
в этих файлах не прошли бы стартовый guard `server/src/server.js:359` по длине (21 < 32),
а `ONEC_API_KEY` длиной 23 не прошёл бы порог `>= 24` из `server/src/server.js:724` —
то есть эти значения физически не могут быть рабочими.

**Вердикт: подтверждаю исходную оценку. Реального секретного материала ни в одном
отслеживаемом файле нет.** Файл `server/.env` (единственный с боевыми значениями)
в git отсутствует и никогда в нём не был.

Отдельно проверены исходники 1С — там тоже **только плейсхолдеры**:
`CHANGE_ME_CLOVER_SECRET` в `one_c_extension_source/HTTPService_CloverExchange_Module.bsl:9`
и `one_c_extension_ready/HTTPService_CloverExchange_Module.bsl:9`;
`***REPLACE_WITH_ONEC_API_KEY***` в `one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt:9`,
`one_c_patches/vlavka/ЗАГОЛОВКИ_VLAVKA.txt:5`,
`one_c_patches/price_types/ПОЛНЫЙ_МОДУЛЬ_вставить_целиком.txt:2`.

### Регулярная перепроверка

```bash
cd /opt/clover/clover-app
git ls-files | grep -iE '\.env|secret'
git log --all --oneline -- server/.env    # должно быть пусто
git check-ignore -v server/.env           # должно указать на правило в .gitignore
```

---

## 8. Очистка истории git (НЕ ВЫПОЛНЯТЬ СЕЙЧАС)

> ### ⛔ ЭТОТ РАЗДЕЛ — ЗАГОТОВКА НА БУДУЩЕЕ
> На момент написания **реальных секретов в истории нет** (раздел 7). Ничего из описанного ниже
> выполнять не нужно. Раздел существует на случай, если секрет когда-нибудь попадёт в коммит.

### 8.1 Порядок действий, если секрет всё же закоммичен

**Шаг 0 (единственный срочный): РОТИРОВАТЬ СЕКРЕТ.** Это не опция и не «потом». Переписывание
истории — косметика; сам секрет считается скомпрометированным навсегда с момента `git push`.
Выполните соответствующий раздел 1-6 этого runbook **до** любых манипуляций с историей.

Почему ротация обязательна независимо от чистки истории:

- у любого, кто делал `git clone` или `git fetch`, объект остаётся в локальном репозитории;
- GitHub держит «висячие» объекты доступными по прямой ссылке на SHA коммита ещё долгое время
  (удаление требует отдельного обращения в поддержку GitHub);
- форки репозитория **не** переписываются вашим force-push и продолжают содержать секрет;
- секрет мог попасть в кеши сборки, логи CI, зеркала, локальные IDE-индексы, скриншоты, чаты;
- поисковые боты и сканеры секретов индексируют публичные репозитории в течение минут.

Репозиторий: `https://github.com/SergeyDe7/clover-app.git` (`git remote -v`).

### 8.2 Форма команды (только для справки, НЕ ЗАПУСКАТЬ)

```bash
# ЗАРАНЕЕ: полный бэкап репозитория
git clone --mirror https://github.com/SergeyDe7/clover-app.git /opt/clover/backups/clover-app-mirror.git

# Установка инструмента (git-filter-branch устарел и НЕ рекомендуется)
pipx install git-filter-repo   # или: pip install --user git-filter-repo

# Вариант А — удалить файл целиком из всей истории
git filter-repo --path server/.env --invert-paths

# Вариант Б — заменить конкретные значения на литерал, сохранив файлы
# replacements.txt (сам файл — тоже секрет, хранить вне репозитория, chmod 600, удалить после):
#   literal:<старое значение>==>***REMOVED***
git filter-repo --replace-text /root/replacements.txt
```

`git-filter-repo` по умолчанию требует свежий клон и удаляет `origin` после работы — remote
придётся добавить обратно вручную.

### 8.3 Последствия force-push

После переписывания истории **все SHA коммитов меняются**, начиная с самого раннего затронутого.

```bash
git push --force --all
git push --force --tags
```

Последствия, которые надо принять заранее:

- у всех коллабораторов локальные клоны становятся несовместимыми; обычный `git pull` создаст
  дубли всей истории. Каждый должен либо клонировать заново, либо сделать
  `git fetch origin && git reset --hard origin/<branch>` с потерей незапушенных локальных коммитов;
- открытые Pull Request'ы могут «сломаться» — их следует закрыть и переоткрыть после чистки;
- ссылки на коммиты в тикетах, чатах и документации становятся мёртвыми;
- ветки защиты (branch protection) на `main` нужно временно снять и вернуть обратно;
- теги требуют отдельного пуша (`--tags`).

### 8.4 Обязательные сопутствующие шаги

1. **Уведомить всех коллабораторов заранее** — до force-push, с точным временем и инструкцией
   по пересозданию клона. После чистки — подтвердить, что все пересоздали клоны.
2. **Инвалидировать кеши GitHub Actions.** Сейчас в репозитории нет `.github/workflows`
   (директория отсутствует), поэтому шаг неприменим. Если workflows появятся — очистить кеши:
   `gh cache delete --all --repo SergeyDe7/clover-app` и проверить логи прошлых прогонов
   на предмет попадания секрета в вывод (логи придётся удалять отдельно).
3. **Проверить форки.** Через API: `gh api repos/SergeyDe7/clover-app/forks`. Ваш force-push
   их не затрагивает — с владельцами нужно связываться отдельно.
4. **Запросить у поддержки GitHub удаление висячих объектов**, если репозиторий публичный.
5. **Проверить релизы и артефакты** — `releases/` в этом репозитории содержит
   `server.env.for-dc` и `server.env.template`; при чистке истории убедиться, что и они не
   несут материала.
6. **После всего — ещё раз подтвердить, что секрет ротирован.** Если по какой-то причине
   шаг 0 был пропущен, вернуться к нему. Чистая история со старым живым секретом —
   худший из исходов: ложное ощущение безопасности.

---

## 9. Где секреты живут в рантайме

### 9.1 Единственный файл

`/opt/clover/clover-app/server/.env` — все значения из этого runbook.

Загружается через `import "dotenv/config"` (`server/src/server.js:1`). `dotenv` без явного пути
читает `.env` относительно **рабочей директории процесса**, а она задана в юните как
`WorkingDirectory=/opt/clover/clover-app/server` (`/etc/systemd/system/clover-api.service:9`).

### 9.2 systemd: `EnvironmentFile` НЕ используется

Действующий юнит `/etc/systemd/system/clover-api.service`:

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

Директивы `EnvironmentFile=` нет. Единственная `Environment=` задаёт несекретный `NODE_ENV`.
Секреты systemd **не видит вовсе** — их читает сам процесс Node через `dotenv`.
Эталонный юнит в репозитории фиксирует это намеренно:
`releases/dc-prep-ac44dcf/systemd/clover-api.service:12` — комментарий
«Loads secrets from server/.env via dotenv in the app; do not put secrets here.»

Практическое следствие: **не переносите секреты в юнит**. Файлы в `/etc/systemd/system/` имеют
права `0644` (`root:root`), то есть читаемы всеми пользователями системы, а `systemctl show`
показывает `Environment=` любому. Текущая схема через `.env` строго безопаснее.

### 9.3 Права доступа — ТРЕБУЕТ ИСПРАВЛЕНИЯ

Фактическое состояние на момент написания:

```
-rw-rw-r-- 1 clover clover 2354 server/.env      # режим 0664
```

**Файл доступен на чтение всем пользователям системы (`o+r`).** Для файла, содержащего
`JWT_SECRET`, `ONEC_API_KEY`, `SMTP_PASSWORD` и `TELEGRAM_BOT_TOKEN`, это избыточно широко.
Также группа `clover` имеет право записи.

Рекомендуемое исправление (**вне окна ротации, как отдельная задача**):

```bash
chmod 600 /opt/clover/clover-app/server/.env
chown clover:clover /opt/clover/clover-app/server/.env
ls -l /opt/clover/clover-app/server/.env   # ожидаем -rw-------
```

Процесс работает от `User=clover` (`/etc/systemd/system/clover-api.service:7`), поэтому `0600`
с владельцем `clover` полностью достаточен и ничего не сломает. Рестарт после `chmod` не нужен —
`.env` читается только при старте, но при следующем рестарте права уже должны быть корректны.

Проверьте также родительские директории — если `/opt/clover/clover-app/server` доступна на
чтение и обход всем, содержимое `.env` при `0600` всё равно защищено, но список файлов виден.

### 9.4 Кто может прочитать

- `root` — всегда;
- пользователь `clover` (владелец, от него работает сервис);
- **при текущих правах `0664` — любой локальный пользователь системы**; после `chmod 600` — нет;
- любой, кто может выполнять `sudo` без ограничений;
- процессы под `clover`, включая скрипты из `scripts/linux/`.

Через HTTP значения не утекают: наружу отдаются только булевы признаки и публичные данные —
`publicOneCStatus` (`server/src/oneC.js:96-122`, только `secretConfigured`),
`publicMailStatus` (`server/src/mailer.js:19-25`, только `configured` и `from`),
`publicPushStatus` (`server/src/push.js:18-24`, только публичный VAPID-ключ).

### 9.5 Смежные хранилища с чувствительными данными

- `server/data/clover.sqlite` (`server/src/db.js:19-21`) — bcrypt-хеши паролей и push-подписки.
  Не содержит секретов из этого runbook, но требует не менее строгой защиты.
- `server/data/` в целом, а также бэкапы, создаваемые `scripts/linux/daily-backup.sh`, —
  проверьте права на каталог назначения бэкапов.
- Копии `.env`, которые вы делаете по разделу 0: **всегда `chmod 600`** и держите вне
  дерева репозитория.

### 9.6 Быстрый аудит

```bash
stat -c '%n %A %U:%G' /opt/clover/clover-app/server/.env
grep -c EnvironmentFile /etc/systemd/system/clover-api.service   # ожидаем 0
systemctl show clover-api -p Environment                          # ожидаем только NODE_ENV
git -C /opt/clover/clover-app check-ignore -v server/.env
```
