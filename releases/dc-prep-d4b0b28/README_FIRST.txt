Clover — подготовка установки в датацентр (НЕ установка)
=========================================================

Версия кода: 4.0.4
Git HEAD:    d4b0b28 (main, PR #11-#14 merged; install target d4b0b28)
Дата prep:   2026-08-02
Домен (позже): clover-order.ru

Сейчас этот пакет только готовит шаги. На сервер ДЦ НИЧЕГО не ставится,
пока вы явно не напишете: «ставить».


До «ставить» нужны от вас ответы
--------------------------------
1. Внутренний IP сервера Clover в ДЦ (пример: 10.x.x.x).
2. IP 81.177.141.15 у clover-order.ru — это ваш сервер или парковка регистратора?
3. Где 1С TEST (тот же сервер / другой хост / путь базы).
4. Путь установки на сервере (рекомендуется: C:\Clover\clover-app).
5. Будет ли на сервере чистая TEST-база или перенос локальной sqlite.


Порядок после ответов (когда скажете «ставить»)
-----------------------------------------------
Этап 1 — LAN / TEST (без публикации в интернет):
  1) Backup (если на сервере уже что-то есть).
  2) Код main @ d4b0b28 (git clone/pull или архив) БЕЗ чужого server\.env.
  3) npm ci в корне и в server\.
  4) server\.env из server.env.template (подставить IP и секреты).
  5) ONEC_WRITE_ENABLED=false до отдельного «да».
  6) START_CLOVER_V18.bat → health 4.0.4.
  7) Автозапуск: tools\Install-CloverAutostart.ps1 (от администратора).
  8) Приёмка: логин → тестовый заказ → очередь → 1С TEST → ACK.

Этап 2 — домен + HTTPS + push (отдельное «да»):
  docs\deploy\AFTER_DOMAIN.md + docs\deploy\PUSH_ENABLE.md
  URL: https://clover-order.ru


Главный файл для передачи Андрею
--------------------------------
  INSTALL_FOR_ANDREY.txt   — установка
  ARCHITECTURE.txt         — 1С на компе1, Clover в ДЦ, VPN, бэкапы
  server.env.for-dc + systemd/
  Zip для отправки: ../clover-dc-prep-d4b0b28-for-andrey.zip


Файлы в этой папке
------------------
  INSTALL_FOR_ANDREY.txt     — ГЛАВНЫЙ файл установки для Андрея
  server.env.for-dc          — .env с пометками 【АНДРЕЙ】 / (ФИКС)
  ANDREY_FILL_ME.txt         — короткая анкета (дубль части B)
  README_FIRST.txt           — этот файл
  PREP_STATUS.txt            — что уже проверено локально
  CHECKLIST_DC.txt           — сжатый чеклист A–F + этап домена
  server.env.template        — запасной шаблон .env
  ROLLBACK.txt               — откат
  MANIFEST.txt               — состав и git
  CHECKSUMS_SHA256.txt       — хеши ключевых скриптов/доков
  LINUX_INSTALL_ANDREY.txt   — краткая копия шагов
  systemd/                   — clover-api + clover-ui
  nginx/                     — LAN :80 и HTTPS примеры
  caddy/Caddyfile.example    — этап 2 HTTPS
  scripts/health-check.sh    — curl-проверка после установки


Ограничения
-----------
- Не 1С production / VLAVKA без отдельного «да».
- Не публиковать 4100/5273 в интернет без reverse-proxy + HTTPS.
- Секреты (.env, VAPID, JWT, пароли) не коммитить в Git.
