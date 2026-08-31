#!/usr/bin/env bash
# Пересборка UI и перезапуск Clover API (:4100) и UI (:5273) на этом хосте.
#
# Порядок: сначала сборка, потом перезапуск. Если сборка не удалась,
# работающие процессы не трогаются вообще.
#
# Процессы останавливаются точечно. Раньше здесь был `pkill -f 'node
# src/server.js'`, который на общем хосте убивает любой чужой node с похожей
# командной строкой; теперь подходят только процессы, чей рабочий каталог
# лежит внутри этого проекта, и только когда systemd недоступен.
#
# CLOVER_RESTART_DRY_RUN=1 — показать план и найденные процессы, ничего не
# собирая и не перезапуская.
set -euo pipefail

# Переопределяются только тестами; в продакшене используются значения по умолчанию.
ROOT="${CLOVER_ROOT:-/opt/clover/clover-app}"
API_PORT="${CLOVER_API_PORT:-4100}"
UI_PORT="${CLOVER_UI_PORT:-5273}"
HEALTH_TIMEOUT=30
STOP_GRACE=10
BACKUP_ROOT="$ROOT/.deploy-backup"
KEEP_BACKUPS=3
DRY_RUN="${CLOVER_RESTART_DRY_RUN:-0}"

cd "$ROOT"

