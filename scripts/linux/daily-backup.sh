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
# Полный zip со снимком БД и фото (если Node доступен).
# Используем scripts из репозитория, откуда вызван этот файл; данные — из CLOVER_ROOT.
if [[ -x /usr/bin/node || -n "$(command -v node)" ]]; then
  (
    export DB_PATH="${DB_PATH:-$SERVER/data/clover.sqlite}"
    export CLOVER_SERVER_BACKUP_DIR="$BACKUP_ROOT"
    export CLOVER_UPLOADS_DIR="${CLOVER_UPLOADS_DIR:-$SERVER/uploads}"
    mkdir -p "$CLOVER_UPLOADS_DIR"
    chmod 700 "$CLOVER_UPLOADS_DIR" 2>/dev/null || true
    node "$REPO_ROOT/server/scripts/create-scheduled-backup.mjs" >/dev/null
  ) || echo "WARN: create-scheduled-backup.mjs failed" >&2
fi

# Ротация tarball'ов data+.env (внутри того же lock)
find "$OUT_DIR" -type f -name 'clover-data-env.*.tgz' -mtime +"$KEEP_DAYS" -delete

echo "OK: $ARCHIVE ($(du -h "$ARCHIVE" | awk '{print $1}'))"
