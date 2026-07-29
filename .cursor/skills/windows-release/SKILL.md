---
name: "windows-release"
description: "Создание проверяемого Windows 10 установщика Clover с backup, checksum, health-check и автоматическим rollback."
---


# Пакет

- `1_INSTALL_*.bat` — только оболочка запуска PowerShell.
- `install.ps1` — проверки, backup, установка, health и rollback.
- `payload/` — только необходимые файлы.
- `CHECKSUMS_SHA256.txt`.
- `README_FIRST.txt`.
- `ROLLBACK.md`.

# Обязательные проверки

- правильный компьютер и путь;
- ожидаемый hash исходного файла либо безопасная проверка версии;
- отсутствие production-секретов;
- остановка только нужных процессов;
- проверка синтаксиса до запуска;
- health после запуска;
- проверка критических данных без destructive ACK;
- восстановление исходных файлов при ошибке;
- итоговый лог рядом с проектом.

