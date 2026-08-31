# Runbook: межсетевой экран хоста Clover

> # ⛔ НЕ ЗАПУСКАТЬ БЕЗ ПРИСМОТРА
>
> **Этот runbook нельзя выполнять по SSH без страховки, из cron, из скрипта
> деплоя, из CI и «одной командой в конце рабочего дня».**
>
> Первое же применяемое правило может отрезать вас от машины. Хост
> `192.168.155.15` не имеет консоли под рукой в рамках этой процедуры,
> а межсетевого экрана на нём сейчас **нет вообще** — то есть любая ошибка
> сразу становится полной потерей доступа.
>
> Обязательные условия перед первой командой из §4:
>
> 1. **Открыта вторая SSH-сессия** к хосту, и она не закрывается до конца работ.
> 2. **Взведён автосброс правил** по §5 (`systemd-run`), проверен
>    `systemctl list-timers`.
> 3. Известен способ попасть на консоль/KVM у владельца площадки, если оба
>    предыдущих пункта не сработают.
> 4. **Определён IP машины 1С** (§3.2). Без него правило для `:4100` написать
>    нельзя, а неверное правило остановит боевой обмен с базой `VLAVKA`.
>
> Ни одна команда из этого документа при его составлении **не выполнялась**.
> Правила не применялись, `nftables.service` не включался, ничего не
> перезапускалось.
>
> Дата обследования: **2026-08-31**.

---

## 1. Текущее состояние

### 1.1 Какой инструмент есть

| Инструмент | Наличие | Проверено |
| --- | --- | --- |
| `nftables` | **установлен**, версия `1.1.3-1`, бинарь `/usr/sbin/nft` | `dpkg -l`, `ls /usr/sbin/nft` |
| `iptables` / `ip6tables` | **не установлены** | нет `/usr/sbin/iptables`, `/sbin/iptables`, `/usr/sbin/ip6tables` |
| `ufw` | **не установлен** | нет `/usr/sbin/ufw` |
| `firewalld` | **не установлен** | нет `firewall-cmd` |
| `at` / `atd` | **не установлен** | нет `/usr/bin/at` |
| `systemd-run` | **есть**, `/usr/bin/systemd-run` | — |

Вывод: рабочий инструмент здесь один — **nftables**. Он и рекомендуется.

### 1.2 Активны ли правила сейчас

```
$ systemctl is-enabled nftables   → disabled
$ systemctl is-active  nftables   → inactive
```

`/etc/nftables.conf` существует (`0755 root:root`, от 2025-06-10) и содержит
**заготовку без единого правила и без политики**:

```nftables
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
	chain input {
		type filter hook input priority filter;
	}
	chain forward {
		type filter hook forward priority filter;
	}
	chain output {
		type filter hook output priority filter;
	}
}
```

Политика по умолчанию для цепочки без `policy` — `accept`. Но и этот файл
не применяется: юнит выключен.

`nft list ruleset` — **не проверено, требует sudo**: под учётной записью
обследования вернулось `Operation not permitted (you must be root)` и
`netlink: Error: cache initialization failed`. Оператор обязан выполнить
проверку сам:

```bash
sudo nft list ruleset
```

Ожидаемый результат при пустом экране — **пустой вывод**. Если вывод
непустой, дальше по этому runbook идти нельзя: сначала разобраться,
откуда правила и кто их поставил.

**Рабочая гипотеза (на основании `disabled` + `inactive` + пустой заготовки):
фильтрации на хосте нет, всё, что слушает на `0.0.0.0`, доступно из сети
`192.168.155.0/24` без ограничений.** Косвенное подтверждение —
`curl http://192.168.155.15:4100/api/health` с самого хоста по LAN-адресу
проходит и возвращает `200`.

### 1.3 Сеть

```
$ ip -brief addr
lo     UNKNOWN  127.0.0.1/8 ::1/128
eth0   UP       192.168.155.15/24 fe80::2c2c:f81:304a:76f7/64

$ ip route
default via 192.168.155.1 dev eth0 proto dhcp src 192.168.155.15 metric 1002
192.168.155.0/24 dev eth0 proto dhcp scope link src 192.168.155.15 metric 1002

$ ip -6 route
fe80::/64 dev eth0 proto kernel metric 256
```

