import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: настройки кабинета, уведомления и роли.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { PasswordSecurityPanel, PushSettings } from "../../shared/SharedPanels";
import { getRussianPhoneLocalDigits, formatRussianPhone } from "../../shared/appHelpers";
import { appAlert } from "../../shared/AppModal";
import { FREE_DELIVERY_MIN_TOTAL, PAID_DELIVERY_FEE } from "../../config/orderConfig";

function ManagerPromotionPanel() {
  const { t } = useLocalization();
  const [title, setTitle] = useState("Новость Clover");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const result = await api.sendPromotion(title, body);
      await appAlert({
        title: result.result?.enabled ? t("manager.sent") : t("manager.pushIsNotConfigured"),
        message: result.result?.enabled
          ? t("manager.settings.sentCount", { count: result.result.sent })
          : t("manager.pushIsNotConfiguredOnThe"),
        tone: result.result?.enabled ? "success" : "warn",
      });
      setBody("");
    } catch (error) {
      await appAlert({ title: t("manager.sendError"), message: error.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="manager-contact-settings">
      <h3>{t("manager.pushAboutAPromoOrNew")}</h3>
      <div className="form-grid"><label className="field">{t("shared.field.title")}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field field-wide">{t("manager.field.bodyText")}<textarea rows="3" value={body} onChange={(event) => setBody(event.target.value)} /></label></div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || !body.trim()} onClick={send}>{t("manager.sendToSubscribedClients")}</button></div>
    </div>
  );
}

function ToggleSetting({ title, description, value, onChange }) {
  return <article className="setting-card"><div><h3>{title}</h3><p>{description}</p></div><button className={value ? "toggle active" : "toggle"} type="button" onClick={() => onChange(!value)} aria-label={title}><span /></button></article>;
}

function ManagerNotificationSettings({ settings, set }) {
  const { t } = useLocalization();
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
      smtp_not_configured: t("manager.smtpIsNotConfiguredInServer"),
      recipient_not_configured: t("manager.enterTheEmailAbove"),
      telegram_not_configured: t("manager.noBotTokenInEnvOr"),
      telegram_unreachable: t("manager.noAccessFromTheDcTo"),
      telegram_api_error: t("manager.telegramApiReturnedAnError"),
      telegram_send_failed: t("manager.telegramSendError"),
      push_not_configured: t("manager.httpsAndVapidAreRequiredOn"),
      no_push_subscription: t("manager.installThePwaAndAllowNotifications"),
      disabled: t("manager.turnedOffWithTheSwitch"),
    };
    if (map[code]) return map[code];
    if (/fetch failed|ETIMEDOUT|ENETUNREACH|AbortError/i.test(code)) {
      return t("manager.noAccessFromTheDcTo");
    }
    if (code) return code;
    if (channel === "push") return t("manager.notSentPwaSubscriptionIsNot");
    return t("manager.notSent");
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
        const channel = item.channel === "email" ? "email" : item.channel === "telegram" ? "Telegram" : item.channel === "push" ? "push" : t("manager.channel");
        if (item.sent === true || Number(item.sent) > 0) return t("manager.settings.channelSent", { channel });
        return `${channel}: ${reasonRu(item.channel, item.reason, item.error)}`;
      });
      if (!settings.managerNotifyEmail && !delivery.some((item) => item.channel === "email")) {
        parts.unshift("email: включите тумблер «Отправлять на email» и обновите страницу");
      }
      const emailOk = delivery.some((item) => item.channel === "email" && (item.sent === true || Number(item.sent) > 0));
      const summary = parts.length ? parts.join("; ") : t("manager.anInternalNotificationWasCreatedExternal");
      setMessage(emailOk ? t("manager.settings.mailSentTo", {
        email: status?.email?.recipient || settings.managerNotificationEmail || t("manager.settings.namedAddressFallback"),
        summary,
      }) : summary);
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message || "Не удалось проверить каналы");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manager-contact-settings manager-notification-settings">
      <h3>{t("manager.managerNotifications")}</h3>
      <p>{t("manager.newOrderOrderChangeProductOutside")}</p>
      <div className="settings-grid">
        <ToggleSetting title={t("manager.cloverNotifications")} description={t("manager.showNewEventsImmediatelyInThe")} value={settings.managerNotificationsEnabled !== false} onChange={(value) => set("managerNotificationsEnabled", value)} />
        <ToggleSetting title={t("manager.newOrders")} description={t("manager.notifyAboutEveryNewClientOrder")} value={settings.managerNotifyNewOrders !== false} onChange={(value) => set("managerNotifyNewOrders", value)} />
        <ToggleSetting title={t("manager.orderChanges")} description={t("manager.notifyWhenAClientChangesOr")} value={settings.managerNotifyOrderChanges !== false} onChange={(value) => set("managerNotifyOrderChanges", value)} />
        <ToggleSetting title={t("manager.productsOutsideTheMatrix")} description={t("manager.notifySeparatelyAboutANewItem")} value={settings.managerNotifyCustomItems !== false} onChange={(value) => set("managerNotifyCustomItems", value)} />
        <ToggleSetting title={t("manager.statementRequests")} description={t("manager.notifyAboutANewRequestWith")} value={settings.managerNotifyReconciliation !== false} onChange={(value) => set("managerNotifyReconciliation", value)} />
        <ToggleSetting title={t("manager.newRegistrations")} description={t("manager.notifyAboutClientsWaitingForManager")} value={settings.managerNotifyRegistrations !== false} onChange={(value) => set("managerNotifyRegistrations", value)} />
        <ToggleSetting title={t("manager.exchange.errorsToggle")} description={t("manager.notifyAboutOrderSendAndProcessing")} value={settings.managerNotifyOneCErrors !== false} onChange={(value) => set("managerNotifyOneCErrors", value)} />
        <ToggleSetting title={t("manager.pushToManagerDevices")} description={t("manager.sendNotificationsToTheInstalledClover")} value={settings.managerNotifyPush !== false} onChange={(value) => set("managerNotifyPush", value)} />
        <ToggleSetting title={t("manager.sendToEmail")} description={t("manager.anEmailAboutANewOrder")} value={Boolean(settings.managerNotifyEmail)} onChange={(value) => set("managerNotifyEmail", value)} />
        <ToggleSetting title={t("manager.sendToTelegramBot")} description={t("manager.theTokenIsStoredOnlyIn")} value={Boolean(settings.managerNotifyTelegram)} onChange={(value) => set("managerNotifyTelegram", value)} />
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">{t("manager.notificationEmail")
          }<input type="email" value={settings.managerNotificationEmail || ""} placeholder="clover-order@mail.ru" onChange={(event) => set("managerNotificationEmail", event.target.value)} />
        </label>
        <label className="field">{t("manager.managerTelegramChatId")
          }<input value={settings.managerTelegramChatId || ""} placeholder={t("manager.forExample123456789")} onChange={(event) => set("managerTelegramChatId", event.target.value.trim())} />
        </label>
      </div>
      <div className="notification-channel-status">
        <span className={status?.email?.configured && settings.managerNotifyEmail ? "badge green" : "badge yellow"}>
          Email: {settings.managerNotifyEmail
            ? (status?.email?.configured ? t("manager.enabledAndReady") : status?.email?.smtpConfigured ? t("manager.enabledEnterAnAddress") : t("manager.enabledSmtpIsNotConfigured"))
            : (status?.email?.configured ? t("manager.readyButDisabled") : t("manager.off"))}
        </span>
        <span className={status?.telegram?.configured ? "badge green" : "badge yellow"}>Telegram: {status?.telegram?.configured ? t("manager.ready") : status?.telegram?.tokenConfigured ? t("manager.enterTheChatId") : t("manager.tokenIsNotConfigured")}</span>
        <span className={status?.push?.configured ? "badge green" : "badge yellow"}>Push: {status?.push?.configured ? t("manager.ready") : t("manager.afterHttpsAndVapid")}</span>
      </div>
      <p className="manager-contact-help">{t("manager.theTelegramBotTokenAndSmtp")}</p>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={test}>{busy ? t("manager.checking") : t("manager.sendATestNotification")}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={loadStatus}>{t("manager.refreshStatus")}</button>
      </div>
      {message && <div className="request-photo-status">{message}</div>}
    </div>
  );
}

