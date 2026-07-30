// Компоненты, общие для экрана клиента и экрана менеджера.
import { Component, useEffect, useState } from "react";
import cloverLogo from "../assets/clover-logo.png";
import { startPasskeyRegistration } from "../utils/webauthn";
import { api, setApiToken } from "../serverApi";
import { formatDateTime } from "./appHelpers";

export class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(this.props.label || "Ошибка панели Clover", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="sync-error" style={{ marginTop: 12 }}>
          <strong>{this.props.label || "Не удалось показать блок"}.</strong>
          <div style={{ marginTop: 8 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button
            className="secondary-button"
            type="button"
            style={{ marginTop: 10 }}
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OrderTimeline({ order }) {
  const history = Array.isArray(order?.history) ? order.history : [];
  const items = history.length
    ? [...history].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      )
    : [
        {
          id: `created-${order.id}`,
          label: "Заказ создан",
          actor: order.customerContact || "Клиент",
          createdAt: order.createdAt,
        },
      ];

  return (
    <div className="comment-box" style={{ marginTop: 14 }}>
      <strong>История заказа</strong>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              borderLeft: "3px solid rgba(47, 125, 50, 0.35)",
              paddingLeft: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>{item.label}</div>
            <small>
              {formatDateTime(item.createdAt)} · {item.actor || "Система"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({ title, subtitle, onLogout, children }) {
  return (
    <header className="app-header">
      <img className="app-header-logo" src={cloverLogo} alt="Clover" width="168" height="113" />
      <div className="app-header-actions">
        <div className="app-header-titles">
          <strong>{title}</strong>
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
        {children}
        {onLogout && (
          <button className="header-button" type="button" onClick={onLogout}>
            Выйти
          </button>
        )}
      </div>
    </header>
  );
}

export function CustomRequestPhoto({ photo, className = "" }) {
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setViewerOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerOpen]);

  if (!photo?.dataUrl) return null;

  const altText = photo.name || "Фото товара из запроса";

  return (
    <>
      <button
        className={`custom-request-photo ${className}`.trim()}
        type="button"
        onClick={() => setViewerOpen(true)}
        title="Открыть фотографию"
        aria-label={`Открыть фотографию: ${altText}`}
      >
        <img src={photo.dataUrl} alt={altText} />
      </button>
      {viewerOpen && (
        <div
          className="custom-photo-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={altText}
          onClick={() => setViewerOpen(false)}
        >
          <button
            className="custom-photo-viewer-close"
            type="button"
            onClick={() => setViewerOpen(false)}
            aria-label="Закрыть фотографию"
            title="Закрыть"
          >
            ×
          </button>
          <img
            src={photo.dataUrl}
            alt={altText}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function PasswordSecurityPanel() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", repeatPassword: "" });
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPasskeys = async () => {
    try {
      const result = await api.listPasskeys();
      setPasskeys(result.passkeys || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => { loadPasskeys(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.newPassword !== form.repeatPassword) {
      setError("Новые пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.changePassword(form.currentPassword, form.newPassword);
      if (result.token) setApiToken(result.token);
      setMessage(result.message || "Пароль изменён.");
      setForm({ currentPassword: "", newPassword: "", repeatPassword: "" });
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
    }
  };

  const endOtherSessions = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.logoutOtherSessions();
      if (result.token) setApiToken(result.token);
      setMessage(result.message || "Другие сессии завершены.");
    } catch (sessionError) {
      setError(sessionError.message);
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setError("");
    setMessage("");
    if (!("PublicKeyCredential" in window)) {
      setError("Это устройство или браузер не поддерживает Face ID, отпечаток или ключи доступа.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const ceremony = await api.getPasskeyRegistrationOptions();
      const response = await startPasskeyRegistration(ceremony.options);
      const result = await api.verifyPasskeyRegistration(ceremony.ceremonyId, response);
      setMessage(result.message || "Ключ доступа добавлен.");
      await loadPasskeys();
    } catch (registrationError) {
      setError(registrationError.message || "Не удалось добавить ключ доступа.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const removePasskey = async (credentialId) => {
    if (!window.confirm("Удалить этот ключ доступа? Вход по паролю останется доступен.")) return;
    setPasskeyBusy(true);
    setError("");
    try {
      await api.deletePasskey(credentialId);
      setMessage("Ключ доступа удалён.");
      await loadPasskeys();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <section className="panel compact-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Безопасность</p><h2>Пароль и вход по устройству</h2><p>Можно входить по паролю либо через Face ID, отпечаток или код блокировки телефона.</p></div>
      </div>
      <form className="form-grid security-form" onSubmit={submit}>
        <label className="field">Текущий пароль<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></label>
        <label className="field">Новый пароль<input type="password" autoComplete="new-password" minLength="8" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /></label>
        <label className="field">Повторите новый пароль<input type="password" autoComplete="new-password" minLength="8" value={form.repeatPassword} onChange={(event) => setForm({ ...form, repeatPassword: event.target.value })} required /></label>
        <div className="form-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Изменить пароль"}</button></div>
      </form>
      <div className="form-actions session-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={endOtherSessions}>
          Завершить другие сессии
        </button>
      </div>

      <div className="passkey-settings">
        <div>
          <h3>Face ID / отпечаток</h3>
          <p className="muted">Данные лица и отпечатка остаются только на устройстве. Clover получает лишь подтверждение входа.</p>
        </div>
        <button className="secondary-button" type="button" disabled={passkeyBusy} onClick={addPasskey}>
          {passkeyBusy ? "Подождите…" : passkeys.length ? "Добавить ещё устройство" : "Включить вход по устройству"}
        </button>
        <div className="passkey-list">
          {passkeys.map((item, index) => (
            <div className="passkey-row" key={item.id}>
              <div><strong>Ключ доступа {index + 1}</strong><span>{item.backedUp ? "Синхронизируется с аккаунтом устройства" : "Сохранён на этом устройстве"}</span></div>
              <button className="danger-button" type="button" disabled={passkeyBusy} onClick={() => removePasskey(item.id)}>Удалить</button>
            </div>
          ))}
          {!passkeys.length && <div className="empty-box">Ключи доступа пока не добавлены.</div>}
        </div>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}
    </section>
  );
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushSettings() {
  const [status, setStatus] = useState(null);
  const [currentEndpoint, setCurrentEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [promotions, setPromotions] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const result = await api.getPushStatus();
      setStatus(result);
      let endpoint = "";
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        const browserSubscription = await registration.pushManager.getSubscription();
        endpoint = browserSubscription?.endpoint || "";
      }
      setCurrentEndpoint(endpoint);
      const saved = (result.subscriptions || []).find((item) => item.endpoint === endpoint);
      setPromotions(Boolean(saved?.promotions));
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => { load(); }, []);

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!status?.enabled) throw new Error("Push будет доступен после настройки домена, HTTPS и VAPID-ключей.");
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Этот браузер не поддерживает push-уведомления.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Разрешение на уведомления не предоставлено.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.publicKey) });
      }
      await api.subscribePush(subscription.toJSON(), { orderEvents: true, promotions });
      setMessage(currentEndpoint ? "Настройки уведомлений сохранены." : "Уведомления включены на этом устройстве.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setCurrentEndpoint("");
      setMessage("Уведомления отключены на этом устройстве.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const subscribed = Boolean(currentEndpoint && status?.subscriptions?.some((item) => item.endpoint === currentEndpoint));
  return (
    <section className="panel compact-panel">
      <div className="panel-heading"><div><p className="eyebrow">Уведомления</p><h2>Уведомления на телефоне</h2><p>Статусы заказов и документы — основные; акции можно отключить отдельно.</p></div></div>
      <label className="checkbox-line"><input type="checkbox" checked={promotions} onChange={(event) => setPromotions(event.target.checked)} /> Получать акции и новинки</label>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={enable}>{busy ? "Сохраняем…" : subscribed ? "Сохранить настройки" : "Включить уведомления"}</button>
        {subscribed && <button className="secondary-button" type="button" disabled={busy} onClick={disable}>Отключить на этом устройстве</button>}
      </div>
      {!status?.enabled && <p className="muted small">Техническая часть подготовлена. Фактическая отправка включится после домена, HTTPS и добавления VAPID-ключей.</p>}
      {status?.subscriptions?.length > 0 && !subscribed && <p className="muted small">Уведомления уже включены на другом устройстве. На этом телефоне или компьютере их можно включить отдельно.</p>}
      {message && <div className="request-photo-status">{message}</div>}
    </section>
  );
}
