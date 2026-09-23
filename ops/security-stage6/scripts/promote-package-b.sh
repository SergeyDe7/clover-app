#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ARTIFACT_ROOT=""
EXPECTED_MANIFEST=""
DEST_ROOT=""
TRUSTED_SOURCE_ROOT=""
EXPECTED_COMMIT=""
TRUSTED_VERIFIER=""
TRUSTED_RECOVERY_ROOT=""
PRODUCTION=0
TEST_BOOTSTRAP=0
ROLLBACK_ONLY=0
FAIL_AFTER_INSTALL=0
HOLD_AFTER_LOCK=0
HOLD_AFTER_INSTALL=0
HOLD_AFTER_SNAPSHOT=0
SIMULATE_NGINX_FAILURE=0
SELF_TERM_AFTER_INSTALL=0
ENFORCE_ROOT_BOOTSTRAP=0

usage() {
  echo "usage: $0 --artifact-root DIR --expected-manifest SHA256 --dest-root DIR [--production --trusted-source-root DIR --expected-commit SHA --trusted-recovery-root DIR --trusted-verifier FILE | --test-bootstrap] [--rollback]" >&2
  exit 64
}

while (($#)); do
  case "$1" in
    --artifact-root) ARTIFACT_ROOT=${2:-}; shift 2 ;;
    --expected-manifest) EXPECTED_MANIFEST=${2:-}; shift 2 ;;
    --dest-root) DEST_ROOT=${2:-}; shift 2 ;;
    --trusted-source-root) TRUSTED_SOURCE_ROOT=${2:-}; shift 2 ;;
    --expected-commit) EXPECTED_COMMIT=${2:-}; shift 2 ;;
    --trusted-verifier) TRUSTED_VERIFIER=${2:-}; shift 2 ;;
    --trusted-recovery-root) TRUSTED_RECOVERY_ROOT=${2:-}; shift 2 ;;
    --production) PRODUCTION=1; shift ;;
    --test-bootstrap) TEST_BOOTSTRAP=1; shift ;;
    --rollback) ROLLBACK_ONLY=1; shift ;;
    --fail-after-install) FAIL_AFTER_INSTALL=1; shift ;;
    --hold-after-lock) HOLD_AFTER_LOCK=${2:-}; shift 2 ;;
    --hold-after-install) HOLD_AFTER_INSTALL=${2:-}; shift 2 ;;
    --hold-after-snapshot) HOLD_AFTER_SNAPSHOT=${2:-}; shift 2 ;;
    --simulate-nginx-failure) SIMULATE_NGINX_FAILURE=1; shift ;;
    --self-term-after-install) SELF_TERM_AFTER_INSTALL=1; shift ;;
    --enforce-root-bootstrap) ENFORCE_ROOT_BOOTSTRAP=1; shift ;;
    *) usage ;;
  esac
done

