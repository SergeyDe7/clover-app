#!/usr/bin/env bash
# Source-controlled Package A operator. Not permission to run on production.
# Launch only via the two-phase TTY command in PROMOTE_ROLLBACK.md:
#   sudo /bin/bash -c '<fixed bootstrap>' -- \
#     --target <EXTERNAL_TARGET> \
#     --expected-manifest <EXTERNAL_MANIFEST_SHA256> \
#     --artifact <ABS_ARTIFACT>
# The bootstrap writes this file into a new root-owned recovery directory,
# compares git hash-object --no-filters to $TARGET:path, then executes
# /bin/bash <root-owned-operator>. Never pipe git show into bash -s.
# Rejected remote SHA ba0a3c3e57d2bd01c94046dab81aded4e10c2df1566038b02a19be6c498a4f50
# must never be executed.
#
# Exit codes:
#   0  PASS
#   2  TTY/root gate
#  10  lock busy
#  20  explicit pre-change failure
#  40  promote failed after change; rollback completed
#  41  rollback incomplete
# Other nonzero: original unexpected error before the first change.

set -Eeuo pipefail

umask 0077

readonly EXIT_PASS=0
readonly EXIT_SUDO=2
readonly EXIT_LOCK=10
readonly EXIT_PRE=20
readonly EXIT_PROMOTE_FAIL=40
readonly EXIT_ROLLBACK_INCOMPLETE=41

readonly DEFAULT_ROOT=/opt/clover/clover-app
readonly DEFAULT_LIVE=1fdd7e6ac715f55e407d71a225e5a6037eb9d2e8
readonly DEFAULT_LOCK=/opt/clover/deployments/deploy.lock
readonly OPERATOR_REL=ops/security-stage5/scripts/promote-package-a.sh
if [ -x /usr/bin/git ]; then
  readonly TRUSTED_GIT=/usr/bin/git
elif [ -x /mingw64/bin/git ]; then
  readonly TRUSTED_GIT=/mingw64/bin/git
else
  readonly TRUSTED_GIT=/usr/bin/git
fi

TARGET=""
EXPECTED_MANIFEST=""
ARTIFACT=""
ROOT="$DEFAULT_ROOT"
LIVE="$DEFAULT_LIVE"
LOCK="$DEFAULT_LOCK"
DEST_ROOT=""
RECOVERY_ARG=""

CHANGED=0
ROLLBACK_RUNNING=0
IN_CLEANUP=0
LOCK_HELD=0
ORIG_EXIT=0
RECOVERY=""
SNAPSHOT=""
PROMOTE_LOG=""
ROLLBACK_STATE=NOT_NEEDED
PRE_TIMER_UNIT=""
PRE_API_RELEASE=""
PRE_UI_TAG=""
PRE_UI_SHA=""
PRE_NGX_PID=""
UMASK_SHA=""
UMASK_FILE=""
SNAP_API=""
SNAP_UI=""
SNAP_TIMER=""
DST_API=""
DST_UI=""
DST_TIMER=""
DIR_API=""
DIR_UI=""

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    printf '%s\n' "ROOT GATE: FAIL" >&2
    exit "$EXIT_SUDO"
  fi
}

