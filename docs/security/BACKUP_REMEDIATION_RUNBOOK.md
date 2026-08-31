# Runbook: приведение резервных копий Clover в безопасное состояние

> **Статус: подготовительный документ.** Ни одна команда из этого runbook не была
> выполнена при его составлении. Всё ниже выполняется **оператором вручную**,
> в рабочее время, при живом доступе к консоли — **не ночью и не автоматом**.
>
> Дата обследования: **2026-08-31**, хост `192.168.155.15` (Debian 13),
> ветка `security/audit-hardening-20260831`.

---

## 1. Текущее состояние (наблюдаемые факты)

### 1.1 Где лежат копии

Обнаружены **три независимых** места хранения, а не одно:

| Путь | Что там | Объём | Права каталога |
| --- | --- | --- | --- |
| `server/backups/` | 41 файл `clover-*.zip` (полные копии Clover) | 1.3 GB (весь подпуть) | `755 clover:clover` |
| `server/backups/daily/` | 15 файлов `clover-data-env.*.tgz` + `cron.log` | 106 MB | `775 clover:clover` |
| `server/backups/manual/` | 3 файла — сырые копии `clover.sqlite` / `-shm` / `-wal` от 2026-08-09 | 12 MB | `775 clover:clover` |
| `server/data/backups/` | сырые `.bak` БД, копия nginx-конфига, 8 каталогов SEO-снимков | 50 MB | `775 clover:clover` |

Полный размер `server/backups/` — **1.3 GB**, `server/data/backups/` — **50 MB**.
Свободного места на `/` — 27 GB из 37 GB (22 % занято).

### 1.2 Биты прав — точные значения

```
$ stat -c '%a %U:%G' server/backups/*.zip | sort | uniq -c
     41 666 clover:clover

$ stat -c '%a %U:%G' server/backups/daily/* | sort | uniq -c
     16 664 clover:clover
```

- **41 zip-архив имеет режим `0666` — доступен на чтение И на запись всем
  пользователям системы.**
- 16 файлов в `daily/` (15 архивов + `cron.log`) имеют `0664` — доступны на
  чтение всем.
- Файлы в `manual/` — `0644`, тоже world-readable.
- Всего в дереве копий: **41 world-writable файл, 117 world-readable файлов**.

Проверено командами:

```
find server/backups server/data/backups -type f -perm -o+w | wc -l   # → 41
find server/backups server/data/backups -type f -perm -o+r | wc -l   # → 117
```

### 1.3 Путь доступа действительно открыт

Права на каталоги по пути:

```
/opt                                    755 root:root
/opt/clover                             701 clover:clover     ← «прочие» могут пройти насквозь (x), но не листать
/opt/clover/clover-app                  775 clover:clover     ← «прочие» могут читать и листать
/opt/clover/clover-app/server           775 clover:clover
/opt/clover/clover-app/server/backups   755 clover:clover     ← «прочие» могут листать
```

`/opt/clover` = `0701` не даёт `ls` самого каталога, но даёт `x` (проход по
известному имени). Так как имя пути общеизвестно и зафиксировано в юнитах,
crontab и десятке файлов репозитория, это **не** защита. Итог: любой локальный
пользователь может полностью просмотреть каталог копий и прочитать любой архив.

В системе есть локальный интерактивный аккаунт `user` (uid 1000, `/bin/bash`)
помимо служебного `clover` (uid 988). Сервисный пользователь `clover` входит
в группу `sudo` (`id clover` → `groups=988(clover),27(sudo)`).

### 1.4 Возраст копий

| Набор | Самый старый | Самый новый |
| --- | --- | --- |
| `server/backups/*.zip` (41 шт.) | `clover-2026-08-03T20-57-37-496Z-auto-start.zip` (2 708 байт) | `clover-2026-08-31T00-15-02-267Z-scheduled.zip` (20 983 371 байт) |
| `server/backups/daily/*.tgz` (15 шт.) | `clover-data-env.20260817T001501Z.tgz` | `clover-data-env.20260831T001501Z.tgz` |
| `server/backups/manual/` | `clover.sqlite.before-storefront-copy-20260809-014149` | то же (единственный набор) |

### 1.5 Кто создаёт копии

