// Раздел менеджера: настройки кабинета, уведомления и роли.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { PasswordSecurityPanel, PushSettings } from "../../shared/SharedPanels";
import { getRussianPhoneLocalDigits, formatRussianPhone } from "../../shared/appHelpers";
import { appAlert } from "../../shared/AppModal";
import { FREE_DELIVERY_MIN_TOTAL, PAID_DELIVERY_FEE } from "../../config/orderConfig";

function ManagerPromotionPanel() {
  const [title, setTitle] = useState("Новость Clover");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const result = await api.sendPromotion(title, body);
      await appAlert({
        title: result.result?.enabled ? "Отправлено" : "Push не настроен",
        message: result.result?.enabled
          ? `Отправлено: ${result.result.sent}`
          : "Push пока не настроен на сервере.",
        tone: result.result?.enabled ? "success" : "warn",
      });
      setBody("");
    } catch (error) {
      await appAlert({ title: "Ошибка отправки", message: error.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="manager-contact-settings">
      <h3>Push-уведомление об акции или новинке</h3>
      <div className="form-grid"><label className="field">Заголовок<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field field-wide">Текст<textarea rows="3" value={body} onChange={(event) => setBody(event.target.value)} /></label></div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || !body.trim()} onClick={send}>Отправить подписанным клиентам</button></div>
    </div>
  );
}

function ToggleSetting({ title, description, value, onChange }) {
  return <article className="setting-card"><div><h3>{title}</h3><p>{description}</p></div><button className={value ? "toggle active" : "toggle"} type="button" onClick={() => onChange(!value)} aria-label={title}><span /></button></article>;
}

function ManagerNotificationSettings({ settings, set }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    try {
      const result = await api.getManagerNotifications({ limit: 1 });
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const reasonRu = (channel, reason, error) => {
    const code = String(reason || error || "").trim();
    const map = {
      smtp_not_configured: "SMTP не настроен в server/.env",
      recipient_not_configured: "укажите email выше",
      telegram_not_configured: "нет токена бота в .env или Chat ID",
      telegram_unreachable: "нет доступа с DC до api.telegram.org (сеть/firewall)",
      telegram_api_error: "ответ Telegram API с ошибкой",
      telegram_send_failed: "ошибка отправки в Telegram",
      push_not_configured: "нужны HTTPS и VAPID на сервере",
      no_push_subscription: "установите PWA и разрешите уведомления",
      disabled: "выключено тумблером",
    };
    if (map[code]) return map[code];
    if (/fetch failed|ETIMEDOUT|ENETUNREACH|AbortError/i.test(code)) {
      return "нет доступа с DC до api.telegram.org (сеть/firewall)";
    }
    if (code) return code;
    if (channel === "push") return "не отправлено (PWA-подписка не нужна для email)";
    return "не отправлено";
  };

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      // Настройки уже сохраняются автоматически — повторный PUT здесь
      // мог затереть email=true устаревшим состоянием вкладки.
      const result = await api.testManagerNotifications();
      const delivery = result.result?.delivery || [];
      const parts = delivery.map((item) => {
        const channel = item.channel === "email" ? "email" : item.channel === "telegram" ? "Telegram" : item.channel === "push" ? "push" : "канал";
        if (item.sent === true || Number(item.sent) > 0) return `${channel}: отправлено`;
        return `${channel}: ${reasonRu(item.channel, item.reason, item.error)}`;
      });
      if (!settings.managerNotifyEmail && !delivery.some((item) => item.channel === "email")) {
        parts.unshift("email: включите тумблер «Отправлять на email» и обновите страницу");
      }
      const emailOk = delivery.some((item) => item.channel === "email" && (item.sent === true || Number(item.sent) > 0));
      const summary = parts.length ? parts.join("; ") : "Внутреннее уведомление создано. Внешние каналы пока выключены.";
      setMessage(emailOk ? `Письмо ушло на ${status?.email?.recipient || settings.managerNotificationEmail || "указанный адрес"}. ${summary}` : summary);
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message || "Не удалось проверить каналы");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manager-contact-settings manager-notification-settings">
      <h3>Уведомления менеджеру</h3>
      <p>Новый заказ, изменение заказа, товар вне матрицы, запрос акта сверки, регистрация клиента и ошибки 1С.</p>
      <div className="settings-grid">
        <ToggleSetting title="Уведомления в Clover" description="Показывать новые события сразу в кабинете менеджера." value={settings.managerNotificationsEnabled !== false} onChange={(value) => set("managerNotificationsEnabled", value)} />
        <ToggleSetting title="Новые заказы" description="Сообщать о каждом новом заказе клиента." value={settings.managerNotifyNewOrders !== false} onChange={(value) => set("managerNotifyNewOrders", value)} />
        <ToggleSetting title="Изменения заказов" description="Сообщать, когда клиент меняет или удаляет новый заказ." value={settings.managerNotifyOrderChanges !== false} onChange={(value) => set("managerNotifyOrderChanges", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Отдельно сообщать о новой позиции, комментарии и фотографии." value={settings.managerNotifyCustomItems !== false} onChange={(value) => set("managerNotifyCustomItems", value)} />
        <ToggleSetting title="Запросы актов сверки" description="Сообщать о новом запросе с выбранным периодом." value={settings.managerNotifyReconciliation !== false} onChange={(value) => set("managerNotifyReconciliation", value)} />
        <ToggleSetting title="Новые регистрации" description="Сообщать о клиентах, ожидающих подтверждения менеджера." value={settings.managerNotifyRegistrations !== false} onChange={(value) => set("managerNotifyRegistrations", value)} />
        <ToggleSetting title="Ошибки обмена с 1С" description="Сообщать о сбоях передачи и обработки заказов." value={settings.managerNotifyOneCErrors !== false} onChange={(value) => set("managerNotifyOneCErrors", value)} />
        <ToggleSetting title="Push на устройства менеджера" description="Отправлять уведомления в установленную PWA Clover." value={settings.managerNotifyPush !== false} onChange={(value) => set("managerNotifyPush", value)} />
        <ToggleSetting title="Отправлять на email" description="Письмо о новом заказе с полным составом для ручного ввода в 1С. Нужны SMTP в server/.env и адрес ниже." value={Boolean(settings.managerNotifyEmail)} onChange={(value) => set("managerNotifyEmail", value)} />
        <ToggleSetting title="Отправлять в Telegram-бот" description="Токен хранится только в server/.env, Chat ID указывается ниже." value={Boolean(settings.managerNotifyTelegram)} onChange={(value) => set("managerNotifyTelegram", value)} />
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">Email для уведомлений
          <input type="email" value={settings.managerNotificationEmail || ""} placeholder="clover-order@mail.ru" onChange={(event) => set("managerNotificationEmail", event.target.value)} />
        </label>
        <label className="field">Telegram Chat ID менеджера
          <input value={settings.managerTelegramChatId || ""} placeholder="Например: 123456789" onChange={(event) => set("managerTelegramChatId", event.target.value.trim())} />
        </label>
      </div>
      <div className="notification-channel-status">
        <span className={status?.email?.configured && settings.managerNotifyEmail ? "badge green" : "badge yellow"}>
          Email: {settings.managerNotifyEmail
            ? (status?.email?.configured ? "включён и готов" : status?.email?.smtpConfigured ? "включён, укажите адрес" : "включён, SMTP не настроен")
            : (status?.email?.configured ? "готов, но выключен" : "выключен")}
        </span>
        <span className={status?.telegram?.configured ? "badge green" : "badge yellow"}>Telegram: {status?.telegram?.configured ? "готов" : status?.telegram?.tokenConfigured ? "укажите Chat ID" : "токен не настроен"}</span>
        <span className={status?.push?.configured ? "badge green" : "badge yellow"}>Push: {status?.push?.configured ? "готов" : "после HTTPS и VAPID"}</span>
      </div>
      <p className="manager-contact-help">Токен Telegram-бота и SMTP-пароль не вводятся в браузере — они уже задаются в server/.env на этом ПК (позже будет отдельный локальный настройщик). Для письма достаточно тумблера «Отправлять на email» и адреса выше. Push для проверки не обязателен.</p>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={test}>{busy ? "Проверяем…" : "Отправить тестовое уведомление"}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={loadStatus}>Обновить статус</button>
      </div>
      {message && <div className="request-photo-status">{message}</div>}
    </div>
  );
}

export function DeliveryOneCSettings({ settings, set }) {
  const freeDeliveryMinTotal = FREE_DELIVERY_MIN_TOTAL.toLocaleString("ru-RU");
  const paidDeliveryFee = PAID_DELIVERY_FEE.toLocaleString("ru-RU");

  return (
    <div className="manager-contact-settings">
      <h3>Номенклатура доставки в 1С</h3>
      <p>
        Для заказов менее {freeDeliveryMinTotal} ₽ Clover добавляет доставку {paidDeliveryFee} ₽;
        от {freeDeliveryMinTotal} ₽ — бесплатно.
      </p>
      <div className="form-grid">
        <label className="field" htmlFor="delivery-onec-name">
          Наименование в 1С
          <input
            id="delivery-onec-name"
            name="deliveryOneCName"
            value={settings.deliveryOneCName ?? "Доставка"}
            placeholder="Доставка"
            onChange={(event) => set("deliveryOneCName", event.target.value)}
          />
        </label>
        <label className="field" htmlFor="delivery-onec-code">
          Код в 1С
          <input
            id="delivery-onec-code"
            name="deliveryOneCCode"
            value={settings.deliveryOneCCode ?? ""}
            placeholder="Например: НФ-000001"
            spellCheck="false"
            onChange={(event) => set("deliveryOneCCode", event.target.value)}
          />
        </label>
        <label className="field field-wide" htmlFor="delivery-onec-id">
          ID в 1С
          <input
            id="delivery-onec-id"
            name="deliveryOneCId"
            value={settings.deliveryOneCId ?? ""}
            placeholder="UUID номенклатуры"
            spellCheck="false"
            onChange={(event) => set("deliveryOneCId", event.target.value)}
          />
        </label>
      </div>
      <p className="manager-contact-help">
        Укажите UUID или код позиции доставки из 1С. Эти значения используются для
        сопоставления служебной строки доставки при передаче заказа.
      </p>
    </div>
  );
}

function newDeliveryZoneId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `zone-${crypto.randomUUID()}`;
  }
  return `zone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseOptionalMoney(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function DeliveryZonesSettings({ settings, set }) {
  const zones = Array.isArray(settings.deliveryZones) ? settings.deliveryZones : [];

  const updateZones = (next) => set("deliveryZones", next);

  const patchZone = (zoneId, patch) => {
    updateZones(
      zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone))
    );
  };

  const addZone = () => {
    updateZones([
      ...zones,
      {
        id: newDeliveryZoneId(),
        name: "",
        enabled: true,
        freeFrom: null,
        fee: null,
      },
    ]);
  };

  const toggleZone = (zoneId) => {
    const current = zones.find((zone) => zone.id === zoneId);
    if (!current) return;
    patchZone(zoneId, { enabled: !current.enabled });
  };

  return (
    <div className="manager-contact-settings">
      <h3>Зоны доставки</h3>
      <p>
        Для каждого адреса клиента можно выбрать зону. Пустые поля берут глобальные
        значения: бесплатно от {FREE_DELIVERY_MIN_TOTAL} ₽, доставка {PAID_DELIVERY_FEE} ₽.
      </p>
      {zones.map((zone) => (
        <div className="form-grid" key={zone.id} style={{ marginBottom: 12 }}>
          <label className="field" htmlFor={`delivery-zone-name-${zone.id}`}>
            Название
            <input
              id={`delivery-zone-name-${zone.id}`}
              name={`deliveryZoneName-${zone.id}`}
              value={zone.name ?? ""}
              placeholder="Например: Мурино"
              onChange={(event) => patchZone(zone.id, { name: event.target.value })}
            />
          </label>
          <label className="field" htmlFor={`delivery-zone-free-${zone.id}`}>
            Бесплатная доставка от, ₽
            <input
              id={`delivery-zone-free-${zone.id}`}
              name={`deliveryZoneFreeFrom-${zone.id}`}
              type="number"
              min="0"
              step="1"
              value={zone.freeFrom == null ? "" : zone.freeFrom}
              placeholder={`По умолчанию: ${FREE_DELIVERY_MIN_TOTAL}`}
              onChange={(event) =>
                patchZone(zone.id, { freeFrom: parseOptionalMoney(event.target.value) })
              }
            />
            <small>По умолчанию: {FREE_DELIVERY_MIN_TOTAL} ₽</small>
          </label>
          <label className="field" htmlFor={`delivery-zone-fee-${zone.id}`}>
            Стоимость доставки, ₽
            <input
              id={`delivery-zone-fee-${zone.id}`}
              name={`deliveryZoneFee-${zone.id}`}
              type="number"
              min="0"
              step="1"
              value={zone.fee == null ? "" : zone.fee}
              placeholder={`По умолчанию: ${PAID_DELIVERY_FEE}`}
              onChange={(event) =>
                patchZone(zone.id, { fee: parseOptionalMoney(event.target.value) })
              }
            />
            <small>По умолчанию: {PAID_DELIVERY_FEE} ₽</small>
          </label>
          <div className="field" style={{ display: "flex", alignItems: "end", gap: 8 }}>
            <button
              type="button"
              className="secondary-button"
              data-zone-id={zone.id}
              onClick={() => toggleZone(zone.id)}
            >
              {zone.enabled === false ? "Включить" : "Отключить"}
            </button>
            <span className={zone.enabled === false ? "badge yellow" : "badge green"}>
              {zone.enabled === false ? "Отключена" : "Активна"}
            </span>
          </div>
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={addZone}>
        Добавить зону
      </button>
      <p className="manager-contact-help">
        Изменения сохраняются вместе с настройками кабинета. Удаление зон не
        выполняется — отключите зону, если она больше не нужна.
      </p>
    </div>
  );
}

export function ManagerSettings({ settings, setSettings, authUser }) {
  const isAdmin = authUser?.role === "admin";
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Правила</p>
          <h2>Настройки кабинета</h2>
          <p>Изменения сохраняются автоматически и применяются сразу.</p>
        </div>
      </div>

      <details className="manager-help-details">
        <summary>Автоматическое сопоставление номенклатуры</summary>
        <p>
          Clover сохраняет только точные совпадения и несколько наиболее похожих
          вариантов для несвязанных товаров. Название на сайте может отличаться от 1С:
          в заказ передаётся ID 1С. Полная номенклатура и база клиентов в Clover не
          сохраняются. Неоднозначные варианты выбирает менеджер во вкладке «Товары».
        </p>
      </details>

      <div className="manager-contact-settings">
        <h3>Контакты менеджера для клиентов</h3>
        <p>
          В личном кабинете появится кнопка «Ваш менеджер». При наведении
          или нажатии клиент увидит ФИО, телефон и кнопки связи.
        </p>
        <div className="form-grid">
          <label className="field">
            ФИО менеджера
            <input
              value={settings.managerFullName || ""}
              placeholder="Например: Иванов Иван Иванович"
              onChange={(event) => set("managerFullName", event.target.value)}
            />
          </label>
          <label className="field">
            Телефон менеджера
            <input
              inputMode="tel"
              value={formatRussianPhone(settings.managerPhone || "")}
              onFocus={(event) => {
                if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                  requestAnimationFrame(() => {
                    const end = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(end, end);
                  });
                }
              }}
              onChange={(event) => set("managerPhone", formatRussianPhone(event.target.value))}
              placeholder="+7 (___) ___-__-__"
            />
          </label>
          <label className="field">
            Ссылка на профиль MAX
            <input
              value={settings.managerMax || ""}
              placeholder="https://max.ru/u/... или max.ru/username"
              onChange={(event) => set("managerMax", event.target.value)}
            />
          </label>
          <label className="field">
            Telegram менеджера — необязательно
            <input
              value={settings.managerTelegram || ""}
              placeholder="@username или ссылка t.me"
              onChange={(event) => set("managerTelegram", event.target.value)}
            />
          </label>
        </div>
        <p className="manager-contact-help">
          Для MAX вставьте ссылку на профиль, скопированную в приложении MAX.
          Telegram показывается только после заполнения имени пользователя или ссылки.
        </p>
      </div>

      <DeliveryOneCSettings settings={settings} set={set} />
      <DeliveryZonesSettings settings={settings} set={set} />
      <ManagerNotificationSettings settings={settings} set={set} />
      <PushSettings />

      <div className="settings-grid">
        <ToggleSetting title="Показывать цены" description="Клиент увидит цены, заполненные в карточках товаров." value={settings.showPrices} onChange={(value) => set("showPrices", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Разрешить клиенту запрашивать отсутствующие позиции." value={settings.allowCustomItems} onChange={(value) => set("allowCustomItems", value)} />
        <ToggleSetting title="Редактирование новых заказов" description="Клиент может менять заказ до принятия менеджером." value={settings.allowClientEdit} onChange={(value) => set("allowClientEdit", value)} />
        <ToggleSetting title="Удаление новых заказов" description="Клиент может отправить заказ «Новый» в корзину менеджера." value={settings.allowClientDelete} onChange={(value) => set("allowClientDelete", value)} />
        <ToggleSetting title="Повтор заказа" description="Показывать кнопку для быстрого повторения заказа." value={settings.allowRepeatOrder} onChange={(value) => set("allowRepeatOrder", value)} />
        <ToggleSetting title="Обязательный профиль" description="Запретить заказ без данных организации." value={settings.requireProfile} onChange={(value) => set("requireProfile", value)} />
        <ToggleSetting title="Обязательный адрес" description="Запретить заказ без сохранённого адреса." value={settings.requireAddress} onChange={(value) => set("requireAddress", value)} />
        <ToggleSetting title="Корзина менеджера" description="Менеджер может перемещать заказы в корзину до передачи в 1С и восстанавливать их." value={settings.managerCanDeleteOrders} onChange={(value) => set("managerCanDeleteOrders", value)} />
        <ToggleSetting title="Избранные товары" description="Клиент может отмечать часто используемые товары." value={settings.showFavorites} onChange={(value) => set("showFavorites", value)} />
        <ToggleSetting title="Автосохранение черновика" description="Незавершённый новый заказ сохраняется в браузере." value={settings.enableDrafts} onChange={(value) => set("enableDrafts", value)} />
      </div>
      <ManagerPromotionPanel />
      <PasswordSecurityPanel
        allowPasswordChange={!isAdmin}
        passwordChangeHint={
          isAdmin
            ? "Смену пароля администратора выполняйте в «Ещё → Доступы → Менеджеры» → ваша карточка → «Управление». Здесь можно добавить Face ID, отпечаток или завершить другие сессии."
            : ""
        }
      />
    </section>
  );
}
