#!/usr/bin/env bash
# Ежедневный backup: SQLite/data + .env (+ опционально полный zip через Node).
# Linux: umask 077 + non-blocking flock на весь job (TGZ + scheduled ZIP + retention).
set -euo pipefail

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: flock is required for daily-backup.sh (refusing unlocked run)" >&2
  exit 1
fi

umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

ROOT="${CLOVER_ROOT:-/opt/clover/clover-app}"
SERVER="$ROOT/server"
OUT_DIR="${CLOVER_BACKUP_DIR:-$SERVER/backups/daily}"
BACKUP_ROOT="${CLOVER_SERVER_BACKUP_DIR:-$SERVER/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${CLOVER_BACKUP_KEEP_DAYS:-14}"
LOCK_FILE="${CLOVER_BACKUP_LOCK_FILE:-$BACKUP_ROOT/.daily-backup.lock}"
EVIDENCE_DIR="/var/lib/clover-monitor-evidence"
BACKUP_EVIDENCE="${EVIDENCE_DIR}/backup-evidence.json"
EVIDENCE_WRITER="/opt/clover/clover-app/server/scripts/write-monitor-evidence.mjs"
if [[ -n "${CLOVER_MONITOR_FIXTURE_ROOT:-}" ]]; then
  FIXTURE_ROOT="$(realpath -e -- "${CLOVER_MONITOR_FIXTURE_ROOT}")"
  EVIDENCE_DIR="$(realpath -m -- "${CLOVER_MONITOR_EVIDENCE_DIR:-${FIXTURE_ROOT}/evidence}")"
  BACKUP_EVIDENCE="$(realpath -m -- "${CLOVER_MONITOR_BACKUP_EVIDENCE:-${EVIDENCE_DIR}/backup-evidence.json}")"
  EVIDENCE_WRITER="$(realpath -m -- "${CLOVER_MONITOR_EVIDENCE_WRITER:-${FIXTURE_ROOT}/server/scripts/write-monitor-evidence.mjs}")"
  for fixture_path in "${EVIDENCE_DIR}" "${BACKUP_EVIDENCE}" "${EVIDENCE_WRITER}"; do
    [[ "${fixture_path}" == "${FIXTURE_ROOT}"/* ]] || { echo "ERROR: monitor fixture path escapes fixture root" >&2; exit 2; }
  done
fi
# Producer contract: write-monitor-evidence.mjs backup; canonical production path,
# overrides require a contained fixture root.
MONITOR_ENVIRONMENT="${CLOVER_MONITOR_ENVIRONMENT:-production}"

mkdir -p "$BACKUP_ROOT" "$OUT_DIR"
chmod 700 "$BACKUP_ROOT" "$OUT_DIR"

# FD 9 held for script lifetime; released automatically on any exit.
exec 9>"$LOCK_FILE"
chmod 600 "$LOCK_FILE"
if ! flock -n 9; then
  echo "SKIP: daily backup already running (lock busy: $LOCK_FILE)" >&2
  exit 0
fi

ARCHIVE="$OUT_DIR/clover-data-env.$STAMP.tgz"
TMP_ARCHIVE="${ARCHIVE}.tmp.$$"
RESTORE_FIXTURE=""
EVIDENCE_WRITTEN=0

write_backup_failure_evidence() {
  [[ "${EVIDENCE_WRITTEN}" -eq 0 && -f "${EVIDENCE_WRITER}" && -d "${EVIDENCE_DIR}" ]] || return 0
  node "${EVIDENCE_WRITER}" backup --out "${BACKUP_EVIDENCE}" \
    --environment "${MONITOR_ENVIRONMENT}" --result failed --archive-size 0 \
    --integrity-ok false --restore-ok false --completed-at "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
    >/dev/null 2>&1 || true
}

cleanup_backup_fixture() {
  local rc=$?
  if [[ -n "${RESTORE_FIXTURE}" && -d "${RESTORE_FIXTURE}" ]]; then
    rm -rf -- "${RESTORE_FIXTURE}"
  fi
  if [[ "${rc}" -ne 0 ]]; then
    write_backup_failure_evidence
  fi
}
trap cleanup_backup_fixture EXIT

tar -czf "$TMP_ARCHIVE" \
  -C "$SERVER" \
  --exclude='data/backups' \
  data \
  .env || {
  rm -f "$TMP_ARCHIVE"
  exit 1
}
chmod 600 "$TMP_ARCHIVE"
mv -f "$TMP_ARCHIVE" "$ARCHIVE"

# The evidence binds a readable archive to an isolated restore fixture. No
# restored data is executed and the fixture is removed before the job exits.
tar -tzf "$ARCHIVE" >/dev/null
RESTORE_FIXTURE="$(mktemp -d "${BACKUP_ROOT}/.restore-fixture.XXXXXX")"
chmod 700 "${RESTORE_FIXTURE}"
tar -xzf "$ARCHIVE" -C "${RESTORE_FIXTURE}" --no-same-owner
[[ -d "${RESTORE_FIXTURE}/data" && -f "${RESTORE_FIXTURE}/.env" ]]
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
node "${EVIDENCE_WRITER}" backup --out "${BACKUP_EVIDENCE}" \
  --environment "${MONITOR_ENVIRONMENT}" --result success --archive "$ARCHIVE" \
  --integrity-ok true --restore-ok true --completed-at "${COMPLETED_AT}"
EVIDENCE_WRITTEN=1
rm -rf -- "${RESTORE_FIXTURE}"
RESTORE_FIXTURE=""
# Полный zip со снимком БД и фото (если Node доступен).
# Используем scripts из репозитория, откуда вызван этот файл; данные — из CLOVER_ROOT.
if [[ -x /usr/bin/node || -n "$(command -v node)" ]]; then
  (
    export DB_PATH="${DB_PATH:-$SERVER/data/clover.sqlite}"
    export CLOVER_SERVER_BACKUP_DIR="$BACKUP_ROOT"
    export CLOVER_UPLOADS_DIR="${CLOVER_UPLOADS_DIR:-$SERVER/uploads}"
    mkdir -p "$CLOVER_UPLOADS_DIR"
    node "$REPO_ROOT/server/scripts/create-scheduled-backup.mjs" >/dev/null
  ) || echo "WARN: create-scheduled-backup.mjs failed" >&2
fi

# Ротация tarball'ов data+.env (внутри того же lock)
find "$OUT_DIR" -type f -name 'clover-data-env.*.tgz' -mtime +"$KEEP_DAYS" -delete

echo "OK: $ARCHIVE ($(du -h "$ARCHIVE" | awk '{print $1}'))"
