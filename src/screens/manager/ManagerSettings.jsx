// Раздел менеджера: настройки кабинета, уведомления и роли.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { AdminRolePanel } from "../../components/AdminRolePanel";
import { PasswordSecurityPanel, PushSettings } from "../../shared/SharedPanels";
import { getRussianPhoneLocalDigits, formatRussianPhone } from "../../shared/appHelpers";
import { appAlert } from "../../shared/AppModal";

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

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.saveSettings(settings);
      const result = await api.testManagerNotifications();
      const delivery = result.result?.delivery || [];
      const parts = delivery.map((item) => {
        const channel = item.channel === "email" ? "email" : item.channel === "telegram" ? "Telegram" : item.channel === "push" ? "push" : "канал";
        if (item.sent === true || Number(item.sent) > 0) return `${channel}: отправлено`;
        return `${channel}: ${item.reason || item.error || "не отправлено"}`;
      });
      setMessage(parts.length ? parts.join("; ") : "Внутреннее уведомление создано. Внешние каналы пока выключены.");
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
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
        <ToggleSetting title="Отправлять на email" description="Использовать SMTP и адрес, указанный ниже." value={Boolean(settings.managerNotifyEmail)} onChange={(value) => set("managerNotifyEmail", value)} />
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
        <span className={status?.email?.configured ? "badge green" : "badge yellow"}>Email: {status?.email?.configured ? "готов" : status?.email?.smtpConfigured ? "укажите адрес" : "SMTP не настроен"}</span>
        <span className={status?.telegram?.configured ? "badge green" : "badge yellow"}>Telegram: {status?.telegram?.configured ? "готов" : status?.telegram?.tokenConfigured ? "укажите Chat ID" : "токен не настроен"}</span>
        <span className={status?.push?.configured ? "badge green" : "badge yellow"}>Push: {status?.push?.configured ? "готов" : "после HTTPS и VAPID"}</span>
      </div>
      <p className="manager-contact-help">Токен Telegram-бота и SMTP-пароль не вводятся в браузере и не отправляются в чат. Для них в обновлении будет отдельный локальный настройщик.</p>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={test}>{busy ? "Проверяем…" : "Отправить тестовое уведомление"}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={loadStatus}>Обновить статус</button>
      </div>
      {message && <div className="request-photo-status">{message}</div>}
    </div>
  );
}

export function ManagerSettings({ settings, setSettings, authUser }) {
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
      <AdminRolePanel currentUser={authUser} />
      <PasswordSecurityPanel />
    </section>
  );
}
