#!/usr/bin/env bash
set -Eeuo pipefail
umask 0077

readonly OPERATOR_REL="ops/security-stage5/scripts/promote-package-d.sh"
readonly PAYLOAD_REL="ops/security-stage5/package-d/nftables/clover-perimeter.nft"
readonly VERIFIER_REL="server/scripts/securityStage5Artifact.mjs"
readonly DEFAULT_ROOT="/opt/clover/clover-app"
readonly DEFAULT_LOCK="/opt/clover/deployments/deploy.lock"
readonly DESTINATION="/etc/nftables.conf"
readonly PRECONFIG_SHA256="60dac93ffe0ea440fc4a8941a080b6fb8d2c8655d47baf856e97182a0d1ca29a"

TARGET=""
EXPECTED_MANIFEST=""
ARTIFACT=""
RECOVERY=""
ROOT="$DEFAULT_ROOT"
LIVE="70eb66504bf981b1ea395d55671547292fa95141"
LOCK="$DEFAULT_LOCK"
CHANGED=0
ROLLBACK_RUNNING=0
PROMOTE_COMPLETE=0
PRE_SERVICE_ACTIVE=""
PRE_SERVICE_ENABLED=""
PRE_API_PID=""
PRE_UI_PID=""
PRE_NGINX_PID=""

fail() { printf 'FAIL: %s\n' "$*" >&2; return 1; }

require_sha256() {
  printf '%s' "$1" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid SHA-256: $2"
}

trusted_git() {
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_OBJECT_DIRECTORY \
    -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_INDEX_FILE \
    -u GIT_NAMESPACE -u GIT_COMMON_DIR -u GIT_REPLACE_REF_BASE \
    /usr/bin/git --no-replace-objects -C "$ROOT" "$@"
}

manifest_file_hash() {
  /usr/bin/python3 -I -S -c '
import json,sys
with open(sys.argv[1], "rb") as handle:
    manifest=json.load(handle)
hits=[item.get("sha256", "") for item in manifest.get("files", []) if item.get("path")==sys.argv[2]]
if len(hits)!=1:
    sys.exit(1)
print(hits[0])
' "$ARTIFACT/manifest.json" "$1"
}

manifest_package_status() {
  /usr/bin/python3 -I -S -c '
import json,sys
with open(sys.argv[1], "rb") as handle:
    manifest=json.load(handle)
status=manifest.get("packages", {}).get(sys.argv[2], {}).get("status", "")
if not isinstance(status, str) or not status:
    sys.exit(1)
print(status)
' "$ARTIFACT/manifest.json" "$1"
}

require_root_file() {
  local path="$1" mode="$2"
  [ -f "$path" ] && [ ! -L "$path" ] || fail "unsafe regular file: $path"
  [ "$(stat -c %u:%g -- "$path")" = "0:0" ] || fail "unexpected owner: $path"
  [ "$(stat -c %a -- "$path")" = "$mode" ] || fail "unexpected mode: $path"
  [ "$(stat -c %h -- "$path")" = "1" ] || fail "unexpected nlink: $path"
}

require_trusted_recovery() {
  case "$RECOVERY" in /opt/clover/recovery/security-stage5-package-d-*) ;; *) fail "unexpected recovery path" ;; esac
  [ -d "$RECOVERY" ] && [ ! -L "$RECOVERY" ] || fail "unsafe recovery directory"
  [ "$(stat -c %u:%g -- "$RECOVERY")" = "0:0" ] || fail "recovery owner"
  [ "$(stat -c %a -- "$RECOVERY")" = "700" ] || fail "recovery mode"
}

require_trusted_self() {
  local self="${BASH_SOURCE[0]}"
  case "$self" in "$RECOVERY"/promote-package-d.sh) ;; *) fail "operator must run from recovery" ;; esac
  require_root_file "$self" 500
  local expected_oid actual_oid
  expected_oid="$(trusted_git rev-parse --verify "$TARGET:$OPERATOR_REL")"
  actual_oid="$(trusted_git hash-object --no-filters -- "$self")"
  [ "$actual_oid" = "$expected_oid" ] || fail "operator Git blob mismatch"
}