`systemctl list-timers` — **таймера для Clover нет** (только системные
`man-db`, `apt-daily`, `logrotate`, `fstrim`, `e2scrub_all`, `dpkg-db-backup`,
`systemd-tmpfiles-clean`). Копии создаёт **cron пользователя root**:

```
$ crontab -l
15 3 * * * CLOVER_ROOT=/opt/clover/clover-app /opt/clover/clover-app/scripts/linux/daily-backup.sh >>/opt/clover/clover-app/server/backups/daily/cron.log 2>&1 # clover-daily-backup
```

`scripts/linux/daily-backup.sh` делает две вещи:

1. `tar -czf server/backups/daily/clover-data-env.<STAMP>.tgz -C server --exclude='data/backups' data .env`
2. запускает `node scripts/create-scheduled-backup.mjs`, который через
   `createServerBackup({ label: "scheduled" })` кладёт zip в `server/backups/`.

Плюс есть третий источник: `ensureDailyBackup()` в `server/src/backups.js:275`
создаёт архив с меткой `auto-start` при первом за сутки старте API — отсюда
файлы `*-auto-start.zip`.

**Проблема воспроизводится, а не является исторической.** Архив, созданный
сегодня в 03:15, имеет режим `0666`. Разовый `chmod` без правки конвейера
починит прошлое, но не будущее (см. §4.3).

---

## 2. Что находится внутри архива и сколько стоит его утечка

### 2.1 `server/backups/*.zip` — полная копия Clover

Формируется в `createServerBackup()` (`server/src/backups.js:94`). Состав:

- `manifest.json` — метаданные (`format`, `exportedAt`, `reason`, `photoCount`);
- `snapshot.json` — результат `exportDatabaseSnapshot()` (`server/src/db.js:1625`);
- `uploads/**` — **все** файлы из `server/uploads/` (фотографии товаров,
  вложения), добавляются целиком: `zip.addFile('uploads/' + name, readFileSync(...))`.

`snapshot.json` содержит следующие таблицы:

| Ключ снимка | Таблица | Что там персонального / секретного |
| --- | --- | --- |
| `users` | `users` | e-mail, **`password_hash` (bcrypt)**, роль, `approval_status`, `last_login_at` |
| `clientState` | `client_state` | `profile_json`, **`addresses_json` — адреса доставки клиентов**, `favorites_json` |
| `appState` | `app_state` | глобальные настройки приложения, каталог, контент витрины |
| `orders` | `orders` | **`payload_json` целиком** — состав заказов, цены, контактные лица, телефоны, адреса |
| `auditLog` | `audit_log` | `user_email`, `user_role`, `details_json` по всем действиям |
| `authTokens` | `auth_tokens` | **`token_hash`** и сроки действия токенов сброса пароля / verify |
| `reconciliationRequests` | `reconciliation_requests` | акты сверки, `file_path` |
| `pushSubscriptions` | `push_subscriptions` | `endpoint` и **`subscription_json` с ключами push-подписки** |
| `managerNotifications` | `manager_notifications` | внутренние уведомления менеджеров |
| `passkeys` | `passkey_credentials` | публичные ключи WebAuthn (base64), `webauthn_user_id` |

**`.env` в zip-архив не попадает.** Секретов в открытом виде там нет, но есть
bcrypt-хэши паролей и полный массив персональных данных клиентов.

### 2.2 `server/backups/daily/*.tgz` — здесь секреты есть

```
tar -czf ... -C server --exclude='data/backups' data .env
```

Архив включает **`server/.env` целиком**. Имена переменных в нём (значения
намеренно не приводятся):

```
ALLOW_DEV_AUTH_LINKS  APP_PUBLIC_URL  CABINET_PATH  CBOR_NATIVE_ACCELERATION_DISABLED
CLOVER_PUBLIC_URL  HOST  JWT_SECRET  MAIL_FROM  MANAGER_NOTIFICATION_EMAIL
ONEC_ALLOWED_DATABASES  ONEC_ALLOW_LOCAL_WITHOUT_KEY  ONEC_API_KEY  ONEC_BASE_URL
ONEC_DEFAULT_EXCHANGE_DATABASE  ONEC_PASSWORD  ONEC_PROD_EXCHANGE_ENABLED
ONEC_USERNAME  ONEC_WRITE_ENABLED  PASSKEY_ORIGIN  PASSKEY_RP_ID  PASSKEY_RP_NAME
PORT  SMTP_HOST  SMTP_PASSWORD  SMTP_PORT  SMTP_SECURE  SMTP_USER
TELEGRAM_BOT_TOKEN  TELEGRAM_MANAGER_CHAT_ID  VAPID_PRIVATE_KEY  VAPID_PUBLIC_KEY
VAPID_SUBJECT
```

