#!/usr/bin/env bash
# Ежедневный backup: SQLite/data + .env (+ опционально полный zip через Node).
set -euo pipefail

ROOT="${CLOVER_ROOT:-/opt/clover/clover-app}"
SERVER="$ROOT/server"
OUT_DIR="${CLOVER_BACKUP_DIR:-$SERVER/backups/daily}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${CLOVER_BACKUP_KEEP_DAYS:-14}"

mkdir -p "$OUT_DIR"

ARCHIVE="$OUT_DIR/clover-data-env.$STAMP.tgz"

tar -czf "$ARCHIVE" \
  -C "$SERVER" \
  --exclude='data/backups' \
  data \
  .env

# Полный zip со снимком БД и фото (если Node доступен)
if [[ -x /usr/bin/node || -n "$(command -v node)" ]]; then
  (
    cd "$SERVER"
    node scripts/create-scheduled-backup.mjs >/dev/null
  ) || echo "WARN: create-scheduled-backup.mjs failed" >&2
fi

# Ротация tarball'ов data+.env
find "$OUT_DIR" -type f -name 'clover-data-env.*.tgz' -mtime +"$KEEP_DAYS" -delete

echo "OK: $ARCHIVE ($(du -h "$ARCHIVE" | awk '{print $1}'))"
