#!/usr/bin/env bash
# Extract the deploy script FROM the target commit and run it BEFORE live ROOT
# is switched. Live source/dist stay on the previous SHA until the extracted
# script performs cutover. First cutover and rollback therefore use the new
# asset gate even when live still has the old restart-api-ui.sh.
#
# Usage (from any cwd; ROOT is never inferred from this file's location):
#   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
#     bash /opt/clover/deployments/staging/delivered-deploy-<sha>/run-target-deploy.sh <40-char-sha>
#
# First deploy while live ROOT still has the previous tree:
#   1) fetch the SHA into ROOT's object DB (no reset, no live source switch)
#   2) git show SHA:scripts/linux/run-target-deploy.sh into STAGING (not ROOT)
#   3) bash that extracted file with CLOVER_DEPLOY_ROOT set
# Dependencies of THIS file: bash, git, mkdir, chmod. It does not need node/npm/curl.
# The extracted restart-api-ui.sh then needs node, npm, curl, flock, systemd.
#
# The SHA object must already be in ROOT's git (fetch first). This script
# does not reset ROOT, does not talk to production 1С, and does not chmod dist.
set -euo pipefail

ROOT="${CLOVER_DEPLOY_ROOT:-/opt/clover/clover-app}"
STAGING_ROOT="${CLOVER_DEPLOY_STAGING:-/opt/clover/deployments/staging}"
GIT_BIN="${CLOVER_DEPLOY_GIT:-git}"
TARGET_SHA="${1:-${CLOVER_DEPLOY_TARGET_SHA:-}}"

if [[ -z "${TARGET_SHA}" ]]; then
  echo "ERROR: target commit SHA required: $0 <sha>" >&2
  exit 2
fi
if [[ ! "${TARGET_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: target SHA must be a full 40-char commit hash" >&2
  exit 2
fi
if [[ ! -d "${ROOT}/.git" && ! -f "${ROOT}/.git" ]]; then
  echo "ERROR: ROOT is not a git checkout: ${ROOT}" >&2
  exit 2
fi
if ! "${GIT_BIN}" -C "${ROOT}" cat-file -e "${TARGET_SHA}^{commit}"; then
  echo "ERROR: target SHA object not in ROOT repo: ${TARGET_SHA}" >&2
  exit 2
fi

EXTRACT="${STAGING_ROOT}/delivered-deploy-${TARGET_SHA}"
mkdir -p "${EXTRACT}"
if ! "${GIT_BIN}" -C "${ROOT}" show "${TARGET_SHA}:scripts/linux/restart-api-ui.sh" \
  > "${EXTRACT}/restart-api-ui.sh"; then
  echo "ERROR: target commit has no scripts/linux/restart-api-ui.sh" >&2
  exit 1
fi
if ! "${GIT_BIN}" -C "${ROOT}" show "${TARGET_SHA}:server/scripts/uiAssetProbe.mjs" \
  > "${EXTRACT}/uiAssetProbe.mjs"; then
  echo "ERROR: target commit has no server/scripts/uiAssetProbe.mjs" >&2
  exit 1
fi
if ! "${GIT_BIN}" -C "${ROOT}" show "${TARGET_SHA}:server/scripts/releaseNamespace.js" \
  > "${EXTRACT}/releaseNamespace.js"; then
  echo "ERROR: target commit has no server/scripts/releaseNamespace.js" >&2
  exit 1
fi
chmod +x "${EXTRACT}/restart-api-ui.sh" || true

export CLOVER_DEPLOY_ROOT="${ROOT}"
export CLOVER_DEPLOY_STAGING="${STAGING_ROOT}"
export CLOVER_DEPLOY_PROBE_JS="${EXTRACT}/uiAssetProbe.mjs"
echo "FIRST_DEPLOY_LAUNCHER: invoked=${EXTRACT}/restart-api-ui.sh"
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
exec bash "${EXTRACT}/restart-api-ui.sh" "${TARGET_SHA}"
