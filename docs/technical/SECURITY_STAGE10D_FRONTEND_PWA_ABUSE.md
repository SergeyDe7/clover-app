# Security Stage 10D — frontend, PWA и abuse resistance

Дата локальной проверки: 2026-09-29. База ветки и подтверждённый production SHA: `9eef63f43d1542be7301ad6a0783722748b2f7a9`.

## Границы

- Работа выполнялась в managed worktree на локальных fixtures.
- Production, рабочая БД, 1С, systemd, nginx, firewall и GitHub settings не изменялись.
- Реальные заказы, письма, Telegram/MAX и push не отправлялись.
- Push, PR, merge и deploy не выполнялись.
- Production restore и post-deploy post-check остаются `NOT VERIFIED`. Текущая
  production identity/CSP baseline отдельно подтверждена read-only проверкой,
  описанной ниже.

## Исправленные подтверждённые дефекты

1. Приватные PDF актов сверки можно было получить без авторизации через alias пути `%2F`, `%5C` или повторный `/`. Общий `/uploads` mount теперь до `express.static` декодирует и нормализует mount-relative путь, запрещает private namespace без учёта регистра и отклоняет malformed, NUL и dot-segment пути.
2. Черновик заказа хранился под одним глобальным ключом и мог открыться следующему клиенту на общем браузере. Ключ теперь включает authenticated user ID; старый глобальный ключ не читается и удаляется при logout/создании нового заказа.
3. Legacy profile/addresses/orders могли автоматически присвоиться следующему вошедшему клиенту. Миграция клиента теперь разрешается только при точном case-insensitive совпадении email legacy-профиля и authenticated user либо при явном owner marker. Другому аккаунту данные не показываются и не отправляются. После успешной миграции source PII удаляется; при ошибке остаётся для безопасного повторения. Global manager data мигрируется только authenticated manager/admin.
4. Login, passkey, guest order, registration и recovery endpoints ограничивались только меняемым email/телефоном/token/cookie. Добавлен второй обязательный fail-closed bucket по доверенно определённому IP для login, register, verify/resend, forgot/reset, passkey options/verify и guest order. Недоверенный клиент не может выбрать bucket через `X-Real-IP`; recovery gate выполняется до писем, БД и password hashing.
5. Детальный public catalog route теперь использует тот же read limiter, что список каталога.
6. Ответ guest order всегда получает `Cache-Control: no-store`; неизвестная server-side ошибка больше не раскрывает `error.message` или internal code.
7. Bearer token перенесён из постоянного `localStorage` в `sessionStorage`. Старый token мигрируется однократно и удаляется только после успешной записи; logout чистит оба хранилища. Это сокращает срок хранения, но не заменяет CSP и не защищает активную сессию от same-origin XSS.
8. После отдельного разрешения владельца полный resource CSP подготовлен как enforcing tracked candidate; inline event attributes запрещены через `script-src-attr 'none'`, offline retry больше не использует `onclick`. `unsafe-inline` для script blocks/styles временно сохранён ради текущего JSON-LD, boot/print и React styles.

## Затронутые файлы Stage 10D

- `server/src/uploadPathPolicy.js`
- `server/src/server.js`
- `server/src/publicRateLimit.js`
- `server/scripts/verify-security-stage10d-frontend-abuse.mjs`
- `server/package.json`
- `src/shared/browserStorageSecurity.js`
- `src/shared/sessionTokenStorage.js`
- `src/serverApi.js`
- `src/App.jsx`
- `src/screens/client/ClientScreen.jsx`
- `src/screens/client/OrderEditor.jsx`
- `ops/security-stage6/package-b/nginx/clover-security-headers.conf`
- `ops/security-stage6/README.md`
- `public/offline.html`
- `server/scripts/verify-security-stage6.mjs`
- `server/scripts/securityStage6Artifact.mjs`
- `server/scripts/verify-security-stage10d-csp-browser.mjs`

## Автоматические evidence

