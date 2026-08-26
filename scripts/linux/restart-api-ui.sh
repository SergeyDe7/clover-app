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

echo "Stopping API/UI processes (all duplicates, not only port holders)..."
# Старые npm/vite часто остаются без порта — из‑за них «не применилось».
pkill -f '/opt/clover/clover-app/server/src/server.js' 2>/dev/null || true
pkill -f 'vite preview --host 0.0.0.0 --port 5273' 2>/dev/null || true
pkill -f 'npm run preview -- --host 0.0.0.0 --port 5273' 2>/dev/null || true
sleep 1
for port in 4100 5273; do
  pids="$(ss -tlnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
  for pid in $pids; do
    echo "kill -9 $pid (port $port)"
    kill -9 "$pid" 2>/dev/null || true
  done
done
sleep 1
ss -tlnp | grep -E ':4100|:5273' && echo "WARN: ports still busy" >&2 || echo "ports free"

start_manual() {
  echo "Starting API/UI manually..."
  cd "$ROOT/server"
  nohup /usr/bin/node src/server.js >> /tmp/clover-api.log 2>&1 &
  cd "$ROOT"
  nohup /usr/bin/npm run preview -- --host 0.0.0.0 --port 5273 >> /tmp/clover-ui.log 2>&1 &
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

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files clover-api.service 2>/dev/null | grep -q clover-api; then
  if sudo -n systemctl restart clover-api clover-ui 2>/dev/null; then
    :
  elif sudo systemctl restart clover-api clover-ui 2>/dev/null; then
    :
  elif ! systemctl is-active --quiet clover-ui 2>/dev/null; then
    echo "systemd restart unavailable — starting manually"
    start_manual
  fi
else
  start_manual
fi

wait_for_health

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
