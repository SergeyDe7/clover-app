#!/usr/bin/env bash
# Explicit post-Deploy-OK recovery for the one-time PR #159 SEO cutover.
# Never run automatically. Owner approval is required for --apply.
# Usage: recover-seo-post-success.sh --target <40-char-sha> --manifest-sha256 <64-char-hex> --check|--apply
set -euo pipefail

ROOT="${CLOVER_DEPLOY_ROOT:-/opt/clover/clover-app}"
STAGING="${CLOVER_DEPLOY_STAGING:-/opt/clover/deployments/staging}"
LOCK="${CLOVER_DEPLOY_LOCK:-/opt/clover/deployments/deploy.lock}"
GIT="${CLOVER_DEPLOY_GIT:-git}"
SYSTEMCTL="${CLOVER_DEPLOY_SYSTEMCTL:-systemctl}"
SUDO_SYSTEMCTL="${CLOVER_DEPLOY_SUDO_SYSTEMCTL:-sudo -n /bin/systemctl}"
CURL="${CLOVER_DEPLOY_CURL:-curl}"
ORIGIN="${CLOVER_DEPLOY_ORIGIN_BASE:-http://127.0.0.1:5273}"
NGINX="${CLOVER_DEPLOY_NGINX_UI:-https://clover-spb.ru}"
NGINX_RESOLVE="${CLOVER_DEPLOY_NGINX_RESOLVE:-127.0.0.1}"
CANONICAL_HOST="${CLOVER_DEPLOY_CANONICAL_HOST:-clover-spb.ru}"
HEALTH_API="${CLOVER_DEPLOY_HEALTH_API:-http://127.0.0.1:4100/api/health}"
HEALTH_UI="${CLOVER_DEPLOY_HEALTH_UI:-http://127.0.0.1:5273/}"
API_UNIT="${CLOVER_DEPLOY_API_UNIT:-clover-api.service}"
UI_UNIT="${CLOVER_DEPLOY_UI_UNIT:-clover-ui.service}"
BASE_SHA="21259c768b3dbf2de17da9a0b676f571380c6a1b"
FEATURE_SHA="a952974bd5126d4000ed6d0fda1d696bfca49b36"
BACKUP="/opt/clover/deployments/lkg/seo-before-a3a158c7914d82ae3d2b8abea55788126adf0124"
OLD_MANIFEST="/opt/clover/deployments/staging/prepared-21259c768b3dbf2de17da9a0b676f571380c6a1b/manifest.json"
OLD_MANIFEST_SHA="f0db034cff474006b832af812d68042298265e5820fff0a9a8245e200b0afdb2"

