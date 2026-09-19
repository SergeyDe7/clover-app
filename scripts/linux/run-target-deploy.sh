#!/usr/bin/env bash
# Extract the deploy script FROM the target commit and run it BEFORE live ROOT
# is switched. Live source/dist stay on the previous SHA until the extracted
# script performs cutover. First cutover and rollback therefore use the new
# asset gate even when live still has the old restart-api-ui.sh.
#
# Usage (from any cwd; ROOT is never inferred from this file's location):
#   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
#     bash /opt/clover/deployments/staging/delivered-deploy-<sha>/run-target-deploy.sh <40-char-sha>
#   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
#     bash .../run-target-deploy.sh prepare <40-char-sha>
#   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
#     bash .../run-target-deploy.sh promote <prepared-dir> <40-char-sha>
#
# There is no hidden build-skip switch. prepare builds once; promote installs that tree.
# promote pins the expected SHA from argv (or CLOVER_DEPLOY_TARGET_SHA). It does not
# read targetSha from the manifest to choose which helpers to extract.
#
# First deploy while live ROOT still has the previous tree:
#   1) fetch the SHA into ROOT's object DB (no reset, no live source switch)
#   2) git show SHA:scripts/linux/run-target-deploy.sh into STAGING (not ROOT)
#   3) bash that extracted file with CLOVER_DEPLOY_ROOT set
# Dependencies of THIS file: bash, git, mkdir, chmod.
# promote also needs node after extract, to run the trusted inspect-sha helper
# from the pinned SHA. The extracted restart-api-ui.sh then needs node, npm,
# curl, flock, systemd.
#
# The SHA object must already be in ROOT's git (fetch first). This script
# does not reset ROOT, does not talk to production 1С, and does not chmod dist.
set -euo pipefail

ROOT="${CLOVER_DEPLOY_ROOT:-/opt/clover/clover-app}"
STAGING_ROOT="${CLOVER_DEPLOY_STAGING:-/opt/clover/deployments/staging}"
GIT_BIN="${CLOVER_DEPLOY_GIT:-git}"
LAUNCH_MODE="deploy"
TARGET_SHA=""
PREPARED_PATH=""

if [[ "${1:-}" == "prepare" ]]; then
  LAUNCH_MODE="prepare"
  TARGET_SHA="${2:-${CLOVER_DEPLOY_TARGET_SHA:-}}"
elif [[ "${1:-}" == "promote" ]]; then
  LAUNCH_MODE="promote"
  PREPARED_PATH="${2:-${CLOVER_DEPLOY_PREPARED_PATH:-}}"
  TARGET_SHA="${3:-${CLOVER_DEPLOY_TARGET_SHA:-}}"
else
  TARGET_SHA="${1:-${CLOVER_DEPLOY_TARGET_SHA:-}}"
fi

if [[ "${LAUNCH_MODE}" == "promote" ]]; then
  if [[ -z "${PREPARED_PATH}" || ! -f "${PREPARED_PATH}/manifest.json" ]]; then
    echo "ERROR: promote requires a prepared artifact directory with manifest.json" >&2
    exit 2
  fi
  if [[ -z "${TARGET_SHA}" ]]; then
    echo "ERROR: promote requires an explicit expected target SHA: $0 promote <dir> <sha>" >&2
    exit 2
  fi
fi

if [[ -z "${TARGET_SHA}" ]]; then
  echo "ERROR: target commit SHA required: $0 <sha>|prepare <sha>|promote <dir> <sha>" >&2
  exit 2
fi
if [[ ! "${TARGET_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: target SHA must be a full 40-char commit hash" >&2
  exit 2
fi
TARGET_SHA="$(printf '%s' "${TARGET_SHA}" | tr 'A-F' 'a-f')"
PINNED_SHA="${TARGET_SHA}"
if [[ ! -d "${ROOT}/.git" && ! -f "${ROOT}/.git" ]]; then
  echo "ERROR: ROOT is not a git checkout: ${ROOT}" >&2
  exit 2
fi
if ! "${GIT_BIN}" -C "${ROOT}" cat-file -e "${PINNED_SHA}^{commit}"; then
  echo "ERROR: target SHA object not in ROOT repo: ${PINNED_SHA}" >&2
  exit 2
fi

EXTRACT="${STAGING_ROOT}/delivered-deploy-${PINNED_SHA}"
mkdir -p "${EXTRACT}"
extract_file() {
  local repo_path="$1"
  local dest="$2"
  if ! "${GIT_BIN}" -C "${ROOT}" show "${PINNED_SHA}:${repo_path}" > "${dest}"; then
    echo "ERROR: target commit has no ${repo_path}" >&2
    exit 1
  fi
}
extract_file "scripts/linux/restart-api-ui.sh" "${EXTRACT}/restart-api-ui.sh"
extract_file "server/scripts/uiAssetProbe.mjs" "${EXTRACT}/uiAssetProbe.mjs"
extract_file "server/scripts/releaseNamespace.js" "${EXTRACT}/releaseNamespace.js"
extract_file "server/scripts/preparedDist.mjs" "${EXTRACT}/preparedDist.mjs"
chmod +x "${EXTRACT}/restart-api-ui.sh" || true
if [[ "${LAUNCH_MODE}" == "promote" ]]; then
  EXTRACTED_SHA="$(node "${EXTRACT}/preparedDist.mjs" inspect-sha --manifest "${PREPARED_PATH}/manifest.json")"
  if [[ "${EXTRACTED_SHA}" != "${PINNED_SHA}" ]]; then
    echo "ERROR: prepared manifest targetSha does not match pinned ${PINNED_SHA}; refusing promote" >&2
    exit 1
  fi
  TARGET_SHA="${PINNED_SHA}"
fi

export CLOVER_DEPLOY_ROOT="${ROOT}"
export CLOVER_DEPLOY_STAGING="${STAGING_ROOT}"
export CLOVER_DEPLOY_PROBE_JS="${EXTRACT}/uiAssetProbe.mjs"
export CLOVER_DEPLOY_TARGET_SHA="${PINNED_SHA}"
echo "FIRST_DEPLOY_LAUNCHER: invoked=${EXTRACT}/restart-api-ui.sh"
echo "FIRST_DEPLOY_LAUNCHER: mode=${LAUNCH_MODE}"
echo "FIRST_DEPLOY_LAUNCHER: pinned_sha=${PINNED_SHA}"
echo "FIRST_DEPLOY_LAUNCHER: root=${ROOT}"
abs_root="$(cd "${ROOT}" && pwd)"
abs_extract="$(cd "${EXTRACT}" && pwd)"
echo "FIRST_DEPLOY_LAUNCHER: abs_root=${abs_root}"
echo "FIRST_DEPLOY_LAUNCHER: abs_extract=${abs_extract}"
case "${abs_extract}" in
  "${abs_root}"|"${abs_root}"/*)
    echo "ERROR: extract dir must not be inside live ROOT" >&2
    exit 1
    ;;
esac
if [[ "${LAUNCH_MODE}" == "prepare" ]]; then
  exec bash "${EXTRACT}/restart-api-ui.sh" prepare "${PINNED_SHA}"
fi
if [[ "${LAUNCH_MODE}" == "promote" ]]; then
  exec bash "${EXTRACT}/restart-api-ui.sh" promote "${PREPARED_PATH}" "${PINNED_SHA}"
fi
exec bash "${EXTRACT}/restart-api-ui.sh" "${PINNED_SHA}"