- Один интерфейс, приватный адрес. Публичный доступ к `:443` идёт через
  DNAT на периметре — фильтровать 80/443 по источнику **нельзя**, там будут
  адреса реальных посетителей сайта.
- **Глобального IPv6 нет** — только link-local `fe80::/64`. Но правила для
  IPv6 всё равно обязательны (§4.3).

Критично для §4 — обращение к собственному LAN-адресу идёт через `lo`:

```
$ ip route get 192.168.155.15
local 192.168.155.15 dev lo src 192.168.155.15
```

Именно поэтому `iif "lo" accept` сохраняет работоспособность nginx, который
проксирует на `http://192.168.155.15:4100` и `http://192.168.155.15:5273`.
**Без этого правила сайт ляжет целиком.**

### 1.4 SSH

`/etc/ssh/sshd_config`:

- директивы `Port` **нет** — значит действует значение по умолчанию,
  **порт 22**;
- `ListenAddress` не задан;
- `#AddressFamily any` закомментировано → слушает и IPv4, и IPv6;
- `PermitRootLogin yes` (строка 33);
- `#PasswordAuthentication yes` закомментировано → действует умолчание `yes`.

`/etc/ssh/sshd_config.d/` — **пуст**, переопределений нет.

Подтверждение из `ss -ltnp`: `0.0.0.0:22` и `[::]:22`.

> Итог: **SSH-порт — 22, на IPv4 и на IPv6.** Оба должны быть разрешены,
> иначе вход по IPv6 (в том числе по link-local внутри сегмента) отвалится.

`PermitRootLogin yes` вместе с парольной аутентификацией — отдельная
проблема, вне рамок этого runbook, но упомянуть стоит: пока порт 22 открыт
наружу, он будет перебираться.

---

## 2. Что обязано остаться доступным

| Порт | Протокол | Кому нужен | Последствие ошибочной блокировки |
| --- | --- | --- | --- |
| **22/tcp** | SSH, v4 **и** v6 | администратор | **потеря доступа к хосту** |
| **80/tcp** | HTTP | ACME-челленджи dehydrated + 301 на HTTPS | сертификаты перестанут продлеваться, сайт умрёт молча через ≤90 дней |
| **443/tcp** | HTTPS | все посетители | сайт недоступен |
| **4100/tcp** | HTTP, Clover API | **1С (база `VLAVKA`, боевая)** + nginx через `lo` | **остановка боевого обмена с 1С** |
| 5273/tcp | HTTP, Clover UI | nginx через `lo`; исторически — ПК менеджеров напрямую | «белая страница» у тех, кто ходит по прямому адресу |

### 2.1 Порт 80 — не забыть

Соблазн закрыть 80 «раз есть HTTPS» приводит к отложенной аварии.
Vhost `dehydrated` (`server_name _`, `listen 80`) обслуживает
`/.well-known/acme-challenge` — путь проверки Let's Encrypt. Закроете 80 —
продление сертификата тихо упадёт, а узнаете об этом в день истечения.

### 2.2 Порт 4100 — главный риск этого runbook

Из `INFRA_HARDENING_RUNBOOK.md` §2 (там же доказательства):

> **1С подключается напрямую к `192.168.155.15:4100` по обычному HTTP,
> не через nginx.** В модуле —
> `Соединение = Новый HTTPСоединение("192.168.155.15", 4100);`
> (`one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt`, 7 вызовов;
> `Clover_ХостAPI()` возвращает `"192.168.155.15"`). В журналах nginx —
> текущем и всех 14 ротированных — **ноль** обращений, содержащих `one-c`.

Значит: **правило `drop` на `:4100` без исключения для машины 1С остановит
обмен с боевой базой `VLAVKA`.** Это не «потенциально», это гарантированно.

