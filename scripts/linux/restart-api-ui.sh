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
#   CLOVER_DEPLOY_ORIGIN_BASE, CLOVER_DEPLOY_NGINX_UI, CLOVER_DEPLOY_NGINX_RESOLVE
#   CLOVER_DEPLOY_CANONICAL_HOST, CLOVER_DEPLOY_TLS_CA, CLOVER_DEPLOY_PROBE_JS
#   CLOVER_DEPLOY_DB_PATH, CLOVER_DEPLOY_NODE_MODULES, CLOVER_DEPLOY_SERVER_NODE_MODULES
#   CLOVER_DEPLOY_DRY_RUN=1  — resolve/validate only; never mutate live source/dist/services
#
# First deploy of this SHA while live still has the previous script:
#   bash scripts/linux/run-target-deploy.sh <sha>
# That extracts THIS file + uiAssetProbe.mjs from the target commit into staging
# and execs them. ROOT stays CLOVER_DEPLOY_ROOT (never this file's directory).
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
ORIGIN_BASE="${CLOVER_DEPLOY_ORIGIN_BASE:-http://127.0.0.1:5273}"
NGINX_UI="${CLOVER_DEPLOY_NGINX_UI:-https://clover-spb.ru}"
NGINX_RESOLVE="${CLOVER_DEPLOY_NGINX_RESOLVE:-127.0.0.1}"
CANONICAL_HOST="${CLOVER_DEPLOY_CANONICAL_HOST:-clover-spb.ru}"
READY_CONSECUTIVE="${CLOVER_DEPLOY_READY_CONSECUTIVE:-2}"
DRY_RUN="${CLOVER_DEPLOY_DRY_RUN:-0}"
API_UNIT="${CLOVER_DEPLOY_API_UNIT:-clover-api.service}"
UI_UNIT="${CLOVER_DEPLOY_UI_UNIT:-clover-ui.service}"
PROBE_JS=""

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

install_runtime_probe() {
  local script_dir invoked_root src
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  invoked_root="$(cd "${script_dir}/../.." && pwd)"
  for src in \
    "${CLOVER_DEPLOY_PROBE_JS:-}" \
    "${script_dir}/uiAssetProbe.mjs" \
    "${invoked_root}/server/scripts/uiAssetProbe.mjs" \
    "${ROOT}/server/scripts/uiAssetProbe.mjs"
  do
    if [[ -n "${src}" && -f "${src}" ]]; then
      mkdir -p "${STAGING_ROOT}"
      PROBE_JS="${STAGING_ROOT}/uiAssetProbe.runtime.mjs"
      cp "${src}" "${PROBE_JS}"
      if [[ -f "$(dirname "${src}")/releaseNamespace.js" ]]; then
        cp "$(dirname "${src}")/releaseNamespace.js" "${STAGING_ROOT}/releaseNamespace.js"
      fi
      return 0
    fi
  done
  return 1
}