export function DeliveryOneCSettings({ settings, set }) {
  const { t } = useLocalization();
  const freeDeliveryMinTotal = FREE_DELIVERY_MIN_TOTAL.toLocaleString("ru-RU");
  const paidDeliveryFee = PAID_DELIVERY_FEE.toLocaleString("ru-RU");

  return (
    <div className="manager-contact-settings">
      <h3>{t("manager.settings.deliveryNomenclature")}</h3>
      <p>
        {t("manager.settings.paidDeliveryRule", {
          freeFrom: freeDeliveryMinTotal,
          fee: paidDeliveryFee,
        })}
      </p>
      <div className="form-grid">
        <label className="field" htmlFor="delivery-onec-name">{
          t("manager.nameIn1c")
          }<input
            id="delivery-onec-name"
            name="deliveryOneCName"
            value={settings.deliveryOneCName ?? "Доставка"}
            placeholder={t("checkout.delivery")}
            onChange={(event) => set("deliveryOneCName", event.target.value)}
          />
        </label>
        <label className="field" htmlFor="delivery-onec-code">{
          t("manager.codeIn1c")
          }<input
            id="delivery-onec-code"
            name="deliveryOneCCode"
            value={settings.deliveryOneCCode ?? ""}
            placeholder={t("manager.forExampleNf000001")}
            spellCheck="false"
            onChange={(event) => set("deliveryOneCCode", event.target.value)}
          />
        </label>
        <label className="field field-wide" htmlFor="delivery-onec-id">{
          t("manager.idIn1c")
          }<input
            id="delivery-onec-id"
            name="deliveryOneCId"
            value={settings.deliveryOneCId ?? ""}
            placeholder={t("manager.nomenclatureUuid")}
            spellCheck="false"
            onChange={(event) => set("deliveryOneCId", event.target.value)}
          />
        </label>
      </div>
      <p className="manager-contact-help">{
        t("manager.enterTheUuidOrDeliveryItem")
      }</p>
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
  const { t } = useLocalization();
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
      <h3>{t("manager.deliveryZones")}</h3>
      <p>
        {t("manager.settings.zoneEmptyFieldsHint", {
          freeFrom: FREE_DELIVERY_MIN_TOTAL,
          fee: PAID_DELIVERY_FEE,
        })}
      </p>
      {zones.map((zone) => (
        <div className="delivery-zone-item" key={zone.id}>
          <div className="delivery-zone-header">
            <strong className="delivery-zone-title">{zone.name}</strong>
            <div className="delivery-zone-actions">
              <span className={zone.enabled === false ? "badge yellow" : "badge green"}>
                {zone.enabled === false ? t("manager.disabled") : t("manager.active2")}
              </span>
              <button
                type="button"
                className="secondary-button"
                data-zone-id={zone.id}
                onClick={() => toggleZone(zone.id)}
              >
                {zone.enabled === false ? t("shared.action.enable") : t("shared.action.disable")}
              </button>
            </div>
          </div>
          <div className="form-grid delivery-zone-fields">
            <label className="field" htmlFor={`delivery-zone-name-${zone.id}`}>{
              t("shared.field.name")
              }<input
                id={`delivery-zone-name-${zone.id}`}
                name={`deliveryZoneName-${zone.id}`}
                value={zone.name ?? ""}
                placeholder={t("manager.forExampleMurino")}
                onChange={(event) => patchZone(zone.id, { name: event.target.value })}
              />
            </label>
            <label className="field" htmlFor={`delivery-zone-free-${zone.id}`}>{
              t("manager.freeDeliveryFrom")
              }<input
                id={`delivery-zone-free-${zone.id}`}
                name={`deliveryZoneFreeFrom-${zone.id}`}
                type="number"
                min="0"
                step="1"
                value={zone.freeFrom == null ? "" : zone.freeFrom}
                placeholder={t("manager.settings.defaultValue", { value: FREE_DELIVERY_MIN_TOTAL })}
                onChange={(event) =>
                  patchZone(zone.id, { freeFrom: parseOptionalMoney(event.target.value) })
                }
              />
              <small>{t("manager.settings.defaultValue", { value: `${FREE_DELIVERY_MIN_TOTAL} ₽` })}</small>
            </label>
            <label className="field" htmlFor={`delivery-zone-fee-${zone.id}`}>{
              t("manager.deliveryFee")
              }<input
                id={`delivery-zone-fee-${zone.id}`}
                name={`deliveryZoneFee-${zone.id}`}
                type="number"
                min="0"
                step="1"
                value={zone.fee == null ? "" : zone.fee}
                placeholder={t("manager.settings.defaultValue", { value: PAID_DELIVERY_FEE })}
                onChange={(event) =>
                  patchZone(zone.id, { fee: parseOptionalMoney(event.target.value) })
                }
              />
              <small>{t("manager.settings.defaultValue", { value: `${PAID_DELIVERY_FEE} ₽` })}</small>
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={addZone}>{
        t("manager.addZone")
      }</button>
      <p className="manager-contact-help">{
        t("manager.changesAreSavedWithCabinetSettings")
      }</p>
    </div>
  );
}

export function ManagerSettings({ settings, setSettings, authUser }) {
  const { t } = useLocalization();
  const isAdmin = authUser?.role === "admin";
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("manager.rules")}</p>
          <h2>{t("manager.cabinetSettings")}</h2>
          <p>{t("manager.changesAreSavedAutomaticallyAndApply")}</p>
        </div>
      </div>

      <details className="manager-help-details">
        <summary>{t("manager.automaticNomenclatureMatching")}</summary>
        <p>{
          t("manager.cloverStoresOnlyExactMatchesAnd")
        }</p>
      </details>

      <div className="manager-contact-settings">
        <h3>{t("manager.managerContactsForClients")}</h3>
        <p>{
          t("manager.theCabinetWillShowAYour")
        }</p>
        <div className="form-grid">
          <label className="field">{
            t("manager.managerFullName")
            }<input
              value={settings.managerFullName || ""}
              placeholder={t("manager.forExampleIvanovIvanIvanovich")}
              onChange={(event) => set("managerFullName", event.target.value)}
            />
          </label>
          <label className="field">{
            t("manager.managerPhone")
            }<input
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
          <label className="field">{
            t("manager.maxProfileLink")
            }<input
              value={settings.managerMax || ""}
              placeholder={t("manager.httpsMaxRuUOrMax")}
              onChange={(event) => set("managerMax", event.target.value)}
            />
          </label>
          <label className="field">{
            t("manager.managerTelegramOptional")
            }<input
              value={settings.managerTelegram || ""}
              placeholder={t("manager.usernameOrTMeLink")}
              onChange={(event) => set("managerTelegram", event.target.value)}
            />
          </label>
        </div>
        <p className="manager-contact-help">{
          t("manager.forMaxPasteTheProfileLink")
        }</p>
      </div>

      <DeliveryOneCSettings settings={settings} set={set} />
      <DeliveryZonesSettings settings={settings} set={set} />
      <ManagerNotificationSettings settings={settings} set={set} />
      <PushSettings />

      <div className="settings-grid">
        <ToggleSetting title={t("manager.showPrices")} description={t("manager.theClientWillSeePricesFilled")} value={settings.showPrices} onChange={(value) => set("showPrices", value)} />
        <ToggleSetting title={t("manager.productsOutsideTheMatrix")} description={t("manager.allowTheClientToRequestMissing")} value={settings.allowCustomItems} onChange={(value) => set("allowCustomItems", value)} />
        <ToggleSetting title={t("manager.editingNewOrders")} description={t("manager.theClientCanChangeTheOrder")} value={settings.allowClientEdit} onChange={(value) => set("allowClientEdit", value)} />
        <ToggleSetting title={t("manager.deletingNewOrders")} description={t("manager.theClientCanMoveANew")} value={settings.allowClientDelete} onChange={(value) => set("allowClientDelete", value)} />
        <ToggleSetting title={t("client.order.repeat")} description={t("manager.showAButtonForQuicklyRepeating")} value={settings.allowRepeatOrder} onChange={(value) => set("allowRepeatOrder", value)} />
        <ToggleSetting title={t("manager.requiredProfile")} description={t("manager.blockOrdersWithoutOrganizationDetails")} value={settings.requireProfile} onChange={(value) => set("requireProfile", value)} />
        <ToggleSetting title={t("manager.requiredAddress")} description={t("manager.blockOrdersWithoutASavedAddress")} value={settings.requireAddress} onChange={(value) => set("requireAddress", value)} />
        <ToggleSetting title={t("manager.managerTrash")} description={t("manager.aManagerCanMoveOrdersTo")} value={settings.managerCanDeleteOrders} onChange={(value) => set("managerCanDeleteOrders", value)} />
        <ToggleSetting title={t("manager.favoriteProducts")} description={t("manager.theClientCanMarkFrequentlyUsed")} value={settings.showFavorites} onChange={(value) => set("showFavorites", value)} />
        <ToggleSetting title={t("manager.draftAutosave")} description={t("manager.anUnfinishedNewOrderIsSaved")} value={settings.enableDrafts} onChange={(value) => set("enableDrafts", value)} />
      </div>
      <ManagerPromotionPanel />
      <PasswordSecurityPanel
        allowPasswordChange={!isAdmin}
        passwordChangeHint={
          isAdmin
            ? t("manager.changeTheAdministratorPasswordInMore")
            : ""
        }
      />
    </section>
  );
}