[[ -n "$ARTIFACT_ROOT" && -n "$EXPECTED_MANIFEST" && -n "$DEST_ROOT" ]] || usage
[[ "$EXPECTED_MANIFEST" =~ ^[0-9a-f]{64}$ ]] || usage
[[ "$HOLD_AFTER_LOCK" =~ ^[0-9]+$ && "$HOLD_AFTER_INSTALL" =~ ^[0-9]+$ && "$HOLD_AFTER_SNAPSHOT" =~ ^[0-9]+$ ]] || usage
[[ -d "$DEST_ROOT" ]] || { echo "DEST_ROOT must already exist" >&2; exit 65; }
if [[ "$(uname -s)" == MINGW* ]]; then
  [[ "$DEST_ROOT" != /* && "$DEST_ROOT" != *":"* && "$DEST_ROOT" != ".." && "$DEST_ROOT" != ../* && "$DEST_ROOT" != */../* ]] || {
    echo "Windows dry-run DEST_ROOT must stay relative to the test workspace" >&2
    exit 65
  }
else
  DEST_ROOT=$(cd -- "$DEST_ROOT" && pwd -P)
fi

OPERATOR_REL="ops/security-stage6/scripts/promote-package-b.sh"
VERIFIER_REL="server/scripts/securityStage6Artifact.mjs"

if [[ "$DEST_ROOT" == "/" ]]; then
  ((PRODUCTION == 1 && TEST_BOOTSTRAP == 0)) || {
    echo "refusing live destination without trusted --production bootstrap" >&2
    exit 65
  }
  [[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40,64}$ ]] || usage
  [[ -n "$TRUSTED_SOURCE_ROOT" && -n "$TRUSTED_VERIFIER" && -n "$TRUSTED_RECOVERY_ROOT" ]] || usage
  ((FAIL_AFTER_INSTALL == 0 && HOLD_AFTER_LOCK == 0 && HOLD_AFTER_INSTALL == 0 && HOLD_AFTER_SNAPSHOT == 0 && SIMULATE_NGINX_FAILURE == 0 && SELF_TERM_AFTER_INSTALL == 0)) || usage
else
  ((PRODUCTION == 0)) || { echo "--production requires --dest-root /" >&2; exit 65; }
  if ((TEST_BOOTSTRAP == 0)); then
    [[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40,64}$ ]] || usage
    [[ -n "$TRUSTED_SOURCE_ROOT" && -n "$TRUSTED_VERIFIER" && -n "$TRUSTED_RECOVERY_ROOT" ]] || usage
  fi
fi

verify_git_blob() {
  local relative=$1
  local file=$2
  local expected actual resolved
  [[ ! -L "$file" && -f "$file" ]] || {
    echo "trusted bootstrap must be a regular non-link file: $relative" >&2
    exit 69
  }
  resolved=$(cd -- "$(dirname -- "$file")" && pwd -P)/$(basename -- "$file")
  expected=$(git_clean -C "$TRUSTED_SOURCE_ROOT" rev-parse "$EXPECTED_COMMIT:$relative")
  actual=$(git_clean -C "$TRUSTED_SOURCE_ROOT" hash-object --no-filters "$resolved")
  [[ "$actual" == "$expected" ]] || {
    echo "trusted bootstrap blob mismatch: $relative" >&2
    exit 69
  }
}

if ((TEST_BOOTSTRAP == 0)); then
  if ((PRODUCTION == 1)); then
    GIT_BIN=/usr/bin/git
    NODE_BIN=/usr/bin/node
  else
    GIT_BIN=$(command -v git)
    NODE_BIN=$(command -v node)
  fi
  [[ -x "$GIT_BIN" && -x "$NODE_BIN" ]] || { echo "absolute git/node binaries not found" >&2; exit 69; }
  git_clean() {
    env -i PATH=/usr/bin:/bin HOME=/root GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
      "$GIT_BIN" --no-replace-objects -c safe.directory="$TRUSTED_SOURCE_ROOT" "$@"
  }
  RECOVERY_REAL=$(cd -- "$TRUSTED_RECOVERY_ROOT" && pwd -P)
  OPERATOR_REAL=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/$(basename -- "${BASH_SOURCE[0]}")
  VERIFIER_REAL=$(cd -- "$(dirname -- "$TRUSTED_VERIFIER")" && pwd -P)/$(basename -- "$TRUSTED_VERIFIER")
  [[ "$(dirname -- "$OPERATOR_REAL")" == "$RECOVERY_REAL" ]] || { echo "operator is outside trusted recovery" >&2; exit 70; }
  [[ "$(dirname -- "$VERIFIER_REAL")" == "$RECOVERY_REAL" ]] || { echo "verifier is outside trusted recovery" >&2; exit 70; }
  if ((PRODUCTION == 1 || ENFORCE_ROOT_BOOTSTRAP == 1)); then
    for trusted_path in "$RECOVERY_REAL" "$OPERATOR_REAL" "$VERIFIER_REAL"; do
      [[ "$(stat -c '%u' "$trusted_path")" == "0" ]] || { echo "trusted recovery must be root-owned" >&2; exit 70; }
      trusted_mode=$(stat -c '%a' "$trusted_path")
      (( (8#$trusted_mode & 8#022) == 0 )) || { echo "trusted recovery is group/world-writable" >&2; exit 70; }
    done
  fi
  git_clean -C "$TRUSTED_SOURCE_ROOT" cat-file -e "$EXPECTED_COMMIT^{commit}"
  verify_git_blob "$OPERATOR_REL" "${BASH_SOURCE[0]}"
  verify_git_blob "$VERIFIER_REL" "$TRUSTED_VERIFIER"
  VERIFIER_BIN="$VERIFIER_REAL"
else
  NODE_BIN=$(command -v node)
  VERIFIER_BIN="$ARTIFACT_ROOT/$VERIFIER_REL"
fi

PREFIX=${DEST_ROOT%/}
[[ -n "$PREFIX" ]] || PREFIX=""
TARGET="$PREFIX/etc/nginx/snippets/clover-security-headers.conf"
BACKUP_PARENT="$PREFIX/var/backups/clover/security-stage6"
BACKUP_DIR="$BACKUP_PARENT/$EXPECTED_MANIFEST"
BACKUP_FILE="$BACKUP_DIR/clover-security-headers.conf.before"
BACKUP_SHA_FILE="$BACKUP_DIR/clover-security-headers.conf.before.sha256"
ABSENT_MARKER="$BACKUP_DIR/clover-security-headers.conf.absent"
SNAPSHOT_DIR="$BACKUP_DIR/artifact-snapshot"
LOCK_PARENT="$PREFIX/var/lock"
LOCK_FILE="$LOCK_PARENT/clover-security-stage6.lock"
LOCK_DIR="$LOCK_FILE.d"
LOCK_DIR_HELD=0
INSTALLED=0

mkdir -p -- "$LOCK_PARENT"
if ((PRODUCTION == 1)); then
  command -v flock >/dev/null 2>&1 || { echo "flock is required" >&2; exit 68; }
  exec 9>"$LOCK_FILE"
  flock -n 9 || { echo "another Stage 6 operation holds the deploy lock" >&2; exit 68; }
else
  mkdir -- "$LOCK_DIR" 2>/dev/null || {
    echo "another Stage 6 operation holds the deploy lock" >&2
    exit 68
  }
  LOCK_DIR_HELD=1
fi

cleanup_lock() {
  if ((LOCK_DIR_HELD == 1)); then
    rmdir -- "$LOCK_DIR" 2>/dev/null || true
    LOCK_DIR_HELD=0
  fi
}

restore_backup() {
  local expected actual
  if [[ -f "$BACKUP_FILE" && -f "$BACKUP_SHA_FILE" ]]; then
    expected=$(tr -d '[:space:]' < "$BACKUP_SHA_FILE")
    [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
    actual=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
    [[ "$actual" == "$expected" ]] || return 1
    cp --preserve=all -- "$BACKUP_FILE" "$TARGET" || return 1
    actual=$(sha256sum "$TARGET" | awk '{print $1}')
    [[ "$actual" == "$expected" ]] || return 1
  elif [[ -f "$ABSENT_MARKER" ]]; then
    rm -f -- "$TARGET" || return 1
    [[ ! -e "$TARGET" ]] || return 1
  else
    return 1
  fi
}

validate_and_reload() {
  if ((SIMULATE_NGINX_FAILURE == 1)); then
    return 1
  fi
  if ((PRODUCTION == 1)); then
    nginx -t && systemctl reload nginx.service
  fi
}

rollback_handler() {
  local status=$1
  local incomplete=0
  trap - ERR INT TERM
  set +e
  if ((INSTALLED == 1)); then
    restore_backup || incomplete=1
    if ((PRODUCTION == 1 && incomplete == 0)); then
      nginx -t && systemctl reload nginx.service || incomplete=1
    fi
  fi
  cleanup_lock
  if ((incomplete == 1)); then
    echo "SECURITY_STAGE6_ROLLBACK: INCOMPLETE manifest=$EXPECTED_MANIFEST" >&2
    exit 90
  fi
  if ((INSTALLED == 1)); then
    echo "SECURITY_STAGE6_ROLLBACK: PASS manifest=$EXPECTED_MANIFEST status=$status" >&2
  else
    echo "SECURITY_STAGE6_ROLLBACK: no destination change status=$status" >&2
  fi
  exit "$status"
}
trap 'rollback_handler $?' ERR
trap 'rollback_handler 130' INT
trap 'rollback_handler 143' TERM

if ((HOLD_AFTER_LOCK > 0)); then
  sleep "$HOLD_AFTER_LOCK"
fi

if ((ROLLBACK_ONLY == 1)); then
  if ! restore_backup; then
    cleanup_lock
    echo "SECURITY_STAGE6_ROLLBACK: INCOMPLETE trusted backup missing or corrupt" >&2
    exit 90
  fi
  if ! validate_and_reload; then
    cleanup_lock
    echo "SECURITY_STAGE6_ROLLBACK: INCOMPLETE validation or reload failed" >&2
    exit 91
  fi
  cleanup_lock
  trap - ERR INT TERM
  echo "SECURITY_STAGE6_ROLLBACK: PASS manifest=$EXPECTED_MANIFEST target=$TARGET"
  exit 0
fi

mkdir -p -- "$BACKUP_PARENT"
mkdir -- "$BACKUP_DIR" 2>/dev/null || {
  echo "recovery directory already exists: $BACKUP_DIR" >&2
  false
}
"$NODE_BIN" "$VERIFIER_BIN" snapshot "$ARTIFACT_ROOT" "$EXPECTED_MANIFEST" "$SNAPSHOT_DIR"
if ((HOLD_AFTER_SNAPSHOT > 0)); then
  sleep "$HOLD_AFTER_SNAPSHOT"
fi
# Detect mutation during snapshot preparation. Installation itself reads only
# from the checked recovery snapshot, never from the mutable artifact.
"$NODE_BIN" "$VERIFIER_BIN" verify "$ARTIFACT_ROOT" "$EXPECTED_MANIFEST"
SOURCE="$SNAPSHOT_DIR/ops/security-stage6/package-b/nginx/clover-security-headers.conf"
mkdir -p -- "$(dirname "$TARGET")"

if [[ -e "$TARGET" ]]; then
  cp --preserve=all -- "$TARGET" "$BACKUP_FILE"
  sha256sum "$BACKUP_FILE" | awk '{print $1}' > "$BACKUP_SHA_FILE"
else
  : > "$ABSENT_MARKER"
fi

install -m 0644 -- "$SOURCE" "$TARGET.stage6-new"
[[ "$(sha256sum "$SOURCE" | awk '{print $1}')" == "$(sha256sum "$TARGET.stage6-new" | awk '{print $1}')" ]]
INSTALLED=1
mv -f -- "$TARGET.stage6-new" "$TARGET"

if ((HOLD_AFTER_INSTALL > 0)); then
  sleep "$HOLD_AFTER_INSTALL"
fi
if ((SELF_TERM_AFTER_INSTALL == 1)); then
  kill -TERM $$
fi
if ((FAIL_AFTER_INSTALL == 1)); then
  false
fi
validate_and_reload

cleanup_lock
trap - ERR INT TERM
echo "SECURITY_STAGE6_PROMOTE_PACKAGE_B: PASS manifest=$EXPECTED_MANIFEST target=$TARGET"
