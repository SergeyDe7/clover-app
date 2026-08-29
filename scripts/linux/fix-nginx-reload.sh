#!/usr/bin/env bash
# Починить nginx reload (cloverspb.ru без cert) + gzip + проверка сжатия assets.
set -euo pipefail

ROOT="/opt/clover/clover-app"
CONF="/etc/nginx/nginx.conf"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите: sudo bash $0" >&2
  exit 1
fi

cp "$CONF" "${CONF}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$ROOT/ops/nginx/cloverspb-redirect.conf" /etc/nginx/sites-available/cloverspb.ru

if ! grep -q "gzip_proxied any" "$CONF"; then
  bash "$ROOT/scripts/linux/enable-nginx-gzip.sh"
else
  echo "gzip already configured in nginx.conf"
fi

nginx -t
systemctl reload nginx

echo "=== Проверка сжатия через nginx ==="
CSS_HEADERS=$(curl -fsSk -H "Accept-Encoding: gzip" -I https://127.0.0.1/assets/index-CMgCT55Y.css -H "Host: clover-spb.ru" || true)
echo "$CSS_HEADERS" | grep -iE 'HTTP/|content-encoding|content-length|vary' || true

if echo "$CSS_HEADERS" | grep -qi "content-encoding: gzip"; then
  echo "OK: CSS отдаётся с gzip"
else
  echo "WARN: CSS без gzip через nginx — vite preview должен сжимать (см. curl :5273)" >&2
fi

echo "=== Проверка сжатия vite preview ==="
VITE_HEADERS=$(curl -fsS -H "Accept-Encoding: gzip" -I http://127.0.0.1:5273/assets/index-CMgCT55Y.css || true)
echo "$VITE_HEADERS" | grep -iE 'HTTP/|content-encoding|content-length|vary' || true
