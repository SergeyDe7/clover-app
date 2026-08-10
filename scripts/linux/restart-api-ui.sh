#!/usr/bin/env bash
# Restart Clover API (:4100) and UI preview (:5273) on this host.
set -euo pipefail

echo "Stopping listeners on 4100/5273..."
for port in 4100 5273; do
  pids="$(ss -tlnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
  for pid in $pids; do
    echo "kill $pid (port $port)"
    kill "$pid" 2>/dev/null || true
  done
done
sleep 2

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files clover-api.service 2>/dev/null | grep -q clover-api; then
  if sudo -n systemctl restart clover-api clover-ui 2>/dev/null; then
    sleep 2
    systemctl is-active clover-api clover-ui
    curl -fsS http://127.0.0.1:4100/api/health
    echo
    curl -fsS -o /dev/null -w "ui:%{http_code}\n" http://127.0.0.1:5273/
    exit 0
  fi
  echo "Trying systemd with sudo (password may be required)..."
  sudo systemctl restart clover-api clover-ui
  sleep 2
  systemctl is-active clover-api clover-ui
  curl -fsS http://127.0.0.1:4100/api/health
  echo
  curl -fsS -o /dev/null -w "ui:%{http_code}\n" http://127.0.0.1:5273/
  exit 0
fi

echo "systemd unavailable — starting manually..."
cd /opt/clover/clover-app/server
nohup /usr/bin/node src/server.js >> /tmp/clover-api.log 2>&1 &
cd /opt/clover/clover-app
nohup /usr/bin/npm run preview -- --host 0.0.0.0 --port 5273 >> /tmp/clover-ui.log 2>&1 &
sleep 3
ss -ltn | grep -E '4100|5273' || true
curl -fsS http://127.0.0.1:4100/api/health
echo
curl -fsS -o /dev/null -w "ui:%{http_code}\n" http://127.0.0.1:5273/
