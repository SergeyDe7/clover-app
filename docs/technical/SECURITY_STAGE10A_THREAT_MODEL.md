# Security Stage 10A — threat model and attack surface

Дата: 2026-09-29. Read-only baseline: production и `origin/main`
`9eef63f43d1542be7301ad6a0783722748b2f7a9`.

## Активы, роли и trust boundaries

Активы: учётные записи/сессии/passkeys, клиентские PII и заказы, цены и каталог,
акты/PDF/uploads, SQLite и backup, ключи интеграций, очередь 1С и release
artifacts. Роли: anonymous/client/manager/admin, backend, nginx/systemd,
GitHub Actions и два изолированных контура 1С TEST/VLAVKA. Границы: Internet →
nginx → Node API; браузер/PWA → bearer API; API → SQLite/files; API ↔ SMTP/push;
1С → key-auth claim/ACK API; developer/GitHub → target-pinned production deploy.

## Attack surface и модель угроз

Внешний surface: public catalog/order/auth/recovery/passkey endpoints, CORS/CSP,
PWA cache/service worker, uploads и public files. Внутренний: manager/admin RBAC,
backup/restore, reconciliation PDF, notifications, audit/monitoring, deploy and
rollback scripts. Интеграционный: replay/claim/ACK/idempotency, contour mismatch,
SSRF/path traversal/injection/file spoofing, secret and PII leakage. Главные
угрозы: account takeover/privilege escalation/BOLA, cross-account browser data,
stored/reflected XSS, resource exhaustion, malicious archive/upload, duplicate
1С document, TEST↔VLAVKA contamination and compromised dependency/release.

## Результат 10A и критерии пакетов

P0/P1 Stage 1–9 не воспроизведены; historical evidence-only gaps и production
restore остаются residual/NOT VERIFIED. Для каждого 10B–10F обязательны:
затронутые файлы, negative fixtures, pre-change backup, exact rollback, P0–P3,
отдельные разрешения и independent Security/QA/Reviewer verdict. 10B закрывает
identity/RBAC/BOLA/CSRF; 10C — validation/uploads/backup/1С isolation; 10D —
XSS/CSP/PWA/abuse; 10E — dependencies/CI/artifact/deploy; 10F — полный regression,
incident drill, reviews, CI, authorized rollout и exact-SHA post-check.

Production/DB/1С/GitHub settings/messages/orders/restore/push/merge/deploy не
разрешаются этим документом.