Сломается тихо: сайт продолжит работать, заказы будут копиться в очереди,
цены перестанут обновляться. Заметят через часы или дни. Поэтому §3.2
(определение IP машины 1С) — не опциональный шаг.

### 2.3 Порт 5273

`nginx` ходит на него через `lo`, поэтому правило `iif "lo" accept` его
покрывает. Внешний доступ нужен только если кто-то из менеджеров до сих пор
открывает `http://192.168.155.15:5273/` напрямую — так описано в
`docs/deploy/CHECKLIST.md`. **Перед закрытием спросить у менеджеров.**
После перевода UI на статику nginx (`INFRA_HARDENING_RUNBOOK.md` §4) порт
исчезает вместе с сервисом, и вопрос снимается сам.

---

## 3. Предварительные проверки (до единой изменяющей команды)

### 3.1 Снять состояние «до»

```bash
sudo nft list ruleset            | sudo tee /root/fw-before-ruleset.txt
sudo ss -ltnp                    | sudo tee /root/fw-before-listen.txt
systemctl is-enabled nftables    | sudo tee -a /root/fw-before-listen.txt
systemctl is-active  nftables    | sudo tee -a /root/fw-before-listen.txt
ip -brief addr                   | sudo tee /root/fw-before-net.txt
ip route                         | sudo tee -a /root/fw-before-net.txt
ip -6 route                      | sudo tee -a /root/fw-before-net.txt
sudo cp /etc/nftables.conf /root/nftables.conf.orig
sudo sshd -T | grep -Ei '^(port|listenaddress|addressfamily|permitrootlogin)'
```

Последняя команда — авторитетная проверка порта SSH: `sshd -T` печатает
эффективную конфигурацию с учётом умолчаний. Ожидается `port 22`.

### 3.2 Определить IP машины 1С — обязательно

Любой из способов, лучше несколько:

```bash
# 1. по журналу API: oneCAuthRequired пишет ip в аудит при отказе
sudo journalctl -u clover-api --since "7 days ago" | grep -i 'one-c'

# 2. по живым соединениям в момент планового обмена
sudo ss -tnp state established '( sport = :4100 )'

# 3. пассивное наблюдение. tcpdump на хосте НЕ установлен (проверено),
#    нужен `sudo apt install tcpdump`:
sudo timeout 600 tcpdump -nn -i eth0 'tcp port 4100 and tcp[tcpflags] & tcp-syn != 0' \
  | tee /root/fw-onec-syn.log

#    без установки пакетов — опрос соединений раз в 5 секунд:
sudo sh -c 'for i in $(seq 1 120); do
  ss -tn state established "( sport = :4100 )" | tail -n +2
  sleep 5
done' | sort -u | tee /root/fw-onec-peers.log

# 4. журнал аудита Clover в UI менеджера: действия one-c.* содержат ip
```

Записать результат сюда перед началом работ:

```
ONEC_IP = ______________________     (например 192.168.155.__)
Кто подтвердил: __________________   Дата: __________
```

Если за наблюдение обмен не случился — **не гадать**. Либо дождаться
планового обмена, либо на первом этапе разрешить `:4100` для всей подсети
`192.168.155.0/24` (уже сильно лучше, чем `0.0.0.0/0`) и сузить позже,
когда IP станет известен.

### 3.3 Проверить, что вы попадёте обратно

```bash
# вторая сессия — открыть ДО начала и не закрывать
ssh -o ServerAliveInterval=15 <user>@192.168.155.15 'echo session-2-alive; sleep 3600'

# запомнить свой адрес, с которого пришли (ниже он не понадобится в правилах,
# но пригодится при разборе, если что-то пойдёт не так)
who am i
sudo ss -tnp state established '( sport = :22 )'
```

---

## 4. Целевой набор правил

### 4.1 Почему `table inet`

`table inet` в nftables обрабатывает IPv4 и IPv6 **одной** цепочкой. Это
закрывает классическую дыру, когда для IPv4 правила написали, а IPv6 остался
полностью открытым: с `iptables` это две независимые утилиты и два набора,
здесь — один. Учитывая, что sshd слушает `[::]:22`, отдельный IPv6-набор
здесь был бы обязателен, и его забыли бы.

