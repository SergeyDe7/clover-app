#!/usr/bin/env bash
# 1) cloverspb.ru без битого SSL → nginx -t проходит
# 2) gzip_types в nginx.conf
# 3) /assets/ и /fonts/ с диска (gzip + sendfile, без proxy vite)
set -euo pipefail

ROOT="/opt/clover/clover-app"
DIST="$ROOT/dist"
SITE="/etc/nginx/sites-available/clover-spb.ru"
CONF="/etc/nginx/nginx.conf"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите: sudo bash $0" >&2
  exit 1
fi

cp "$CONF" "${CONF}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$SITE" "${SITE}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$ROOT/ops/nginx/cloverspb-redirect.conf" /etc/nginx/sites-available/cloverspb.ru

if ! grep -q "gzip_proxied any" "$CONF"; then
  bash "$ROOT/scripts/linux/enable-nginx-gzip.sh"
fi

python3 - "$SITE" "$DIST" <<'PY'
import sys
from pathlib import Path

site = Path(sys.argv[1])
dist = sys.argv[2]
text = site.read_text()
old_assets = """    location /assets/ {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Cache-Control;
        proxy_hide_header Pragma;
        proxy_hide_header Expires;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # Self-hosted fonts
    location /fonts/ {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Cache-Control;
        proxy_hide_header Pragma;
        proxy_hide_header Expires;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }"""
new_assets = f"""    location /assets/ {{
        alias {dist}/assets/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }}

    location /fonts/ {{
        alias {dist}/fonts/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }}"""
if old_assets not in text:
    raise SystemExit("Не найден блок proxy /assets/ в clover-spb.ru — правка вручную.")
site.write_text(text.replace(old_assets, new_assets, 1))
print("clover-spb.ru: static assets from disk")
PY

# www-data должен пройти по пути /opt/clover/.../dist (иначе 403 на alias)
chmod o+x /opt/clover 2>/dev/null || true

nginx -t
systemctl reload nginx

echo "=== CSS через nginx (ожидается gzip ~25KB) ==="
curl -fsSk -H "Accept-Encoding: gzip" -I https://127.0.0.1/assets/index-CMgCT55Y.css -H "Host: clover-spb.ru" \
  | grep -iE 'HTTP/|content-encoding|content-length|vary' || true

echo "=== JS react ==="
curl -fsSk -H "Accept-Encoding: gzip" -I https://127.0.0.1/assets/vendor-react-BArXPKOB.js -H "Host: clover-spb.ru" \
  | grep -iE 'content-encoding|content-length' || true
