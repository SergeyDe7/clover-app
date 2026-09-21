# Security Stage 3 Package 3 closeout

Source-controlled closeout for the production path-gate, DAC helper, and retention timer. This document is the install/rollback plan. It does **not** install, enable, start, chmod, or apply anything on production.

Stage 5 supersedes the timer target: scheduled executions are now dry-run only.
The apply service remains available for a separately approved manual run.

## Production path contract

Retention CLI (`server/scripts/run-audit-retention.mjs`) opens SQLite only after `assertRetentionDbPathAllowed`. `DatabaseSync` receives that canonical path. Dry-run is `readOnly`. Apply requires the literal flag `--apply`. The CLI does not import `db.js` / schema-ensure.

| Input | `CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION=1` | Result |
|-------|-----------------------------------------------|--------|
| Exact canonical live DB `<provenProductionRoot>/server/data/clover.sqlite` | no | `Refusing production DB_PATH` |
| Exact canonical live DB `/opt/clover/clover-app/server/data/clover.sqlite` when `repositoryRoot` is proven `/opt/clover/clover-app` and has no symlink/junction components | yes | allowed; canonical path is opened |
| Local worktree `server/data/*.sqlite` | yes or no | `Refusing worktree DB_PATH` |
| Other files under production `server/data/` | yes or no | denied |
| Symlink, junction, parent symlink, alias | yes or no | `Refusing symlink DB_PATH` |

Proven production repository root is exact `/opt/clover/clover-app` after `path.resolve`, with no symlink/junction path components. Production allow is not a general worktree bypass.

## Permissions install / dry-run / rollback

Fact-first baseline (confirmed production, not changed by this package):

- `/opt/clover` mode `701`; `server/data` and `one-c-preview` `755`
- DB / WAL / SHM / `clients-preview` / `products-preview` `644`
- backups already `700`/`600`
- `clover-api.service` and `clover-ui.service` run as `User=clover` / `Group=clover` and have no `UMask`
- nginx proxies `/uploads/` to the API, so uploads are not served from disk by nginx

Mechanism (source-controlled only):

1. Drop-in `ops/systemd/clover-api.service.d/10-umask.conf` → `UMask=0077` for **new** files created by `clover-api`.
2. Helper `server/scripts/run-runtime-permissions.mjs` for **existing** exact paths. Default dry-run. `--apply` is literal. Symlinks are skipped (no chmod-follow). `server/uploads` and `dist` are not targets.

Exact targets under the validated root:

- `server/data` and `server/data/one-c-preview` → `700`
- `server/data/clover.sqlite`, `-wal`, `-shm` → `600`
- `one-c-preview/clients-preview.json`, `products-preview.json` → `600`
- `server/backups` directory → `700` (children not walked)

Do not run these commands until a separate production approval. Before apply: backup, then dry-run.

Dry-run (read-only):

```bash
CLOVER_RUNTIME_PERMISSIONS_ALLOW_PRODUCTION=1 \
  node /opt/clover/clover-app/server/scripts/run-runtime-permissions.mjs \
  --root /opt/clover/clover-app
```

Install drop-in (separate approval; does not chmod existing files):

```bash
sudo mkdir -p /etc/systemd/system/clover-api.service.d
sudo cp /opt/clover/clover-app/ops/systemd/clover-api.service.d/10-umask.conf \
  /etc/systemd/system/clover-api.service.d/10-umask.conf
sudo systemctl daemon-reload
sudo systemctl restart clover-api
```

Apply existing modes (separate approval, after successful dry-run and backup):

```bash
CLOVER_RUNTIME_PERMISSIONS_ALLOW_PRODUCTION=1 \
  node /opt/clover/clover-app/server/scripts/run-runtime-permissions.mjs \
  --root /opt/clover/clover-app \
  --plan /opt/clover/recovery/runtime-permissions-plan.json \
  --apply
```

Postcheck:

```bash
CLOVER_RUNTIME_PERMISSIONS_ALLOW_PRODUCTION=1 \
  node /opt/clover/clover-app/server/scripts/run-runtime-permissions.mjs \
  --root /opt/clover/clover-app \
  --postcheck
```

Rollback permissions (uses the saved plan; no chown):

```bash
CLOVER_RUNTIME_PERMISSIONS_ALLOW_PRODUCTION=1 \
  node /opt/clover/clover-app/server/scripts/run-runtime-permissions.mjs \
  --rollback \
  --plan /opt/clover/recovery/runtime-permissions-plan.json
```

Rollback drop-in:

```bash
sudo rm -f /etc/systemd/system/clover-api.service.d/10-umask.conf
sudo systemctl daemon-reload
sudo systemctl restart clover-api
```

Do not `chmod`/`chown` by hand. Do not run the helper against a developer worktree.

