# Развёртывание Clover в датацентре

Сейчас рабочий режим этапа 1 — доступ по **IP** локальной/частной сети датацентра. HTTPS, Passkey и Push домена — **этап 2**, только после явного «да».

| Документ | Назначение |
|----------|------------|
| [CHECKLIST.md](./CHECKLIST.md) | Пошаговый чеклист этапа 1 (до/после установки) |
| [ARCHITECTURE_SERVER.md](./ARCHITECTURE_SERVER.md) | Схема сервер ↔ 1С ↔ клиенты |
| [server.env.datacenter.example](./server.env.datacenter.example) | Шаблон `.env` по IP |
| [FIREWALL.md](./FIREWALL.md) | Порты и правила |
| [STAGE2_DOMAIN_HTTPS_PUSH.md](./STAGE2_DOMAIN_HTTPS_PUSH.md) | **Черновик этапа 2:** домен + HTTPS + push |
| [AFTER_DOMAIN.md](./AFTER_DOMAIN.md) | Детали DNS/TLS/`.env` после появления домена |
| [PUSH_ENABLE.md](./PUSH_ENABLE.md) | VAPID и подписка устройств |
| [DOMAIN_RECOMMENDATION.md](./DOMAIN_RECOMMENDATION.md) | Выбор домена |
| [ROLLBACK.md](./ROLLBACK.md) | Откат |

Скрипты:

- `tools/Install-CloverAutostart.ps1` — автозапуск через **Планировщик заданий** Windows (`schtasks`), не службу NSSM
- `tools/Install-CloverWindowsService.ps1` — алиас на тот же скрипт (старое имя)
- `tools/Health-Check.ps1` — проверка health
- `tools/Daily-Backup.ps1` — ежедневный backup
- `START_CLOVER_V18.bat` / `STOP_CLOVER_V18.bat` — ручной старт/стоп

**Важно:** установка на сервер и любые действия с production/1С — только после вашего явного «да».
Этап 2 (домен / HTTPS / push) — только после отдельного «да»; до этого LAN по IP — нормальный режим.
