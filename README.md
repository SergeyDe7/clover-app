# Clover V18.1

Рабочая версия приложения: **4.0.4**.

## Быстрый старт

1. Запуск: `START_CLOVER_V18.bat`
2. UI: http://localhost:5273/
3. Health: http://localhost:4100/api/health

Настройки 1С, SMTP, Push и Passkey — только в `server/.env` (образец: `server/.env.example`).

## Документация

- Техническая: [`docs/technical/`](docs/technical/README.md)
- Датацентр / сервер без домена: [`docs/deploy/`](docs/deploy/README.md)
- Агенты Cursor: [`docs/agents/README_DSD.md`](docs/agents/README_DSD.md) — оркестратор `@dsd` (писать `@dsd` каждый раз не обязательно)
- Правила команды: [`AGENTS.md`](AGENTS.md)