- `npm run test:security-stage10d-frontend-abuse`: PASS, 9/9.
- `npm run test:security-stage10d-csp-browser`: PASS in local Chromium; blocks inline event attributes and an unlisted script origin while preserving inline blocks/styles, same-origin scripts and the offline retry listener.
- Off-live Yandex Metrika mock browser smoke in installed local Chrome: PASS, including desktop and 390px mobile consent UI; external `mc.yandex.ru` was not loaded.
- `npm run test:security-stage4-package-b`: PASS, 224 checks.
- `npm run test:security-stage6`: PASS.
- `npm run test:security-stage7-anti-scraping`: PASS.
- `npm run check`: PASS.
- Root `npm run lint`: PASS, 0 errors; 53 исторических warnings.
- Root `npm run build`: PASS.
- `git diff --check`: PASS; сообщения только о line-ending normalization.
- Stage 10D verifier включён в `server/package.json` → `test:all`.

Отдельно воспроизведён baseline exploit: старый static mount возвращал приватный fixture через encoded slash и двойной slash со статусом 200. Candidate возвращает 404 для literal, encoded slash/backslash, repeated slash и mixed case; обычный публичный upload остаётся доступен.

## Production read-only evidence перед возможным rollout

Проверка выполнена 2026-09-29 без `sudo`, записи, reload, deploy, входа в
аккаунт и действий с заказами:

- SSH alias `clover` разрешается в ранее документированный production host;
  `/opt/clover/clover-app` находится на точном SHA
  `9eef63f43d1542be7301ad6a0783722748b2f7a9`.
- Installed `/etc/nginx/snippets/clover-security-headers.conf` и tracked файл
  production checkout побайтно совпадают; SHA-256 обоих:
  `5f8db193025bb29ee8616187ca6db94f400a68984179cd1a485209ed3d974e18`.
- Installed policy всё ещё является безопасной исходной точкой Stage 6:
  минимальный CSP enforcing, полный resource policy — Report-Only. Локальный
  Stage 10D enforcing candidate на production **не установлен**.
- Публичные `/`, `/contacts`, `/lk` и `/offline.html` вернули HTTP 200 в
  headless Chromium; page errors и события нарушения текущего Report-Only CSP
  не зафиксированы.
- `/api/health` вернул `ok=true`, service `clover-server`, version `4.0.4`.
  Health endpoint не публикует release SHA, поэтому identity подтверждена через
  read-only `git rev-parse` на host.
- Все 691 товара активного публичного каталога имеют `imageUrl` только в
  управляемом same-origin namespace `/uploads`; внешних, `data:`/`blob:` и
  некорректных product image URL не найдено. У всех 691 публичных записей
  `certificateUrl` пуст. Это подтверждает совместимость нового `img-src` для
  активного публичного набора, но не доказывает состояние скрытых/архивных
  записей или данных, доступных только менеджеру.
- Production checkout содержит прежний untracked каталог
  `dist.lkg-ui-20260910-DS202DDX-20260910T215957Z/`. Его происхождение,
  необходимость и включение в backup/rollback пока `NOT VERIFIED`; в этой
  проверке каталог не читался и не изменялся. Это передано в scope Stage 10E.

## Backup и rollback

Pre-change backup:

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10d-prechange`

CSP subpackage pre-change backup:

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10d-csp-prechange`

The CSP backup also contains reconstructed exact pre-CSP copies of
`server/package.json` and `server/scripts/securityStage6Artifact.mjs`. The audit
report itself is intentionally retained after rollback so evidence is not
erased. The new browser verifier is removed only together with its npm script
and artifact-manifest entry.

Fixture rollback rehearsal materialized the complete pre-CSP operational set,
validated JSON/module syntax and confirmed restoration of the former
Report-Only header, former offline handler and pre-CSP npm/artifact wiring:
`SECURITY_STAGE10D_CSP_ROLLBACK_REHEARSAL: PASS`. This is local evidence only;
production rollback remains `NOT VERIFIED`.

