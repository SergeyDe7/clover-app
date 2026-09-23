# Security Stage 7 — production release closeout

Дата фиксации: 2026-09-23 (Europe/Moscow). Это итог установки Security Stage 7 — **Security Audit + Minimal Security Hardening**, а не I18N Stage 7. [Аудит и threat model](SECURITY_STAGE7_AUDIT.md) описывают состояние кандидата **до** merge и установки; их исторический раздел о production не является текущим статусом релиза.

## Решение по этапу

**PASS для подтверждённых технических gates Stage 7.** PR [#158](https://github.com/SergeyDe7/clover-app/pull/158) merged в commit `21259c768b3dbf2de17da9a0b676f571380c6a1b`. Production checkout и запущенные API/UI используют этот commit. Непроверенные реальные сценарии и остаточные advisories перечислены ниже и не объявляются PASS.

Исходное определение scope: материал от 2026-09-13, SHA-256 `e47acbeb7e8b451948f46b21b2cfbbb2c23d955227d89f27e747bb0d9545fe3e`. Изменения этапа: совместимые обновления зависимостей; ограничения Excel import и почтовых получателей/вложений; HTML escaping в письмах; placeholders вместо tracked credentials в текущем дереве; аудит и Stage 7 verifier. Протокол обмена с 1С, polling/claim/ACK, идемпотентность, TEST/production isolation, БД, расширение 1С, firewall, systemd и старые процессы не менялись этим этапом.

## Exact release и production evidence

- Production application HEAD: `21259c768b3dbf2de17da9a0b676f571380c6a1b`, detached, без tracked drift. Единственный показанный `git status` untracked путь — ранее существовавший `dist.lkg-ui-20260910-DS202DDX-20260910T215957Z/`; он сохранён.
- Prepared artifact: `/opt/clover/deployments/staging/prepared-21259c768b3dbf2de17da9a0b676f571380c6a1b/manifest.json`, SHA-256 `f0db034cff474006b832af812d68042298265e5820fff0a9a8245e200b0afdb2`. Manifest содержит target SHA, release ID `20260923HjDT6xzD`, ожидаемые locale `enabled` и Metrika `on`.
- `preparedDist.mjs verify` для trusted staging и `verify-files` для live `/opt/clover/clover-app/dist` прошли: **81 файл** в каждом случае, exact target SHA и release ID совпали. Live UI tag: `ui-20260923HjDT6xzD`.
- Live `server/src/mailer.js`, `server/src/server.js`, `src/shared/matrixExcelImport.js`, Stage 7 verifier и оба lockfile byte-for-byte совпали с Git blob целевого commit. `SECURITY_STAGE7_VERIFIER:PASS`; установленные серверные зависимости включают WebAuthn `13.3.3`, multer `2.4.0`, Nodemailer `7.0.13`, adm-zip `0.6.1`, sharp `0.35.4`.
- API/UI/nginx `active`, `NRestarts=0`; локальный API `/api/health` вернул `ok: true`, `service: clover-server`, `version: 4.0.4`. Это отдельные сигналы, не замена browser smoke.
- Внешний browser smoke после установки: `/`, `/lk/`, `/ru/contacts`, `/cart` реально отрисованы. На `/ru/contacts` дождались данных; `/cart` показал пустую корзину. Console errors в этих проверках не обнаружены. Login, отправка формы и заказ не выполнялись.
- Установленный nginx security header snippet `/etc/nginx/snippets/clover-security-headers.conf`: SHA-256 `5f8db193025bb29ee8616187ca6db94f400a68984179cd1a485209ed3d974e18`, равен Stage 6 baseline.

## Сохранённый откат

Непосредственный baseline перед Stage 7: application `d3233ca01683d0f3c4ad121f027e03bd882ddf17`, UI `ui-20260923VrBxTxx6`.

- Предыдущий UI `dist`: `/opt/clover/deployments/lkg/dist`; его tag сверён. Дополнительная pre-cutover копия UI: `/opt/clover/deployments/lkg/security-stage7-deps-d3233ca01683d0f3c4ad121f027e03bd882ddf17/pre-dist`.
- Старые зависимости: каталоги `root-node_modules` и `server-node_modules` в том же Stage 7 LKG; у обоих присутствует `.package-lock.json`.
- Использованный Stage 7 promote wrapper сохранён в `/opt/clover/deployments/staging/delivered-deploy-21259c768b3dbf2de17da9a0b676f571380c6a1b/security-stage7-promote-wrapper.sh`, SHA-256 `d7af6687a9144081411fc03a192335ff2357bc96007f0483176d8994e7af3336`. Его независимый review V2: PASS; live rollback не запускался.
- Stage 6 recovery (application `70eb66504bf981b1ea395d55671547292fa95141`, nginx pre-state, immutable snapshot) — предыдущий уровень восстановления, не непосредственный baseline Stage 7. Его сохранность в этой closeout-проверке повторно не аудировалась.

При необходимости отката нужно сначала повторно снять production identity и сверить LKG и checksum оператора. Откат production требует отдельного решения владельца; произвольный `git reset` не является процедурой отката.

## Границы результата и следующие проверки

- **NOT VERIFIED:** реальные login, reset, orders, mail и рабочая 1С; целостность обмена с 1С в TEST по реальному сценарию также не заявляется по одному только synthetic test.
- **NOT VERIFIED:** system journal после установки: у пользователя `clover` нет доступа к root-only journal. Отсутствие console errors и `NRestarts=0` не доказывает отсутствие сообщений в journal.
- **NOT VERIFIED:** принятие или отзыв исторических credentials всеми внешними системами. Текущий tracked файл содержит placeholders; audit зафиксировал, что production values отличаются от исторических, но live auth/1С вызовы не проводились.
- `npm audit` сохраняет HIGH advisories для `xlsx@0.18.5` (совместимого npm fix нет) и Nodemailer 7.x (полное исправление требует major 10). Их доступные пути ограничены внесёнными проверками; полное upstream устранение не заявляется.
- Остаточные риски Security Stage 5 — старые listeners 4117/4118/5293, доступность портов и точный firewall ruleset/сохранение после reboot — не закрываются и не считаются scope Stage 7. Reboot не выполнялся.
- Пустые GitHub checks и HTTP 200 сами по себе не использовались как PASS. Production остаётся закреплённым на `21259c7…`; проверенный на момент отчёта `origin/main` — `a952974bd5126d4000ed6d0fda1d696bfca49b36` (отдельный SEO merge), не включённый в этот production release.

Отчёт фиксирует наблюдения, а не разрешает следующую установку, откат или живые интеграционные операции.
