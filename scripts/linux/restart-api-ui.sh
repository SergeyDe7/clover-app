#!/usr/bin/env bash
# Safe Clover production deploy: build off the live serving path, stage, cutover,
# health-check, and roll back BOTH source SHA and UI dist on failure.
#
# Usage:
#   scripts/linux/restart-api-ui.sh <exact-target-commit-sha>
#
# Injectable overrides (for sandbox tests / dry validation):
#   CLOVER_DEPLOY_ROOT, CLOVER_DEPLOY_STAGING, CLOVER_DEPLOY_LKG, CLOVER_DEPLOY_LOCK
#   CLOVER_DEPLOY_GIT, CLOVER_DEPLOY_NPM, CLOVER_DEPLOY_SYSTEMCTL, CLOVER_DEPLOY_SUDO_SYSTEMCTL
#   CLOVER_DEPLOY_CURL, CLOVER_DEPLOY_HEALTH_API, CLOVER_DEPLOY_HEALTH_UI
#   CLOVER_DEPLOY_DB_PATH, CLOVER_DEPLOY_NODE_MODULES, CLOVER_DEPLOY_SERVER_NODE_MODULES
#   CLOVER_DEPLOY_DRY_RUN=1  — resolve/validate only; never mutate live source/dist/services
#
set -euo pipefail

ROOT="${CLOVER_DEPLOY_ROOT:-/opt/clover/clover-app}"
STAGING_ROOT="${CLOVER_DEPLOY_STAGING:-/opt/clover/deployments/staging}"
LKG_ROOT="${CLOVER_DEPLOY_LKG:-/opt/clover/deployments/lkg}"
LOCK_FILE="${CLOVER_DEPLOY_LOCK:-/opt/clover/deployments/deploy.lock}"
GIT_BIN="${CLOVER_DEPLOY_GIT:-git}"
NPM_BIN="${CLOVER_DEPLOY_NPM:-npm}"
SYSTEMCTL_BIN="${CLOVER_DEPLOY_SYSTEMCTL:-systemctl}"
SUDO_SYSTEMCTL="${CLOVER_DEPLOY_SUDO_SYSTEMCTL:-sudo -n /bin/systemctl}"
CURL_BIN="${CLOVER_DEPLOY_CURL:-curl}"
HEALTH_API="${CLOVER_DEPLOY_HEALTH_API:-http://127.0.0.1:4100/api/health}"
HEALTH_UI="${CLOVER_DEPLOY_HEALTH_UI:-http://127.0.0.1:5273/}"
DRY_RUN="${CLOVER_DEPLOY_DRY_RUN:-0}"
API_UNIT="${CLOVER_DEPLOY_API_UNIT:-clover-api.service}"
UI_UNIT="${CLOVER_DEPLOY_UI_UNIT:-clover-ui.service}"

TARGET_SHA="${1:-${CLOVER_DEPLOY_TARGET_SHA:-}}"
if [[ -z "${TARGET_SHA}" ]]; then
  echo "ERROR: target commit SHA required: $0 <sha>" >&2
  exit 2
