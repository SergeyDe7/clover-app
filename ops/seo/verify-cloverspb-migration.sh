#!/usr/bin/env bash
# Проверка переноса cloverspb.ru БЕЗ смены публичного DNS.
# Запускать на DC после деплоя nginx-конфига, до/после переключения DNS.
#
# Локальная симуляция (DNS ещё на Megagroup):
#   curl --resolve cloverspb.ru:80:127.0.0.1 -I http://cloverspb.ru/magazin/product/folga-30-sm-100-metrov
#   curl --resolve cloverspb.ru:443:127.0.0.1 -kI https://cloverspb.ru/...
#
# После DNS на DC — те же URL без --resolve.
set -euo pipefail

ROOT="/opt/clover/clover-app"
ORIGIN="https://clover-spb.ru"
RESOLVE=(--resolve "cloverspb.ru:80:127.0.0.1" --resolve "www.cloverspb.ru:80:127.0.0.1")
RESOLVE_HTTPS=(--resolve "cloverspb.ru:443:127.0.0.1" --resolve "www.cloverspb.ru:443:127.0.0.1")

if [[ "${1:-}" == "--public" ]]; then
  RESOLVE=()
  RESOLVE_HTTPS=()
  echo "Режим: публичный DNS"
else
  echo "Режим: локальный nginx (127.0.0.1 + Host)"
fi

check_redirect() {
  local label="$1"
  local url="$2"
  local expect_prefix="$3"
  shift 3
  local extra=("$@")
  local out
  out=$(curl -sS -o /dev/null -w "%{http_code} %{redirect_url}" -I "${extra[@]}" "$url" 2>/dev/null || echo "000 ")
  local code="${out%% *}"
  local loc="${out#* }"
  local status="OK"
  if [[ "$code" != "301" && "$code" != "308" ]]; then status="FAIL(code=$code)"; fi
  if [[ -n "$expect_prefix" && "$loc" != "$expect_prefix"* ]]; then status="FAIL(loc=$loc)"; fi
  # цепочка: повторный запрос не должен снова 301 на другой хост cloverspb
  if [[ -n "$loc" && "$loc" == *cloverspb.ru* ]]; then status="FAIL(chain to cloverspb)"; fi
  printf "%-36s %-4s %-8s %s\n" "$label" "$status" "$code" "${loc:-—}"
}

echo ""
echo "=== HTTP → HTTPS canonical (после активации SSL-конфига) ==="
check_redirect "http cloverspb.ru/" "http://cloverspb.ru/" "$ORIGIN" "${RESOLVE[@]}"
check_redirect "http www →" "http://www.cloverspb.ru/" "$ORIGIN" "${RESOLVE[@]}"

echo ""
echo "=== HTTPS (если сертификат выпущен) ==="
check_redirect "https cloverspb.ru/" "https://cloverspb.ru/" "$ORIGIN" -k "${RESOLVE_HTTPS[@]}" || true
check_redirect "https www →" "https://www.cloverspb.ru/" "$ORIGIN" -k "${RESOLVE_HTTPS[@]}" || true

echo ""
echo "=== /magazin/ product samples (ожидаем 301 на clover-spb.ru) ==="
samples=(
  "/magazin/product/folga-30-sm-100-metrov|$ORIGIN/catalog/hozyajstvennye-tovary/folga-plenka-pergament"
  "/magazin/product/stakan-bumazhnyj-180-ml|$ORIGIN/catalog/odnorazovaya-posuda/stakany"
  "/magazin/product/shumanit-antizhir-bagi-3-l|$ORIGIN/catalog/himiya-chistyashchie-sredstva/zhiroudaliteli"
  "/magazin/product/bloknot-a6|$ORIGIN/product/"
  "/magazin/folder/stakany|$ORIGIN/catalog/odnorazovaya-posuda/stakany"
  "/kontakty|$ORIGIN/contacts"
)
for entry in "${samples[@]}"; do
  path="${entry%%|*}"
  expect="${entry#*|}"
  check_redirect "$path" "http://cloverspb.ru$path" "$expect" "${RESOLVE[@]}"
done

echo ""
echo "=== SSL cert files (dehydrated) ==="
if [[ -f /dehydrated/certs/cloverspb.ru/fullchain.pem ]]; then
  openssl x509 -in /dehydrated/certs/cloverspb.ru/fullchain.pem -noout -subject -dates 2>/dev/null || true
else
  echo "Нет /dehydrated/certs/cloverspb.ru/fullchain.pem — выпустить ПОСЛЕ DNS на DC"
fi

echo ""
echo "=== nginx -t ==="
sudo nginx -t 2>&1 || echo "nginx -t: нужен sudo"