Плюс `server/data/` — сама `clover.sqlite` со всеми таблицами.

Отдельно: сам живой файл **`server/.env` имеет режим `0664`**, то есть тоже
world-readable, и **`server/data/clover.sqlite` — `0644`**. Разбор этого —
не предмет данного runbook, но зафиксировать нужно.

### 2.3 Цена утечки одного архива

- `daily/*.tgz` → `JWT_SECRET` (подделка любой сессии, включая admin),
  `ONEC_API_KEY` (полный доступ к контуру обмена с 1С), SMTP-учётка,
  `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY`, учётка обмена `ONEC_*`.
  Компрометация — тотальная, требует ротации всех перечисленных переменных.
- `*.zip` → база клиентов B2B целиком: адреса, телефоны, история и суммы
  заказов, bcrypt-хэши для офлайн-перебора. Персональные данные клиентов.

### 2.4 Отдельный риск: world-writable, а не только world-readable

Режим `0666` означает, что локальный пользователь может **подменить** архив.
Маршрут восстановления `POST /api/admin/backups/:fileName/restore`
(`server/src/server.js:4806`) вызывает `restoreServerBackup()` →
`importDatabaseSnapshot()`, который в `server/src/db.js:1672`:

```
DELETE FROM users;  ...  INSERT INTO users(id, email, password_hash, role, ...)
```

то есть **полностью заменяет таблицу пользователей содержимым архива**.
Подложенный `snapshot.json` со своей строкой `role='admin'` даёт атакующему
администратора Clover в момент, когда менеджер нажмёт «Восстановить».
Дополнительно `restorePhotosFromZip()` предварительно вызывает
`clearUploadsDirectory()` — стирает `server/uploads/` целиком.

Поэтому снятие бита `o+w` — не косметика, а закрытие пути к повышению привилегий.

---

## 3. Ремедиация существующих архивов

> **Выполнять утром, руками, с открытой консолью.** Не запускать ночью и не
> добавлять в cron. Работы не требуют остановки сервисов и не трогают БД.

Владелец должен остаться **`clover:clover`** — это пользователь, под которым
работает API (`/etc/systemd/system/clover-api.service`: `User=clover`,
`Group=clover`; `ps` подтверждает: pid API запущен от `clover`). Именно этот
процесс создаёт и читает архивы через UI-маршруты `/api/admin/backups*`.
Cron работает от `root` и права игнорирует, так что переход на `0600` его
не сломает.

### 3.1 Шаг 0 — зафиксировать состояние «до»

```bash
cd /opt/clover/clover-app
stat -c '%a %U:%G %n' server/backups server/backups/daily server/backups/manual \
  server/data/backups > /tmp/backup-perms-before.txt
find server/backups server/data/backups -type f -printf '%m %u:%g %p\n' \
  >> /tmp/backup-perms-before.txt
wc -l /tmp/backup-perms-before.txt
```

### 3.2 Шаг 1 — сначала каталоги (немедленная локализация)

Каталог закрывается первым: это одним движением обрывает и чтение, и запись
для всех посторонних, даже пока файлы ещё имеют старые биты.

```bash
sudo chown clover:clover /opt/clover/clover-app/server/backups \
                         /opt/clover/clover-app/server/backups/daily \
                         /opt/clover/clover-app/server/backups/manual \
                         /opt/clover/clover-app/server/data/backups
sudo chmod 700 /opt/clover/clover-app/server/backups \
               /opt/clover/clover-app/server/backups/daily \
               /opt/clover/clover-app/server/backups/manual \
               /opt/clover/clover-app/server/data/backups
```

### 3.3 Шаг 2 — затем файлы

