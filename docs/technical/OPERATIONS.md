# Эксплуатация Clover (Windows)

## Запуск / остановка

| Действие | Файл |
|----------|------|
| Старт V18 | `START_CLOVER_V18.bat` |
| Автозапуск | `START_CLOVER_AUTOSTART.bat` |
| Стоп | `STOP_CLOVER_V18.bat` |
| Резервная копия сейчас | `CREATE_BACKUP_NOW.bat` |
| Проверка сервера | `CHECK_SERVER.ps1` |

После старта:

- UI: http://localhost:5273/
- Health: http://localhost:4100/api/health → `version: "4.0.4"`

## Конфигурация

Только `server/.env` (образец: `server/.env.example`).

Критичные переменные:

- `ONEC_API_KEY`, `ONEC_ALLOW_LOCAL_WITHOUT_KEY`
- `ONEC_BASE_URL`, `ONEC_USERNAME`, `ONEC_PASSWORD` (исходящие вызовы)
- `ONEC_WRITE_ENABLED` — по умолчанию `false` (запись черновиков в 1С выкл.)
- `JWT_SECRET`, SMTP, VAPID, Passkey — для домена/HTTPS

## Backup

Перед рискованными шагами:

1. `CREATE_BACKUP_NOW.bat`, или
2. копия `server/data/`, `server/.env`, ключевого кода в `Clover-Backups\...`

Локальные `backups/` внутри проекта в Git не входят.

## Полезные корневые скрипты (оставить)

- `INSTALL_SERVER.bat`
- `INSTALL_CLOVER_1C_QUEUE_UPDATE.bat` / `INSTALL_ONEC_QUEUE_FIX_TEST.*` — обновления очереди (только после чтения инструкции)
- `CHECK_ONEC_QUEUE_V2.cmd`

Исторические установщики STAGE/BIG/FIX и `*_RESULT.txt` вынесены из корня в резервную папку вне репозитория (см. cleanup backup).
