CLOVER ↔ 1С TEST — БЕЗОПАСНЫЙ ОБМЕН

После установки Clover создаёт папку one_c_extension_ready с локальной копией шаблона. Действующая 1С TEST и её настройки автоматически не изменяются.

Пока ONEC_API_KEY не настроен, входящие callback-запросы Clover принимает только с этого же компьютера. Это сохраняет совместимость с текущей локальной 1С TEST.

После отдельной настройки ключа все обращения 1С к Clover должны содержать заголовок:
X-Clover-Key: <тот же ключ>

На постоянном сервере после настройки ключа установите в server/.env:
ONEC_ALLOW_LOCAL_WITHOUT_KEY=false

Защищённые маршруты Clover:
- GET /api/one-c/purchase-price-request
- POST /api/one-c/purchase-prices
- GET/POST /api/one-c/test-order
- POST /api/one-c/orders/{orderId}/ack
- POST /api/one-c/products-preview
- POST /api/one-c/clients-preview
- GET /api/one-c/reconciliation/requests
- POST /api/one-c/reconciliation/{requestId}/result

Готовый акт передаётся последним маршрутом в JSON:
{
  "fileName": "Акт-сверки.pdf",
  "fileBase64": "JVBERi0x...",
  "managerComment": "Сформирован в 1С"
}

Не отправляйте ONEC_API_KEY в чат, письма или скриншоты.