```bash
cd /opt/clover/clover-app
sudo find server/backups server/data/backups -type f \
  -exec chown clover:clover {} +
sudo find server/backups server/data/backups -type f \
  -exec chmod 600 {} +
sudo find server/backups server/data/backups -type d \
  -exec chmod 700 {} +   # включая подкаталоги seo-* в server/data/backups
```

`cron.log` тоже станет `600` — cron пишет от root, это не мешает.

### 3.4 Шаг 3 — проверка

Обе команды обязаны вернуть `0`:

```bash
cd /opt/clover/clover-app
find server/backups server/data/backups \( -type f -o -type d \) -perm /o+rwx | wc -l
find server/backups server/data/backups \( -type f -o -type d \) -perm /g+w  | wc -l
```

И визуально:

```bash
stat -c '%a %U:%G %n' server/backups server/backups/daily
stat -c '%a %U:%G' server/backups/*.zip | sort | uniq -c   # ожидаем: 41 600 clover:clover
```

Функциональная проверка (UI не должен сломаться): войти менеджером,
открыть раздел резервных копий — список (`GET /api/admin/backups`) должен
отрисоваться, скачивание одного архива должно работать. API читает файлы
от `clover`, владелец не меняется, поэтому регрессии не ожидается.

### 3.5 Откат

```bash
cd /opt/clover/clover-app
sudo chmod 755 server/backups server/data/backups
sudo chmod 775 server/backups/daily server/backups/manual
sudo find server/backups -maxdepth 1 -name '*.zip' -exec chmod 666 {} +
sudo find server/backups/daily -type f -exec chmod 664 {} +
```

Сверить с `/tmp/backup-perms-before.txt`.

---

## 4. Чтобы не вернулось: правка конвейера

Разовый `chmod` не удержит состояние — архив, созданный сегодня в 03:15, уже
пришёл с `0666`. Причина в том, что `adm-zip` открывает файл с явным режимом
`0666` (`server/node_modules/adm-zip/util/utils.js`,
`fs.openSync(path, "w", 0o666)` и `fs.chmodSync(path, 0o666)` в fallback-ветке),
а `tar` из `daily-backup.sh` наследует umask вызывающего cron. Umask живого
процесса API — `0022` (`/proc/<pid>/status` → `Umask: 0022`).

Три независимых предложения оператору (каждое можно применить отдельно):

1. **Umask в systemd-юните.** Добавить в `[Service]` файла
   `clover-api.service` строку `UMask=0077`. Тогда `auto-start`-архивы
   будут создаваться с `0600`.
2. **Явный `chmod` в конце `daily-backup.sh`** (после ротации):
   ```bash
   chmod 600 "$ARCHIVE"
   find "$SERVER/backups" -maxdepth 1 -type f -name 'clover-*.zip' -exec chmod 600 {} +
   ```
3. **Сторожевая проверка**, чтобы отклонение было заметно. Отдельным пунктом
   утреннего чек-листа:
   ```bash
   find /opt/clover/clover-app/server/backups -type f -perm /o+rwx -mtime -2
   ```
   Пустой вывод = норма.

Правки в `clover-api.service` и `daily-backup.sh` в рамках этого runbook
**не вносились** — это отдельное согласованное изменение.

---

## 5. Хранение вне хоста

### 5.1 Почему только-на-хосте не работает

Резервные копии существуют ради сценариев «хост потерян» и «данные испорчены».
Текущая схема ни один из них не покрывает:

- Все 1.35 GB копий лежат на том же `/dev/sda2`, что и живая
  `server/data/clover.sqlite`. Отказ диска или файловой системы уносит копии
  вместе с оригиналом.
- Копии лежат **внутри рабочего каталога приложения** (`server/backups`).
  Любой сценарий, который повреждает `/opt/clover/clover-app` — ошибочный
  `rm -rf`, откат деплоя, шифровальщик под учёткой `clover` — уничтожает и
  архивы.
- До ремедиации из §3 архивы были ещё и world-writable, то есть их можно было
  испортить, даже не имея прав на БД.
- `cleanupOldBackups()` сама удаляет файлы (см. §7). Единственная копия за
  нужную дату может быть уже удалена ротацией.

Правило: копия считается копией, только когда она находится **на другой машине**.

### 5.2 Что установлено на хосте

