# После появления домена и HTTPS

1. Купить/привязать домен → A/AAAA на публичный IP (или через reverse-proxy датацентра).
2. Поставить Caddy / IIS ARR / nginx с сертификатом Let's Encrypt.
3. Обновить в `server/.env`:
   - `APP_PUBLIC_URL=https://clover.example.ru`
   - `CLOVER_PUBLIC_URL=https://clover.example.ru`
   - `PASSKEY_RP_ID=clover.example.ru` (без схемы)
   - `PASSKEY_ORIGIN=https://clover.example.ru`
4. Сгенерировать VAPID-ключи для Web Push и прописать в `.env` (пошагово: [PUSH_ENABLE.md](./PUSH_ENABLE.md)).
5. Настроить SMTP реального ящика.
6. Закрыть прямой доступ к 5273/4100 из интернета.
7. Повторить smoke: логин, заказ, очередь 1С TEST, PWA на телефоне, push + цифра на иконке.

До этого этапа LAN по IP — нормальный рабочий режим для внутренних тестов.
