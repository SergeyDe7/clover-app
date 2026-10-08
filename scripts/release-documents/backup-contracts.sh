#!/usr/bin/env bash
# Local preparation only. Install as a separate reviewed backup job after approval.
# Includes entire SQLite snapshot and all referenced private contracts files.
set -euo pipefail
umask 077
[[ $# == 5 ]] || { echo 'Usage: backup-contracts.sh <app-root> <db> <private-storage> <output-dir> <private-temp>'; exit 2; }
root="$(realpath "$1")"; database="$(realpath "$2")"; storage="$(realpath "$3")"; output="$(realpath "$4")"; temporary="$(realpath "$5")"
for target in "$storage" "$output" "$temporary"; do
 case "$target/" in "$root/dist/"*|"$root/public/"*|"$root/server/uploads/"*) echo 'PRIVATE_PATH_REQUIRED'; exit 2;; esac
 [[ -d "$target" ]] || exit 2
done
[[ "$output" != "$storage" && "$temporary" != "$storage" ]] || exit 2
command -v flock >/dev/null
exec 9>"$output/.contracts-backup.lock"
flock -n 9 || { echo 'SKIP: contracts backup already running'; exit 0; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
node "$root/server/scripts/backup-documents.mjs" --db "$database" --storage "$storage" --out "$output/contracts-$stamp.zip" --temp "$temporary"
# No automatic deletion or retention here; operator chooses a reviewed retention policy.