Проверено: `scp`, `gpg`, `tar`, `openssl`, `curl`, `systemd-run` — **есть**.
`rsync`, `restic`, `age`, `sqlite3` — **не установлены**.

### 5.3 Вариант A — rsync по SSH (рекомендуемый)

Требует `sudo apt install rsync` на этом хосте и на приёмнике.

```bash
# на приёмнике (backup-host): отдельный ключ и пользователь только под приём
#   useradd -m -s /bin/bash clover-backup
#   mkdir -p /srv/backups/clover-192.168.155.15

sudo rsync -av --delete-delay \
  --chmod=D700,F600 \
  -e 'ssh -i /root/.ssh/clover-backup -o StrictHostKeyChecking=yes' \
  /opt/clover/clover-app/server/backups/ \
  clover-backup@BACKUP_HOST:/srv/backups/clover-192.168.155.15/
```

Ключ на приёмнике ограничить в `~/.ssh/authorized_keys`:

```
command="rrsync -wo /srv/backups/clover-192.168.155.15",restrict <ключ>
```

`-wo` — только запись, без чтения: скомпрометированный Clover-хост не сможет
скачать обратно чужой архив и не сможет удалить историю.

### 5.4 Вариант B — scp без установки пакетов (сегодня же)

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo scp -i /root/.ssh/clover-backup \
  /opt/clover/clover-app/server/backups/clover-2026-08-31T00-15-02-267Z-scheduled.zip \
  /opt/clover/clover-app/server/backups/daily/clover-data-env.20260831T001501Z.tgz \
  clover-backup@BACKUP_HOST:/srv/backups/clover-192.168.155.15/$STAMP/
```

### 5.5 Вариант C — restic (если нужны дедупликация и снапшоты)

```bash
sudo apt install restic
export RESTIC_REPOSITORY=sftp:clover-backup@BACKUP_HOST:/srv/restic/clover
export RESTIC_PASSWORD_FILE=/root/.config/clover/restic.pass   # chmod 600, root:root

sudo -E restic init      # один раз
sudo -E restic backup /opt/clover/clover-app/server/backups \
                      /opt/clover/clover-app/server/data/clover.sqlite
