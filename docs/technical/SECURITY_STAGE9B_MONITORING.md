# Security Stage 9B — bounded monitoring and kill switches

Status: source-controlled implementation. Production installation, timer enablement,
environment changes and real alert delivery require separate owner approval.

## Safety contract

- The monitor is a one-shot process with a 45 second systemd timeout.
- It never calls a 1C endpoint and never uses `/api/one-c/queue-status`.
- A hardened one-shot producer running as the existing `clover` account reads
  queue/audit through a separate SQLite `readOnly` connection and backup evidence.
  It atomically publishes only bounded aggregates to `runtime-snapshot.json`.
  `clover-monitor` has no direct SQLite or backup access contract.
- Snapshots and alerts contain only closed-enum signal IDs, severity, scope and
  numeric/boolean facts. Raw audit details, order IDs, document numbers, IPs,
  emails, phones, URLs, paths, tokens, cookies and response bodies are rejected.
- Production and test state are separate. An environment mismatch is an error.
- Alert state and fixed-schema observation state are bounded and written atomically under a fixed state
  directory. The systemd unit creates `/var/lib/clover-monitor` with mode 0700;
  files are written under umask 077. The unit uses a dedicated `clover-monitor`
  account. The snapshot producer uses the existing application account; no ACL is
  granted from SQLite/backups to `clover-monitor`.
- The monitor executable and its closed dependency set are installed read-only
  under `/usr/lib/clover-monitor`. The monitor account is not granted traversal
  access to the application checkout, `.env`, SQLite, backups or uploads.
- Local sanitized output is the mandatory fallback. Email/Telegram incident
  delivery is not enabled by this package and must not be inferred from product
  notification settings.
- Availability outage age, CPU/RAM sustained duration and systemd restart deltas
  survive one-shot runs in `observations-<environment>.json`; healthy readings reset
  the corresponding windows. Raw samples, process IDs and paths are not stored.
- Alert notification state is committed only after the local operator sink
  acknowledges every event. A sink failure exits non-zero and leaves the prior
  notification state intact so the next timer run retries the alert.
- The monitor unit only orders itself after API/UI/nginx; it does not pull those
  services into a transaction or start them. It never reads production
  `server/.env`; `/etc/clover/monitor-status.env` is a separate closed-allowlist,
  secret-free status projection. The API health response exposes only an opaque
  HMAC-SHA-256 revision of the same allowlisted values. The API receives
  `CLOVER_MONITOR_STATUS_HMAC_KEY` from its secret environment; the monitor reads
  the same key from `/etc/clover/monitor-status.hmac` (`root:clover-monitor`, `0640`).
  Neither key nor raw values are returned. A missing or drifted revision is a failed probe.
- The timer wants and orders the snapshot producer first, but producer failure does
  not suppress the rest of monitoring. Missing/stale/malformed snapshots emit
  critical `monitor.runtime_snapshot`; queue/audit/backup remain explicitly unknown,
  and the monitor never falls back to direct SQLite or backup reads.

## Evidence producer contracts

Deploy and backup evidence are strict, bounded JSON contracts. The source-controlled
`write-monitor-evidence.mjs` producer writes them atomically. `daily-backup.sh` and
`restart-api-ui.sh` invoke that producer; production installation remains a separate
owner-approved action. Producers write into `/var/lib/clover-monitor-evidence`, whose
tmpfiles contract is `0770 root:clover` plus a read-only `clover-monitor` ACL limited
to that sanitized directory. Atomic files inherit read-only access and use mode `0640`.
The monitor has no application-group membership; systemd exposes
the evidence directory to it through `ReadOnlyPaths`; monitor state remains in a
separate private `0700` directory.
Production wrappers pin these canonical paths. Overrides are honored only with an
explicit `CLOVER_MONITOR_FIXTURE_ROOT` and only when every resolved path remains
contained below that fixture root.

- Deploy receipt (`CLOVER_MONITOR_DEPLOY_RECEIPT`, maximum 16 KiB): schemaVersion
  1, exact environment, event `success|failure|rollback`, result
  `succeeded|failed|rollback_succeeded|rollback_failed`, ISO `occurredAt`, and a full
  lowercase 40-character release SHA. Only receipts inside the configured time
  window contribute a signal; stale valid receipts become a zero count.
