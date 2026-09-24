#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
HARDENER="${SCRIPT_DIR}/harden-deployment-artifacts.sh"
PYTHON_BIN="${S8A_FIXTURE_PYTHON:-/usr/bin/python3.13}"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/clover-s8a-fixture.XXXXXX")"

cleanup() {
  local resolved=""
  if [[ -n "${LOCK_HOLDER:-}" ]]; then
    kill "${LOCK_HOLDER}" 2>/dev/null || true
    wait "${LOCK_HOLDER}" 2>/dev/null || true
  fi
  if [[ -d "${FIXTURE_ROOT}" && ! -L "${FIXTURE_ROOT}" ]]; then
    resolved="$(realpath -e -- "${FIXTURE_ROOT}")"
    case "${resolved}" in
      /tmp/clover-s8a-fixture.*|/var/tmp/clover-s8a-fixture.*) rm -rf -- "${resolved}" ;;
      *) echo "ERROR: refused fixture cleanup outside expected temp root: ${resolved}" >&2 ;;
    esac
  fi
}
trap cleanup EXIT

fail() {
  echo "FIXTURE_FAIL|$*" >&2
  exit 1
}

run_hardener() {
  S8A_FIXTURE_MODE=1 S8A_FIXTURE_PYTHON="${PYTHON_BIN}" \
    bash "${HARDENER}" --root "${DEPLOYMENTS}" --allowlist "${ALLOWLIST}" "$@"
}

expect_failure() {
  local label="$1"
  shift
  if "$@" >"${FIXTURE_ROOT}/${label}.stdout" 2>"${FIXTURE_ROOT}/${label}.stderr"; then
    fail "${label}-unexpected-success"
  fi
  echo "${label}:PASS"
}

DEPLOYMENTS="${FIXTURE_ROOT}/deployments"
ALLOWLIST="${FIXTURE_ROOT}/allowlist.txt"
mkdir -p "${DEPLOYMENTS}/lkg" "${DEPLOYMENTS}/db-backups" "${DEPLOYMENTS}/staging/safe"
chmod 755 "${FIXTURE_ROOT}" "${DEPLOYMENTS}" "${DEPLOYMENTS}/lkg"
chmod 700 "${DEPLOYMENTS}/db-backups" "${DEPLOYMENTS}/staging" "${DEPLOYMENTS}/staging/safe"
: >"${DEPLOYMENTS}/deploy.lock"

printf 'fixture-only\n' >"${DEPLOYMENTS}/lkg/old.sqlite"
printf 'fixture-only\n' >"${DEPLOYMENTS}/lkg/readonly.db"
printf 'fixture-only\n' >"${DEPLOYMENTS}/lkg/wide.db"
printf 'fixture-only\n' >"${DEPLOYMENTS}/db-backups/old.sqlite-wal"
printf 'fixture-only\n' >"${DEPLOYMENTS}/staging/safe/.env"
chmod 644 "${DEPLOYMENTS}/lkg/old.sqlite" "${DEPLOYMENTS}/db-backups/old.sqlite-wal"
chmod 440 "${DEPLOYMENTS}/lkg/readonly.db"
chmod 777 "${DEPLOYMENTS}/lkg/wide.db"
chmod 600 "${DEPLOYMENTS}/staging/safe/.env"

write_valid_allowlist() {
  printf '%s\n' \
    'lkg/old.sqlite' \
    'lkg/readonly.db' \
    'lkg/wide.db' \
    'db-backups/old.sqlite-wal' \
    'staging/safe/.env' >"${ALLOWLIST}"
}
write_valid_allowlist

DRY_OUTPUT="$(run_hardener --dry-run)"
grep -Fq 'ACCESSIBLE_PERMISSION_CHAIN|lkg/old.sqlite|644' <<<"${DRY_OUTPUT}" || fail "dry-run-accessible-classification"
grep -Fq 'BLOCKED_BY_PARENT_OTHER_BITS|db-backups/old.sqlite-wal|644' <<<"${DRY_OUTPUT}" || fail "dry-run-parent-classification"
grep -Fq 'DRY_RUN_OK|no-changes' <<<"${DRY_OUTPUT}" || fail "dry-run-marker"
[[ "$(stat -c '%a' "${DEPLOYMENTS}/lkg/old.sqlite")" == "644" ]] || fail "dry-run-mutated-mode"
echo "S8A_DRY_RUN:PASS"

