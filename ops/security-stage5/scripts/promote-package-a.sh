#!/usr/bin/env bash
# Source-controlled Package A operator. Not permission to run on production.
# Rejected remote SHA ba0a3c3e57d2bd01c94046dab81aded4e10c2df1566038b02a19be6c498a4f50
# must never be executed. This file is the only approved operator source.
#
# Exit codes:
#   0  PASS
#   2  TTY/sudo gate
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

ROOT=${ROOT:-/opt/clover/clover-app}
LIVE=${LIVE:-1fdd7e6ac715f55e407d71a225e5a6037eb9d2e8}
ARTIFACT=${ARTIFACT:-}
TARGET=${TARGET:-}
EXPECTED_MANIFEST=${EXPECTED_MANIFEST:-}
LOCK=${LOCK:-/opt/clover/deployments/deploy.lock}
DEST_ROOT=${DEST_ROOT:-}
UMASK_FILE=${UMASK_FILE:-}

ART_API=""
ART_UI=""
ART_TIMER=""
DST_API=""
DST_UI=""
DST_TIMER=""
DIR_API=""
DIR_UI=""

CHANGED=0
IN_ROLLBACK=0
IN_CLEANUP=0
LOCK_HELD=0
ORIG_EXIT=0
RECOVERY=""
PROMOTE_LOG=""
ROLLBACK_STATE=NOT_NEEDED
SUDO_KEEP=""

require_tty() {
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    printf '%s\n' "SUDO GATE: FAIL (no TTY)" >&2
    exit "$EXIT_SUDO"
  fi
}

require_sha256() {
  local label="$1" value="$2"
  if [ -z "$value" ] || ! printf '%s' "$value" | grep -Eq '^[0-9a-f]{64}$'; then
    printf '%s\n' "FAIL: empty or invalid SHA-256 for $label" >&2
    return 1
  fi
}

sha_file() {
  local path="$1" hash
  hash=$(sha256sum -- "$path" | awk '{print $1}')
  require_sha256 "$path" "$hash"
  printf '%s\n' "$hash"
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
  if sudo test -e "$destination"; then
    sudo cp --preserve=all -- "$destination" "$RECOVERY/$key"
    sudo sha256sum "$RECOVERY/$key" | sudo tee "$RECOVERY/$key.sha256" >/dev/null
  else
    sudo touch "$RECOVERY/$key.absent"
  fi
}

restore_exact() {
  destination="$1"
  key="$2"
  if sudo test -e "$RECOVERY/$key.absent"; then
    sudo rm -f -- "$destination"
  else
    (cd "$RECOVERY" && sudo sha256sum -c "$key.sha256")
    sudo cp --preserve=all -- "$RECOVERY/$key" "$destination"
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
  if sudo test -e "$marker"; then
    echo "FAIL: recovery marker already exists for $key" >&2
    exit 1
  fi
  if sudo test -L "$destination"; then
    echo "FAIL: $destination exists and is a symlink" >&2
    exit 1
  fi
  if sudo test -e "$destination"; then
    if sudo test -d "$destination"; then
      return 0
    fi
    echo "FAIL: $destination exists and is not a directory" >&2
    exit 1
  fi
  if ! sudo install -d -m "$mode" -- "$destination"; then
    echo "FAIL: could not create directory $destination" >&2
    exit 1
  fi
  if ! sudo touch -- "$marker"; then
    echo "FAIL: could not write directory marker $marker" >&2
    sudo rmdir -- "$destination"
    exit 1
  fi
  if ! sudo test -e "$marker"; then
    echo "FAIL: directory marker missing after create $marker" >&2
    sudo rmdir -- "$destination"
    exit 1
  fi
}

