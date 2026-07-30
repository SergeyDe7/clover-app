# Развёртывание Clover в датацентре (без домена)

Сейчас домена нет — план рассчитан на доступ по **IP** локальной/частной сети датацентра. HTTPS и Passkey/Push домена подключаются отдельным этапом.

| Документ | Назначение |
|----------|------------|
| [CHECKLIST.md](./CHECKLIST.md) | Пошаговый чеклист до/после установки |
| [ARCHITECTURE_SERVER.md](./ARCHITECTURE_SERVER.md) | Схема сервер ↔ 1С ↔ клиенты |
| [server.env.datacenter.example](./server.env.datacenter.example) | Шаблон `.env` по IP |
| [FIREWALL.md](./FIREWALL.md) | Порты и правила |
| [AFTER_DOMAIN.md](./AFTER_DOMAIN.md) | Что сделать, когда появится домен + HTTPS |
| [ROLLBACK.md](./ROLLBACK.md) | Откат |

Скрипты:

- `tools/Install-CloverAutostart.ps1` — автозапуск через **Планировщик заданий** Windows (`schtasks`), не службу NSSM
- `tools/Install-CloverWindowsService.ps1` — алиас на тот же скрипт (старое имя)
- `tools/Health-Check.ps1` — проверка health
- `tools/Daily-Backup.ps1` — ежедневный backup
- `START_CLOVER_V18.bat` / `STOP_CLOVER_V18.bat` — ручной старт/стоп

**Важно:** установка на сервер и любые действия с production/1С — только после вашего явного «да».