log() { echo "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# --- Поиск процессов проекта -------------------------------------------------

# Процессы этого проекта: слушают наш порт и запущены из каталога проекта.
# Проверка рабочего каталога отсекает и чужие сборки Clover, и совпадения
# по одинаковой командной строке.
project_pids_on_port() {
  local port="$1" pid cwd
  ss -tlnpH "sport = :$port" 2>/dev/null |
    sed -n 's/.*pid=\([0-9]\+\).*/\1/p' |
    sort -u |
    while read -r pid; do
      [ -n "$pid" ] || continue
      cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
      case "$cwd" in
        "$ROOT" | "$ROOT"/*) echo "$pid" ;;
      esac
    done
}

describe_pid() {
  local pid="$1"
  printf '  pid=%s cwd=%s cmd=%s\n' \
    "$pid" \
    "$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo '?')" \
    "$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | cut -c1-80)"
}

# Останавливает процессы мягко (TERM) и только потом принудительно.
# kill -9 обрывает запись в SQLite, поэтому он остаётся крайней мерой.
stop_pids() {
  local pids=("$@") pid waited=0 alive
  [ "${#pids[@]}" -gt 0 ] || return 0

  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  while [ "$waited" -lt "$STOP_GRACE" ]; do
    alive=0
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" -eq 0 ] && return 0
    sleep 1
    waited=$((waited + 1))
  done

  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      log "процесс $pid не завершился за ${STOP_GRACE}s, отправляю KILL"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
}

systemd_available() {
  command -v systemctl >/dev/null 2>&1 &&
    systemctl list-unit-files clover-api.service 2>/dev/null | grep -q clover-api
}

systemd_restart() {
  sudo -n systemctl restart clover-api clover-ui 2>/dev/null ||
    sudo systemctl restart clover-api clover-ui
}

start_manual() {
  log "Запускаю API и UI без systemd..."
  (cd "$ROOT/server" && nohup /usr/bin/node src/server.js >>/tmp/clover-api.log 2>&1 &)
  (cd "$ROOT" && nohup /usr/bin/npm run preview -- --host 0.0.0.0 --port "$UI_PORT" >>/tmp/clover-ui.log 2>&1 &)
}

stop_manual() {
  local pids=()
  mapfile -t pids < <(
    project_pids_on_port "$API_PORT"
    project_pids_on_port "$UI_PORT"
  )
  if [ "${#pids[@]}" -eq 0 ]; then
    log "Процессы проекта на портах $API_PORT/$UI_PORT не найдены."
    return 0
  fi
  log "Останавливаю процессы проекта:"
  for pid in "${pids[@]}"; do describe_pid "$pid"; done
  stop_pids "${pids[@]}"
}

restart_services() {
  if systemd_available; then
    log "Перезапускаю clover-api и clover-ui через systemd..."
    systemd_restart
  else
    stop_manual
    start_manual
  fi
}

# --- Проверка состояния ------------------------------------------------------

wait_for_health() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 &&
      curl -fsS -o /dev/null "http://127.0.0.1:$UI_PORT/" 2>/dev/null; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "ERROR: API/UI не ответили за ${HEALTH_TIMEOUT}s" >&2
  return 1
}

read_build_tag() {
  grep -o 'name="clover-ui-build" content="[^"]*"' "$1" 2>/dev/null |
    sed 's/.*content="//;s/"$//' || true
}

read_bundle() {
  grep -o 'src="/assets/index-[^"]*\.js"' "$1" 2>/dev/null | head -1 || true
}

verify_live_ui() {
  local live_html build_tag live_tag build_js live_js
  live_html="$(mktemp)"
  curl -fsS "http://127.0.0.1:$UI_PORT/" >"$live_html" || {
    rm -f "$live_html"
    return 1
  }

  build_tag="$(read_build_tag dist/index.html)"
  live_tag="$(read_build_tag "$live_html")"
  build_js="$(read_bundle dist/index.html)"
  live_js="$(read_bundle "$live_html")"
  rm -f "$live_html"

  log "Сборка: ${build_tag:-unknown} / ${build_js:-unknown}"
  log "На порту $UI_PORT: ${live_tag:-unknown} / ${live_js:-unknown}"

  if [ -n "$build_tag" ] && [ -n "$live_tag" ] && [ "$build_tag" != "$live_tag" ]; then
    echo "ERROR: отдаётся не та сборка UI (метка)" >&2
    return 1
  fi
  if [ -n "$build_js" ] && [ -n "$live_js" ] && [ "$build_js" != "$live_js" ]; then
    echo "ERROR: отдаётся не та сборка UI (бандл)" >&2
    return 1
  fi
  return 0
}

# --- Резервная копия dist для отката -----------------------------------------

BACKUP_DIR=""

backup_dist() {
  [ -d dist ] || return 0
  mkdir -p "$BACKUP_ROOT"
  BACKUP_DIR="$BACKUP_ROOT/dist-$(date +%Y%m%d-%H%M%S)"
  cp -a dist "$BACKUP_DIR"
  log "Предыдущая сборка сохранена: $BACKUP_DIR"

  # Оставляем только последние копии, иначе каталог растёт без предела.
  ls -1dt "$BACKUP_ROOT"/dist-* 2>/dev/null |
    tail -n "+$((KEEP_BACKUPS + 1))" |
    while read -r old; do rm -rf "$old"; done
}

rollback_dist() {
  [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ] || {
    log "Откат UI невозможен: предыдущая сборка не сохранена."
    return 1
  }
  log "Возвращаю предыдущую сборку UI из $BACKUP_DIR"
  rm -rf dist
  cp -a "$BACKUP_DIR" dist
  restart_services
  wait_for_health
}

# --- Основной сценарий -------------------------------------------------------

# Печатает процессы, которые были бы остановлены в ручном режиме.
# Нужно, чтобы проверить выбор процессов, ничего не останавливая.
if [ "${1:-}" = "--list-targets" ]; then
  for pid in $(project_pids_on_port "$API_PORT") $(project_pids_on_port "$UI_PORT"); do
    echo "$pid"
  done
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  log "CLOVER_RESTART_DRY_RUN=1 — сборка и перезапуск не выполняются."
  log "Каталог проекта: $ROOT"
  if systemd_available; then
    log "Перезапуск шёл бы через systemd: clover-api, clover-ui"
  else
    log "systemd недоступен, остановлены были бы только эти процессы:"
    for pid in $(project_pids_on_port "$API_PORT") $(project_pids_on_port "$UI_PORT"); do
      describe_pid "$pid"
    done
  fi
  exit 0
fi

# Копия делается до сборки: откатывать нужно на то, что работало раньше.
backup_dist

log "Собираю UI..."
npm run build || fail "сборка не удалась, работающие процессы не тронуты"

restart_services

if ! wait_for_health || ! verify_live_ui; then
  echo "ERROR: проверка после перезапуска не пройдена" >&2
  rollback_dist || echo "ERROR: откат не выполнен, нужна ручная проверка" >&2
  exit 1
fi

log "Готово."
