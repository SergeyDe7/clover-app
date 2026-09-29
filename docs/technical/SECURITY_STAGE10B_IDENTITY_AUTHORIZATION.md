# Security Stage 10B — Identity and Authorization

Дата локальной проверки: 2026-09-28. База: production SHA `9eef63f43d1542be7301ad6a0783722748b2f7a9`. Ветка: `codex/security-stage10b-identity-authorization`.

## Scope и границы

Пакет меняет только authentication, session/JWT, password, recovery, passkey, RBAC/BOLA regression и browser cross-site defense. Миграции БД нет. Протокол 1С, рабочие заказы, production, systemd, nginx, firewall и GitHub settings не изменялись. Реальные письма, push и операции восстановления не выполнялись.

## Закрытые findings

- `10B-AUTH-001` (P1): действующей bearer-сессии было достаточно, чтобы закрепить доступ новым passkey, продлить JWT через `logout-other-sessions` или сменить собственный пароль через admin staff endpoint. Теперь sensitive operations требуют текущий пароль; admin self-target запрещён; неверные proofs rate-limited по authenticated user ID.
- Password writes теперь принимают 12–200 Unicode code points при пределе 72 UTF-8 bytes, чтобы bcrypt не обрезал разные пароли до одного credential. Hash wrapper дополнительно fail-closed отклоняет ввод свыше 72 bytes. Login старых аккаунтов остаётся совместимым и по-прежнему принимает существующий короткий пароль.
- JWT подписывается и проверяется только HS256, привязан к `iss=clover-server` и `aud=clover-app`, TTL ограничен двумя часами. Authority по-прежнему перечитывается из БД на каждом private request.
- Password recovery вычисляет hash до расходования token и атомарно обновляет token, password hash, session epoch и удаляет все passkeys пользователя в `BEGIN IMMEDIATE` transaction.
- Registration, resend, forgot-password и passkey authentication options больше не раскрывают существование аккаунта различающимися status/body shape. Auth issuance использует общий минимальный response floor; registration выполняет bcrypt на fresh/duplicate путях и нейтрализует конкурентный `UNIQUE(email)` race.
- Disabled account блокируется до passkey verification, counter update, login audit и token issuance.
- Production WebAuthn требует явные HTTPS `PASSKEY_ORIGIN` и совместимый `PASSKEY_RP_ID`; request Host fallback в production запрещён.
- Private unsafe browser requests с `Sec-Fetch-Site: cross-site` отклоняются. Bearer token не принимается из cookie, query или body.

## Контракты UI/API

- `POST /api/passkeys/registration/options` — body `{ currentPassword }`.
- `POST /api/passkeys/:credentialId/delete` — body `{ currentPassword }`.
- Legacy `DELETE /api/passkeys/:credentialId` — `405`, без мутации.
- `POST /api/auth/logout-other-sessions` — body `{ currentPassword }`.
- Все формы нового/заменяемого пароля перед submit проверяют 12–200 Unicode code points и предел 72 UTF-8 bytes; пароль не trim/normalize перед отправкой или hashing.
- Backend и frontend должны выпускаться атомарно из-за изменения passkey/logout contracts.

## Evidence

- `npm run lint` — PASS, 0 errors; сохранены существующие warnings.
- `npm run build` — PASS на fixture SQLite.
- `npm --prefix server run test:security-stage10b-identity` — 21/21 PASS, включая Unicode proof 0/1/200/201, bcrypt 71/72/73 UTF-8 bytes, cross-credential checks, neutral timing/race, limiter-before-bcrypt и atomic passkey revoke.
- `npm --prefix server run test:security-stage4-package-b` — 224/224 PASS.
- `npm --prefix server run test:all` — NOT VERIFIED целиком на Windows: все пакеты до `test:security-stage5-prepare` прошли, затем Linux operator fixture завис на обязательном `/dev/tty`; запуск прерван без production-действий. Отдельно после него PASS: Stage 5D, Stage 6, Stage 7, Stage 8A/B/C/closeout, Stage 9B/9C/closeout и финальные UI/SEO fixture suites. Stage 5 prepare остаётся переносимым test-infrastructure gap, не доказанным дефектом Stage 10B.
- `git diff --check` — PASS.

## Backup и rollback

Pre-change копия файлов с SHA-256 сохранена вне репозитория в:

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10b-prechange-backup-9eef63f`

Rollback к `9eef63f43d1542be7301ad6a0783722748b2f7a9` не требует изменения схемы БД. Новые password hashes, auth tokens и passkeys остаются совместимыми со старым кодом. До любого будущего deploy обязателен отдельный approved backup production DB/WAL/SHM, uploads и env.

## Residual risk / NOT VERIFIED

- Stage 10D перенёс bearer token из `localStorage` в account-session-scoped
  `sessionStorage` с безопасной retirement-миграцией legacy token. Активный
  same-origin XSS всё ещё может прочитать token; HttpOnly-cookie migration не
  выполнялась и остаётся отдельным архитектурным решением.
- P2: individual per-device session inventory/revoke-one отсутствует; session table потребует отдельной миграции БД.
- P2: rate-limit store process-local и не переживает restart/multi-worker; это зафиксированный Stage 10D abuse-resistance scope.
- P2: отправка auth-писем запускается асинхронно, чтобы SMTP latency не создавала account-enumeration oracle; durable mail queue отсутствует, поэтому process termination между `202/200` и завершением SMTP может потерять письмо. Durable integration queue относится к Stage 10C.
- P3: MFA/универсальный step-up, password history и breached-password provider не внедрены.
- Реальные Android/iOS/Windows passkey ceremonies и production post-check — NOT VERIFIED.
- Production deploy, CI/PR и exact post-deploy SHA — NOT PERFORMED; отдельного разрешения не было.

## Release gate

Без отдельного разрешения запрещены push, PR, merge, deploy и любые production/1С операции. Перед release нужны зелёный GitHub CI, approved production backup, target-pinned deploy, rollback rehearsal на безопасной среде и read-only production post-check.