### 4.2 Файл ruleset

Готовить как `/etc/nftables.conf.new`, применять только после §5.

```nftables
#!/usr/sbin/nft -f
# Clover host 192.168.155.15 — межсетевой экран
# Меняли: ____________  Дата: __________
#
# ВНИМАНИЕ: строка с ONEC_IP обязательна. Без неё обмен с боевой базой 1С
# VLAVKA остановится (1С ходит напрямую на 192.168.155.15:4100 по HTTP).

flush ruleset

define ONEC_IP   = 192.168.155.0/24     # ЗАМЕНИТЬ на конкретный адрес из §3.2
define LAN_V4    = 192.168.155.0/24

table inet filter {

    chain input {
        type filter hook input priority filter; policy drop;

        # --- 1. Петля. ОБЯЗАТЕЛЬНО ПЕРВЫМ ПРАВИЛОМ. ---
        # nginx проксирует на http://192.168.155.15:4100 и :5273;
        # `ip route get 192.168.155.15` → `local ... dev lo`, то есть
        # этот трафик приходит с iif lo. Без правила ляжет весь сайт.
        iif "lo" accept

        # --- 2. Уже установленные соединения ---
        ct state established,related accept
        ct state invalid drop

        # --- 3. ICMP. Для IPv6 это не опция: без ND сеть не работает. ---
        ip  protocol icmp   icmp   type { echo-request, echo-reply, destination-unreachable, time-exceeded, parameter-problem } accept
        ip6 nexthdr icmpv6 icmpv6 type { echo-request, echo-reply, destination-unreachable, packet-too-big, time-exceeded, parameter-problem,
                                          nd-router-solicit, nd-router-advert, nd-neighbor-solicit, nd-neighbor-advert,
                                          mld-listener-query, mld-listener-report, mld-listener-done } accept

        # --- 4. SSH. Порт 22 (Port в sshd_config не задан → умолчание). ---
        #     Оба семейства: sshd слушает 0.0.0.0:22 и [::]:22.
        #     На время внедрения — БЕЗ ограничения скорости: при отладке
        #     легко открыть несколько сессий подряд и самому попасть под лимит.
        tcp dport 22 accept

        #     Антиперебор включать ОТДЕЛЬНЫМ шагом, после этапа 6 из §10,
        #     заменив строку выше на эти две:
        # tcp dport 22 ct state new limit rate 30/minute burst 30 packets accept
        # tcp dport 22 ct state new counter drop comment "перебор SSH"

        # --- 5. HTTP: ACME dehydrated + 301 на HTTPS. Закрывать нельзя. ---
        tcp dport 80 accept

        # --- 6. HTTPS: основной сайт ---
        tcp dport 443 accept

        # --- 7. Clover API. Только машина 1С. Локальный доступ уже дан п.1 ---
        ip saddr $ONEC_IP tcp dport 4100 accept comment "1C VLAVKA -> Clover API"

        # --- 8. Clover UI (vite preview). Раскомментировать ТОЛЬКО если
        #     менеджеры реально ходят на http://192.168.155.15:5273/.
        #     После перевода UI на статику nginx строка не нужна.
        # ip saddr $LAN_V4 tcp dport 5273 accept comment "UI напрямую из LAN"

        # --- 9. Всё остальное: считаем и роняем ---
        counter comment "input drop"
        log prefix "nft-input-drop: " level info limit rate 5/minute
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
        counter
    }

    chain output {
        type filter hook output priority filter; policy accept;
        # Исходящий не ограничиваем: нужен APT, dehydrated/ACME, SMTP,
        # Telegram Bot API, web-push, обращения Clover к ONEC_BASE_URL.
    }
}
```

### 4.3 Что здесь закрывает IPv6

`table inet` + `policy drop` в `input` означает, что IPv6 попадает под те же
правила. Специально предусмотрено:

- SSH по IPv6 разрешён тем же `tcp dport 22` — без этого вход по
  link-local-адресу пропал бы;
- ICMPv6 (`nd-*`, `mld-*`, `packet-too-big`) разрешён явно. Если этого не
  сделать, ломается обнаружение соседей и Path MTU Discovery — симптом
  выглядит как «случайно зависают большие ответы», и на firewall не думают;
- `:4100` и `:5273` по IPv6 остаются закрытыми: правила ограничены `ip saddr`
  (только IPv4), что здесь и требуется — глобального IPv6 на хосте нет.

### 4.4 Проверка синтаксиса без применения

```bash
sudo nft -c -f /etc/nftables.conf.new && echo "синтаксис OK"
```

Флаг `-c` только проверяет, ничего не активирует. Пока `-c` не проходит —
к §5 не переходить.

### 4.5 Альтернатива на ufw

Приводится для полноты. **Не рекомендуется здесь**: ufw не установлен, его
установка тянет свой набор правил и может конфликтовать с `nftables.service`;
кроме того, `ufw` по умолчанию открывает порт целиком для всех, и правило
ограничения источника надо не забыть.

```bash
sudo apt install ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH — ПЕРВЫМ, до включения
sudo ufw limit 22/tcp comment 'SSH'

sudo ufw allow 80/tcp  comment 'HTTP ACME + redirect'
sudo ufw allow 443/tcp comment 'HTTPS'

# API только для 1С — подставить реальный адрес
sudo ufw allow from 192.168.155.__ to any port 4100 proto tcp comment '1C -> Clover API'

# UI напрямую — только если действительно нужен
# sudo ufw allow from 192.168.155.0/24 to any port 5273 proto tcp comment 'Clover UI'

sudo ufw --force enable
sudo ufw status verbose numbered
```

Про IPv6 в ufw: он управляется параметром `IPV6=yes` в `/etc/default/ufw`
(значение по умолчанию в Debian — `yes`). **Проверить обязательно**, иначе
получится ровно та дыра, ради закрытия которой всё делается:

```bash
grep -i '^IPV6' /etc/default/ufw
sudo ufw status verbose | grep -i v6
```

Петлевой интерфейс ufw разрешает сам (`allow in on lo`) — правило из §4.2 п.1
там не требуется, но проверить стоит: `sudo ufw show raw | grep -i lo`.

---

## 5. Защита от блокировки самого себя

### 5.1 Автосброс через systemd-run

`at` на хосте **не установлен**, поэтому используем `systemd-run` — он есть.
Идея: до применения правил взводится отложенная задача, которая через N минут
безусловно снесёт весь ruleset. Если после применения вы всё ещё в системе —
задача отменяется вручную. Если отрезало — ждёте N минут и снова заходите.

```bash
# Взвести ДО применения правил. 10 минут — разумно для проверок из §7.
sudo systemd-run --on-active=10min --unit=nft-panic --description='Clover firewall panic rollback' \
  /usr/sbin/nft flush ruleset

# Убедиться, что таймер действительно взведён
systemctl list-timers nft-panic.timer --all --no-pager
systemctl cat nft-panic.timer --no-pager
```

`nft flush ruleset` удаляет все таблицы. Цепочек не остаётся, фильтрации нет,
поведение возвращается к текущему (см. §1.2) — доступ открыт.

Отмена **после** того, как вы убедились, что доступ жив:

```bash
sudo systemctl stop nft-panic.timer
sudo systemctl reset-failed nft-panic.service 2>/dev/null || true
systemctl list-timers nft-panic.timer --all --no-pager   # должно быть пусто
```

Если проверки из §7 не уложились в 10 минут — **перевзвести таймер до
истечения**, а не увеличивать интервал задним числом:

```bash
sudo systemctl stop nft-panic.timer
sudo systemd-run --on-active=10min --unit=nft-panic /usr/sbin/nft flush ruleset
```

### 5.2 Вторая SSH-сессия

Открыть заранее, в отдельном окне, и не трогать:

```bash
ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=3 <user>@192.168.155.15
# внутри:
while true; do date; sleep 30; done
```

