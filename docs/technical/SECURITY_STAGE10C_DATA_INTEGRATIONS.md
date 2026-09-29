# Security Stage 10C — данные и интеграции

Дата локальной проверки: 2026-09-28. База ветки: `9eef63f43d1542be7301ad6a0783722748b2f7a9`.

## Границы

- Все проверки выполнялись в managed worktree и на временных fixtures.
- Production, рабочая БД, systemd/nginx/firewall и GitHub settings не изменялись.
- Запросы, заказы, письма, push и сообщения в рабочие системы не отправлялись.
- Модуль VLAVKA изменён только в Git. Установка в Конфигуратор и проверка в 1С TEST требуют отдельного разрешения.
- Production restore остаётся `NOT VERIFIED`; этот пакет не разрешает реальное восстановление.

## Исправленные подтверждённые дефекты

1. Snapshot v5 не сохранял `disabled_at` и `permissions_json`. Snapshot v6 сохраняет их точно; импорт валидирует все security-разделы и обязательные поля до транзакции. При restore v5 состояние безопасности уже известных identities берётся из текущей БД, а отсутствующие в ней identities восстанавливаются заблокированными и без прав. Неполный v6 отклоняется с `BACKUP_SECURITY_STATE_MISSING`, повреждённый — с `BACKUP_SECURITY_STATE_INVALID`.
2. Upload filename включал decoded `productId`/`requestId` и допускал выход из каталога. Физические имена теперь состоят только из server-owned prefix, timestamp, UUID и allowlisted extension. Несуществующий ресурс отклоняется до Multer.
3. HTTP static/upload использовал hardcoded `server/uploads`, а backup — `CLOVER_UPLOADS_DIR`. Backend, backup и restore теперь используют один экспортированный uploads root. Preview 1С использует `CLOVER_ONEC_PREVIEW_DIR` либо каталог рядом с `DB_PATH`.
4. Restore сначала менял БД, затем разрушительно перезаписывал uploads. Новый порядок: полная preflight-проверка ZIP → sibling staging → restore journal → атомарное переключение каталогов → транзакционный импорт БД. Ошибка возвращает исходные БД и uploads; незавершённый journal восстанавливается до запуска HTTP-сервера.
5. Tracked-модуль VLAVKA синхронизирован с подтверждённой установленной базой без секрета и дополнен запретом изменения/удаления Clover ID. Runtime 1С не менялся.
6. CSV export нейтрализует строки, начинающиеся после управляющих/пробельных символов с `=`, `+`, `-` или `@`; числовые отрицательные значения остаются числами.
7. Multipart акта сверки ограничен одним полем и одним файлом; `managerComment` валидируется с максимумом 2000 символов, а файл удаляется при ошибке после загрузки.
8. Все шесть disk-upload маршрутов после Multer проверяют фактическое содержимое: изображения декодируются через Sharp и сопоставляются с заявленным MIME, PDF проверяется по сигнатуре. Несоответствие возвращает безопасную ошибку и удаляет файл.
9. Запросы актов сверки получили обязательное поле `database`. 1С list/get/update фильтруются по авторизованному контуру; несовпадающий ID возвращается как отсутствующий. Legacy-записи без контура останавливают запуск fail-closed, пока оператор явно не задаст `CLOVER_LEGACY_RECONCILIATION_DATABASE=TEST|VLAVKA`; автоматического назначения в TEST нет. Новые клиентские запросы получают текущий `defaultExchangeDatabase()`.
10. Immutable Clover ID guard, уже применявшийся в VLAVKA, добавлен в tracked TEST-модуль. Verifier теперь одинаково требует guard и вызов BeforeWrite для обоих контуров. Конфигуратор и runtime 1С не менялись.
11. PDF из manager multipart и base64 endpoint 1С проходит один структурный validator (header, object, `startxref`, `%%EOF`). После DB commit новый акт больше не удаляется при ошибке audit/mail/cleanup; удаление прежнего файла выполняется best-effort.
12. Full backup сохраняет пути uploads в переносимом виде, а restore безопасно сопоставляет portable/legacy absolute paths с entries архива и активным `CLOVER_UPLOADS_DIR`.
13. Backup останавливается fail-closed, если БД ссылается на отсутствующий managed upload, вместо создания заведомо невосстановимого архива.

## Автоматические evidence