require_tty() {
  if [ ! -t 1 ] || [ ! -t 2 ]; then
    printf '%s\n' "TTY GATE: FAIL (stdout/stderr)" >&2
    exit "$EXIT_SUDO"
  fi
  if [ ! -e /dev/tty ] || [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
    printf '%s\n' "TTY GATE: FAIL (/dev/tty)" >&2
    exit "$EXIT_SUDO"
  fi
}

trusted_git() {
  if [ ! -x "$TRUSTED_GIT" ]; then
    printf '%s\n' "FAIL: /usr/bin/git missing" >&2
    return 1
  fi
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_OBJECT_DIRECTORY \
    -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_INDEX_FILE \
    -u GIT_NAMESPACE -u GIT_COMMON_DIR -u GIT_REPLACE_REF_BASE \
    "$TRUSTED_GIT" --no-replace-objects -C "$ROOT" "$@"
}

require_sha256() {
  local label="$1" value="$2"
  if [ -z "$value" ] || ! printf '%s' "$value" | grep -Eq '^[0-9a-f]{64}$'; then
    printf '%s\n' "FAIL: empty or invalid SHA-256 for $label" >&2
    return 1
  fi
}

require_sha256_upper() {
  local label="$1" value="$2"
  if [ -z "$value" ] || ! printf '%s' "$value" | grep -Eq '^[0-9A-F]{64}$'; then
    printf '%s\n' "FAIL: empty or invalid uppercase SHA-256 for $label" >&2
    return 1
  fi
}

sha_file() {
  local path="$1" hash
  if ! test -f "$path" || test -L "$path"; then
    printf '%s\n' "FAIL: not a regular file $path" >&2
    return 1
  fi
  hash=$(sha256sum -- "$path" | awk '{print $1}')
  require_sha256 "$path" "$hash"
  printf '%s\n' "$hash"
}

git_blob_sha() {
  local spec="$1" hash
  hash=$(trusted_git show "$spec" | sha256sum | awk '{print $1}')
  require_sha256 "$spec" "$hash"
  [ -n "$hash" ] || return 1
  printf '%s\n' "$hash"
}

git_blob_id() {
  local spec="$1" oid
  oid=$(trusted_git rev-parse --verify "$spec")
  if [ -z "$oid" ] || ! printf '%s' "$oid" | grep -Eq '^[0-9a-f]{40}$'; then
    printf '%s\n' "FAIL: empty or invalid git object id for $spec" >&2
    return 1
  fi
  printf '%s\n' "$oid"
}

file_blob_id() {
  local path="$1" oid
  oid=$(trusted_git hash-object --no-filters -- "$path")
  if [ -z "$oid" ] || ! printf '%s' "$oid" | grep -Eq '^[0-9a-f]{40}$'; then
    printf '%s\n' "FAIL: empty or invalid hash-object for $path" >&2
    return 1
  fi
  printf '%s\n' "$oid"
}

require_trusted_recovery() {
  local expected="$1"
  case "$expected" in
    /*) ;;
    *) fail_before "recovery must be an absolute path" ;;
  esac
  [ "$RECOVERY" = "$expected" ] || fail_before "recovery path mismatch"
  if test -L "$RECOVERY"; then
    fail_before "recovery must not be a symlink"
  fi
  [ -d "$RECOVERY" ] || fail_before "recovery is not a directory"
  [ "$(stat -c '%F' "$RECOVERY")" = "directory" ] || fail_before "recovery is not a directory"
  local uidgid mode
  uidgid=$(stat -c '%u:%g' "$RECOVERY")
  mode=$(stat -c '%a' "$RECOVERY")
  [ "$uidgid" = "0:0" ] || fail_before "recovery owner $uidgid"
  [ "$mode" = "700" ] || [ "$mode" = "0700" ] || fail_before "recovery mode $mode"
}

require_trusted_self() {
  local self="${BASH_SOURCE[0]:-}"
  if [ -z "$self" ]; then
    fail_before "BASH_SOURCE missing; stdin/source launch is forbidden"
  fi
  case "$self" in
    /*) ;;
    *) fail_before "operator path must be absolute" ;;
  esac
  if [ "$self" != "$0" ]; then
    fail_before "operator must be executed as a file, not sourced or piped"
  fi
  case "$0" in
    bash|-bash|/bin/bash|/usr/bin/bash) fail_before "bash -s/stdin launch is forbidden" ;;
  esac
  if test -L "$self" || ! test -f "$self"; then
    fail_before "operator is not a regular non-symlink file"
  fi
  local owner mode nlink
  owner=$(stat -c '%U:%G' "$self")
  mode=$(stat -c '%a' "$self")
  nlink=$(stat -c '%h' "$self")
  [ "$owner" = "root:root" ] || fail_before "operator owner $owner"
  [ "$mode" = "500" ] || [ "$mode" = "0500" ] || fail_before "operator mode $mode"
  [ "$nlink" = "1" ] || fail_before "operator nlink $nlink"
  case "$self" in
    "$RECOVERY"/*) ;;
    *) fail_before "operator is outside recovery" ;;
  esac
  case "$self" in
    */artifact/*|*/ops/security-stage5/scripts/promote-package-a.sh)
      fail_before "worktree/artifact operator path is forbidden"
      ;;
  esac
  local expected_oid copy_oid
  expected_oid=$(git_blob_id "${TARGET}:${OPERATOR_REL}")
  copy_oid=$(file_blob_id "$self")
  [ "$copy_oid" = "$expected_oid" ] || fail_before "operator blob id mismatch"
}

log() {
  if [ -n "${PROMOTE_LOG:-}" ]; then
    printf '%s\n' "$*" | tee -a "$PROMOTE_LOG"
  else
    printf '%s\n' "$*"
  fi
}

