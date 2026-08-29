#!/usr/bin/env bash
# Включить gzip для проксируемых JS/CSS (иначе PWA ~700 KB несжатых → ~10 сек на 4G).
set -euo pipefail

CONF="/etc/nginx/nginx.conf"
BACKUP="${CONF}.bak-$(date +%Y%m%d-%H%M%S)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите: sudo bash $0" >&2
  exit 1
fi

cp "$CONF" "$BACKUP"
echo "Backup: $BACKUP"

python3 <<'PY'
from pathlib import Path
p = Path("/etc/nginx/nginx.conf")
text = p.read_text()
text = text.replace("# patched below http block manually if needed\n", "")
old = """\t##
\t# Gzip Settings
\t##

\tgzip on;

\t##
\t# Virtual Host Configs
\t##"""
new = """\t##
\t# Gzip Settings
\t##

\tgzip on;
\tgzip_vary on;
\tgzip_proxied any;
\tgzip_comp_level 5;
\tgzip_min_length 256;
\tgzip_http_version 1.1;
\tgzip_types text/plain text/css text/xml application/javascript application/json application/xml application/xml+rss image/svg+xml font/woff2;

\t##
\t# Virtual Host Configs
\t##"""
if old not in text:
    raise SystemExit("Блок gzip в nginx.conf не найден — восстановите из backup и повторите.")
p.write_text(text.replace(old, new, 1))
print("gzip configured")
PY

nginx -t
systemctl reload nginx

echo "Проверка CSS:"
curl -fsSk -H "Accept-Encoding: gzip" -I https://127.0.0.1/assets/index-CMgCT55Y.css -H "Host: clover-spb.ru" \
  | grep -iE 'HTTP/|content-encoding|content-length' || true
echo "Проверка JS:"
curl -fsSk -H "Accept-Encoding: gzip" -I https://127.0.0.1/assets/vendor-react-BArXPKOB.js -H "Host: clover-spb.ru" \
  | grep -iE 'content-encoding|content-length' || true
echo "OK — ожидается Content-Encoding: gzip и ~25 KB для CSS (не 180 KB)."
