#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
ROOT="/opt/clover/deployments"
ALLOWLIST="${REPO_ROOT}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist"
MODE="dry-run"

usage() {
  cat <<'USAGE'
Usage:
  harden-deployment-artifacts.sh [--root PATH] [--allowlist FILE] --dry-run
  harden-deployment-artifacts.sh [--root PATH] [--allowlist FILE] --apply

Dry-run is the default. The tool inspects metadata only: it never reads file contents.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="${2:-}"; shift 2 ;;
    --allowlist) ALLOWLIST="${2:-}"; shift 2 ;;
    --dry-run) MODE="dry-run"; shift ;;
    --apply) MODE="apply"; shift ;;
    --plan-out|--rollback)
      echo "ERROR|unsafe-rollback-disabled|$1" >&2
      exit 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR|unknown-argument|$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "${ROOT}" && -n "${ALLOWLIST}" ]] || { echo "ERROR|missing-path" >&2; exit 2; }
[[ -d "${ROOT}" ]] || { echo "ERROR|root-not-directory|${ROOT}" >&2; exit 2; }
[[ -f "${ALLOWLIST}" && ! -L "${ALLOWLIST}" ]] || { echo "ERROR|allowlist-not-regular|${ALLOWLIST}" >&2; exit 2; }

ROOT_LEXICAL="$(cd "${ROOT}" && pwd -L)"
ROOT_REAL="$(cd "${ROOT}" && pwd -P)"
[[ "${ROOT_LEXICAL}" == "${ROOT_REAL}" && ! -L "${ROOT}" ]] || {
  echo "ERROR|root-symlink-refused|${ROOT}" >&2
  exit 2
}
ALLOWLIST_REAL="$(realpath -e -- "${ALLOWLIST}")"
EXPECTED_ALLOWLIST="$(realpath -e -- "${REPO_ROOT}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist")"
if [[ "${S8A_FIXTURE_MODE:-0}" == "1" ]]; then
  case "${ROOT_REAL}" in
    /tmp/*|/var/tmp/*|/c/Users/*/AppData/Local/Temp/*) ;;
    *) echo "ERROR|fixture-root-refused|${ROOT_REAL}" >&2; exit 2 ;;
  esac
else
  [[ "${ROOT_REAL}" == "/opt/clover/deployments" && "${ALLOWLIST_REAL}" == "${EXPECTED_ALLOWLIST}" ]] || {
    echo "ERROR|production-root-or-allowlist-mismatch" >&2
    exit 2
  }
fi

declare -a ALLOWED=()
declare -A ALLOWED_SET=()
is_sensitive_name() {
  local base="${1##*/}"
  case "${base}" in
    .env|.env.production|.env.local|.env.test|*.sqlite|*.sqlite-wal|*.sqlite-shm|*.db|*.db-wal|*.db-shm) return 0 ;;
    *) return 1 ;;
  esac
}