# Runbook helpers. They must exit 1 on error and must not rely on caller set -e.
backup_exact() {
  destination="$1"
  key="$2"
  if test -e "$destination"; then
    if ! cp --preserve=all -- "$destination" "$RECOVERY/$key"; then
      echo "FAIL: could not backup $destination" >&2
      exit 1
    fi
    if ! sha256sum "$RECOVERY/$key" | tee "$RECOVERY/$key.sha256" >/dev/null; then
      echo "FAIL: could not hash backup $key" >&2
      exit 1
    fi
    if ! test -s "$RECOVERY/$key.sha256"; then
      echo "FAIL: empty backup hash $key" >&2
      exit 1
    fi
  else
    if ! touch "$RECOVERY/$key.absent"; then
      echo "FAIL: could not write absent marker $key" >&2
      exit 1
    fi
    if ! test -e "$RECOVERY/$key.absent"; then
      echo "FAIL: absent marker missing after create $key" >&2
      exit 1
    fi
  fi
}

restore_exact() {
  destination="$1"
  key="$2"
  if test -e "$RECOVERY/$key.absent"; then
    if ! rm -f -- "$destination"; then
      echo "FAIL: could not remove absent destination $destination" >&2
      exit 1
    fi
  else
    if ! (cd "$RECOVERY" && sha256sum -c "$key.sha256"); then
      echo "FAIL: backup hash check failed for $key" >&2
      exit 1
    fi
    if ! cp --preserve=all -- "$RECOVERY/$key" "$destination"; then
      echo "FAIL: could not restore $destination" >&2
      exit 1
    fi
  fi
}

ensure_destination_dir() {
  destination="$1"
  key="$2"
  mode="$3"
  marker="$RECOVERY/$key.dir-created"
  if [ "$mode" != "0755" ]; then
    echo "FAIL: directory create mode must be 0755, got $mode" >&2
    exit 1
  fi
  if test -e "$marker"; then
    echo "FAIL: recovery marker already exists for $key" >&2
    exit 1
  fi
  if test -L "$destination"; then
    echo "FAIL: $destination exists and is a symlink" >&2
    exit 1
  fi
  if test -e "$destination"; then
    if test -d "$destination"; then
      return 0
    fi
    echo "FAIL: $destination exists and is not a directory" >&2
    exit 1
  fi
  if ! install -d -m "$mode" -- "$destination"; then
    echo "FAIL: could not create directory $destination" >&2
    exit 1
  fi
  if ! touch -- "$marker"; then
    echo "FAIL: could not write directory marker $marker" >&2
    rmdir -- "$destination"
    exit 1
  fi
  if ! test -e "$marker"; then
    echo "FAIL: directory marker missing after create $marker" >&2
    rmdir -- "$destination"
    exit 1
  fi
}

rollback_created_dir() {
  destination="$1"
  key="$2"
  marker="$RECOVERY/$key.dir-created"
  if ! test -e "$marker"; then
    return 0
  fi
  if ! rmdir -- "$destination"; then
    echo "FAIL: $destination is not empty or not a directory; leftover entries were not deleted; marker kept" >&2
    exit 1
  fi
  if ! rm -f -- "$marker"; then
    echo "FAIL: could not remove directory marker $marker after rmdir" >&2
    exit 1
  fi
}

wait_active() {
  local unit="$1" tries=40 i as ss
  for i in $(seq 1 "$tries"); do
    as=$(systemctl show "$unit" -p ActiveState --value)
    ss=$(systemctl show "$unit" -p SubState --value)
    if [ "$as" = active ] && [ "$ss" = running ]; then
      return 0
    fi
    sleep 1
  done
  log "WAIT_FAIL $unit as=${as:-} ss=${ss:-}"
  return 1
}

api_health() {
  local out="$RECOVERY/api-health.json"
  curl -fsS --connect-timeout 2 --max-time 8 -o "$out" http://127.0.0.1:4100/api/health
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); sys.exit(0 if d.get("ok") is True else 1)' "$out"
}

capture_api_release() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); print(str(d.get("releaseId") or d.get("version") or ""))' "$RECOVERY/api-health.json"
}

capture_ui_identity() {
  local html="$1"
  python3 -c '
import hashlib, re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
tags = re.findall(r"ui-[A-Za-z0-9]+", text)
print(tags[0] if tags else "")
print(hashlib.sha256(text.encode("utf-8", "replace")).hexdigest())
' "$html"
}

ui_fetch() {
  curl -fsS --connect-timeout 2 --max-time 8 -o "$1" http://127.0.0.1:5273/
}

ngx_health() {
  local out="$RECOVERY/ngx-health.json"
  curl -fsS --connect-timeout 3 --max-time 8 -k --resolve clover-spb.ru:443:127.0.0.1 \
    -o "$out" https://clover-spb.ru/api/health
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); sys.exit(0 if d.get("ok") is True else 1)' "$out"
}

release_lock() {
  if [ "$LOCK_HELD" = 1 ]; then
    flock -u 9 || true
    LOCK_HELD=0
    log "LOCK_RELEASED"
  fi
}