До commit/deploy откат выполняется восстановлением только перечисленных Stage 10D файлов из backup и удалением новых Stage 10D helper/verifier файлов. После отката обязательны focused 10D test, Stage4B, Stage6, lint и build. Stage 10B/10C находятся в том же worktree и не должны быть удалены общим reset.

После будущего deploy откат разрешён только target-pinned release-процедурой с отдельным backup и согласием. Локальный rollback rehearsal CSP-подпакета — PASS; полный откат всех накопленных Stage 10B–10D изменений и любой production rollback остаются `NOT VERIFIED`. Общий Stage 6 fixture rollback — PASS.

Обязательный порядок будущего rollout: сначала target-pinned UI release с новым
`offline.html`, затем UI/browser smoke, и только после этого установка CSP
snippet, `nginx -t`, reload и повторный smoke. Package B promoter устанавливает
только nginx snippet и сам UI не доставляет. Порядок rollback обратный по
безопасности: сначала восстановить прежний CSP snippet, выполнить `nginx -t` и
reload, затем откатывать UI. Иначе старый offline `onclick` окажется под
`script-src-attr 'none'` и кнопка повторной загрузки перестанет работать.

## Остаточные риски и действия с отдельным разрешением

- **P2:** resource CSP подготовлен как enforcing tracked candidate, но production не менялся. `script-src 'unsafe-inline'` и `style-src 'unsafe-inline'` временно сохранены; их снятие требует внешнего JSON-LD/boot/print/styles и отдельного browser regression.
- **PARTIALLY VERIFIED:** активный публичный catalog inventory совместим с
  candidate `img-src`: 691/691 product images находятся в `/uploads`, все
  публичные `certificateUrl` пусты. Hidden/archive/manager-only и полный DB
  inventory остаются `NOT VERIFIED`; до установки нужен либо безопасный
  aggregate read-only inventory этих записей, либо явное принятие этого
  ограничения владельцем.
- **P2:** rate-limit store process-local, сбрасывается при restart и не разделяется между несколькими backend workers. Исправление через persistent/shared storage затронет архитектуру/БД и требует отдельного пакета.
- **P2:** fail-closed client store при 10 000 одновременно активных новых IP временно отказывает новым IP до expiry. Это осознанный availability/security компромисс, но владелец ещё не принял его как остаточный риск.
- **P2:** произвольные legacy/external `imageUrl` и `certificateUrl` ещё не сведены к same-origin allowlist. Подтверждённого XSS нет; остаётся риск privacy/referrer и несовместимости с будущей строгой CSP.
- **P2 / NOT TESTED:** реальный browser/PWA flow login A → draft → logout/обрыв → login B, offline/online, полный restart, update worker и CSP telemetry на Android/iOS/Windows.
- **P3:** SW install пока подавляет ошибку shell precache; SW/page message handlers имеют минимальную, а не строгую schema/source validation.
- Активный same-origin XSS всё ещё может прочитать token из `sessionStorage`; подтверждённого XSS sink в React UI не найдено.
- GitHub CI и deploy относятся к 10E/10F и не выполнялись. Текущая production
  identity/SHA baseline подтверждена; post-deploy identity/post-check ещё не
  применимы и остаются обязательными после отдельно разрешённого deploy.

## Критерий перехода

Повторные независимые проверки актуального candidate:

- Security: `READY по P0/P1`.
- QA: `READY для локального Stage 10D gate по P0/P1`.
- Reviewer: `READY по P0/P1 / APPROVE WITH CONDITIONS`.

Локальный Stage 10D gate: `READY по P0/P1`; P0 = 0, P1 = 0. Это не означает overall Stage 10 READY или production READY. Для полного closeout остаются решение владельца по перечисленным P2/`NOT VERIFIED`, GitHub CI, безопасный rollout/rollback и production read-only post-check в Stage 10E/10F.
