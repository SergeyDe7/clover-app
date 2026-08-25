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

echo "Stopping listeners on 4100/5273..."
for port in 4100 5273; do
  pids="$(ss -tlnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
  for pid in $pids; do
    echo "kill $pid (port $port)"
    kill "$pid" 2>/dev/null || true
  done
done
sleep 2

start_manual() {
  echo "Starting API/UI manually..."
  cd "$ROOT/server"
  nohup /usr/bin/node src/server.js >> /tmp/clover-api.log 2>&1 &
  cd "$ROOT"
  nohup /usr/bin/npm run preview -- --host 0.0.0.0 --port 5273 >> /tmp/clover-ui.log 2>&1 &
  sleep 3
}

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files clover-api.service 2>/dev/null | grep -q clover-api; then
  if sudo -n systemctl restart clover-api clover-ui 2>/dev/null; then
    :
  elif sudo systemctl restart clover-api clover-ui 2>/dev/null; then
    :
  else
    echo "systemd restart unavailable — starting manually"
    start_manual
  fi
  sleep 2
  if ! systemctl is-active --quiet clover-ui 2>/dev/null; then
    echo "systemd UI inactive — fallback to manual start"
    start_manual
  fi
else
  start_manual
fi

ss -ltn | grep -E '4100|5273' || true
curl -fsS http://127.0.0.1:4100/api/health
echo
curl -fsS -o /dev/null -w "ui:%{http_code}\n" http://127.0.0.1:5273/

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