- Backup evidence (`CLOVER_MONITOR_BACKUP_EVIDENCE`, maximum 16 KiB): schemaVersion
  1, exact environment, completedAt/result/archiveSize/archiveSha256, an integrity result with
  checkedAt, and a fixture restore result with checkedAt. The archive size and
  completion time and SHA-256 must match the newest scheduled archive. Integrity,
  restore and completion timestamps are independently ordered, bounded and rejected
  when future or stale. File existence or
  non-zero size alone is never reported as integrity or restore proof.

## Initial thresholds

These are the Stage 9A owner-review defaults implemented by pure rules and
covered by fixtures:

- availability: warning after 2 of 3 failures; critical after 3 consecutive
  failures or five minutes of outage;
- systemd: warning after one restart in 15 minutes; critical when failed/inactive
  or after three restarts in ten minutes;
- CPU/RAM: warning at 80%/85% sustained for ten minutes; critical at 95% for ten
  minutes or on OOM;
- disk: warning below 20%; critical below 10% or below the required byte reserve;
- backup: warning at 26 hours; critical at 48 hours or failed integrity/restore;
- TLS: warning at 30 days; critical at 14 days or invalid hostname/chain;
- 1C ready: warning at age 10 minutes or count 5; critical at 30 minutes or 20;
- 1C sending: warning at age 10 minutes; critical at 16 minutes or repeated requeue;
- ACK rejection: warning on one; critical on contour mismatch/collision or three
  rejections in ten minutes.

Repeated alerts are deduplicated. Severity escalation bypasses cooldown. Recovery
requires two consecutive healthy samples. The default global budget prevents an
unbounded alert storm.

## Runtime kill switches

All switches are operator environment flags. `true` pauses the feature,
`false`/unset preserves current behavior, and a malformed explicit value fails
closed for that feature only. Denial returns HTTP 503 `FEATURE_PAUSED`, no-store
headers and `Retry-After: 60`.

- `CLOVER_PAUSE_ONEC_CLAIMS` — blocks new 1C pull/claim; ACK remains available so
  already claimed orders can complete;
- `CLOVER_PAUSE_REGISTRATION`;
- `CLOVER_PAUSE_GUEST_ORDERS`;
- `CLOVER_PAUSE_UPLOADS` — checked before multer writes;
- `CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS` — global email/Telegram/push deny;
- `CLOVER_PAUSE_EMAIL`, `CLOVER_PAUSE_TELEGRAM`, `CLOVER_PAUSE_PUSH`.

Existing `ONEC_WRITE_ENABLED` and stored `allowDraftCreation` remain the separate
double gate for direct Clover-to-1C draft creation. MAX transport is not
implemented and is not represented as an operational switch.

## Verification

Run from `server/`:

```text
npm run test:security-stage9b-monitoring
npm run check
```

The verifier uses a temporary SQLite database and fake time, disables network,
checks exact threshold boundaries, sanitization, dedupe, escalation, recovery,
storm limits and proves that queue collection leaves database bytes and mtime
unchanged.

## Installation boundary

Files `ops/systemd/clover-monitor.service` and `.timer` are delivery artifacts
only. Stage 9B does not install, enable or start them. Before an approved install:

1. verify the deployment SHA and backup;
2. create/verify the locked `clover-monitor` account and its exclusive ownership
   of the state directory; do not grant it SQLite or backup ACLs;
3. review both `clover-monitor-snapshot.service` and `clover-monitor.service` and
   run fixtures on that exact SHA;
   follow `ops/systemd/INSTALL_MONITORING_PLAN.md` only after explicit approval;
4. install units, daemon-reload and enable the timer only after explicit approval;
5. inspect sanitized local output for 24 hours before enabling any external channel.

## Rollback

Application rollback is source-only: return to the prior Git SHA. If the timer was
installed in a later approved step, stop/disable the timer and restore the previous
unit files. No database migration, 1C change or data rollback is required by this
package. Runtime kill switches default to the pre-Stage-9B available state when
their variables are absent.