expect_failure S8A_PRODUCTION_ROOT_PIN env S8A_FIXTURE_MODE=0 S8A_FIXTURE_PYTHON="${PYTHON_BIN}" \
  bash "${HARDENER}" \
    --root "${DEPLOYMENTS}" --allowlist "${ALLOWLIST}" --dry-run

printf '../escape.sqlite\n' >"${ALLOWLIST}"
expect_failure S8A_TRAVERSAL_REFUSED run_hardener --dry-run
write_valid_allowlist

expect_failure S8A_ROLLBACK_DISABLED run_hardener --rollback "${FIXTURE_ROOT}/unsafe.plan"
expect_failure S8A_PLAN_OUT_DISABLED run_hardener --apply --plan-out "${FIXTURE_ROOT}/unsafe.plan"
[[ "$(stat -c '%a' "${DEPLOYMENTS}/lkg/old.sqlite")" == "644" ]] || fail "disabled-command-mutated-mode"

printf '%s\n' 'lkg/old.sqlite' 'lkg/missing.sqlite' >"${ALLOWLIST}"
expect_failure S8A_MISSING_FAIL_CLOSED run_hardener --apply
[[ "$(stat -c '%a' "${DEPLOYMENTS}/lkg/old.sqlite")" == "644" ]] || fail "missing-mutated-mode"
write_valid_allowlist

OUTSIDE="${FIXTURE_ROOT}/outside.sqlite"
printf 'fixture-only\n' >"${OUTSIDE}"
chmod 644 "${OUTSIDE}"
ln -s "${OUTSIDE}" "${DEPLOYMENTS}/lkg/linked.sqlite"
printf 'lkg/linked.sqlite\n' >"${ALLOWLIST}"
expect_failure S8A_FINAL_SYMLINK_REFUSED run_hardener --apply
[[ "$(stat -c '%a' "${OUTSIDE}")" == "644" ]] || fail "symlink-target-mode-changed"

mkdir "${FIXTURE_ROOT}/outside-dir"
printf 'fixture-only\n' >"${FIXTURE_ROOT}/outside-dir/nested.sqlite"
chmod 644 "${FIXTURE_ROOT}/outside-dir/nested.sqlite"
ln -s "${FIXTURE_ROOT}/outside-dir" "${DEPLOYMENTS}/linked-parent"
printf 'linked-parent/nested.sqlite\n' >"${ALLOWLIST}"
expect_failure S8A_PARENT_SYMLINK_REFUSED run_hardener --apply
[[ "$(stat -c '%a' "${FIXTURE_ROOT}/outside-dir/nested.sqlite")" == "644" ]] || fail "parent-symlink-target-mode-changed"
write_valid_allowlist

flock -x "${DEPLOYMENTS}/deploy.lock" -c 'sleep 2' &
LOCK_HOLDER=$!
sleep 0.2
expect_failure S8A_LOCK_CONTENTION run_hardener --apply
wait "${LOCK_HOLDER}"

run_hardener --apply >"${FIXTURE_ROOT}/apply.stdout"
for relative in lkg/old.sqlite lkg/readonly.db lkg/wide.db db-backups/old.sqlite-wal staging/safe/.env; do
  [[ "$(stat -c '%a' "${DEPLOYMENTS}/${relative}")" == "600" ]] || fail "apply-mode-${relative}"
done
echo "S8A_APPLY_FCHMOD:PASS"

run_hardener --apply >"${FIXTURE_ROOT}/reapply.stdout"
for relative in lkg/old.sqlite lkg/readonly.db lkg/wide.db db-backups/old.sqlite-wal staging/safe/.env; do
  [[ "$(stat -c '%a' "${DEPLOYMENTS}/${relative}")" == "600" ]] || fail "reapply-mode-${relative}"
done
echo "S8A_IDEMPOTENT_REAPPLY:PASS"

echo "SECURITY_STAGE8_PACKAGE_A_LINUX_FIXTURE_PASS"
