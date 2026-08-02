# Чеклист: сервер в датацентре без домена

## A. До установки (на бумаге)

1. Выделить Windows Server / Windows 10+ VM в датацентре.
2. Зафиксировать **внутренний IP** сервера Clover (пример: `10.x.x.x`).
3. Зафиксировать, где крутится **1С TEST** (тот же сервер / другой хост / терминал).
4. Решить: на сервере сначала только **TEST**, без VLAVKA.
5. Подготовить отдельный сложный `ONEC_API_KEY` (≥ 24 символов).
6. Подготовить путь установки, например `C:\Clover\clover-app`.
7. Договориться о ежедневном backup (диск / сеть / облако датацентра).

## B. Установка ПО

1. Node.js **≥ 22.13** (LTS).
2. Git (опционально) или копия релиза с checksum.
3. Скопировать приложение **без** чужого `server/.env` и без чужой sqlite, либо осознанно перенести TEST-базу.
4. `npm ci` в корне и в `server/` (или `npm install` по инструкции релиза).
5. Создать `server/.env` из `docs/deploy/server.env.datacenter.example` — подставить IP.
6. `ONEC_ALLOW_LOCAL_WITHOUT_KEY=false` после настройки ключа.
7. `ONEC_WRITE_ENABLED=false` до отдельного решения.

## C. Сеть

1. Открыть порты по [FIREWALL.md](./FIREWALL.md): UI `5273`, API `4100` (или только reverse-proxy позже).
2. С рабочих ПК менеджеров проверить: `http://<IP>:5273/` и `http://<IP>:4100/api/health`.
3. 1С TEST должна достучаться до `http://<IP>:4100/api/one-c/...` с заголовком ключа.

## D. Автозапуск и backup

1. Запустить от администратора:  
   `powershell -ExecutionPolicy Bypass -File tools\Install-CloverAutostart.ps1`  
   (создаёт задачу Планировщика `CloverAutostart`, не Windows Service)
2. Проверить автозапуск после перезагрузки.
3. Настроить `tools\Daily-Backup.ps1` по расписанию (Планировщик заданий).
4. Проверить health: `tools\Health-Check.ps1`.

## E. Приёмка TEST на сервере

1. Health → версия **4.0.4**.
2. Логин менеджера / клиента.
3. Один тестовый заказ → очередь → документ в 1С TEST → ACK.
4. Повторный заказ (регресс).
5. Зафиксировать номера документов в журнале.

## F. Ещё НЕ делать без «да»

- Домен / SSL / публикация в интернет — см. черновик [STAGE2_DOMAIN_HTTPS_PUSH.md](./STAGE2_DOMAIN_HTTPS_PUSH.md).
- Подключение VLAVKA / production 1С (код очереди сейчас принимает только базу имени **TEST**).
- Реальные клиентские заказы в рабочую 1С.
- `git push` / merge в main без подтверждения.

## G. После merge ветки `agent/p1-status-fsm-roles` (не выполнять без «да»)

Изменения ветки: FSM статусов заказов + роли (`admin`), admin tooling, split экранов, UX nav, split ManagerScreen, verify scan `src/**`.

1. Backup кода + `server/data` + `server/.env` (см. [ROLLBACK.md](./ROLLBACK.md)).
2. Выкат кода на сервер (git pull нужной ветки / релизный пакет с checksum).
3. `npm ci` в корне и в `server/` при смене lockfile.
4. Dry-run миграции admin-роли:  
   `node server/scripts/migrate-admin-role.mjs`  
   Apply только после явного «да»:  
   `node server/scripts/migrate-admin-role.mjs --apply`
5. Перезапуск: `STOP_CLOVER_V18.bat` → `START_CLOVER_V18.bat` (или Планировщик).
6. Health: `http://127.0.0.1:4100/api/health` → версия **4.0.4**.
7. Локальные проверки на сервере:  
   `cd server && npm run check && npm run test:manager-tabs && npm run test:v18`
8. Приёмка UI: вкладки менеджера Заказы / Клиенты / Товары / 1С / Ещё (Акты, Настройки, Backup, Журнал).
9. Один тестовый заказ → очередь → 1С **TEST** → ACK (не prod).
10. Откат при сбое — по [ROLLBACK.md](./ROLLBACK.md).