cleanup() {
  if [ "$IN_CLEANUP" = 1 ]; then
    return 0
  fi
  IN_CLEANUP=1
  release_lock
}

fail_before() {
  log "FAIL_BEFORE_CHANGE: $*"
  ROLLBACK_STATE=NOT_NEEDED
  exit "$EXIT_PRE"
}

disable_recursive_traps() {
  trap - ERR
  trap 'exit '"$EXIT_ROLLBACK_INCOMPLETE" INT
  trap 'exit '"$EXIT_ROLLBACK_INCOMPLETE" TERM
}

do_rollback() {
  ROLLBACK_RUNNING=1
  ROLLBACK_STATE=INCOMPLETE
  disable_recursive_traps
  log "===== AUTOMATIC ROLLBACK ====="
  local rb=0
  systemctl stop clover-audit-retention.timer || true
  (restore_exact "$DST_API" api-20-hardening.conf) || rb=1
  (restore_exact "$DST_UI" ui-20-hardening.conf) || rb=1
  (restore_exact "$DST_TIMER" audit-retention.timer) || rb=1
  (rollback_created_dir "$DIR_API" a-dir-clover-api.service.d) || rb=1
  (rollback_created_dir "$DIR_UI" a-dir-clover-ui.service.d) || rb=1
  # 10-umask.conf is evidence-only and is never restored.
  systemctl daemon-reload || rb=1
  systemctl restart clover-api.service || rb=1
  wait_active clover-api.service || rb=1
  api_health || rb=1
  systemctl restart clover-ui.service || rb=1
  wait_active clover-ui.service || rb=1
  ui_fetch "$RECOVERY/ui-root.rollback.html" || rb=1
  systemctl start clover-audit-retention.timer || rb=1
  local tgt as now_umask apply_st
  tgt=$(systemctl show clover-audit-retention.timer -p Unit --value) || rb=1
  as=$(systemctl show clover-audit-retention.timer -p ActiveState --value) || rb=1
  if [ "$tgt" != "$PRE_TIMER_UNIT" ] || [ "$as" != active ]; then
    rb=1
  fi
  if [ "$PRE_TIMER_UNIT" = clover-audit-retention-apply.service ]; then
    log "RESIDUAL: restored pre-state timer still targets apply.service; apply service was not started"
  fi
  now_umask=$(sha_file "$UMASK_FILE") || rb=1
  if [ "$now_umask" != "$UMASK_SHA" ]; then
    rb=1
  fi
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value) || rb=1
  if [ "$apply_st" != inactive ]; then
    rb=1
  fi
  if [ "$rb" -ne 0 ]; then
    log "ROLLBACK INCOMPLETE orig_exit=$ORIG_EXIT"
    return 1
  fi
  ROLLBACK_STATE=COMPLETED
  log "ROLLBACK COMPLETED orig_exit=$ORIG_EXIT"
  return 0
}

finish_fail_after_change() {
  disable_recursive_traps
  if do_rollback; then
    release_lock
    echo "PACKAGE A PROMOTE: FAIL"
    echo "ROLLBACK: COMPLETED"
    echo "ORIG_EXIT=$ORIG_EXIT"
    exit "$EXIT_PROMOTE_FAIL"
  fi
  release_lock
  echo "PACKAGE A PROMOTE: FAIL"
  echo "ROLLBACK: INCOMPLETE"
  echo "ORIG_EXIT=$ORIG_EXIT"
  exit "$EXIT_ROLLBACK_INCOMPLETE"
}

operator_on_err() {
  local code=$?
  ORIG_EXIT=$code
  if [ "$ROLLBACK_RUNNING" = 1 ] || [ "$IN_CLEANUP" = 1 ]; then
    exit "$EXIT_ROLLBACK_INCOMPLETE"
  fi
  if [ "$CHANGED" = 1 ]; then
    finish_fail_after_change
  fi
  release_lock
  echo "PACKAGE A PROMOTE: FAIL"
  echo "ROLLBACK: NOT_NEEDED"
  echo "ORIG_EXIT=$ORIG_EXIT"
  exit "$ORIG_EXIT"
}

operator_on_signal() {
  local sig="$1"
  case "$sig" in
    INT) ORIG_EXIT=130 ;;
    TERM) ORIG_EXIT=143 ;;
    *) ORIG_EXIT=1 ;;
  esac
  log "SIGNAL $sig"
  if [ "$ROLLBACK_RUNNING" = 1 ] || [ "$IN_CLEANUP" = 1 ]; then
    exit "$EXIT_ROLLBACK_INCOMPLETE"
  fi
  if [ "$CHANGED" = 1 ]; then
    finish_fail_after_change
  fi
  release_lock
  echo "PACKAGE A PROMOTE: FAIL"
  echo "ROLLBACK: NOT_NEEDED"
  echo "ORIG_EXIT=$ORIG_EXIT"
  exit "$ORIG_EXIT"
}