while IFS= read -r raw || [[ -n "${raw}" ]]; do
  raw="${raw%$'\r'}"
  [[ -z "${raw}" || "${raw}" == \#* ]] && continue
  [[ "${raw}" != /* && "${raw}" != *".."* && "${raw}" != *"//"* ]] || {
    echo "ERROR|invalid-allowlist-path|${raw}" >&2
    exit 2
  }
  is_sensitive_name "${raw}" || { echo "ERROR|invalid-allowlist-type|${raw}" >&2; exit 2; }
  [[ -z "${ALLOWED_SET[${raw}]:-}" ]] || { echo "ERROR|duplicate-allowlist-path|${raw}" >&2; exit 2; }
  ALLOWED+=("${raw}")
  ALLOWED_SET["${raw}"]=1
done < "${ALLOWLIST}"
[[ ${#ALLOWED[@]} -gt 0 ]] || { echo "ERROR|empty-allowlist" >&2; exit 2; }

assert_safe_path() {
  local relative="$1" path="${ROOT_REAL}/$1" cursor="${ROOT_REAL}"
  local component
  IFS='/' read -r -a components <<< "${relative}"
  for component in "${components[@]}"; do
    [[ -n "${component}" && "${component}" != "." && "${component}" != ".." ]] || return 1
    cursor="${cursor}/${component}"
    [[ ! -L "${cursor}" ]] || return 1
  done
  [[ -e "${path}" && -f "${path}" && ! -L "${path}" ]] || return 1
  local resolved
  resolved="$(realpath -e -- "${path}")" || return 1
  [[ "${resolved}" == "${ROOT_REAL}/"* ]] || return 1
}

classify_path() {
  local relative="$1" path="${ROOT_REAL}/$1" cursor="" component mode other parent
  local parent_block=""
  parent="$(dirname "${path}")"
  IFS='/' read -r -a components <<< "${parent#/}"
  for component in "${components[@]}"; do
    [[ -n "${component}" ]] || continue
    cursor="${cursor}/${component}"
    mode="$(stat -Lc '%a' -- "${cursor}")" || { echo "NOT_VERIFIED|${relative}|stat-parent-failed"; return; }
    other=$((10#${mode} % 10))
    if (( (other & 1) == 0 )); then parent_block="${cursor}:${mode}"; break; fi
  done
  mode="$(stat -Lc '%a' -- "${path}")" || { echo "NOT_VERIFIED|${relative}|stat-file-failed"; return; }
  other=$((10#${mode} % 10))
  if [[ -n "${parent_block}" ]]; then
    echo "BLOCKED_BY_PARENT_OTHER_BITS|${relative}|${mode}|${parent_block}"
  elif (( (other & 4) == 0 )); then
    echo "BLOCKED_BY_FILE_OTHER_BITS|${relative}|${mode}"
  else
    echo "ACCESSIBLE_PERMISSION_CHAIN|${relative}|${mode}"
  fi
}

inventory() {
  local relative path
  echo "INVENTORY_ROOT|${ROOT_REAL}"
  for relative in "${ALLOWED[@]}"; do
    path="${ROOT_REAL}/${relative}"
    if [[ -L "${path}" ]]; then
      echo "SYMLINK_REFUSED|${relative}"
    elif [[ ! -e "${path}" ]]; then
      echo "ALLOWLIST_MISSING|${relative}"
    elif ! assert_safe_path "${relative}"; then
      echo "NOT_VERIFIED|${relative}|unsafe-or-nonregular"
    else
      classify_path "${relative}"
    fi
  done

  local found errors kind discovered error_line
  found="$(mktemp)"; errors="$(mktemp)"
  find -P "${ROOT_REAL}" -xdev \( -type f -o -type l \) \
    \( -name '*.sqlite' -o -name '*.sqlite-wal' -o -name '*.sqlite-shm' \
       -o -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \
       -o -name '.env' -o -name '.env.production' -o -name '.env.local' -o -name '.env.test' \) \
    -printf '%y|%P\n' >"${found}" 2>"${errors}" || true
  while IFS='|' read -r kind discovered; do
    [[ -n "${discovered}" ]] || continue
    if [[ "${kind}" == "l" ]]; then
      echo "SYMLINK_REFUSED|${discovered}"
    elif [[ -z "${ALLOWED_SET[${discovered}]:-}" ]]; then
      echo "NOT_ALLOWLISTED|${discovered}"
    fi
  done < <(LC_ALL=C sort "${found}")
  while IFS= read -r error_line; do
    [[ -n "${error_line}" ]] && echo "NOT_VERIFIED|discovery|${error_line}"
  done < "${errors}"
  rm -f -- "${found}" "${errors}"
}

if [[ "${MODE}" == "dry-run" ]]; then
  inventory
  echo "DRY_RUN_OK|no-changes"
  exit 0
fi

HELPER="${REPO_ROOT}/scripts/linux/security_stage8_artifact_modes.py"
[[ -f "${HELPER}" && ! -L "${HELPER}" ]] || { echo "ERROR|mode-helper-refused" >&2; exit 2; }
PYTHON_BIN="/usr/bin/python3.13"
if [[ "${S8A_FIXTURE_MODE:-0}" == "1" && -n "${S8A_FIXTURE_PYTHON:-}" ]]; then
  PYTHON_BIN="${S8A_FIXTURE_PYTHON}"
else
  [[ -f "${PYTHON_BIN}" && ! -L "${PYTHON_BIN}" ]] || { echo "ERROR|python-runtime-refused" >&2; exit 2; }
  PYTHON_META="$(stat -c '%u|%a' -- "${PYTHON_BIN}")"
  [[ "${PYTHON_META}" == 0\|755 ]] || { echo "ERROR|python-runtime-identity-mismatch" >&2; exit 2; }
fi

"${PYTHON_BIN}" "${HELPER}" apply "${ROOT_REAL}" "${ALLOWLIST_REAL}" "${S8A_FIXTURE_MODE:-0}"
