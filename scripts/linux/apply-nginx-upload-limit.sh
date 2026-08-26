#!/usr/bin/env bash
# Добавляет client_max_body_size в nginx vhost clover-spb.ru (нужен sudo).
set -euo pipefail

CONF="/etc/nginx/sites-available/clover-spb.ru"
MARKER="client_max_body_size"

if [[ ! -f "$CONF" ]]; then
  echo "ERROR: $CONF not found" >&2
  exit 1
fi

if grep -q "$MARKER" "$CONF"; then
  echo "OK: $MARKER already set in $CONF"
else
  sudo sed -i "/server_name clover-spb.ru/a\\    client_max_body_size 16m;" "$CONF"
  echo "Added client_max_body_size 16m to $CONF"
fi

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reloaded."