set_once() {
  local name="$1" value="$2"
  case "$name" in
    TARGET) [ -z "$TARGET" ] || fail_before "duplicate argument --target" ;;
    EXPECTED_MANIFEST) [ -z "$EXPECTED_MANIFEST" ] || fail_before "duplicate argument --expected-manifest" ;;
    ARTIFACT) [ -z "$ARTIFACT" ] || fail_before "duplicate argument --artifact" ;;
    ROOT) [ "$ROOT" = "$DEFAULT_ROOT" ] || fail_before "duplicate argument --repo" ;;
    LIVE) [ "$LIVE" = "$DEFAULT_LIVE" ] || fail_before "duplicate argument --live" ;;
    LOCK) [ "$LOCK" = "$DEFAULT_LOCK" ] || fail_before "duplicate argument --lock" ;;
    DEST_ROOT) [ -z "$DEST_ROOT" ] || fail_before "duplicate argument --dest-root" ;;
    RECOVERY_ARG) [ -z "$RECOVERY_ARG" ] || fail_before "duplicate argument --recovery" ;;
  esac
  case "$name" in
    TARGET) TARGET="$value" ;;
    EXPECTED_MANIFEST) EXPECTED_MANIFEST="$value" ;;
    ARTIFACT) ARTIFACT="$value" ;;
    ROOT) ROOT="$value" ;;
    LIVE) LIVE="$value" ;;
    LOCK) LOCK="$value" ;;
    DEST_ROOT) DEST_ROOT="$value" ;;
    RECOVERY_ARG) RECOVERY_ARG="$value" ;;
  esac
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --target)
        [ $# -ge 2 ] || fail_before "missing value for --target"
        set_once TARGET "$2"
        shift 2
        ;;
      --expected-manifest)
        [ $# -ge 2 ] || fail_before "missing value for --expected-manifest"
        set_once EXPECTED_MANIFEST "$2"
        shift 2
        ;;
      --artifact)
        [ $# -ge 2 ] || fail_before "missing value for --artifact"
        set_once ARTIFACT "$2"
        shift 2
        ;;
      --repo)
        [ $# -ge 2 ] || fail_before "missing value for --repo"
        set_once ROOT "$2"
        shift 2
        ;;
      --live)
        [ $# -ge 2 ] || fail_before "missing value for --live"
        set_once LIVE "$2"
        shift 2
        ;;
      --lock)
        [ $# -ge 2 ] || fail_before "missing value for --lock"
        set_once LOCK "$2"
        shift 2
        ;;
      --dest-root)
        [ $# -ge 2 ] || fail_before "missing value for --dest-root"
        set_once DEST_ROOT "$2"
        shift 2
        ;;
      --recovery)
        [ $# -ge 2 ] || fail_before "missing value for --recovery"
        set_once RECOVERY_ARG "$2"
        shift 2
        ;;
      *)
        fail_before "unknown argument $1"
        ;;
    esac
  done
}

require_regular_file() {
  local path="$1"
  if test -L "$path" || ! test -f "$path"; then
    fail_before "not a regular file $path"
  fi
}

copy_payload_snapshot() {
  local rel="$1" dest="$2" man_hash="$3"
  local src="$ARTIFACT/$rel" copy_hash blob_hash
  require_regular_file "$src"
  if ! cp -- "$src" "$dest"; then
    fail_before "could not snapshot $rel"
  fi
  if ! chmod 0400 -- "$dest"; then
    fail_before "could not lock snapshot $rel"
  fi
  copy_hash=$(sha_file "$dest")
  [ "$copy_hash" = "$man_hash" ] || fail_before "snapshot $rel != manifest"
  blob_hash=$(git_blob_sha "${TARGET}:${rel}")
  [ "$copy_hash" = "$blob_hash" ] || fail_before "snapshot $rel != git blob"
  local expected_oid copy_oid
  expected_oid=$(git_blob_id "${TARGET}:${rel}")
  copy_oid=$(file_blob_id "$dest")
  [ "$copy_oid" = "$expected_oid" ] || fail_before "snapshot $rel blob id mismatch"
}

manifest_file_hash() {
  local rel="$1"
  python3 -c 'import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
p=sys.argv[2]
hits=[x["sha256"] for x in d.get("files",[]) if x.get("path")==p]
if len(hits)!=1:
  sys.exit(1)
print(hits[0])' "$ARTIFACT/manifest.json" "$rel"
}