fi
if [[ ! "${TARGET_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: target SHA must be a full 40-char commit hash" >&2
  exit 2
fi

LIVE_DIST="${ROOT}/dist"
STAGED_DIST=""
BUILD_WT=""
PREV_SHA=""
PREV_TAG=""
PREV_JS=""
BUILD_TAG=""
MAIN_JS=""
CUTOVER_STARTED=0
LOCK_FD=""

cleanup_temp() {
  if [[ -n "${BUILD_WT}" && -d "${BUILD_WT}" ]]; then
    "${GIT_BIN}" -C "${ROOT}" worktree remove --force "${BUILD_WT}" >/dev/null 2>&1 || rm -rf "${BUILD_WT}" || true
  fi
  if [[ -n "${STAGED_DIST}" && -d "${STAGED_DIST}" && "${CUTOVER_STARTED}" -eq 0 ]]; then
    rm -rf "${STAGED_DIST}" || true
  fi
}

die() {
  echo "ERROR: $*" >&2
  cleanup_temp
  exit 1
}

critical() {
  echo "CRITICAL: $*" >&2
  cleanup_temp
  exit 3
}

require_loaded_unit() {
  local unit="$1"
  local load
  load="$("${SYSTEMCTL_BIN}" show "${unit}" --no-pager -p LoadState 2>/dev/null || true)"
  if [[ "${load}" != "LoadState=loaded" ]]; then
    die "systemd unit ${unit} is not loaded (${load:-LoadState=unavailable}); refusing unmanaged process start"
  fi
}

wait_for_health() {
  local i
  local attempts="${CLOVER_DEPLOY_HEALTH_ATTEMPTS:-30}"
  for i in $(seq 1 "${attempts}"); do
    if "${CURL_BIN}" -fsS "${HEALTH_API}" >/dev/null 2>&1 \
      && "${CURL_BIN}" -fsS -o /dev/null "${HEALTH_UI}" 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: API/UI did not become ready in ${attempts}s" >&2
  return 1
}

extract_tag() {
  local html="$1"
  grep -o 'name="clover-ui-build" content="[^"]*"' <<<"${html}" | sed 's/.*content="//;s/"$//' || true
}

extract_js() {
  local html="$1"
  grep -o 'src="/assets/index-[^"]*\.js"' <<<"${html}" | head -1 || true
}

read_dist_meta() {
  local dist_dir="$1"
  local html_file="${dist_dir}/index.html"
  [[ -f "${html_file}" ]] || return 1
  BUILD_TAG="$(extract_tag "$(cat "${html_file}")")"
  MAIN_JS="$(extract_js "$(cat "${html_file}")")"
  [[ -n "${BUILD_TAG}" && -n "${MAIN_JS}" ]]
}

acquire_lock() {
  mkdir -p "$(dirname "${LOCK_FILE}")"
  exec {LOCK_FD}>"${LOCK_FILE}"
  if ! flock -n "${LOCK_FD}"; then
    die "another deployment holds ${LOCK_FILE}"
  fi
}

# Process management is systemd-only. Unsafe fallbacks are rejected by the deploy verifier.

rollback_release() {
  local why="$1"
  echo "Rolling back after failure: ${why}" >&2
  local rollback_ok=1

  if [[ -n "${PREV_SHA}" ]]; then
    if ! "${GIT_BIN}" -C "${ROOT}" reset --hard "${PREV_SHA}"; then
      echo "CRITICAL: source rollback to ${PREV_SHA} failed" >&2
      rollback_ok=0
    fi
  fi

  if [[ -d "${LKG_ROOT}/dist" ]]; then
    rm -rf "${LIVE_DIST}.broken" || true
    if [[ -d "${LIVE_DIST}" ]]; then
      mv "${LIVE_DIST}" "${LIVE_DIST}.broken" || true
    fi
    if ! mv "${LKG_ROOT}/dist" "${LIVE_DIST}"; then
      echo "CRITICAL: dist rollback from ${LKG_ROOT}/dist failed" >&2
      rollback_ok=0
      # best-effort restore broken path
      if [[ -d "${LIVE_DIST}.broken" && ! -d "${LIVE_DIST}" ]]; then
        mv "${LIVE_DIST}.broken" "${LIVE_DIST}" || true
      fi
    else
      rm -rf "${LIVE_DIST}.broken" || true
    fi
  else
    echo "CRITICAL: LKG dist missing; cannot restore UI dist" >&2
    rollback_ok=0
  fi

  if ! ${SUDO_SYSTEMCTL} restart "${API_UNIT%.service}" "${UI_UNIT%.service}"; then
    echo "CRITICAL: systemd restart during rollback failed" >&2
    rollback_ok=0
  fi

  if [[ "${rollback_ok}" -eq 1 ]]; then
    if wait_for_health; then
      echo "Rollback restored previous release (${PREV_SHA})." >&2
      cleanup_temp
      exit 1
    fi
    echo "CRITICAL: rollback health checks failed" >&2
  fi
  critical "rollback failed after cutover (${why})"
}

[[ -d "${ROOT}/.git" || -f "${ROOT}/.git" ]] || die "ROOT is not a git checkout: ${ROOT}"
[[ -d "${ROOT}" ]] || die "ROOT missing: ${ROOT}"

if [[ ! -d "${ROOT}/node_modules" && -z "${CLOVER_DEPLOY_NODE_MODULES:-}" ]]; then
  die "node_modules missing under ROOT; refusing package install during deploy"
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  # Read-only validation: no lock file, no staging dirs, no source/dist/service changes.
  echo "DRY-RUN: validating deploy inputs (no mutation)"
  require_loaded_unit "${API_UNIT}"
  require_loaded_unit "${UI_UNIT}"
  "${GIT_BIN}" -C "${ROOT}" rev-parse HEAD >/dev/null
  "${GIT_BIN}" cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null \
    || "${GIT_BIN}" -C "${ROOT}" cat-file -e "${TARGET_SHA}^{commit}" \
    || die "target SHA object not available: ${TARGET_SHA}"
  if [[ -n "$("${GIT_BIN}" -C "${ROOT}" status --porcelain=v1 --untracked-files=no)" ]]; then
    echo "DRY-RUN WARN: live tracked source has local modifications (deploy would refuse)" >&2
  fi
  echo "DRY-RUN OK: ROOT=${ROOT} target=${TARGET_SHA} staging=${STAGING_ROOT} lkg=${LKG_ROOT}"
  exit 0
fi

acquire_lock
trap 'cleanup_temp' EXIT

# Refuse dirty tracked source before any build/cutover.
if [[ -n "$("${GIT_BIN}" -C "${ROOT}" status --porcelain=v1 --untracked-files=no)" ]]; then
  die "live tracked source has local modifications; refusing deploy"
fi

PREV_SHA="$("${GIT_BIN}" -C "${ROOT}" rev-parse HEAD)"
if ! "${GIT_BIN}" -C "${ROOT}" cat-file -e "${TARGET_SHA}^{commit}"; then
  die "target SHA not present in ROOT repo: ${TARGET_SHA}"
fi
# Accept only current SHA or a descendant (fast-forward). Refuse older ancestors / diverged commits.
# Rollback uses recorded PREV_SHA internally and is not subject to this gate.
if ! "${GIT_BIN}" -C "${ROOT}" merge-base --is-ancestor "${PREV_SHA}" "${TARGET_SHA}"; then
  die "target is not a fast-forward descendant of current production SHA (${PREV_SHA})"
fi

require_loaded_unit "${API_UNIT}"
require_loaded_unit "${UI_UNIT}"

mkdir -p "${STAGING_ROOT}" "${LKG_ROOT}"
# Rename/move cutover requires same filesystem for live dist, staging, and LKG.
fs_device() {
  local path="$1"
  local override="$2"
  if [[ -n "${override}" ]]; then
    printf '%s\n' "${override}"
    return 0
  fi
  stat -c '%d' "${path}"
}
LIVE_FS_PROBE="${LIVE_DIST}"
[[ -e "${LIVE_FS_PROBE}" ]] || LIVE_FS_PROBE="${ROOT}"
LIVE_DEV="$(fs_device "${LIVE_FS_PROBE}" "${CLOVER_DEPLOY_FSDEV_LIVE:-}")"
STAGING_DEV="$(fs_device "${STAGING_ROOT}" "${CLOVER_DEPLOY_FSDEV_STAGING:-}")"
LKG_DEV="$(fs_device "${LKG_ROOT}" "${CLOVER_DEPLOY_FSDEV_LKG:-}")"
if [[ "${LIVE_DEV}" != "${STAGING_DEV}" || "${LIVE_DEV}" != "${LKG_DEV}" ]]; then
  die "cross-filesystem deploy staging is unsafe (live=${LIVE_DEV} staging=${STAGING_DEV} lkg=${LKG_DEV})"
fi

STAGED_DIST="${STAGING_ROOT}/dist-${TARGET_SHA}-$$"
BUILD_WT="${STAGING_ROOT}/src-${TARGET_SHA}-$$"
rm -rf "${STAGED_DIST}" "${BUILD_WT}"
mkdir -p "${STAGED_DIST}"

echo "Recording previous release: ${PREV_SHA}"
if [[ -d "${LIVE_DIST}" ]]; then
  rm -rf "${LKG_ROOT}/dist"
  cp -a "${LIVE_DIST}" "${LKG_ROOT}/dist"
  if [[ -f "${LIVE_DIST}/index.html" ]]; then
    PREV_TAG="$(extract_tag "$(cat "${LIVE_DIST}/index.html")")"
    PREV_JS="$(extract_js "$(cat "${LIVE_DIST}/index.html")")"
  fi
fi
echo "Previous live tag: ${PREV_TAG:-unknown}"
echo "Previous live bundle: ${PREV_JS:-unknown}"

echo "Creating isolated build worktree for ${TARGET_SHA}..."
"${GIT_BIN}" -C "${ROOT}" worktree add --detach "${BUILD_WT}" "${TARGET_SHA}"

# Reuse trusted installed dependencies; never npm install/ci/update.
if [[ -n "${CLOVER_DEPLOY_NODE_MODULES:-}" ]]; then
  ln -sfn "${CLOVER_DEPLOY_NODE_MODULES}" "${BUILD_WT}/node_modules"
elif [[ -d "${ROOT}/node_modules" ]]; then
  ln -sfn "${ROOT}/node_modules" "${BUILD_WT}/node_modules"
fi
if [[ -n "${CLOVER_DEPLOY_SERVER_NODE_MODULES:-}" ]]; then
  mkdir -p "${BUILD_WT}/server"
  ln -sfn "${CLOVER_DEPLOY_SERVER_NODE_MODULES}" "${BUILD_WT}/server/node_modules"
elif [[ -d "${ROOT}/server/node_modules" ]]; then
  mkdir -p "${BUILD_WT}/server"
  ln -sfn "${ROOT}/server/node_modules" "${BUILD_WT}/server/node_modules"
fi

# Vite may need production env files that are not in git. Expose via read-only
# symlink into the temporary build worktree only — never copy into dist/artifacts.
if [[ -f "${ROOT}/.env.production" ]]; then
  ln -sfn "${ROOT}/.env.production" "${BUILD_WT}/.env.production"
fi

DB_PATH_BUILD="${CLOVER_DEPLOY_DB_PATH:-${ROOT}/server/data/clover.sqlite}"
if [[ ! -f "${DB_PATH_BUILD}" ]]; then
  die "DB for sitemap build not found: ${DB_PATH_BUILD}"
fi

echo "Building release off live path into staged dist..."
# IMPORTANT: build must NOT write into live ROOT/dist.
BUILD_PREV_PWD="$(pwd)"
cd "${BUILD_WT}"
export DB_PATH="${DB_PATH_BUILD}"
# Keep sitemap inside the off-live worktree dist, then promote atomically.
export SITEMAP_OUT="${BUILD_WT}/dist/sitemap.xml"
mkdir -p "${BUILD_WT}/dist"
if ! "${NPM_BIN}" run build; then
  cd "${BUILD_PREV_PWD}"
  die "staged build failed; live source/dist/services unchanged"
fi
if [[ ! -f "${BUILD_WT}/dist/index.html" ]]; then
  cd "${BUILD_PREV_PWD}"
  die "build produced no index.html in worktree dist"
fi
if [[ ! -f "${BUILD_WT}/dist/sitemap.xml" ]]; then
  cd "${BUILD_PREV_PWD}"
  die "build produced no sitemap.xml in worktree dist"
fi
# Copy complete off-live dist into staging directory (never into live ROOT/dist).
rm -rf "${STAGED_DIST}"
mkdir -p "${STAGED_DIST}"
cp -a "${BUILD_WT}/dist/." "${STAGED_DIST}/"
cd "${BUILD_PREV_PWD}"

[[ -f "${STAGED_DIST}/index.html" ]] || die "staged index.html missing"
[[ -f "${STAGED_DIST}/sitemap.xml" ]] || die "staged sitemap.xml missing"
read_dist_meta "${STAGED_DIST}" || die "staged dist missing build tag/bundle"
echo "Staged UI build tag: ${BUILD_TAG}"
echo "Staged UI bundle: ${MAIN_JS}"

# Pre-cutover validation complete. Live dist still untouched until here.
echo "Cutover: switching source to ${TARGET_SHA} and promoting staged dist..."
CUTOVER_STARTED=1

"${GIT_BIN}" -C "${ROOT}" reset --hard "${TARGET_SHA}" \
  || rollback_release "source reset to ${TARGET_SHA} failed"

# Same-filesystem rename/move for dist cutover.
rm -rf "${LIVE_DIST}.prev" || true
if [[ -d "${LIVE_DIST}" ]]; then
  mv "${LIVE_DIST}" "${LIVE_DIST}.prev" \
    || rollback_release "could not move live dist aside"
fi
if ! mv "${STAGED_DIST}" "${LIVE_DIST}"; then
  # restore previous live dist if move failed
  if [[ -d "${LIVE_DIST}.prev" ]]; then
    mv "${LIVE_DIST}.prev" "${LIVE_DIST}" || true
  fi
  rollback_release "could not promote staged dist"
fi
rm -rf "${LIVE_DIST}.prev" || true
STAGED_DIST="" # promoted; do not delete on cleanup

echo "Restarting ${API_UNIT} and ${UI_UNIT} via systemd..."
if ! ${SUDO_SYSTEMCTL} restart "${API_UNIT%.service}" "${UI_UNIT%.service}"; then
  rollback_release "systemd restart failed"
fi

"${SYSTEMCTL_BIN}" is-active --quiet "${API_UNIT}" || rollback_release "API unit not active"
"${SYSTEMCTL_BIN}" is-active --quiet "${UI_UNIT}" || rollback_release "UI unit not active"

wait_for_health || rollback_release "post-cutover health failed"

LIVE_HTML="$("${CURL_BIN}" -fsS "${HEALTH_UI}" || true)"
LIVE_TAG="$(extract_tag "${LIVE_HTML}")"
LIVE_JS="$(extract_js "${LIVE_HTML}")"
echo "Live UI tag: ${LIVE_TAG:-unknown}"
echo "Live bundle: ${LIVE_JS:-unknown}"

if [[ -z "${LIVE_TAG}" || "${LIVE_TAG}" != "${BUILD_TAG}" ]]; then
  rollback_release "live build tag mismatch (expected ${BUILD_TAG}, got ${LIVE_TAG:-empty})"
fi
if [[ -z "${LIVE_JS}" || "${LIVE_JS}" != "${MAIN_JS}" ]]; then
  rollback_release "live bundle mismatch (expected ${MAIN_JS}, got ${LIVE_JS:-empty})"
fi

# Bounded LKG: keep only one previous dist snapshot.
# LKG_ROOT/dist already holds pre-cutover snapshot; leave it until next deploy overwrites.

# Remove detached build worktree.
cleanup_temp
trap - EXIT

echo "Listener diagnostics (no process termination):"
ss -tlnp 2>/dev/null | grep -E ':4100|:5273' || echo "WARN: expected ports 4100/5273 not listed" >&2

echo "Deploy OK."
echo "Deployed SHA: ${TARGET_SHA}"
echo "UI build tag: ${BUILD_TAG}"
echo "UI bundle: ${MAIN_JS}"