`ct state established,related accept` (п.2 ruleset) сохраняет уже открытые
соединения даже при ошибке в правиле для нового трафика. Живая вторая сессия —
это работающий канал для отката, когда новые подключения уже не проходят.

### 5.3 Порядок применения

```bash
# 0. страховка взведена (§5.1), вторая сессия открыта (§5.2)
systemctl list-timers nft-panic.timer --all --no-pager

# 1. синтаксис
sudo nft -c -f /etc/nftables.conf.new

# 2. применить в память — БЕЗ включения автозагрузки
sudo nft -f /etc/nftables.conf.new

# 3. немедленно: доступ жив?
sudo nft list ruleset | head -40
#    в ЭТОТ момент проверить вторую сессию и открыть третью с другой машины

# 4. проверки из §7 — пока таймер не истёк

# 5. только если ВСЁ прошло: отменить страховку
sudo systemctl stop nft-panic.timer
```

Обратите внимание: на шаге 2 правила применяются **только в память**.
Перезагрузка вернёт машину в незащищённое, но заведомо доступное состояние.
Постоянство включается отдельно, в §8, и только после успешных проверок.

---

## 6. Если всё-таки отрезало

1. **Ничего не делать 10 минут.** Таймер `nft-panic` сбросит правила сам.
2. Через 10 минут — обычный `ssh`. Проверить: `sudo nft list ruleset`
   (должно быть пусто).
3. Если вторая сессия жива — в ней:
   ```bash
   sudo nft flush ruleset
   ```
4. Если таймер не сработал и живых сессий нет — консоль/KVM у площадки,
   затем `nft flush ruleset` и `systemctl disable nftables`.
5. Разбор: сравнить применённый ruleset с `/root/fw-before-ruleset.txt`
   и `/root/nftables.conf.orig`, найти отсутствующее правило.
   Три типовые причины: забыли `iif "lo" accept`; SSH-правило после
   `policy drop` в неверной цепочке; правило для `:4100` с неверным
   `saddr`.

---

## 7. Проверки

### 7.1 С самого хоста

```bash
# правила загружены и в ожидаемом виде
sudo nft list ruleset

# счётчики: growing counter на drop = что-то легитимное режется
sudo nft list chain inet filter input

# сайт жив (nginx → 127.0.0.1/lo)
curl -fsS -o /dev/null -w 'root %{http_code}\n'  https://clover-spb.ru/
curl -fsS -o /dev/null -w 'api  %{http_code}\n'  https://clover-spb.ru/api/health
curl -fsS -o /dev/null -w 'lk   %{http_code}\n'  https://clover-spb.ru/lk

# API через lo (то, чем ходит nginx)
curl -fsS -o /dev/null -w 'lo:4100 %{http_code}\n' http://127.0.0.1:4100/api/health
curl -fsS -o /dev/null -w 'lan:4100 %{http_code}\n' http://192.168.155.15:4100/api/health

# слушатели не изменились
sudo ss -ltnp
```

`http://192.168.155.15:4100/api/health` с самого хоста обязан отвечать `200`:
трафик идёт через `lo` и попадает под правило 1.

### 7.2 С другой машины в LAN (не 1С)

```bash
# должно отвечать
nc -zv -w3 192.168.155.15 22
nc -zv -w3 192.168.155.15 80
nc -zv -w3 192.168.155.15 443

# должно ТАЙМАУТИТЬ (policy drop = молчание, не «connection refused»)
nc -zv -w3 192.168.155.15 4100
nc -zv -w3 192.168.155.15 5273

# полная картина. nmap на хосте Clover НЕ установлен (проверено),
# но эта проверка и выполняется с ДРУГОЙ машины — там он обычно есть.
nmap -Pn -p 22,80,443,4100,5273 192.168.155.15
```

Ожидаемо в `nmap`: `22/tcp open`, `80/tcp open`, `443/tcp open`,
`4100/tcp filtered`, `5273/tcp filtered`. Именно `filtered`, а не `closed`:
`closed` означает, что правило `drop` не применилось.