operator_main() {
  unset CLOVER_OPERATOR_AS_ROOT SUDO_ASKPASS ASKPASS VERIFIER GIT_DIR GIT_WORK_TREE || true
  require_root
  require_tty
  parse_args "$@"

  printf '%s' "$TARGET" | grep -Eq '^[0-9a-f]{40}$' || fail_before "TARGET must be a 40-character lowercase SHA"
  require_sha256_upper "EXPECTED_MANIFEST" "$EXPECTED_MANIFEST"
  case "$ARTIFACT" in
    /*) ;;
    *) fail_before "ARTIFACT must be an absolute path" ;;
  esac
  [ -n "$RECOVERY_ARG" ] || fail_before "recovery directory is required"
  case "$RECOVERY_ARG" in
    /*) ;;
    *) fail_before "recovery must be an absolute path" ;;
  esac
  RECOVERY="$RECOVERY_ARG"
  require_trusted_recovery "$RECOVERY_ARG"
  [ -d "$ARTIFACT" ] || fail_before "ARTIFACT is not a directory"
  [ -d "$ROOT/.git" ] || fail_before "repo missing $ROOT"
  trusted_git cat-file -e "${TARGET}^{commit}" || fail_before "target commit missing"
  require_trusted_self

  DST_API="${DEST_ROOT}/etc/systemd/system/clover-api.service.d/20-hardening.conf"
  DST_UI="${DEST_ROOT}/etc/systemd/system/clover-ui.service.d/20-hardening.conf"
  DST_TIMER="${DEST_ROOT}/etc/systemd/system/clover-audit-retention.timer"
  DIR_API="${DEST_ROOT}/etc/systemd/system/clover-api.service.d"
  DIR_UI="${DEST_ROOT}/etc/systemd/system/clover-ui.service.d"
  UMASK_FILE="${DEST_ROOT}/etc/systemd/system/clover-api.service.d/10-umask.conf"

  trap operator_on_err ERR
  trap 'operator_on_signal INT' INT
  trap 'operator_on_signal TERM' TERM
  trap cleanup EXIT

  if [ -n "${VERIFIER:-}" ] || [ -e /opt/clover/deployments/staging/.verifier-security-stage5-56448b96-686d5bc473408f28.mjs ]; then
    printf '%s\n' "FAIL: pre-placed verifier is forbidden" >&2
    exit "$EXIT_PRE"
  fi

  exec 9>"$LOCK"
  if ! flock -n 9; then
    echo "LOCK_BUSY"
    exit "$EXIT_LOCK"
  fi
  LOCK_HELD=1

  SNAPSHOT="$RECOVERY/payload"
  install -d -m 0700 -- "$SNAPSHOT"
  chmod 0700 -- "$SNAPSHOT"
  PROMOTE_LOG="$RECOVERY/promote-package-a.log"
  : > "$PROMOTE_LOG"
  chmod 0600 -- "$PROMOTE_LOG"
  log "LOCK_HELD"
  log "RECOVERY=$RECOVERY"

  local verifier expected_oid copy_oid vowner vmode vnlink
  verifier="$RECOVERY/securityStage5Artifact-${TARGET}.mjs"
  expected_oid=$(git_blob_id "${TARGET}:server/scripts/securityStage5Artifact.mjs")
  trusted_git show "${TARGET}:server/scripts/securityStage5Artifact.mjs" > "$verifier" || fail_before "git show verifier"
  [ -s "$verifier" ] || fail_before "empty verifier blob"
  ! test -L "$verifier" || fail_before "verifier symlink"
  test -f "$verifier" || fail_before "verifier not regular"
  copy_oid=$(file_blob_id "$verifier")
  [ "$copy_oid" = "$expected_oid" ] || fail_before "verifier object id mismatch"
  chmod 0500 -- "$verifier"
  ! test -L "$verifier" || fail_before "verifier symlink after chmod"
  test -f "$verifier" || fail_before "verifier not regular after chmod"
  vowner=$(stat -c '%U:%G' "$verifier")
  vmode=$(stat -c '%a' "$verifier")
  vnlink=$(stat -c '%h' "$verifier")
  [ "$vowner" = "root:root" ] || fail_before "verifier owner $vowner"
  [ "$vmode" = "500" ] || [ "$vmode" = "0500" ] || fail_before "verifier mode $vmode"
  [ "$vnlink" = "1" ] || fail_before "verifier nlink $vnlink"
  copy_oid=$(file_blob_id "$verifier")
  [ "$copy_oid" = "$expected_oid" ] || fail_before "verifier object id mismatch after lock"
  case "$verifier" in
    *.verifier*|*/.verifier-*) fail_before "pre-placed verifier path" ;;
  esac

  node "$verifier" verify --artifact "$ARTIFACT" --expected-sha "$TARGET" --source-root "$ROOT"
  local man_sha
  man_sha=$(sha256sum -- "$ARTIFACT/manifest.json" | awk '{print toupper($1)}')
  [ "$man_sha" = "$EXPECTED_MANIFEST" ] || fail_before "manifest sha $man_sha"
  local head
  head=$(trusted_git rev-parse HEAD)
  [ -n "$head" ] || fail_before "empty HEAD"
  [ "$head" = "$LIVE" ] || fail_before "checkout $head"

  local rel_api rel_ui rel_timer man_api man_ui man_timer
  rel_api="ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf"
  rel_ui="ops/security-stage5/package-a/systemd/clover-ui.service.d/20-hardening.conf"
  rel_timer="ops/systemd/clover-audit-retention.timer"
  SNAP_API="$SNAPSHOT/api-20-hardening.conf"
  SNAP_UI="$SNAPSHOT/ui-20-hardening.conf"
  SNAP_TIMER="$SNAPSHOT/audit-retention.timer"
  man_api=$(manifest_file_hash "$rel_api")
  man_ui=$(manifest_file_hash "$rel_ui")
  man_timer=$(manifest_file_hash "$rel_timer")
  require_sha256 "$rel_api" "$man_api"
  require_sha256 "$rel_ui" "$man_ui"
  require_sha256 "$rel_timer" "$man_timer"
  copy_payload_snapshot "$rel_api" "$SNAP_API" "$man_api"
  copy_payload_snapshot "$rel_ui" "$SNAP_UI" "$man_ui"
  copy_payload_snapshot "$rel_timer" "$SNAP_TIMER" "$man_timer"
  log "SNAPSHOT_LOCKED"

  systemctl list-jobs --no-pager | grep -q 'No jobs running' || fail_before "jobs"
  local u as
  for u in clover-api.service clover-ui.service nginx.service; do
    as=$(systemctl show "$u" -p ActiveState --value)
    [ "$as" = active ] || fail_before "$u $as"
  done

  api_health
  ui_fetch "$RECOVERY/ui-root.pre.html"
  ngx_health
  PRE_API_RELEASE=$(capture_api_release)
  {
    read -r PRE_UI_TAG
    read -r PRE_UI_SHA
  } < <(capture_ui_identity "$RECOVERY/ui-root.pre.html")
  require_sha256 "pre UI html" "$PRE_UI_SHA"
  log "PRE_API_RELEASE=${PRE_API_RELEASE:-}"
  log "PRE_UI_TAG=${PRE_UI_TAG:-}"
  log "PRE_UI_SHA=$PRE_UI_SHA"

  PRE_NGX_PID=$(systemctl show nginx.service -p MainPID --value)
  PRE_TIMER_UNIT=$(systemctl show clover-audit-retention.timer -p Unit --value)
  local tas tss apply_st dry_st
  tas=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  tss=$(systemctl show clover-audit-retention.timer -p SubState --value)
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  dry_st=$(systemctl show clover-audit-retention-dry-run.service -p ActiveState --value)
  [ "$tas" = active ] && [ "$tss" = waiting ] || fail_before "timer $tas/$tss"
  [ "$apply_st" = inactive ] && [ "$dry_st" = inactive ] || fail_before "apply/dry $apply_st/$dry_st"
  log "PRE_TIMER_UNIT=$PRE_TIMER_UNIT"

  local api_dir_mode
  api_dir_mode=$(stat -c '%a' "$DIR_API")
  printf '%s\n' "$api_dir_mode" > "$RECOVERY/api-dir.mode"
  [ "$api_dir_mode" = 700 ] || [ "$api_dir_mode" = 0700 ] || fail_before "api dir mode $api_dir_mode"

  backup_exact "$DST_API" api-20-hardening.conf
  backup_exact "$DST_UI" ui-20-hardening.conf
  backup_exact "$DST_TIMER" audit-retention.timer
  if test -f "$RECOVERY/api-20-hardening.conf.sha256"; then
    (cd "$RECOVERY" && sha256sum -c api-20-hardening.conf.sha256)
  else
    test -f "$RECOVERY/api-20-hardening.conf.absent"
  fi
  if test -f "$RECOVERY/ui-20-hardening.conf.sha256"; then
    (cd "$RECOVERY" && sha256sum -c ui-20-hardening.conf.sha256)
  else
    test -f "$RECOVERY/ui-20-hardening.conf.absent"
  fi
  if test -f "$RECOVERY/audit-retention.timer.sha256"; then
    (cd "$RECOVERY" && sha256sum -c audit-retention.timer.sha256)
  else
    test -f "$RECOVERY/audit-retention.timer.absent"
  fi

  test -e "$UMASK_FILE" || fail_before "10-umask.conf missing"
  stat -c 'umask owner=%U:%G mode=%a size=%s path=%n' "$UMASK_FILE" > "$RECOVERY/10-umask.conf.stat"
  UMASK_SHA=$(sha_file "$UMASK_FILE")
  printf '%s  %s\n' "$UMASK_SHA" "$UMASK_FILE" > "$RECOVERY/10-umask.conf.evidence.sha256"
  require_sha256 "10-umask.conf" "$UMASK_SHA"
  log "UMASK_EVIDENCE=$UMASK_SHA"
  log "10-umask.conf is not a destination and will not be installed or restored"

  log "===== STOP TIMER (first change) ====="
  CHANGED=1
  systemctl stop clover-audit-retention.timer
  tas=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  dry_st=$(systemctl show clover-audit-retention-dry-run.service -p ActiveState --value)
  [ "$tas" = inactive ] && [ "$apply_st" = inactive ] && [ "$dry_st" = inactive ]

  ensure_destination_dir "$DIR_API" a-dir-clover-api.service.d 0755
  ensure_destination_dir "$DIR_UI" a-dir-clover-ui.service.d 0755
  api_dir_mode=$(stat -c '%a' "$DIR_API")
  [ "$api_dir_mode" = 700 ] || [ "$api_dir_mode" = 0700 ]

  install -m 0644 -- "$SNAP_API" "$DST_API"
  install -m 0644 -- "$SNAP_UI" "$DST_UI"
  install -m 0644 -- "$SNAP_TIMER" "$DST_TIMER"
  [ "$(sha_file "$UMASK_FILE")" = "$UMASK_SHA" ]
  [ "$(sha_file "$DST_API")" = "$(sha_file "$SNAP_API")" ]
  [ "$(sha_file "$DST_UI")" = "$(sha_file "$SNAP_UI")" ]
  [ "$(sha_file "$DST_TIMER")" = "$(sha_file "$SNAP_TIMER")" ]

  systemd-analyze verify \
    /etc/systemd/system/clover-api.service \
    /etc/systemd/system/clover-ui.service \
    /etc/systemd/system/clover-audit-retention.timer \
    "$DST_API" "$DST_UI" "$DST_TIMER"

  systemctl daemon-reload
  local new_tgt
  new_tgt=$(systemctl show clover-audit-retention.timer -p Unit --value)
  [ "$new_tgt" = clover-audit-retention-dry-run.service ]
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  [ "$apply_st" = inactive ]

  systemctl restart clover-api.service
  wait_active clover-api.service
  api_health
  [ "$(capture_api_release)" = "$PRE_API_RELEASE" ]

  systemctl restart clover-ui.service
  wait_active clover-ui.service
  ui_fetch "$RECOVERY/ui-root.post.html"
  local post_tag post_sha
  {
    read -r post_tag
    read -r post_sha
  } < <(capture_ui_identity "$RECOVERY/ui-root.post.html")
  [ "$post_tag" = "$PRE_UI_TAG" ]
  [ "$post_sha" = "$PRE_UI_SHA" ]
  ngx_health
  [ "$(systemctl show nginx.service -p MainPID --value)" = "$PRE_NGX_PID" ]

  systemctl start clover-audit-retention.timer
  tas=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  tss=$(systemctl show clover-audit-retention.timer -p SubState --value)
  new_tgt=$(systemctl show clover-audit-retention.timer -p Unit --value)
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  [ "$tas" = active ] && [ "$tss" = waiting ]
  [ "$new_tgt" = clover-audit-retention-dry-run.service ]
  [ "$apply_st" = inactive ]
  [ "$(sha_file "$UMASK_FILE")" = "$UMASK_SHA" ]
  [ "$(trusted_git rev-parse HEAD)" = "$LIVE" ]

  ROLLBACK_STATE=NOT_NEEDED
  log "PACKAGE A PROMOTE PASS"
  release_lock
  echo "TTY GATE: PASS"
  echo "PACKAGE A PROMOTE: PASS"
  echo "ROLLBACK: NOT NEEDED"
  echo "PACKAGE B/C/D: NOT TOUCHED"
  echo "PRODUCTION DATA/1C: NOT TOUCHED"
  echo "RECOVERY=$RECOVERY"
  echo "TIMER_TARGET=$new_tgt"
  echo "UMASK_EVIDENCE=$UMASK_SHA"
  exit "$EXIT_PASS"
}

if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  printf '%s\n' "FAIL: operator must not be sourced or piped on stdin" >&2
  exit "$EXIT_PRE"
fi
operator_main "$@"
