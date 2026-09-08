#!/usr/bin/env bash
# Restart Clover API (:4100) and UI preview (:5273) on this host.
set -euo pipefail

ROOT="/opt/clover/clover-app"
cd "$ROOT"

echo "Building UI..."
npm run build
BUILD_TAG="$(grep -o 'name="clover-ui-build" content="[^"]*"' dist/index.html | sed 's/.*content="//;s/"$//' || true)"
MAIN_JS="$(grep -o 'src="/assets/index-[^"]*\.js"' dist/index.html | head -1 || true)"
echo "UI build tag: ${BUILD_TAG:-unknown}"
echo "UI bundle: ${MAIN_JS:-unknown}"

require_loaded_unit() {
  local unit="$1"
  local load
  load="$(systemctl show "$unit" --no-pager -p LoadState 2>/dev/null || true)"
  if [[ "$load" != "LoadState=loaded" ]]; then
    echo "ERROR: systemd unit $unit is not loaded (${load:-LoadState=unavailable}); refusing unmanaged process start" >&2
    exit 1
  fi
}

wait_for_health() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:4100/api/health >/dev/null 2>&1 \
      && curl -fsS -o /dev/null http://127.0.0.1:5273/ 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: API/UI did not become ready in 30s" >&2
  return 1
}

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl is required; refusing unmanaged process start" >&2
  exit 1
fi

require_loaded_unit clover-api.service
require_loaded_unit clover-ui.service

echo "Restarting clover-api.service and clover-ui.service via systemd..."
if ! sudo -n /bin/systemctl restart clover-api clover-ui; then
  echo "ERROR: non-interactive systemd restart of clover-api.service clover-ui.service failed" >&2
  exit 1
fi

if ! systemctl is-active --quiet clover-api.service; then
  echo "ERROR: clover-api.service is not active after restart" >&2
  exit 1
fi
if ! systemctl is-active --quiet clover-ui.service; then
  echo "ERROR: clover-ui.service is not active after restart" >&2
  exit 1
fi

wait_for_health

echo "Listener diagnostics (no process termination):"
ss -tlnp | grep -E ':4100|:5273' || echo "WARN: expected ports 4100/5273 not listed" >&2

LIVE_TAG="$(curl -fsS http://127.0.0.1:5273/ | grep -o 'name="clover-ui-build" content="[^"]*"' | sed 's/.*content="//;s/"$//' || true)"
LIVE_JS="$(curl -fsS http://127.0.0.1:5273/ | grep -o 'src="/assets/index-[^"]*\.js"' | head -1 || true)"
echo "Live UI tag: ${LIVE_TAG:-unknown}"
echo "Live bundle: ${LIVE_JS:-unknown}"

if [[ -n "${BUILD_TAG:-}" && -n "${LIVE_TAG:-}" && "$BUILD_TAG" != "$LIVE_TAG" ]]; then
  echo "ERROR: live UI build tag does not match dist/index.html" >&2
  exit 1
fi

if [[ -n "${MAIN_JS:-}" && -n "${LIVE_JS:-}" && "$MAIN_JS" != "$LIVE_JS" ]]; then
  echo "ERROR: live UI bundle does not match dist/index.html" >&2
  exit 1
fi

echo "Deploy OK."