- `npm run test:security-stage10c-data-integrations`: PASS, 13/13, включая fail-closed legacy migration, явную миграцию в VLAVKA, перенос restore между разными uploads roots и отказ backup при отсутствующем referenced upload.
- Root `npm run lint`: PASS, 0 errors (53 исторических warnings).
- Root `npm run build`: PASS после разрешения записи Vite temporary bundle в managed worktree.
- В `server/package.json` отдельный script `lint` отсутствует; запуск `npm run lint` штатно сообщает `Missing script`. Это не заявляется как PASS.
- `npm run test:security-stage10b-identity`: PASS, 21/21.
- `npm run check`: PASS.
- `npm run test:runtime`: PASS.
- `npm run test:manager-notifications`: PASS.
- `npm run test:onec` с отдельными fixture `DB_PATH`, `CLOVER_UPLOADS_DIR` и backup root: PASS.
- `verify-onec-contour-module-sources.mjs`: PASS для tracked TEST и VLAVKA; immutable-ID guard обязателен в обоих модулях.
- `npm run test:security-stage3-package3` с отдельными fixture paths: PASS, 31/31.
- `verify-backup-lock-permissions.mjs`: PASS для Windows portable checks; Linux-only проверки штатно SKIP.
- `git diff --check`: PASS; сообщения только о CRLF normalization.
- `npm run test:all`: запускался на изолированных путях, но не завершён: после успешных `check`, `test:onec`, concurrency, runtime и Stage 3/4 suite Stage 5 prepare остановился из-за Windows/MSYS `install: cannot create directory ... Permission denied`. Это environment/harness blocker; полный suite не заявляется как PASS.

## Backup и rollback

Pre-change backup backend-файлов:

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10c-backend-prechange`

Pre-change backup tracked-модуля 1С и verifier:

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10c-vlavka-tracked-prechange`

Pre-change backup оставшегося scope аудита (exchange, enrichment, package, документ, tracked TEST-модуль и verifier):

`C:\Users\Lonovo\.codex\visualizations\2026\09\28\01a0e8eb-efb6-7900-ad1e-b5660322bafd\stage10c-remaining-prechange`

Откат до commit/deploy: восстановить перечисленные файлы из backup либо удалить локальный diff Stage 10C, не затрагивая изменения Stage 10B. После будущего deploy откат допустим только target-pinned release-процедурой с отдельным согласованием.

### Будущий rollout миграции актов (не выполнялся)

1. На остановленной безопасной копии БД определить, есть ли строки `reconciliation_requests` до Stage 10C и к какому единственному контуру они относятся.
2. Сделать backup БД и uploads; не запускать обновлённый сервер при неоднозначном происхождении строк.
3. Только при подтверждённом результате временно задать `CLOVER_LEGACY_RECONCILIATION_DATABASE=TEST` либо `VLAVKA` и выполнить первый запуск. Без переменной legacy-строки вызывают `RECONCILIATION_CONTOUR_MIGRATION_REQUIRED` до открытия HTTP-сервера.
4. Проверить количество и contour строк на безопасной среде, затем удалить one-time переменную. При ошибке остановить сервер и восстановить backup; не переносить уже мигрированную БД между TEST/VLAVKA.

## Остаточные риски и отдельные разрешения

- `NOT VERIFIED`: production restore и crash-recovery на production-подобной Linux-среде.
- `NOT VERIFIED`: наличие и фактический contour legacy `reconciliation_requests` в production; до read-only инвентаризации production нельзя выбирать migration env.
- Restore v5 выполняет fail-closed upgrade security state; production rehearsal этого пути остаётся `NOT VERIFIED`.
- `NOT INSTALLED`: новый tracked-модуль VLAVKA не установлен в 1С. Нужны отдельное согласие, backup расширения, проверка синтаксиса и fixture/TEST-сценарии.
- Исправленные P1: межконтурный доступ к актам сверки и отсутствие immutable Clover ID guard в tracked TEST-модуле. Оба имеют fixture/static regression tests.
- **P2:** нет единого fixture-сценария claim → потерянный ACK → requeue → тот же документ → повторный ACK. Существующие backend-тесты отдельно подтверждают replay, foreign ACK, contour/key isolation и concurrency.
- **P2:** суммарная квота uploads и периодическая очистка orphan-файлов не реализованы; текущие ограничения действуют на размер каждого запроса/файла.
- **P2:** межконтурная изоляция подтверждена DB API и static route wiring, но отдельный live HTTP E2E для reconciliation TEST↔VLAVKA ещё не добавлен.
- **P2:** Stage 10B и 10C пока находятся в одном uncommitted diff; до будущей доставки нужен атомарный Stage 10C commit/patch manifest, чтобы откат не затронул Stage 10B.
- **P2:** PDF validation существенно сильнее проверки MIME/signature, но остаётся эвристической, а не полноценным PDF parser.
- `NOT VERIFIED`: фактическая компиляция CFE, строки/суммы/номер документа и полный обмен в 1С TEST. Реальный обмен с 1С — только после отдельного разрешения.
- Push/PR/merge/deploy не выполнялись.

## Статус текущего backend-пакета

- Локальный backend-подпакет backup/uploads/CSV: `PASS`.
- Security state round-trip, fail-closed legacy upgrade, malicious snapshot rejection, full/repeat restore и failure rollback проходят на fixtures.
- Stage 10C целиком: ожидает независимые QA/security/reviewer review; открытых подтверждённых P0/P1 после локальных исправлений не зафиксировано.
- Focused regression Stage 10C и `test:onec` прошли на fixtures. Полный `test:all` имеет описанный environment blocker; GitHub CI, deploy и production post-check относятся к 10F и не выполнялись.
- Production и рабочая 1С остаются неизменными.