health_gate() {
  curl -fsS -o /dev/null --connect-timeout 2 --max-time 8 http://127.0.0.1:4100/api/health
  curl -fsS -o /dev/null --connect-timeout 2 --max-time 8 http://127.0.0.1:5273/
  curl -kfsS -o /dev/null --connect-timeout 3 --max-time 10 \
    --resolve clover-spb.ru:443:127.0.0.1 https://clover-spb.ru/api/health
}

read_ruleset() {
  local output
  if ! output="$(/usr/sbin/nft list ruleset)"; then
    fail "nft list ruleset failed"
    return 1
  fi
  printf '%s' "$output"
}

rollback() {
  local failed=0
  ROLLBACK_RUNNING=1
  trap - ERR
  trap '' HUP INT TERM
  set +e
  printf '%s\n' '===== AUTOMATIC ROLLBACK =====' >&2
  if [ -f "$RECOVERY/nftables.conf" ] && \
     (cd "$RECOVERY" && sha256sum -c nftables.conf.sha256 >/dev/null); then
    cp --preserve=all -- "$RECOVERY/nftables.conf" "$DESTINATION" || failed=1
  else
    failed=1
  fi
  if /usr/sbin/nft list table inet clover_stage5 >/dev/null 2>&1; then
    /usr/sbin/nft delete table inet clover_stage5 || failed=1
  fi
  if [ "$PRE_SERVICE_ENABLED" = disabled ]; then
    systemctl disable nftables.service >/dev/null 2>&1 || failed=1
  fi
  if [ "$PRE_SERVICE_ACTIVE" = inactive ]; then
    local active_now="" before_stop=""
    active_now="$(systemctl is-active nftables.service 2>/dev/null || true)"
    if [ "$active_now" = active ]; then
      if before_stop="$(read_ruleset)" && [ -z "$before_stop" ]; then
        systemctl stop nftables.service >/dev/null 2>&1 || failed=1
      else
        failed=1
      fi
    fi
    [ "$(systemctl is-active nftables.service 2>/dev/null || true)" = inactive ] || failed=1
  fi
  [ "$(sha256sum "$DESTINATION" | awk '{print $1}')" = "$PRECONFIG_SHA256" ] || failed=1
  local post_rules=""
  if ! post_rules="$(read_ruleset)"; then
    failed=1
  elif [ -n "$post_rules" ]; then
    failed=1
  fi
  health_gate || failed=1
  set -e
  ROLLBACK_RUNNING=0
  [ "$failed" -eq 0 ] || return 1
}

on_error() {
  local original=$?
  [ "$ROLLBACK_RUNNING" -eq 0 ] || exit 41
  if [ "$CHANGED" -eq 1 ] && [ "$PROMOTE_COMPLETE" -eq 0 ]; then
    if rollback; then
      printf 'PACKAGE D PROMOTE: FAIL; ROLLBACK: PASS; ORIG_EXIT=%s\n' "$original" >&2
      exit 40
    fi
    printf 'PACKAGE D PROMOTE: FAIL; ROLLBACK: INCOMPLETE; ORIG_EXIT=%s\n' "$original" >&2
    exit 41
  fi
  exit "$original"
}

on_signal() {
  local signal_exit="$1"
  trap - ERR INT TERM
  if [ "$CHANGED" -eq 1 ] && [ "$PROMOTE_COMPLETE" -eq 0 ]; then
    if rollback; then
      printf 'PACKAGE D PROMOTE: INTERRUPTED; ROLLBACK: PASS; SIGNAL_EXIT=%s\n' "$signal_exit" >&2
      exit 40
    fi
    printf 'PACKAGE D PROMOTE: INTERRUPTED; ROLLBACK: INCOMPLETE; SIGNAL_EXIT=%s\n' "$signal_exit" >&2
    exit 41
  fi
  exit "$signal_exit"
}

