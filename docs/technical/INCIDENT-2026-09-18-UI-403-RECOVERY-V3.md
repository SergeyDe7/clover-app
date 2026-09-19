# Инцидент 2026-09-18: UI 403 и Recovery V3

## Наблюдаемые факты

- Production SHA на момент инцидента: `b3f31a3fc68303655c9ddda5c81488c3c834ce04`.
- Recovery V3 восстановил сайт.
- Внешний browser smoke desktop/mobile: PASS для `/`, `/lk`, `/contacts`, `/cart`; JS/CSS/fonts — HTTP 200 с правильным MIME.
- Владелец подтвердил успешный тестовый заказ.
- Live nginx читал `dist` через `alias`. Каталоги/файлы `dist` были `700/600` пользователя `clover`. Origin UI читал их, nginx получал 403.
- Успешный recovery заменил только `/assets/` и `/fonts/` на `proxy_pass` к существующему UI upstream, с сохранением URI и `Host`.
- Upstream `Cache-Control` скрыт. `immutable` без `always`. `expires 1y` убран.
- После reload первый запрос ещё получал 403, следующие — 200. Точная историческая причина первого ответа не доказана.
- Live nginx исправлен вне Git. Recovery `dist` собирался с временным namespace `r403u20260918T233508Z`. Этот суффикс в постоянный код не переносится.
- Точный шаг, который создал `dist` `700/600`, не доказан.
- `UMask=0077` у API и ограничения доступа к runtime data сохраняются. Права `dist` этим пакетом не ослабляются.

## Что закреплено в Git (этот пакет, локально)

- `ops/nginx/static-cache.snippet.conf` и `ops/nginx/clover-spb.ru.with-cache.example`: `/assets/` и `/fonts/` только через UI proxy, без `alias` на private `dist`.
- Deploy/rollback (`scripts/linux/restart-api-ui.sh`) проверяет реальные assets из HTML (entry JS, preload/chunks, CSS, fonts): файлы на диске, HTTP 200, правильный MIME, тело не HTML. Origin и nginx — раздельно.
- После restart: bounded readiness, один deadline, временный первый отказ допустим, нужны два подряд успешных прохода. Старые nginx workers не ждутся. Обязательный `nginx reload` не вводится.
- Неизвестный `/fonts/...` в Vite preview больше не отдаёт HTML 200.

## Обязательный browser smoke после будущей установки

HTML/API 200 и внутренний asset probe **не** заменяют внешний браузер.

После любого deploy/rollback на DC открыть с телефона и с компьютера (не с самого сервера, если есть hairpin):

1. `https://clover-spb.ru/`
2. `https://clover-spb.ru/lk`
3. `https://clover-spb.ru/contacts`
4. `https://clover-spb.ru/cart`

Ожидание: страница рисуется; в Network JS/CSS/fonts — 200, MIME не `text/html`.

Недоступность с сервера / hairpin NAT нельзя записывать как успешный browser test.

## Первый deploy этого пакета (live ещё на старом `restart-api-ui.sh`)

Live source до cutover остаётся на предыдущем SHA. Новый gate живёт только в доставляемом commit. Запускать **не** live `scripts/linux/restart-api-ui.sh`: у него нет `check_http_assets`.

Зависимости launcher (`run-target-deploy.sh`): `bash`, `git`, `mkdir`, `chmod`. `ROOT` берётся только из `CLOVER_DEPLOY_ROOT` (не из пути файла). Извлечение — в `CLOVER_DEPLOY_STAGING/delivered-deploy-<sha>`, не внутри live ROOT. Дальше extracted `restart-api-ui.sh` требует `node`, `npm`, `curl`, `flock`, systemd.

Точные команды (SHA уже в object DB live repo; `git fetch`, без `reset`, без переключения live source):

```bash
SHA=<40-char-sha>
ROOT=/opt/clover/clover-app
STAGING=/opt/clover/deployments/staging
EXTRACT="${STAGING}/delivered-deploy-${SHA}"
mkdir -p "${EXTRACT}"
git -C "${ROOT}" show "${SHA}:scripts/linux/run-target-deploy.sh" > "${EXTRACT}/run-target-deploy.sh"
chmod +x "${EXTRACT}/run-target-deploy.sh"
CLOVER_DEPLOY_ROOT="${ROOT}" CLOVER_DEPLOY_STAGING="${STAGING}" \
  bash "${EXTRACT}/run-target-deploy.sh" "${SHA}"
```

Launcher сам извлечёт `restart-api-ui.sh` и `uiAssetProbe.mjs` из того же SHA и exec их. Cutover и rollback идут уже новым скриптом: оба вызывают `wait_for_health` → `check_http_assets` (origin и nginx раздельно). TLS verification не отключается; при необходимости только `CLOVER_DEPLOY_TLS_CA` (тестовый/служебный CA), не production credentials.

Недостаточно фразы «проверки заработают со следующего деплоя»: первый выкат этого SHA должен идти через команды выше.

## Будущая установка и rollback

Установка (только после отдельного «да», этот пакет её не выполняет):

1. Backup live source + `dist` + `server/data` + `server/.env`.
2. Применить source-controlled nginx snippet/example на DC, `nginx -t`, reload **только если** конфиг nginx реально менялся.
3. Первый выкат этого SHA — через извлечённый `run-target-deploy.sh` (команды выше). Последующие выкаты можно запускать уже live `scripts/linux/restart-api-ui.sh <40-char-sha>`.
4. Скрипт сам проверяет staged/live assets и origin/nginx probe. Origin-only не считается PASS.
5. Внешний browser smoke по списку выше.
6. Не менять `UMask=0077` API и не `chmod` private `dist` «для nginx».

Rollback: тот же extracted/new скрипт откатывает source SHA + LKG `dist` и снова гоняет asset probe. HTML/API 200 недостаточно. Внешний browser smoke обязателен и после отката.

Production этим пакетом не обновлён.