## Retention timer install / enable / rollback

Units (not installed by this package):

- `ops/systemd/clover-audit-retention-dry-run.service` — no `--apply`
- `ops/systemd/clover-audit-retention-apply.service` — literal `--apply` only here
- `ops/systemd/clover-audit-retention.timer` — `Persistent=true`, `Unit=clover-audit-retention-dry-run.service`
- `scripts/linux/run-audit-retention.sh` — `umask 077`, non-blocking `flock`, no secrets. At commit: `git add --chmod=+x` so the blob is `100755` (ExecStart calls the script directly). Wrapper root is the real path of the script (`.../scripts/linux/run-audit-retention.sh` → repository root). `CLOVER_ROOT` is accepted only when it canonicalizes to that same root; otherwise it is rejected. `DB_PATH` is always `<validated-root>/server/data/clover.sqlite`. A symlink invocation does not take root from the symlink directory.

Contract:

- `User=clover`, `Group=clover` (same as `clover-api.service`)
- TTL `--max-age-days 365`
- `DB_PATH=<validated-root>/server/data/clover.sqlite` (production unit: `/opt/clover/clover-app/server/data/clover.sqlite`)
- `CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION=1`
- CLI JSON is aggregated (`scanned` / `wouldAnonymize` / `anonymized`); no PII
- Parallel runs refused via `Type=oneshot` + `flock -n` (busy → exit 75)
- No hidden API startup cleanup

Owner decision: proposed calendar is monthly `*-*-01 03:40:00` (after daily backup 03:15). Change `OnCalendar` only with approval.

Before any future enable or the first timer start:

1. Backup.
2. Successful production dry-run of the path-gate (this closeout supplies the gate; the dry-run itself still needs a separate production approval).
3. Verify that the installed timer targets `clover-audit-retention-dry-run.service`.

Copy units (does not enable):

```bash
sudo cp /opt/clover/clover-app/ops/systemd/clover-audit-retention-dry-run.service /etc/systemd/system/
sudo cp /opt/clover/clover-app/ops/systemd/clover-audit-retention-apply.service /etc/systemd/system/
sudo cp /opt/clover/clover-app/ops/systemd/clover-audit-retention.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

Manual dry-run after copy (separate approval):

```bash
sudo systemctl start clover-audit-retention-dry-run.service
```

Timer catch-up note: `Persistent=true` can immediately start a missed slot, but
the Stage 5 timer target is the dry-run service. Any manual start of
`clover-audit-retention-apply.service` remains a separate production database
action requiring explicit approval and a fresh backup.

Enable/start the dry-run timer (forbidden in this package; requires a later explicit approval):

```bash
sudo systemctl enable --now clover-audit-retention.timer
```

Rollback / disable:

```bash
sudo systemctl disable --now clover-audit-retention.timer
sudo systemctl stop clover-audit-retention-apply.service clover-audit-retention-dry-run.service
sudo rm -f /etc/systemd/system/clover-audit-retention.timer \
  /etc/systemd/system/clover-audit-retention-apply.service \
  /etc/systemd/system/clover-audit-retention-dry-run.service
sudo systemctl daemon-reload
```

## Accepted residuals (not a remote bypass)

These leftovers stay after Package 3. They are documented here so an operator who reads only this closeout sees them.

- **Hard-link residual.** `lstat` sees a regular file. A second name for the same inode is not excluded: `realpath` does not collapse a hard-link, and chmod / `DatabaseSync` operate on the inode. Path-gate and the DAC helper do not compare `nlink`.
- **Short TOCTOU.** There is a short window between path / `lstat` checks and `chmod` / `DatabaseSync` open. Apply re-`lstat`s and skips a symlink that appears in that window; a replacement of the same path with another regular file can still win the race.
- **Trusted rollback plan JSON.** `--rollback --plan` reads a file the operator supplies. Paths and relatives are re-validated against the exact allowlist and canonical root; `from` modes are not schema-limited. A tampered plan on an allowlisted relative can restore a wider mode. Keep the plan mode `600` and treat it as trusted.

These residuals do **not** give a remote bypass. Retention and the DAC helper are not started by the public API. The timer is not enabled by this package. Using a hard-link, winning the chmod/open race, or supplying a rollback plan requires a trusted local operator (or an already-local write) on the host filesystem next to the live files.

Mitigation already in this package: exact allowlist, canonical proven root, symlink/junction rejection, trusted plan path, backup before apply, and postcheck after apply.

## Residual production gates

These remain closed until a separate production approval:

- install/restart of the `UMask=0077` drop-in
- runtime-permissions dry-run/apply/postcheck on the live root
- retention production dry-run with allow
- copy/enable/start of retention units/timer
- commit / push / PR / merge / deploy / SSH / chmod / chown / DB / env / 1C