Различить `filtered` и `closed` можно и без nmap, по поведению `nc`:

- **таймаут** (`nc -w3` молча висит три секунды и выходит) → пакет отброшен
  правилом `drop`, это ожидаемый результат;
- **мгновенное `Connection refused`** → правило не применилось, до порта
  дошли и его просто никто не слушает, либо ядро ответило RST.

`nc` на хосте Clover есть (`/usr/bin/nc`).

### 7.3 С машины 1С — самая важная проверка

```
# на машине 1С (Windows), PowerShell:
Test-NetConnection 192.168.155.15 -Port 4100
curl.exe -sS -o NUL -w "%{http_code}`n" http://192.168.155.15:4100/api/health
```

Затем — **боевая проверка обмена**, а не только доступности порта:

1. В 1С запустить обмен на базе `TEST` (`X-Clover-Database: TEST`):
   получение очереди, `test-order`, `ack`, `price-types`.
2. Дождаться планового обмена на `VLAVKA` и убедиться, что он прошёл.
3. Со стороны Clover — вкладка обмена в кабинете менеджера: не должно
   появиться отказов `one-c.auth.denied` и разрывов.
4. Проверить счётчик отброшенных пакетов:
   ```bash
   sudo nft list chain inet filter input | grep -A2 'input drop'
   ```
   Если он растёт синхронно с попытками обмена — правило для `:4100`
   написано неверно.

### 7.4 Снаружи периметра

С машины вне сети `192.168.155.0/24` (например, из офиса через интернет):

```bash
curl -sSI https://clover-spb.ru/ | head -3
curl -sS -o /dev/null -w '%{http_code}\n' http://clover-spb.ru/.well-known/acme-challenge/probe
nmap -Pn -p 22,80,443,4100,5273 clover-spb.ru
```

`4100` и `5273` снаружи должны быть недоступны. Если они были доступны и до
работ — зафиксировать этот факт как отдельный инцидент: значит, на периметре
есть проброс, который тоже нужно снять.

### 7.5 IPv6 отдельно

```bash
# с соседней машины в том же сегменте, по link-local
ssh -6 <user>@fe80::2c2c:f81:304a:76f7%<ваш-интерфейс>

# ICMPv6 не сломан
ping6 -c3 fe80::2c2c:f81:304a:76f7%<ваш-интерфейс>
```

Проверять обязательно: правило `tcp dport 22` в `table inet` покрывает оба
семейства, но убедиться в этом нужно эмпирически, а не по документации.

---

## 8. Постоянство после перезагрузки

Включать **только** после того, как §7 полностью зелёный и таймер
`nft-panic` отменён.

```bash
# 1. сохранить проверенный набор как боевой
sudo cp /etc/nftables.conf /root/nftables.conf.orig      # если ещё не сделано в §3.1
sudo cp /etc/nftables.conf.new /etc/nftables.conf
sudo chmod 0755 /etc/nftables.conf                        # как было; шебанг #!/usr/sbin/nft -f
sudo chown root:root /etc/nftables.conf

# 2. проверить синтаксис уже боевого файла
sudo nft -c -f /etc/nftables.conf

# 3. включить юнит
sudo systemctl enable nftables.service
sudo systemctl start  nftables.service
systemctl status nftables.service --no-pager
```

`nftables.service` при старте выполняет `/etc/nftables.conf`, в начале
которого стоит `flush ruleset` — набор применяется идемпотентно.

### 8.1 Проверка после перезагрузки

Перезагрузку планировать в окно, когда доступ к консоли площадки
гарантирован:

```bash
sudo reboot
# после возврата:
sudo nft list ruleset | head -40
systemctl is-enabled nftables    # → enabled
systemctl is-active  nftables    # → active
sudo ss -ltnp
curl -fsS -o /dev/null -w '%{http_code}\n' https://clover-spb.ru/api/health
```

И снова прогнать §7.3 — проверку обмена с 1С.

### 8.2 Если выбран ufw

Он включает автозагрузку сам при `ufw enable`. Проверка:

```bash
systemctl is-enabled ufw
sudo ufw status verbose
```

---

## 9. Откат

### 9.1 Немедленный, без перезагрузки

```bash
sudo nft flush ruleset
sudo nft list ruleset            # пусто = фильтрации нет
```

### 9.2 Полный откат к состоянию до работ

```bash
sudo systemctl disable --now nftables.service
sudo nft flush ruleset
sudo cp /root/nftables.conf.orig /etc/nftables.conf
sudo nft list ruleset                         # пусто
systemctl is-enabled nftables                 # → disabled
systemctl is-active  nftables                 # → inactive