TARGET=""
MANIFEST_SHA=""
MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --manifest-sha256) MANIFEST_SHA="${2:-}"; shift 2 ;;
    --check|--apply) [[ -z "${MODE}" ]] || { echo "ERROR: choose one mode" >&2; exit 2; }; MODE="$1"; shift ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "${TARGET}" =~ ^[0-9a-f]{40}$ && "${MANIFEST_SHA}" =~ ^[0-9a-f]{64}$ && -n "${MODE}" ]] || {
  echo "ERROR: exact target SHA, manifest SHA-256, and --check|--apply required" >&2; exit 2;
}
[[ "${TARGET}" != "${BASE_SHA}" ]] || { echo "ERROR: target cannot equal baseline" >&2; exit 2; }
[[ "${CANONICAL_HOST}" == "clover-spb.ru" ]] || { echo "ERROR: canonical host override refused" >&2; exit 2; }
if [[ "${CLOVER_SEO_RECOVERY_FIXTURE:-0}" == "1" ]]; then
  [[ "${ROOT}" == *clover-deploy-seo-post-success-recovery-*/live ]] || { echo "ERROR: invalid recovery fixture root" >&2; exit 2; }
  FIXTURE_PARENT="$(realpath "$(dirname "${ROOT}")")"
  [[ "${FIXTURE_PARENT}" == *clover-deploy-seo-post-success-recovery-* && "${FIXTURE_PARENT}" != /opt/* ]] || { echo "ERROR: recovery fixture resolves outside test area" >&2; exit 2; }
  [[ "$(realpath "${ROOT}")" == "${FIXTURE_PARENT}/live" && "$(realpath "${STAGING}")" == "${FIXTURE_PARENT}/staging" && "$(realpath -m "${LOCK}")" == "${FIXTURE_PARENT}/deploy.lock" ]] || { echo "ERROR: recovery fixture staging/lock mismatch" >&2; exit 2; }
else
  [[ "${ROOT}" == "/opt/clover/clover-app" && "${STAGING}" == "/opt/clover/deployments/staging" && "${LOCK}" == "/opt/clover/deployments/deploy.lock" ]] || { echo "ERROR: production root/staging/lock identity mismatch" >&2; exit 2; }
  [[ "$(realpath "${ROOT}")" == "/opt/clover/clover-app" && "$(realpath "${STAGING}")" == "/opt/clover/deployments/staging" && "$(realpath -m "${LOCK}")" == "/opt/clover/deployments/deploy.lock" ]] || { echo "ERROR: production path resolves outside pinned deployment" >&2; exit 2; }
  [[ "${GIT}" == "git" && "${SYSTEMCTL}" == "systemctl" && "${SUDO_SYSTEMCTL}" == "sudo -n /bin/systemctl" && "${CURL}" == "curl" ]] || { echo "ERROR: production command override refused" >&2; exit 2; }
  [[ "${ORIGIN}" == "http://127.0.0.1:5273" && "${NGINX}" == "https://clover-spb.ru" && "${NGINX_RESOLVE}" == "127.0.0.1" && "${CANONICAL_HOST}" == "clover-spb.ru" && "${HEALTH_API}" == "http://127.0.0.1:4100/api/health" && "${HEALTH_UI}" == "http://127.0.0.1:5273/" ]] || { echo "ERROR: production endpoint override refused" >&2; exit 2; }
  [[ "${API_UNIT}" == "clover-api.service" && "${UI_UNIT}" == "clover-ui.service" && -z "${CLOVER_PROBE_BASH:-}" && -z "${CLOVER_DEPLOY_TLS_CA:-}" ]] || { echo "ERROR: production unit/TLS/probe override refused" >&2; exit 2; }
fi

fail() { echo "ERROR: $*" >&2; exit 1; }
critical() {
  if [[ "${FAILED_UI_PRESERVED:-0}" == "1" ]]; then
    echo "CRITICAL: $*; failed-ui=${RECOVERY}/failed-dist" >&2
  else
    echo "CRITICAL: $*" >&2
  fi
  exit 3
}
hash_is() {
  local actual
  actual="$(sha256sum <"$1" | awk '{print $1}')" || return 1
  [[ "${actual}" == "$2" ]]
}
resolve_spec() {
  if [[ "${NGINX}" == https://* && -n "${NGINX_RESOLVE}" ]]; then
    printf '%s:443:%s\n' "${CANONICAL_HOST}" "${NGINX_RESOLVE}"
  fi
}
extract_tag() {
  grep -o 'name="clover-ui-build" content="[^"]*"' <<<"$1" | sed 's/.*content="//;s/"$//' || true
}
extract_js() {
  grep -oE 'src="/assets/([^"]+/)?index-[^"]+\.js"' <<<"$1" | head -1 || true
}
check_live_html() {
  local label="$1" base="$2"; shift 2
  local html tag bundle
  html="$("${CURL}" --fail --silent --show-error --noproxy '*' --max-time 10 "$@" "${base%/}/")" || critical "${label} HTML fetch failed"
  tag="$(extract_tag "${html}")"
  bundle="$(extract_js "${html}")"
  [[ "${tag}" == "${OLD_TAG}" && "${bundle}" == "${OLD_JS}" ]] || critical "${label} serves wrong UI tag/bundle (${tag:-none}, ${bundle:-none})"
}

[[ -d "${ROOT}/.git" || -f "${ROOT}/.git" ]] || fail "ROOT is not a Git checkout"
[[ -d "${STAGING}" && -d "${BACKUP}" && -f "${OLD_MANIFEST}" ]] || fail "staging, dedicated backup, or baseline manifest missing"
[[ -d "${ROOT}/dist" ]] || fail "live dist missing"
MANIFEST="${STAGING}/prepared-${TARGET}/manifest.json"
RECEIPT="${STAGING}/seo-cutover-${TARGET}.receipt"
[[ -f "${MANIFEST}" ]] || fail "target prepared manifest missing"
[[ -f "${RECEIPT}" && ! -L "${RECEIPT}" ]] || fail "one-time SEO cutover receipt missing"
[[ -f "${ROOT}/server/scripts/preparedDist.mjs" && -f "${ROOT}/server/scripts/uiAssetProbe.mjs" && -f "${ROOT}/server/scripts/seoPostCutoverProbe.mjs" ]] || fail "target validation helpers missing"

# The same deploy lock serializes recovery with PREPARE/PROMOTE. --check does not
# mutate the app, but still takes the lock for a coherent observation.
exec {LOCK_FD}>"${LOCK}"
flock -n "${LOCK_FD}" || fail "another deployment holds ${LOCK}"
[[ "$("${GIT}" -C "${ROOT}" rev-parse HEAD)" == "${TARGET}" ]] || fail "live source is not exact target ${TARGET}"
[[ -z "$("${GIT}" -C "${ROOT}" status --porcelain=v1 --untracked-files=no)" ]] || fail "tracked source drift; refusing reset"
"${GIT}" -C "${ROOT}" cat-file -e "${BASE_SHA}^{commit}" || fail "baseline object missing"
"${GIT}" -C "${ROOT}" cat-file -e "${FEATURE_SHA}^{commit}" || fail "feature object missing"
"${GIT}" -C "${ROOT}" merge-base --is-ancestor "${BASE_SHA}" "${TARGET}" || fail "target lacks baseline ancestry"
"${GIT}" -C "${ROOT}" merge-base --is-ancestor "${FEATURE_SHA}" "${TARGET}" || fail "target lacks SEO feature ancestry"
if [[ -n "$("${GIT}" -C "${ROOT}" ls-files -- server/.env server/data/clover.sqlite)" ]]; then
  fail "environment or database is tracked; refusing source reset"
fi
hash_is "${MANIFEST}" "${MANIFEST_SHA}" || fail "target manifest checksum mismatch"
hash_is "${OLD_MANIFEST}" "${OLD_MANIFEST_SHA}" || fail "baseline manifest checksum mismatch"
mapfile -t receipt_lines <"${RECEIPT}"
[[ "${#receipt_lines[@]}" == 4 && "${receipt_lines[0]}" == "seo-cutover-v1" && "${receipt_lines[1]}" == "${BASE_SHA}" && "${receipt_lines[2]}" == "${TARGET}" && "${receipt_lines[3]}" == "${MANIFEST_SHA}" ]] || fail "SEO cutover receipt identity mismatch"
PREPARED="${ROOT}/server/scripts/preparedDist.mjs"
[[ "$(node "${PREPARED}" inspect-sha --manifest "${MANIFEST}")" == "${TARGET}" ]] || fail "target manifest source mismatch"
if ! node "${PREPARED}" verify-files --manifest "${MANIFEST}" --dist "${ROOT}/dist" --expected-target-sha "${TARGET}"; then
  echo "WARN: damaged live target dist will be quarantined; verified baseline backup is the recovery source" >&2
fi
node "${PREPARED}" verify-files --manifest "${OLD_MANIFEST}" --dist "${BACKUP}" --expected-target-sha "${BASE_SHA}" --expected-release-id "20260923HjDT6xzD" || fail "dedicated baseline backup invalid"
[[ "$(stat -c '%d' "${ROOT}/dist")" == "$(stat -c '%d' "${STAGING}")" ]] || fail "live dist and staging on different filesystems"
for unit in "${API_UNIT}" "${UI_UNIT}"; do
  [[ "$("${SYSTEMCTL}" show "${unit}" --no-pager -p LoadState)" == "LoadState=loaded" ]] || fail "${unit} not loaded"
done
echo "SEO_RECOVERY_PREFLIGHT_OK target=${TARGET} baseline=${BASE_SHA}"
[[ "${MODE}" == "--apply" ]] || exit 0

RECOVERY="$(mktemp -d "${STAGING}/seo-recovery.XXXXXXXX")" || fail "could not create recovery directory"
mkdir -p "${RECOVERY}/ready"
cp -a "${BACKUP}/." "${RECOVERY}/ready/" || critical "could not stage baseline UI; recovery=${RECOVERY}"
cp "${PREPARED}" "${ROOT}/server/scripts/uiAssetProbe.mjs" "${ROOT}/server/scripts/releaseNamespace.js" "${ROOT}/server/scripts/seoPostCutoverProbe.mjs" "${RECOVERY}/" || critical "could not pin validation helpers; recovery=${RECOVERY}"
node "${RECOVERY}/preparedDist.mjs" verify-files --manifest "${OLD_MANIFEST}" --dist "${RECOVERY}/ready" --expected-target-sha "${BASE_SHA}" || critical "staged baseline UI invalid; recovery=${RECOVERY}"

# No rm: the failed release dist is retained before Git can touch tracked UI.
mv "${ROOT}/dist" "${RECOVERY}/failed-dist" || critical "failed UI could not be preserved; recovery=${RECOVERY}"
FAILED_UI_PRESERVED=1
if ! "${GIT}" -C "${ROOT}" reset --hard "${BASE_SHA}"; then
  if [[ -e "${ROOT}/dist" ]]; then
    mv "${ROOT}/dist" "${RECOVERY}/reset-partial-dist" || critical "source reset failed and partial dist could not be moved"
  fi
  if mv "${RECOVERY}/failed-dist" "${ROOT}/dist"; then
    FAILED_UI_PRESERVED=0
    critical "source reset failed; failed UI restored to live path, inspect source state before any retry"
  fi
  critical "source reset failed and failed UI could not be returned to live path"
fi
if [[ -e "${ROOT}/dist" ]]; then
  mv "${ROOT}/dist" "${RECOVERY}/reset-dist" || critical "Git-created dist could not be staged; failed UI at ${RECOVERY}/failed-dist"
fi
mv "${RECOVERY}/ready" "${ROOT}/dist" || critical "baseline UI activation failed; failed UI at ${RECOVERY}/failed-dist"
${SUDO_SYSTEMCTL} restart "${API_UNIT%.service}" "${UI_UNIT%.service}" || critical "API/UI restart failed; failed UI at ${RECOVERY}/failed-dist"
"${SYSTEMCTL}" is-active --quiet "${API_UNIT}" || critical "API inactive after recovery"
"${SYSTEMCTL}" is-active --quiet "${UI_UNIT}" || critical "UI inactive after recovery"
"${CURL}" --fail --silent --show-error --max-time 10 "${HEALTH_API}" >/dev/null || critical "API health failed"
"${CURL}" --fail --silent --show-error --max-time 10 "${HEALTH_UI}" >/dev/null || critical "UI health failed"
node "${RECOVERY}/preparedDist.mjs" verify-files --manifest "${OLD_MANIFEST}" --dist "${ROOT}/dist" --expected-target-sha "${BASE_SHA}" || critical "restored dist inventory failed"
OLD_TAG="$(extract_tag "$(cat "${ROOT}/dist/index.html")")"
OLD_JS="$(extract_js "$(cat "${ROOT}/dist/index.html")")"
[[ "${OLD_TAG}" == "ui-20260923HjDT6xzD" && -n "${OLD_JS}" ]] || critical "restored local UI tag/bundle mismatch"
check_live_html "origin" "${ORIGIN}"
NGINX_ARGS=()
if [[ -n "$(resolve_spec)" ]]; then NGINX_ARGS+=(--resolve "$(resolve_spec)"); fi
if [[ -n "${CLOVER_DEPLOY_TLS_CA:-}" ]]; then NGINX_ARGS+=(--cacert "${CLOVER_DEPLOY_TLS_CA}"); fi
check_live_html "nginx" "${NGINX}" "${NGINX_ARGS[@]}"
node "${RECOVERY}/uiAssetProbe.mjs" check-http --html-file "${ROOT}/dist/index.html" --dist "${ROOT}/dist" --origin "${ORIGIN}" --nginx "${NGINX}" --nginx-resolve "$(resolve_spec)" --curl "${CURL}" ${CLOVER_DEPLOY_TLS_CA:+--cacert "${CLOVER_DEPLOY_TLS_CA}"} || critical "restored UI asset HTTP check failed"
node "${RECOVERY}/seoPostCutoverProbe.mjs" --mode rolled-back --origin "${ORIGIN}" --nginx "${NGINX}" --nginx-resolve "$(resolve_spec)" --curl "${CURL}" ${CLOVER_DEPLOY_TLS_CA:+--cacert "${CLOVER_DEPLOY_TLS_CA}"} || critical "baseline route HTTP check failed"
[[ "$("${GIT}" -C "${ROOT}" rev-parse HEAD)" == "${BASE_SHA}" ]] || critical "restored source identity mismatch"
echo "SEO_POST_SUCCESS_RECOVERY_OK baseline=${BASE_SHA} failed-ui=${RECOVERY}/failed-dist"
