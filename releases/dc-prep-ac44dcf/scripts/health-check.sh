#!/usr/bin/env bash
# Быстрая проверка Clover на Linux после установки (этап 1).
set -euo pipefail

API="${CLOVER_API_URL:-http://127.0.0.1:4100/api/health}"
UI="${CLOVER_UI_URL:-http://127.0.0.1:5273/}"

echo "== systemd =="
systemctl is-active clover-api clover-ui 2>/dev/null || echo "(systemctl недоступен или юниты ещё не установлены)"

echo "== API health =="
curl -fsS "$API" | tee /tmp/clover-health.json
echo
grep -q '"ok":true' /tmp/clover-health.json
grep -q 'clover-server' /tmp/clover-health.json
grep -q '4.0.4' /tmp/clover-health.json && echo "version 4.0.4 OK" || echo "WARN: ожидалась version 4.0.4"

echo "== UI =="
code=$(curl -sS -o /dev/null -w "%{http_code}" "$UI")
echo "HTTP $code"
test "$code" = "200"

echo "OK: базовые проверки пройдены"
