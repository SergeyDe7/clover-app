#!/usr/bin/env bash
# Wrapper for audit retention CLI: umask 077 + non-blocking flock.
# Does not enable systemd timers. Does not print PII. No secrets.
# Repository root comes from this script's real path. CLOVER_ROOT cannot
# select another tree. DB_PATH is always <validated-root>/server/data/clover.sqlite.
set -euo pipefail

umask 077

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

to_posix_abs() {
  local probe="${1//\\//}"
  if [[ "$probe" =~ ^[A-Za-z]:/ ]]; then
    local drive="${probe:0:1}"
    local rest="${probe:3}"
    printf '/%s/%s\n' "$(printf '%s' "$drive" | tr '[:upper:]' '[:lower:]')" "$rest"
  else
    printf '%s\n' "$probe"
  fi
}

resolve_canonical() {
  local candidate="$1"
  local resolved=""
  if command -v realpath >/dev/null 2>&1; then
    resolved="$(realpath -e -- "$candidate" 2>/dev/null || realpath -- "$candidate")" || fail "cannot resolve path"
  elif command -v readlink >/dev/null 2>&1 && readlink -f -- / >/dev/null 2>&1; then
    resolved="$(readlink -f -- "$candidate")" || fail "cannot resolve path"
  else
    fail "realpath or readlink -f is required"
  fi
  [[ -n "$resolved" ]] || fail "cannot resolve path"
  to_posix_abs "$resolved"
}

assert_regular_file() {
  local probe="$1"
  if [[ -L "$probe" || ! -f "$probe" ]]; then
    fail "wrapper is not a regular file"
  fi
}

assert_no_symlink_components() {
  local probe="$1"
  local current=""
  local rest=""
  local part=""
  [[ "$probe" == /* ]] || fail "path is not absolute"
  current="/"
  rest="${probe#/}"
  while [[ -n "$rest" ]]; do
    part="${rest%%/*}"
    if [[ "$rest" == */* ]]; then
      rest="${rest#*/}"
    else
      rest=""
    fi
    [[ -z "$part" ]] && continue
    [[ "$part" == ".." ]] && fail "refusing path escape"
    if [[ "$current" == "/" ]]; then
      current="/$part"
    else
      current="$current/$part"
    fi
    if [[ -L "$current" ]]; then
      fail "refusing symlink wrapper/path"
    fi
  done
}

WRAPPER_INVOKED="${BASH_SOURCE[0]}"
[[ -n "$WRAPPER_INVOKED" ]] || fail "missing wrapper path"
if [[ "$WRAPPER_INVOKED" != /* && ! "$WRAPPER_INVOKED" =~ ^[A-Za-z]:[\\/] ]]; then
  WRAPPER_INVOKED="$(cd -- "$(dirname -- "$WRAPPER_INVOKED")" && pwd -P)/$(basename -- "$WRAPPER_INVOKED")"
fi

# Follow the wrapper inode so a symlink invocation cannot take ROOT from
# the symlink directory. The real path must then be a regular file with
# no remaining symlink components.
WRAPPER_REAL="$(resolve_canonical "$WRAPPER_INVOKED")"
assert_regular_file "$WRAPPER_REAL"
assert_no_symlink_components "$WRAPPER_REAL"

WRAPPER_DIR="$(dirname -- "$WRAPPER_REAL")"
WRAPPER_NAME="$(basename -- "$WRAPPER_REAL")"
[[ "$WRAPPER_NAME" == "run-audit-retention.sh" ]] || fail "unexpected wrapper name"
[[ "$(basename -- "$WRAPPER_DIR")" == "linux" ]] || fail "unexpected wrapper directory"
SCRIPTS_DIR="$(dirname -- "$WRAPPER_DIR")"
[[ "$(basename -- "$SCRIPTS_DIR")" == "scripts" ]] || fail "unexpected wrapper directory"
ROOT="$(resolve_canonical "$(dirname -- "$SCRIPTS_DIR")")"
assert_no_symlink_components "$ROOT"

if [[ -n "${CLOVER_ROOT:-}" ]]; then
  OVERRIDE="$(resolve_canonical "$CLOVER_ROOT")" || fail "CLOVER_ROOT does not match wrapper repository root"
  if [[ "$OVERRIDE" != "$ROOT" ]]; then
    fail "CLOVER_ROOT does not match wrapper repository root"
  fi
fi

export DB_PATH="$ROOT/server/data/clover.sqlite"
LOCK_FILE="${CLOVER_AUDIT_RETENTION_LOCK:-$ROOT/server/data/.audit-retention.lock}"

if [[ "${CLOVER_AUDIT_RETENTION_RESOLVE_ONLY:-}" == "1" ]]; then
  printf '%s\n' "{\"root\":\"$ROOT\",\"dbPath\":\"$DB_PATH\"}"
  exit 0
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: flock is required for run-audit-retention.sh (refusing unlocked run)" >&2
  exit 1
fi

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