rollback_created_dir() {
  destination="$1"
  key="$2"
  marker="$RECOVERY/$key.dir-created"
  if ! sudo test -e "$marker"; then
    return 0
  fi
  if ! sudo rmdir -- "$destination"; then
    echo "FAIL: $destination is not empty or not a directory; leftover entries were not deleted; marker kept" >&2
    exit 1
  fi
  if ! sudo rm -f -- "$marker"; then
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

do_rollback() {
  IN_ROLLBACK=1
  ROLLBACK_STATE=INCOMPLETE
  log "===== AUTOMATIC ROLLBACK ====="
  sudo systemctl stop clover-audit-retention.timer || true
  restore_exact "$DST_API" api-20-hardening.conf
  restore_exact "$DST_UI" ui-20-hardening.conf
  restore_exact "$DST_TIMER" audit-retention.timer
  rollback_created_dir "$DIR_API" a-dir-clover-api.service.d
  rollback_created_dir "$DIR_UI" a-dir-clover-ui.service.d
  # 10-umask.conf is evidence-only and is never restored.
  sudo systemctl daemon-reload
  sudo systemctl restart clover-api.service
  wait_active clover-api.service
  api_health
  sudo systemctl restart clover-ui.service
  wait_active clover-ui.service
  ui_fetch "$RECOVERY/ui-root.rollback.html"
  sudo systemctl start clover-audit-retention.timer
  local tgt as now_umask
  tgt=$(systemctl show clover-audit-retention.timer -p Unit --value)
  as=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  [ "$tgt" = "$PRE_TIMER_UNIT" ]
  [ "$as" = active ]
  if [ "$PRE_TIMER_UNIT" = clover-audit-retention-apply.service ]; then
    log "RESIDUAL: restored pre-state timer still targets apply.service; apply service was not started"
  fi
  now_umask=$(sha_file "$UMASK_FILE")
  [ "$now_umask" = "$UMASK_SHA" ]
  local apply_st
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  [ "$apply_st" = inactive ]
  ROLLBACK_STATE=COMPLETED
  log "ROLLBACK COMPLETED orig_exit=$ORIG_EXIT"
  return 0
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

operator_on_err() {
  local code=$?
  ORIG_EXIT=$code
  if [ "$IN_ROLLBACK" = 1 ] || [ "$IN_CLEANUP" = 1 ]; then
    exit "$EXIT_ROLLBACK_INCOMPLETE"
  fi
  if [ "$CHANGED" = 1 ]; then
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
  if [ "$IN_ROLLBACK" = 1 ]; then
    exit "$EXIT_ROLLBACK_INCOMPLETE"
  fi
  if [ "$CHANGED" = 1 ]; then
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
  fi
  release_lock
  echo "PACKAGE A PROMOTE: FAIL"
  echo "ROLLBACK: NOT_NEEDED"
  echo "ORIG_EXIT=$ORIG_EXIT"
  exit "$ORIG_EXIT"
}

enter_root_shell() {
  if [ "${CLOVER_OPERATOR_AS_ROOT:-}" = 1 ]; then
    return 0
  fi
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi
  require_tty
  log "===== SUDO -v (type password in this terminal; it will not be echoed) ====="
  if ! sudo -v; then
    echo "SUDO GATE: FAIL"
    exit "$EXIT_SUDO"
  fi
  if ! sudo -n true; then
    echo "SUDO GATE: FAIL"
    exit "$EXIT_SUDO"
  fi
  exec sudo -n env CLOVER_OPERATOR_AS_ROOT=1 ROOT="$ROOT" ARTIFACT="$ARTIFACT" \
    TARGET="$TARGET" EXPECTED_MANIFEST="$EXPECTED_MANIFEST" LIVE="$LIVE" LOCK="$LOCK" \
    UMASK_FILE="$UMASK_FILE" DEST_ROOT="$DEST_ROOT" RECOVERY_OVERRIDE="${RECOVERY_OVERRIDE:-}" \
    /bin/bash -- "$0" "$@"
}

operator_main() {
  : "${ARTIFACT:?ARTIFACT must be the accepted PREPARE directory}"
  : "${TARGET:?TARGET must be the 40-character artifact commit}"
  : "${EXPECTED_MANIFEST:?EXPECTED_MANIFEST must be the uppercase SHA-256 of manifest.json}"
  ART_API="$ARTIFACT/ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf"
  ART_UI="$ARTIFACT/ops/security-stage5/package-a/systemd/clover-ui.service.d/20-hardening.conf"
  ART_TIMER="$ARTIFACT/ops/systemd/clover-audit-retention.timer"
  DST_API="${DEST_ROOT}/etc/systemd/system/clover-api.service.d/20-hardening.conf"
  DST_UI="${DEST_ROOT}/etc/systemd/system/clover-ui.service.d/20-hardening.conf"
  DST_TIMER="${DEST_ROOT}/etc/systemd/system/clover-audit-retention.timer"
  DIR_API="${DEST_ROOT}/etc/systemd/system/clover-api.service.d"
  DIR_UI="${DEST_ROOT}/etc/systemd/system/clover-ui.service.d"
  if [ -z "$UMASK_FILE" ]; then
    UMASK_FILE="${DEST_ROOT}/etc/systemd/system/clover-api.service.d/10-umask.conf"
  fi

  enter_root_shell "$@"
  if [ "$(id -u)" -eq 0 ] || [ "${CLOVER_OPERATOR_AS_ROOT:-}" = 1 ]; then
    sudo() { "$@"; }
  fi

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

  local rand
  rand=$(python3 -c "import secrets; print(secrets.token_hex(8))")
  RECOVERY=${RECOVERY_OVERRIDE:-/opt/clover/recovery/security-stage5-package-a-${TARGET}-full-${rand}}
  sudo install -d -m 0700 -- "$RECOVERY"
  sudo chown root:root -- "$RECOVERY"
  sudo chmod 0700 -- "$RECOVERY"
  PROMOTE_LOG="$RECOVERY/promote-package-a.log"
  : > "$PROMOTE_LOG"
  sudo chmod 0600 -- "$PROMOTE_LOG"
  log "LOCK_HELD"
  log "RECOVERY=$RECOVERY"

  local verifier
  verifier="$RECOVERY/securityStage5Artifact-${TARGET}.mjs"
  git -C "$ROOT" cat-file -e "${TARGET}^{commit}"
  git -C "$ROOT" show "${TARGET}:server/scripts/securityStage5Artifact.mjs" > "$verifier"
  sudo chmod 0500 -- "$verifier"
  require_sha256 "extracted verifier" "$(sha_file "$verifier")"
  case "$verifier" in
    *.verifier*|*/.verifier-*) fail_before "pre-placed verifier path" ;;
  esac

  node "$verifier" verify --artifact "$ARTIFACT" --expected-sha "$TARGET" --source-root "$ROOT"
  local man_sha
  man_sha=$(sha256sum -- "$ARTIFACT/manifest.json" | awk '{print toupper($1)}')
  [ "$man_sha" = "$EXPECTED_MANIFEST" ] || fail_before "manifest sha $man_sha"
  local head
  head=$(git -C "$ROOT" rev-parse HEAD)
  [ "$head" = "$LIVE" ] || fail_before "checkout $head"

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

  backup_exact "$DST_API" api-20-hardening.conf
  backup_exact "$DST_UI" ui-20-hardening.conf
  backup_exact "$DST_TIMER" audit-retention.timer
  sudo test -f "$RECOVERY/audit-retention.timer" || sudo test -f "$RECOVERY/audit-retention.timer.absent" || fail_before "timer backup missing"
  if sudo test -f "$RECOVERY/audit-retention.timer.sha256"; then
    (cd "$RECOVERY" && sudo sha256sum -c audit-retention.timer.sha256)
  fi

  sudo test -e "$UMASK_FILE" || fail_before "10-umask.conf missing"
  sudo stat -c 'umask owner=%U:%G mode=%a size=%s path=%n' "$UMASK_FILE" | sudo tee "$RECOVERY/10-umask.conf.stat" >/dev/null
  UMASK_SHA=$(sha_file "$UMASK_FILE")
  printf '%s  %s\n' "$UMASK_SHA" "$UMASK_FILE" | sudo tee "$RECOVERY/10-umask.conf.evidence.sha256" >/dev/null
  log "UMASK_EVIDENCE=$UMASK_SHA"
  log "10-umask.conf is not a destination and will not be installed or restored"

  log "===== STOP TIMER (first change) ====="
  CHANGED=1
  sudo systemctl stop clover-audit-retention.timer
  tas=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  dry_st=$(systemctl show clover-audit-retention-dry-run.service -p ActiveState --value)
  [ "$tas" = inactive ] && [ "$apply_st" = inactive ] && [ "$dry_st" = inactive ]

  ensure_destination_dir "$DIR_API" a-dir-clover-api.service.d 0755
  ensure_destination_dir "$DIR_UI" a-dir-clover-ui.service.d 0755
  local api_dir_mode
  api_dir_mode=$(sudo stat -c '%a' "$DIR_API")
  [ "$api_dir_mode" = 700 ] || [ "$api_dir_mode" = 0700 ]

  sudo install -m 0644 -- "$ART_API" "$DST_API"
  sudo install -m 0644 -- "$ART_UI" "$DST_UI"
  sudo install -m 0644 -- "$ART_TIMER" "$DST_TIMER"
  [ "$(sha_file "$UMASK_FILE")" = "$UMASK_SHA" ]

  local inst_api inst_ui inst_timer art_api art_ui art_timer
  inst_api=$(sha_file "$DST_API")
  inst_ui=$(sha_file "$DST_UI")
  inst_timer=$(sha_file "$DST_TIMER")
  art_api=$(sha_file "$ART_API")
  art_ui=$(sha_file "$ART_UI")
  art_timer=$(sha_file "$ART_TIMER")
  [ "$inst_api" = "$art_api" ]
  [ "$inst_ui" = "$art_ui" ]
  [ "$inst_timer" = "$art_timer" ]

  sudo systemd-analyze verify \
    /etc/systemd/system/clover-api.service \
    /etc/systemd/system/clover-ui.service \
    /etc/systemd/system/clover-audit-retention.timer \
    "$DST_API" "$DST_UI" "$DST_TIMER"

  sudo systemctl daemon-reload
  local new_tgt
  new_tgt=$(systemctl show clover-audit-retention.timer -p Unit --value)
  [ "$new_tgt" = clover-audit-retention-dry-run.service ]
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  [ "$apply_st" = inactive ]

  sudo systemctl restart clover-api.service
  wait_active clover-api.service
  api_health
  [ "$(capture_api_release)" = "$PRE_API_RELEASE" ]

  sudo systemctl restart clover-ui.service
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

  sudo systemctl start clover-audit-retention.timer
  tas=$(systemctl show clover-audit-retention.timer -p ActiveState --value)
  tss=$(systemctl show clover-audit-retention.timer -p SubState --value)
  new_tgt=$(systemctl show clover-audit-retention.timer -p Unit --value)
  apply_st=$(systemctl show clover-audit-retention-apply.service -p ActiveState --value)
  [ "$tas" = active ] && [ "$tss" = waiting ]
  [ "$new_tgt" = clover-audit-retention-dry-run.service ]
  [ "$apply_st" = inactive ]
  [ "$(sha_file "$UMASK_FILE")" = "$UMASK_SHA" ]
  [ "$(git -C "$ROOT" rev-parse HEAD)" = "$LIVE" ]

  ROLLBACK_STATE=NOT_NEEDED
  log "PACKAGE A PROMOTE PASS"
  release_lock
  echo "SUDO GATE: PASS"
  echo "PACKAGE A PROMOTE: PASS"
  echo "ROLLBACK: NOT NEEDED"
  echo "PACKAGE B/C/D: NOT TOUCHED"
  echo "PRODUCTION DATA/1C: NOT TOUCHED"
  echo "RECOVERY=$RECOVERY"
  echo "TIMER_TARGET=$new_tgt"
  echo "UMASK_EVIDENCE=$UMASK_SHA"
  exit "$EXIT_PASS"
}

if [ "${CLOVER_OPERATOR_SOURCE_ONLY:-}" != 1 ]; then
  operator_main "$@"
fi
