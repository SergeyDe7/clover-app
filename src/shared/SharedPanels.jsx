// Компоненты, общие для экрана клиента и экрана менеджера.
import { Component, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import cloverLogo from "../assets/clover-logo.png";
import { startPasskeyRegistration } from "../utils/webauthn";
import { api, setApiToken } from "../serverApi";
import { formatDateTime } from "./appHelpers";
import { appConfirm } from "./AppModal";
import {
  installPushSyncListeners,
  syncPushSubscription,
  urlBase64ToUint8Array,
} from "./pushSync";

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

export function Header({ title, subtitle, onLogout, onLogoClick, nav, between, children }) {
  const headerRef = useRef(null);
  const [compactHeader, setCompactHeader] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setCompactHeader(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  // Высота шапки → spacer под фиксированным верхом
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      const host = el.closest(".clover-app") || document.documentElement;
      host.style.setProperty("--clover-header-offset", `${height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [compactHeader, children, title, subtitle, nav, between]);

  const logo = (
    <img className="app-header-logo" src={cloverLogo} alt="Clover" width="152" height="66" />
  );

  const handleLogoClick = () => {
    if (typeof onLogoClick === "function") {
      onLogoClick();
      return;
    }
    window.location.reload();
  };

  return (
    <header
      ref={headerRef}
      className={`app-header${compactHeader ? " app-header-compact" : ""}${nav ? " app-header-with-nav" : ""}${between ? " app-header-with-between" : ""}`}
    >
      <div className="app-header-top">
        <button
          type="button"
          className="app-header-logo-button"
          onClick={handleLogoClick}
          aria-label="Обновить страницу"
          title="Обновить страницу"
        >
          {logo}
        </button>
        {between ? <div className="app-header-between">{between}</div> : null}
        <div className="app-header-actions">
          {!compactHeader && (
            <div className="app-header-titles">
              <strong>{title}</strong>
              {subtitle && <div className="small muted">{subtitle}</div>}
            </div>
          )}
          {children}
          {onLogout && (
            <button className="header-button header-logout" type="button" onClick={onLogout}>
              Выйти
            </button>
          )}
        </div>
      </div>
      {nav ? <div className="app-header-nav">{nav}</div> : null}
    </header>
  );
}

/** Вкладки кабинета: едут вверх и фиксируются у нижней границы шапки (логотип).
 *  Устарело: используйте StickyCabinetChrome (фиксированный непрозрачный верх).
 */
export function StickyCabinetNav({ children, className = "" }) {
  return (
    <div className={`app-nav-bar${className ? ` ${className}` : ""}`}>
      {children}
    </div>
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

export function PasswordSecurityPanel({
  allowPasswordChange = true,
  passwordChangeHint = "",
} = {}) {
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
    if (!allowPasswordChange) return;
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
    const ok = await appConfirm({
      title: "Удалить ключ доступа?",
      message: "Удалить этот ключ доступа? Вход по паролю останется доступен.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;
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
    <section className="panel compact-panel security-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Безопасность</p>
          <h2>{allowPasswordChange ? "Пароль и вход по устройству" : "Вход по устройству"}</h2>
          <p>
            {allowPasswordChange
              ? "Можно входить по паролю либо через Face ID, отпечаток или код блокировки телефона."
              : passwordChangeHint ||
                "Смену пароля выполняет менеджер. Здесь можно добавить Face ID, отпечаток или завершить другие сессии."}
          </p>
        </div>
      </div>

      {allowPasswordChange ? (
        <div className="security-block">
          <div className="security-block-head">
            <h3>Смена пароля</h3>
            <p className="muted small">Минимум 6 символов. После смены другие сессии можно завершить отдельно.</p>
          </div>
          <form className="security-password-form" onSubmit={submit}>
            <label className="field">
              Текущий пароль
              <input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
                required
              />
            </label>
            <label className="field">
              Новый пароль
              <input
                type="password"
                autoComplete="new-password"
                minLength="6"
                value={form.newPassword}
                onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
                required
              />
            </label>
            <label className="field">
              Повторите новый пароль
              <input
                type="password"
                autoComplete="new-password"
                minLength="6"
                value={form.repeatPassword}
                onChange={(event) => setForm({ ...form, repeatPassword: event.target.value })}
                required
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "Сохраняем…" : "Изменить пароль"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="security-block">
        <div className="security-block-head">
          <h3>Сессии</h3>
          <p className="muted small">Завершает вход на других устройствах и в браузерах. Текущая сессия останется.</p>
        </div>
        <div className="security-block-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={endOtherSessions}>
            Завершить другие сессии
          </button>
        </div>
      </div>

      <div className="security-block">
        <div className="security-block-head security-block-head-row">
          <div>
            <h3>Face ID / отпечаток</h3>
            <p className="muted small">
              Данные лица и отпечатка остаются только на устройстве. Clover получает лишь подтверждение входа.
            </p>
          </div>
          <button className="secondary-button" type="button" disabled={passkeyBusy} onClick={addPasskey}>
            {passkeyBusy ? "Подождите…" : passkeys.length ? "Добавить ещё устройство" : "Включить вход по устройству"}
          </button>
        </div>
        <div className="passkey-list">
          {passkeys.map((item, index) => (
            <div className="passkey-row" key={item.id}>
              <div>
                <strong>Ключ доступа {index + 1}</strong>
                <span>{item.backedUp ? "Синхронизируется с аккаунтом устройства" : "Сохранён на этом устройстве"}</span>
              </div>
              <button className="danger-button" type="button" disabled={passkeyBusy} onClick={() => removePasskey(item.id)}>
                Удалить
              </button>
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

      if (result.enabled && Notification.permission === "granted") {
        const sync = await syncPushSubscription({ promotions: saved?.promotions });
        if (sync.reason === "registered") {
          setMessage("Подписка на уведомления восстановлена после обновления приложения.");
          const refreshed = await api.getPushStatus();
          setStatus(refreshed);
          if ("serviceWorker" in navigator && "PushManager" in window) {
            const registration = await navigator.serviceWorker.ready;
            const browserSubscription = await registration.pushManager.getSubscription();
            endpoint = browserSubscription?.endpoint || "";
            setCurrentEndpoint(endpoint);
          }
        }
      } else if (
        result.enabled &&
        Notification.permission === "granted" &&
        endpoint &&
        !(result.subscriptions || []).some((item) => item.endpoint === endpoint)
      ) {
        setMessage("Нажмите «Включить уведомления», чтобы восстановить push на этом устройстве.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    void load();
    return installPushSyncListeners(() => {
      void load();
    });
  }, []);

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
      <div className="panel-heading"><div><p className="eyebrow">Уведомления</p><h2>Уведомления на телефоне</h2><p>Push на экран и, где поддерживается, цифра на иконке приложения. Акции можно отключить отдельно.</p></div></div>
      <label className="checkbox-line"><input type="checkbox" checked={promotions} onChange={(event) => setPromotions(event.target.checked)} /> Получать акции и новинки</label>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={enable}>{busy ? "Сохраняем…" : subscribed ? "Сохранить настройки" : "Включить уведомления"}</button>
        {subscribed && <button className="secondary-button" type="button" disabled={busy} onClick={disable}>Отключить на этом устройстве</button>}
      </div>
      {!status?.enabled && <p className="muted small">Техническая часть подготовлена. Фактическая отправка включится после домена, HTTPS и VAPID-ключей (см. docs/deploy/PUSH_ENABLE.md).</p>}
      {status?.enabled && Notification.permission === "granted" && !subscribed && (
        <p className="muted small">
          Разрешение есть, но подписка на этом устройстве не активна — нажмите «Включить уведомления».
          На iPhone push работает только из установленного приложения (Safari → «На экран Домой»).
        </p>
      )}
      {status?.subscriptions?.length > 0 && !subscribed && Notification.permission !== "granted" && <p className="muted small">Уведомления уже включены на другом устройстве. На этом телефоне или компьютере их можно включить отдельно.</p>}
      {message && <div className="request-photo-status">{message}</div>}
    </section>
  );
}

/** Полноэкранная благодарность / успех (заказ, акт сверки и т.п.). */
export function OrderThankYouOverlay({
  open,
  onDone,
  title = "Благодарим за Ваш заказ!",
  message = "Мы уже начали его обрабатывать.",
  confirmLabel = "К моим заказам",
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const finish = () => onDoneRef.current?.();
    const onKey = (event) => {
      if (event.key === "Escape") finish();
    };
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyTop: body.style.top,
    };
    html.classList.add("clover-thankyou-open");
    body.classList.add("clover-thankyou-open");
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // iOS: фиксируем body, чтобы под оверлеем ничего не просвечивало.
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.top = "0";
    window.addEventListener("keydown", onKey);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const timer = window.setTimeout(finish, reduceMotion ? 1200 : 2500);
    return () => {
      html.classList.remove("clover-thankyou-open");
      body.classList.remove("clover-thankyou-open");
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.width = previous.bodyWidth;
      body.style.height = previous.bodyHeight;
      body.style.top = previous.bodyTop;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    minHeight: "100dvh",
    zIndex: 2147483000,
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at 20% 18%, rgba(126, 196, 108, 0.45), transparent 42%), radial-gradient(circle at 82% 78%, rgba(74, 148, 78, 0.38), transparent 48%), linear-gradient(160deg, #eef7ea 0%, #d9ecd4 45%, #c7e0c2 100%)",
    cursor: "pointer",
    overflow: "hidden",
    touchAction: "none",
  };

  const cardStyle = isMobile
    ? {
        width: "100%",
        height: "100%",
        minHeight: "100%",
        maxWidth: "none",
        borderRadius: 0,
        border: "none",
        boxShadow: "none",
        background: "transparent",
        padding:
          "max(28px, env(safe-area-inset-top, 0px)) 24px max(28px, env(safe-area-inset-bottom, 0px))",
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        gap: "14px",
      }
    : {
        width: "min(420px, calc(100% - 32px))",
        maxWidth: "100%",
      };

  return createPortal(
    <div
      className={`order-thankyou${isMobile ? " order-thankyou-mobile" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-thankyou-title"
      style={overlayStyle}
      onClick={() => onDoneRef.current?.()}
    >
      <div
        className="order-thankyou-card"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-thankyou-logo-wrap" aria-hidden="true">
          <img
            className="order-thankyou-logo"
            src={cloverLogo}
            alt=""
            width="220"
            height="148"
          />
        </div>
        <h2 id="order-thankyou-title" className="order-thankyou-title">
          {title}
        </h2>
        <p className="order-thankyou-text">
          {message}
        </p>
        <button className="primary-button order-thankyou-button" type="button" onClick={() => onDoneRef.current?.()}>
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}

