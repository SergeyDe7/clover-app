#!/usr/bin/env bash
# Wrapper for audit retention CLI: umask 077 + non-blocking flock.
# Does not enable systemd timers. Does not print PII. No secrets.
set -euo pipefail

umask 077

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: flock is required for run-audit-retention.sh (refusing unlocked run)" >&2
  exit 1
fi

ROOT="${CLOVER_ROOT:-/opt/clover/clover-app}"
LOCK_FILE="${CLOVER_AUDIT_RETENTION_LOCK:-$ROOT/server/data/.audit-retention.lock}"
DB_PATH="${DB_PATH:-$ROOT/server/data/clover.sqlite}"
export DB_PATH

mkdir -p "$(dirname "$LOCK_FILE")"
if [[ -e "$LOCK_FILE" || -L "$LOCK_FILE" ]]; then
  if [[ -L "$LOCK_FILE" || ! -f "$LOCK_FILE" ]]; then
    echo "ERROR: lock is not a regular file" >&2
    exit 1
  fi
fi
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo '{"dryRun":true,"apply":false,"skipped":"already-running"}' >&2
  exit 75
fi

exec /usr/bin/node "$ROOT/server/scripts/run-audit-retention.mjs" "$@"
