#!/usr/bin/env bash
# Ставит user-crontab clover: ежедневный backup в 03:15.
set -euo pipefail

ROOT="${CLOVER_ROOT:-/opt/clover/clover-app}"
SCRIPT="$ROOT/scripts/linux/daily-backup.sh"
LOG_DIR="$ROOT/server/backups/daily"
MARKER="clover-daily-backup"

chmod +x "$SCRIPT"
mkdir -p "$LOG_DIR"

# Маркер только в хвосте-комментарии, иначе `#` обрежет команду.
CRON_LINE="15 3 * * * CLOVER_ROOT=$ROOT $SCRIPT >>$LOG_DIR/cron.log 2>&1 # $MARKER"

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$MARKER" >"$TMP" || true
printf '%s\n' "$CRON_LINE" >>"$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Installed crontab:"
crontab -l | grep "$MARKER"
echo "Test run:"
CLOVER_ROOT="$ROOT" "$SCRIPT"