nginx_resolve_spec() {
  if [[ -z "${NGINX_UI}" ]]; then
    return 0
  fi
  if [[ "${NGINX_UI}" == https://* && -n "${NGINX_RESOLVE}" ]]; then
    printf '%s\n' "${CANONICAL_HOST}:443:${NGINX_RESOLVE}"
  fi
}

check_dist_assets() {
  local dist_dir="$1"
  local expected="${2:-${EXPECT_LOCALE:-}}"
  [[ -n "${PROBE_JS}" ]] || return 1
  [[ -f "${dist_dir}/index.html" ]] || return 1
  [[ -n "${expected}" ]] || return 1
  node "${PROBE_JS}" check-dist --html-file "${dist_dir}/index.html" --dist "${dist_dir}" \
    --expected-locale-stamp "${expected}" \
    || return 1
  node "${PROBE_JS}" check-namespace --html-file "${dist_dir}/index.html" --dist "${dist_dir}" \
    --expected-locale-stamp "${expected}"
}

check_http_assets() {
  local html="$1"
  local html_file rc resolve_spec
  [[ -n "${PROBE_JS}" ]] || return 1
  if [[ -z "${NGINX_UI}" ]]; then
    echo "ERROR: CLOVER_DEPLOY_NGINX_UI is required; origin-only is not a deploy PASS" >&2
    return 1
  fi
  html_file="$(mktemp)"
  printf '%s' "${html}" > "${html_file}"
  resolve_spec="$(nginx_resolve_spec || true)"
  local -a probe_args=(
    check-http
    --html-file "${html_file}"
    --dist "${LIVE_DIST}"
    --origin "${ORIGIN_BASE}"
    --nginx "${NGINX_UI}"
    --nginx-resolve "${resolve_spec}"
    --curl "${CURL_BIN}"
  )
  if [[ -n "${CLOVER_DEPLOY_TLS_CA:-}" ]]; then
    probe_args+=(--cacert "${CLOVER_DEPLOY_TLS_CA}")
  fi
  set +e
  node "${PROBE_JS}" "${probe_args[@]}"
  rc=$?
  set -e
  rm -f "${html_file}"
  return "${rc}"
}

# Bounded readiness: one shared deadline, transient first failures allowed,
# two consecutive full passes (API + UI HTML + origin assets + nginx assets).
# No worker-drain loop. Reverse-proxy reload is not part of this script.
wait_for_health() {
  local i
  local attempts="${CLOVER_DEPLOY_HEALTH_ATTEMPTS:-60}"
  local consecutive=0
  local html
  for i in $(seq 1 "${attempts}"); do
    html=""
    if "${CURL_BIN}" -fsS "${HEALTH_API}" >/dev/null 2>&1 \
      && html="$("${CURL_BIN}" -fsS "${HEALTH_UI}" 2>/dev/null)" \
      && [[ -n "${html}" ]] \
      && check_http_assets "${html}"; then
      consecutive=$((consecutive + 1))
      if [[ "${consecutive}" -ge "${READY_CONSECUTIVE}" ]]; then
        return 0
      fi
    else
      consecutive=0
    fi
    sleep 1
  done
  echo "ERROR: API/UI/assets did not become ready in ${attempts}s (${READY_CONSECUTIVE} consecutive passes required). Not a browser smoke PASS." >&2
  return 1
}

extract_tag() {
  local html="$1"
  grep -o 'name="clover-ui-build" content="[^"]*"' <<<"${html}" | sed 's/.*content="//;s/"$//' || true
}

extract_js() {
  local html="$1"
  grep -oE 'src="/assets/([^"]+/)?index-[^"]+\.js"' <<<"${html}" | head -1 || true
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
install_runtime_probe || die "uiAssetProbe.mjs missing; refusing deploy without asset gate"
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

# Isolated worktrees do not contain server/.env. Pass only the locale-route
# boolean into the off-live build — never source the rest of dotenv, never
# treat DB languages as a substitute for the explicit flag.
LOCALE_ENV_FILE="${ROOT}/server/.env"
ASSERT_JS="${BUILD_WT}/server/scripts/assert-locale-route-release.mjs"
if [[ ! -f "${ASSERT_JS}" ]]; then
  ASSERT_JS="${ROOT}/server/scripts/assert-locale-route-release.mjs"
fi
EXPECT_LOCALE=""
if [[ -f "${ASSERT_JS}" ]]; then
  PRINT_EXPECT_ARGS=(
    --print-expect
    --require-flag
    --locale-env-file "${LOCALE_ENV_FILE}"
    --db "${DB_PATH_BUILD}"
  )
  if [[ "${CLOVER_DEPLOY_ALLOW_DISABLED_LOCALE_ROUTES:-}" != "1" ]]; then
    PRINT_EXPECT_ARGS+=(--fail-if-disabled-with-foreign-languages)
  fi
  EXPECT_LOCALE="$(node -- "${ASSERT_JS}" "${PRINT_EXPECT_ARGS[@]}")" \
    || die "required locale-route flag is missing, unreadable, or inconsistent with configuration; refusing cutover"
  EXPECT_LOCALE="$(printf '%s' "${EXPECT_LOCALE}" | tr -d '[:space:]')"
else
  if [[ ! -f "${LOCALE_ENV_FILE}" ]]; then
    die "required locale-route flag file missing (${LOCALE_ENV_FILE}); refusing cutover"
  fi
  set +e
  LOCALE_FLAG_VALUE="$(
    awk -F= '
      $1 ~ /^[[:space:]]*(export[[:space:]]+)?CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED[[:space:]]*$/ {
        found=1
        v=$2
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        gsub(/^["'"'"']|["'"'"']$/, "", v)
        val=v
      }
      END {
        if (!found) exit 3
        printf "%s", val
      }
    ' "${LOCALE_ENV_FILE}"
  )"
  FLAG_READ_STATUS=$?
  set -e
  if [[ "${FLAG_READ_STATUS}" -eq 3 ]]; then
    die "required CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED missing in ${LOCALE_ENV_FILE}; refusing cutover"
  fi
  if [[ "${FLAG_READ_STATUS}" -ne 0 ]]; then
    die "failed to read locale-route flag from ${LOCALE_ENV_FILE}; refusing cutover"
  fi
  if [[ "${LOCALE_FLAG_VALUE}" == "1" ]]; then
    EXPECT_LOCALE="enabled"
  else
    EXPECT_LOCALE="disabled"
  fi
fi
if [[ "${EXPECT_LOCALE}" == "enabled" ]]; then
  export CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1
  echo "Locale routes: isolated build enabling public locale infrastructure"
elif [[ "${EXPECT_LOCALE}" == "disabled" ]]; then
  export CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=0
  echo "Locale routes: isolated build keeping public locale infrastructure disabled"
else
  die "locale-route expect must be enabled or disabled, got: ${EXPECT_LOCALE}"
fi

echo "Building release off live path into staged dist..."
# IMPORTANT: build must NOT write into live ROOT/dist.
# Do not use `npm run build -- --outDir …`: extra args attach to generate-sitemap, not Vite.
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
check_dist_assets "${STAGED_DIST}" || die "staged dist is missing referenced JS/CSS/fonts or chunks"
echo "Staged UI build tag: ${BUILD_TAG}"
echo "Staged UI bundle: ${MAIN_JS}"

if [[ "${EXPECT_LOCALE}" == "enabled" ]]; then
  if [[ -f "${ASSERT_JS}" ]]; then
    node "${ASSERT_JS}" --dist "${STAGED_DIST}" --db "${DB_PATH_BUILD}" --expect enabled \
      || die "locale-route artifacts rejected; live source/dist/services unchanged"
  else
    if ! grep -q 'name="clover-public-locale-routes"' "${STAGED_DIST}/index.html" \
      || ! grep -q 'content="enabled"' "${STAGED_DIST}/index.html"; then
      die "locale-route HTML stamp is not enabled; refusing cutover"
    fi
    if [[ ! -f "${STAGED_DIST}/public-route-manifest.json" ]] \
      || ! grep -q '"infrastructureEnabled":true' "${STAGED_DIST}/public-route-manifest.json"; then
      die "locale-route manifest is disabled or missing; refusing cutover"
    fi
    if grep -q '"routes":{}' "${STAGED_DIST}/public-route-manifest.json"; then
      die "locale-route manifest routes are empty; refusing cutover"
    fi
    if grep -q '<loc>https://clover-spb.ru/</loc>' "${STAGED_DIST}/sitemap.xml"; then
      die "sitemap has unprefixed homepage; refusing cutover"
    fi
  fi
fi

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