sudo -E restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
sudo -E restic check --read-data-subset=5%
```

restic шифрует репозиторий сам — отдельный §6 в этом варианте не нужен.

### 5.6 Предлагаемая политика хранения

| Класс | На хосте | Вне хоста |
| --- | --- | --- |
| `daily/*.tgz` (data + `.env`) | 14 дней (уже задано `CLOVER_BACKUP_KEEP_DAYS=14`) | 30 дней |
| `*.zip` (полные, `scheduled`) | 14 дней | 90 дней |
| `*.zip` (`auto-start`) | 7 дней | не выгружать (дубликаты `scheduled`) |
| `*.zip` с ручной меткой (`before-*`, `photo-import-*`) | до закрытия задачи | 90 дней |
| Ежемесячный срез (1-е число) | — | 12 месяцев |

Проверка выгрузки раз в неделю: сравнить `sha256sum` последнего архива здесь
и на приёмнике.

---

## 6. Опциональное шифрование архивов

Актуально прежде всего для `daily/*.tgz`, потому что там лежит `.env`.

### 6.1 gpg (установлен на хосте)

```bash
# зашифровать
gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file /root/.config/clover/backup.pass \
    --output /opt/clover/clover-app/server/backups/daily/clover-data-env.20260831T001501Z.tgz.gpg \
    /opt/clover/clover-app/server/backups/daily/clover-data-env.20260831T001501Z.tgz

# расшифровать (на приёмнике или при восстановлении)
gpg --batch --yes --decrypt \
    --passphrase-file /root/.config/clover/backup.pass \
    --output /tmp/clover-restore/clover-data-env.tgz \
    clover-data-env.20260831T001501Z.tgz.gpg
```

### 6.2 age (нужно ставить: `sudo apt install age`)

```bash
age -p -o clover-data-env.20260831T001501Z.tgz.age clover-data-env.20260831T001501Z.tgz
age -d -o /tmp/clover-restore/clover-data-env.tgz clover-data-env.20260831T001501Z.tgz.age
```

Для неинтерактивного режима лучше ключевая пара, а не пароль:

```bash
age-keygen -o /root/.config/clover/backup-age.key     # chmod 600
grep 'public key' /root/.config/clover/backup-age.key  # → age1...
age -r age1... -o архив.age архив.tgz
```

### 6.3 Где держать парольную фразу

- Файл `/root/.config/clover/backup.pass`, режим `0600`, владелец `root:root`,
  каталог `0700`. **Не** в `/opt/clover/clover-app` — иначе фраза попадёт
  в следующий же архив, который она должна защищать, и всё упражнение
  бессмысленно.
- Второй экземпляр — вне этого сервера: корпоративный менеджер паролей или
  бумажный конверт в сейфе. Минимум два человека должны иметь доступ.
- Ротация фразы = перешифровка всего архивного набора; планировать как задачу,
  а не делать «между делом».

### 6.4 Компромисс — прочитать до включения

**Потеря парольной фразы = безвозвратная потеря всех зашифрованных архивов.**
Восстановления нет: ни через поддержку, ни через перебор. Шифрование
превращает риск «утечки данных» в риск «потери данных», и второй риск
реализуется гораздо чаще (уволился сотрудник, переустановили ноутбук,
не записали фразу).

Практический вывод: включать шифрование только вместе с §6.3, и до включения
провести пробное восстановление из зашифрованного архива по §7 —
чтобы убедиться, что фраза действительно записана верно.

---

## 7. Проверка восстановимости на выброс

> **Ключевая опасность.** Штатный `restoreServerBackup()`
> (`server/src/backups.js:215`) **непригоден** для проверки: он вызывает
> `restorePhotosFromZip()` → `clearUploadsDirectory()`
> (`server/src/backups.js:186`), который **стирает `server/uploads/` целиком**.
> Путь к `uploads` вычисляется от расположения модуля и переменной `DB_PATH`
> **не подчиняется**. Поэтому проверка делается через
> `importDatabaseSnapshot()` напрямую, а не через `restoreServerBackup()`.

`server/src/db.js:20` читает `DB_PATH`:

```js
const databasePath =
  process.env.DB_PATH ||
  path.resolve(dataDirectory, "clover.sqlite");
```

Значит, при заданном `DB_PATH` все операции идут в указанный файл, а живая
`server/data/clover.sqlite` не затрагивается.

### 7.1 Процедура

```bash
# 1. Изолированный каталог
WORK=$(mktemp -d /tmp/clover-restore-check.XXXXXX)
chmod 700 "$WORK"
echo "$WORK"

# 2. Извлечь ТОЛЬКО метаданные и снимок; uploads для проверки БД не нужны.
#    unzip на хосте НЕ установлен (проверено), поэтому распаковываем через
#    adm-zip из server/node_modules — тот же модуль, что пишет архивы.
ARCHIVE=/opt/clover/clover-app/server/backups/clover-2026-08-31T00-15-02-267Z-scheduled.zip
cd /opt/clover/clover-app/server
ARCHIVE="$ARCHIVE" OUT="$WORK" node -e '
const AdmZip = require("adm-zip");
const zip = new AdmZip(process.env.ARCHIVE);
for (const name of ["manifest.json", "snapshot.json"]) {
  const e = zip.getEntry(name);
  if (!e) throw new Error("нет записи " + name);
  zip.extractEntryTo(e, process.env.OUT, false, true);
  console.log("извлечено:", name, e.header.size, "байт");
}
'
ls -la "$WORK"
```

Если `unzip` всё же поставят (`sudo apt install unzip`), эквивалент:

```bash
unzip -o "$ARCHIVE" manifest.json snapshot.json -d "$WORK"
```

Скрипт проверки кладём в тот же одноразовый каталог — в репозитории ничего
не создаём:

```bash
cat > "$WORK/verify-restore.mjs" <<'EOF'
import { readFileSync } from "node:fs";
import { db, importDatabaseSnapshot } from "/opt/clover/clover-app/server/src/db.js";

const snapshot = JSON.parse(readFileSync(process.env.SNAPSHOT, "utf8"));
importDatabaseSnapshot(snapshot);

const q = (sql) => db.prepare(sql).get();
console.log("db file      :", process.env.DB_PATH);
console.log("exportedAt   :", snapshot.exportedAt);
console.log("users        :", q("SELECT COUNT(*) AS c FROM users").c);
console.log("  admins     :", q("SELECT COUNT(*) AS c FROM users WHERE role='admin'").c);
console.log("  managers   :", q("SELECT COUNT(*) AS c FROM users WHERE role='manager'").c);
console.log("orders       :", q("SELECT COUNT(*) AS c FROM orders").c);
console.log("client_state :", q("SELECT COUNT(*) AS c FROM client_state").c);
console.log("app_state    :", q("SELECT COUNT(*) AS c FROM app_state").c);
console.log("audit_log    :", q("SELECT COUNT(*) AS c FROM audit_log").c);
console.log("integrity    :", db.prepare("PRAGMA integrity_check").get());
db.close();
EOF
```

```bash
# 3. Импорт в одноразовую БД. DB_PATH указывает ВНЕ server/data.
cd /opt/clover/clover-app/server
DB_PATH="$WORK/verify.sqlite" SNAPSHOT="$WORK/snapshot.json" \
  node "$WORK/verify-restore.mjs"
echo "exit=$?"
```

`cd` в `server/` нужен, чтобы Node нашёл `server/node_modules` (`bcryptjs`,
который импортирует `db.js`). Обе переменные задаются в одной строке с
`node` — иначе `DB_PATH` не попадёт в процесс и импорт уйдёт в **живую** БД.

### 7.2 Критерии успеха

- `integrity_check` → `{ integrity_check: 'ok' }`;
- `users` > 0 и **хотя бы один `admin`** — иначе после реального восстановления
  в систему будет не войти;
- `orders`, `client_state`, `app_state` — порядок величины совпадает с живой
  системой (сверить с разделом менеджера);
- `exportedAt` в снимке соответствует дате в имени файла;
- команда завершилась с кодом `0`.

### 7.3 Обязательная проверка изоляции

```bash
# живая БД не должна была измениться
stat -c '%y %s %n' /opt/clover/clover-app/server/data/clover.sqlite
# одноразовая БД создана и непуста
stat -c '%y %s %n' "$WORK/verify.sqlite"
```

`mtime` живой `clover.sqlite` обязан остаться прежним. Если он изменился —
`DB_PATH` не подхватился, немедленно остановиться и разбираться.

### 7.4 Уборка

```bash
rm -rf "$WORK"
```

### 7.5 Регламент

Проверку проводить **раз в месяц** и **обязательно** — после каждого изменения
`exportDatabaseSnapshot()` / `importDatabaseSnapshot()` в `server/src/db.js`
и перед любым реальным восстановлением в бой. Результат (дата, имя архива,
счётчики) записывать в журнал операций.

---

## 8. Безопасная чистка старых архивов

### 8.1 Что делает автоматика сейчас

`cleanupOldBackups()` (`server/src/backups.js:243`) вызывается из
`createServerBackup()` и `ensureDailyBackup()` с параметрами по умолчанию
`maxFiles = 50`, `automaticMaxAgeDays = 30`:

- удаляет архивы старше 30 дней, **только если** имя или `reason` совпали
  с `/auto-start|Автоматическая/i`;
- затем срезает всё, что выходит за 50 самых свежих, **независимо от метки** —
  включая ручные `before-clear-product-photos`, `before-unused-photo-delete`
  и т. п.

Сейчас в каталоге 41 zip. До порога в 50 осталось 9 файлов, то есть примерно
9 дней при текущем темпе. **После этого автоматика начнёт удалять самые старые
архивы, в том числе ручные точки отката.** Это ещё один довод в пользу §5.

`daily/*.tgz` ротируются отдельно, в `daily-backup.sh`:
`find "$OUT_DIR" -name 'clover-data-env.*.tgz' -mtime +14 -delete`.

### 8.2 Критерии ручного удаления

Удалять можно архив, для которого выполнены **все** условия:

1. существует подтверждённая копия вне хоста (§5) — проверено по `sha256sum`;
2. он не является последним успешно проверенным по §7;
3. он старше 14 дней **и** имеет метку `auto-start` или `scheduled`;
4. он **не** имеет ручной метки задачи (`before-*`, `*-photo-import-*`,
   `*-watermark`, `before-restore`) — такие удаляются только после явного
   подтверждения, что задача закрыта;
5. на сутки, к которым он относится, остаётся хотя бы один другой архив.

Файлы в `server/backups/manual/` (сырые `clover.sqlite*` от 2026-08-09) и в
`server/data/backups/` **в автоматическую чистку не входят** — они удаляются
только вручную и только после выгрузки.

### 8.3 Сухой прогон — сначала обязательно

```bash
cd /opt/clover/clover-app/server/backups

# что попадёт под критерии 3-4: старше 14 дней, авто-метка, без ручной метки
find . -maxdepth 1 -type f -name 'clover-*.zip' -mtime +14 \
     \( -name '*-auto-start.zip' -o -name '*-scheduled.zip' \) \
     -printf '%TY-%Tm-%Td %10s %p\n' | sort

# сколько это освободит
find . -maxdepth 1 -type f -name 'clover-*.zip' -mtime +14 \
     \( -name '*-auto-start.zip' -o -name '*-scheduled.zip' \) \
     -printf '%s\n' | awk '{s+=$1} END {printf "%.1f MB в %d файлах\n", s/1048576, NR}'
```

Тот же список — для `daily/`:

```bash
find /opt/clover/clover-app/server/backups/daily -maxdepth 1 -type f \
     -name 'clover-data-env.*.tgz' -mtime +14 -printf '%TY-%Tm-%Td %10s %p\n' | sort
```

### 8.4 Удаление

Только после того, как список из §8.3 прочитан глазами и сверен с критериями:

```bash
cd /opt/clover/clover-app/server/backups

# зафиксировать, что удаляем
find . -maxdepth 1 -type f -name 'clover-*.zip' -mtime +14 \
     \( -name '*-auto-start.zip' -o -name '*-scheduled.zip' \) \
     -printf '%p\n' | sort > /tmp/backup-delete-list.txt
wc -l /tmp/backup-delete-list.txt

# перенос в карантин вместо rm — откат возможен ещё сутки
sudo mkdir -p /var/tmp/clover-backup-quarantine && sudo chmod 700 /var/tmp/clover-backup-quarantine
xargs -a /tmp/backup-delete-list.txt -d '\n' -I{} sudo mv {} /var/tmp/clover-backup-quarantine/

# сутки спустя, если ничего не сломалось
sudo rm -rf /var/tmp/clover-backup-quarantine
```

Прямой `-delete` в `find` не использовать: одна опечатка в предикате — и
удаляется весь каталог.

---

## 9. Порядок работ на утро

| # | Действие | Раздел | Простой сервиса |
| --- | --- | --- | --- |
| 1 | Снять снимок текущих прав | §3.1 | нет |
| 2 | Закрыть каталоги (`chmod 700`) | §3.2 | нет |
| 3 | Закрыть файлы (`chmod 600`) | §3.3 | нет |
| 4 | Проверить: два `find` дают `0` | §3.4 | нет |
| 5 | Проверить UI: список копий, скачивание | §3.4 | нет |
| 6 | Проверить восстановимость на `DB_PATH` | §7 | нет |
| 7 | Выгрузить свежий `*.zip` и `daily/*.tgz` вне хоста | §5.4 | нет |
| 8 | Обсудить правку конвейера (`UMask`, `chmod` в скрипте) | §4 | требует рестарта API |
| 9 | Сухой прогон чистки, без удаления | §8.3 | нет |

Шаги 1–7 безопасны и обратимы. Шаг 8 — отдельное изменение кода/юнита,
шаг 9 не удаляет ничего.

## 10. Что осталось непроверенным

- `nft list ruleset` и `journalctl -u clover-api` — **не проверено, требует
  sudo**: под текущей учётной записью обследования доступ к netlink и к
  системному журналу закрыт. Историю обращений к архивам по журналу
  подтвердить не удалось.
- Содержимое самих архивов **не открывалось** — состав определён по коду
  (`server/src/backups.js`, `server/src/db.js:1625`,
  `scripts/linux/daily-backup.sh`), а не по распаковке.
- Была ли утечка уже — по имеющимся данным **установить нельзя**. Файлы были
  доступны на чтение всем локальным пользователям как минимум с 2026-08-03
  (дата самого старого архива).
