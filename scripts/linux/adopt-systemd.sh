#!/usr/bin/env bash
# Перевести API/UI под systemd (нужен sudo без пароля или интерактивный ввод).
# Останавливает ручные node/vite на :4100/:5273 и поднимает юниты.
set -euo pipefail

echo "Stopping listeners on 4100/5273 (manual deploy leftovers)..."
for port in 4100 5273; do
  pids="$(ss -tlnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)"
  for pid in $pids; do
    # только процессы clover
    owner="$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    if [[ "$owner" == "clover" ]]; then
      echo "kill $pid (port $port)"
      kill "$pid" 2>/dev/null || true
    fi
  done
done
sleep 2

sudo systemctl daemon-reload
sudo systemctl enable clover-api clover-ui
sudo systemctl restart clover-api clover-ui
sleep 2
systemctl is-active clover-api clover-ui
curl -fsS http://127.0.0.1:4100/api/health
echo
curl -fsS -o /dev/null -w "ui:%{http_code}\n" http://127.0.0.1:5273/
