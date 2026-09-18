#!/usr/bin/env bash
# Clover API/UI health check. Writes the response only to a private mktemp file.
set -euo pipefail

API="${CLOVER_API_URL:-http://127.0.0.1:4100/api/health}"
UI="${CLOVER_UI_URL:-http://127.0.0.1:5273/}"
CURL_BIN="${CLOVER_HEALTH_CURL:-curl}"

echo "== systemd =="
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active clover-api clover-ui 2>/dev/null || echo "(systemctl недоступен или юниты ещё не установлены)"
else
  echo "(systemctl недоступен или юниты ещё не установлены)"
fi

HEALTH_TMP="$(mktemp "${TMPDIR:-/tmp}/clover-health.XXXXXX")"
chmod 600 "${HEALTH_TMP}"
trap 'rm -f "${HEALTH_TMP}"' EXIT

echo "== API health =="
"${CURL_BIN}" -fsS "${API}" > "${HEALTH_TMP}"
echo
grep -q '"ok":true' "${HEALTH_TMP}"
grep -q 'clover-server' "${HEALTH_TMP}"
grep -q '4.0.4' "${HEALTH_TMP}" && echo "version 4.0.4 OK" || echo "WARN: ожидалась version 4.0.4"

echo "== UI =="
code="$("${CURL_BIN}" -sS -o /dev/null -w "%{http_code}" "${UI}")"
echo "HTTP ${code}"
test "${code}" = "200"

echo "OK: базовые проверки пройдены"