# сверить со снимком «до»
diff <(sudo nft list ruleset) /root/fw-before-ruleset.txt && echo "совпало с исходным"
sudo ss -ltnp | diff - /root/fw-before-listen.txt || true
```

### 9.3 Откат ufw

```bash
sudo ufw --force disable
sudo ufw status         # → Status: inactive
```

### 9.4 Проверка после отката

```bash
curl -fsS -o /dev/null -w 'site %{http_code}\n'  https://clover-spb.ru/
curl -fsS -o /dev/null -w 'api  %{http_code}\n'  http://192.168.155.15:4100/api/health
```

И сообщить ответственному за 1С, что ограничение снято и обмен должен идти
как раньше.

---

## 10. План поэтапного внедрения

Разом всё не включать. Каждый этап — отдельное окно с проверками.

| Этап | Что делаем | Риск |
| --- | --- | --- |
| 0 | Проверки §3, определить `ONEC_IP` | нулевой |
| 1 | Написать `/etc/nftables.conf.new`, `nft -c -f` | нулевой |
| 2 | Применить в память со страховкой (§5.3), проверки §7.1-7.2 | средний |
| 3 | Проверка обмена с 1С (§7.3) — дождаться реального цикла | — |
| 4 | Проверка снаружи (§7.4) и по IPv6 (§7.5) | низкий |
| 5 | Наблюдение сутки: счётчики drop, журнал nginx, очередь 1С | низкий |
| 6 | Постоянство (§8) + плановая перезагрузка | средний |
| 7 | Позже: закрыть `:5273` после переезда UI на nginx | низкий |
| 8 | Позже: закрыть `:4100` полностью — **только после** перевода 1С на HTTPS через nginx (`INFRA_HARDENING_RUNBOOK.md` §2.3, фазы 3-4) | высокий |

Между этапами 2 и 6 хост живёт с правилами в памяти: любая перезагрузка
возвращает его в открытое, но заведомо рабочее состояние. Это осознанная
страховка, а не недоделка.

---

## 11. Что осталось непроверенным

- **`nft list ruleset`** — не проверено, требует sudo:
  `Operation not permitted (you must be root)`. Утверждение «правил нет»
  основано на `systemctl is-enabled nftables` = `disabled`,
  `is-active` = `inactive`, пустой заготовке в `/etc/nftables.conf`
  и на том, что `:4100` отвечает по LAN-адресу. **Оператор обязан
  подтвердить это командой из §1.2 перед началом работ.**
- **`iptables -S` / `ip6tables -S` / `ufw status`** — выполнить невозможно,
  бинарей нет в системе (проверено по абсолютным путям и `dpkg -l`).
- **IP машины 1С** — не установлен. `journalctl -u clover-api` недоступен
  (не проверено, требует sudo: «No journal files were opened due to
  insufficient permissions»), активных соединений на `:4100` в момент
  обследования не было (`ss -tnp state established '( sport = :4100 )'` —
  пусто). Это блокирующий пункт для §4, см. §3.2.
- **Правила на периметре/шлюзе `192.168.155.1`** не обследовались — доступа
  к нему нет. Возможно, часть портов уже закрыта там; возможно, наоборот,
  `:4100` проброшен наружу. Проверяется только тестом §7.4 с внешней машины.
- **Реальная потребность в прямом доступе к `:5273`** не подтверждена и не
  опровергнута: нужен опрос менеджеров.