trap on_error ERR
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --expected-manifest) EXPECTED_MANIFEST="${2:-}"; shift 2 ;;
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --recovery) RECOVERY="${2:-}"; shift 2 ;;
    --repo) ROOT="${2:-}"; shift 2 ;;
    --live) LIVE="${2:-}"; shift 2 ;;
    --lock) LOCK="${2:-}"; shift 2 ;;
    *) fail "unknown argument: $1"; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { fail "UID 0 required"; exit 2; }
[ -t 1 ] && [ -t 2 ] && [ -r /dev/tty ] && [ -w /dev/tty ] || { fail "interactive TTY required"; exit 2; }
printf '%s' "$TARGET" | grep -Eq '^[0-9a-f]{40}$' || { fail "invalid target"; exit 2; }
printf '%s' "$LIVE" | grep -Eq '^[0-9a-f]{40}$' || { fail "invalid live SHA"; exit 2; }
printf '%s' "$EXPECTED_MANIFEST" | grep -Eq '^[0-9A-F]{64}$' || { fail "invalid manifest SHA"; exit 2; }
case "$ARTIFACT" in /*) ;; *) fail "artifact must be absolute"; exit 2 ;; esac
case "$ROOT" in /*) ;; *) fail "repo must be absolute"; exit 2 ;; esac
case "$LOCK" in /*) ;; *) fail "lock must be absolute"; exit 2 ;; esac
[ -d "$ROOT/.git" ] || { fail "repo missing .git"; exit 2; }
[ -d "$ARTIFACT" ] && [ ! -L "$ARTIFACT" ] || { fail "unsafe artifact"; exit 2; }
require_trusted_recovery
require_trusted_self

exec 9>"$LOCK"
flock -n 9 || { fail "deploy lock busy"; exit 3; }
printf '%s\n' LOCK_HELD

[ "$(trusted_git rev-parse HEAD)" = "$LIVE" ] || fail "live checkout mismatch"
trusted_git cat-file -e "$TARGET^{commit}"
[ "$(sha256sum "$ARTIFACT/manifest.json" | awk '{print toupper($1)}')" = "$EXPECTED_MANIFEST" ] || fail "manifest SHA mismatch"

VERIFIER="$RECOVERY/securityStage5Artifact-${TARGET}.mjs"
[ ! -e "$VERIFIER" ] || fail "pre-placed verifier is forbidden"
trusted_git show "$TARGET:$VERIFIER_REL" > "$VERIFIER"
chmod 0500 "$VERIFIER"
chown root:root "$VERIFIER"
require_root_file "$VERIFIER" 500
[ "$(trusted_git hash-object --no-filters -- "$VERIFIER")" = "$(trusted_git rev-parse --verify "$TARGET:$VERIFIER_REL")" ] || fail "verifier Git blob mismatch"
node "$VERIFIER" verify --artifact "$ARTIFACT" --expected-sha "$TARGET" --source-root "$ROOT"
[ "$(manifest_package_status D)" = PREPARED ] || fail "Package D manifest is not PREPARED"

PAYLOAD="$RECOVERY/clover-perimeter.nft"
[ ! -e "$PAYLOAD" ] || fail "pre-placed payload is forbidden"
trusted_git show "$TARGET:$PAYLOAD_REL" > "$PAYLOAD"
chmod 0500 "$PAYLOAD"
chown root:root "$PAYLOAD"
require_root_file "$PAYLOAD" 500
[ "$(trusted_git hash-object --no-filters -- "$PAYLOAD")" = "$(trusted_git rev-parse --verify "$TARGET:$PAYLOAD_REL")" ] || fail "payload Git blob mismatch"
PAYLOAD_SHA="$(sha256sum "$PAYLOAD" | awk '{print $1}')"
require_sha256 "$PAYLOAD_SHA" payload
[ "$PAYLOAD_SHA" = "$(manifest_file_hash "$PAYLOAD_REL")" ] || fail "payload manifest mismatch"

[ -f "$DESTINATION" ] && [ ! -L "$DESTINATION" ] || fail "unsafe nftables config"
[ "$(stat -c %u:%g "$DESTINATION")" = 0:0 ] || fail "nftables config owner drift"
[ "$(stat -c %a "$DESTINATION")" = 755 ] || fail "nftables config mode drift"
[ "$(sha256sum "$DESTINATION" | awk '{print $1}')" = "$PRECONFIG_SHA256" ] || fail "nftables config drift"
PRE_RULESET="$(read_ruleset)"
[ -z "$PRE_RULESET" ] || fail "live nftables ruleset is not empty"
PRE_SERVICE_ACTIVE="$(systemctl is-active nftables.service || true)"
PRE_SERVICE_ENABLED="$(systemctl is-enabled nftables.service || true)"
[ "$PRE_SERVICE_ACTIVE" = inactive ] || fail "nftables service active-state drift"
[ "$PRE_SERVICE_ENABLED" = disabled ] || fail "nftables service enablement drift"

PRE_API_PID="$(systemctl show clover-api.service -p MainPID --value)"
PRE_UI_PID="$(systemctl show clover-ui.service -p MainPID --value)"
PRE_NGINX_PID="$(systemctl show nginx.service -p MainPID --value)"
[ "$PRE_API_PID" -gt 1 ] && [ "$PRE_UI_PID" -gt 1 ] && [ "$PRE_NGINX_PID" -gt 1 ] || fail "invalid service PID"
health_gate
ss -H -ltn '( sport = :4100 )' | grep -q '0.0.0.0:4100' || fail "API listener changed"

cp --preserve=all -- "$DESTINATION" "$RECOVERY/nftables.conf"
sha256sum "$RECOVERY/nftables.conf" > "$RECOVERY/nftables.conf.sha256"
(cd "$RECOVERY" && sha256sum -c nftables.conf.sha256 >/dev/null)
/usr/sbin/nft -c -f "$PAYLOAD"

# Revalidate immediately before the first change. Keep the command assignment
# separate so a failed nft invocation cannot look like empty stdout.
CURRENT_RULESET="$(read_ruleset)"
[ -z "$CURRENT_RULESET" ] || fail "live nftables ruleset changed during preflight"

CHANGED=1
install -o root -g root -m 0755 -- "$PAYLOAD" "$DESTINATION"
/usr/sbin/nft -f "$DESTINATION"
systemctl enable nftables.service >/dev/null

RULESET="$(/usr/sbin/nft list ruleset)"
[ "$(sha256sum "$DESTINATION" | awk '{print $1}')" = "$PAYLOAD_SHA" ]
[ "$(stat -c %u:%g "$DESTINATION")" = 0:0 ]
[ "$(stat -c %a "$DESTINATION")" = 755 ]
printf '%s' "$RULESET" | grep -Fq 'clover: working 1C and office LAN'
printf '%s' "$RULESET" | grep -Fq 'clover: block direct API outside office LAN'
printf '%s' "$RULESET" | grep -Fq 'clover: block abandoned test listeners'
[ "$(systemctl is-enabled nftables.service)" = enabled ]
[ "$(systemctl is-active nftables.service || true)" = inactive ]
[ "$(systemctl show clover-api.service -p MainPID --value)" = "$PRE_API_PID" ]
[ "$(systemctl show clover-ui.service -p MainPID --value)" = "$PRE_UI_PID" ]
[ "$(systemctl show nginx.service -p MainPID --value)" = "$PRE_NGINX_PID" ]
health_gate

PROMOTE_COMPLETE=1
CHANGED=0
trap - ERR HUP INT TERM
printf '%s\n' 'PACKAGE D PROMOTE: PASS'
printf '%s\n' 'ROLLBACK: NOT NEEDED'
printf '%s\n' "RECOVERY=$RECOVERY"
