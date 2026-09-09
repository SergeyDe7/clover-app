import { useLocalization } from "./i18n/LocalizationProvider";
// Компоненты, общие для экрана клиента и экрана менеджера.
import { Component, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import cloverLogo from "../assets/clover-logo.png";
import { startPasskeyRegistration } from "../utils/webauthn";
import { api, setApiToken } from "../serverApi";
import { formatDateTime } from "./appHelpers";
import { historyActorLabel, orderHistoryLabel } from "./i18n/displayLabels";
import { errorDisplayMessage } from "./i18n/errorDisplay.js";
import { appConfirm } from "./AppModal";
import {
  installPushSyncListeners,
  pushRestoreHintMessage,
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
    console.error(this.props.label || "Clover panel error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <PanelErrorFallback
          label={this.props.label}
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export function OrderTimeline({ order }) {
  const { t } = useLocalization();
    const history = Array.isArray(order?.history) ? order.history : [];
  const items = history.length
    ? [...history].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      )
    : [
        {
          id: `created-${order.id}`,
          label: "Заказ создан",
          actor: order.customerContact || t("shared.role.client"),
          createdAt: order.createdAt,
        },
      ];

  return (
    <div className="comment-box" style={{ marginTop: 14 }}>
      <strong>{t("shared.orderHistory")}</strong>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              borderLeft: "3px solid rgba(47, 125, 50, 0.35)",
              paddingLeft: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>{orderHistoryLabel(item.label, t)}</div>
            <small>
              {formatDateTime(item.createdAt)} · {historyActorLabel(item.actor, t) || t("shared.role.system")}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelErrorFallback({ label, error, onRetry }) {
  const { t } = useLocalization();
  return (
    <div className="sync-error" style={{ marginTop: 12 }}>
      <strong>{label || t("shared.error.panelShowFailed")}.</strong>
      <div style={{ marginTop: 8 }}>{errorDisplayMessage(error, t)}</div>
      <PanelErrorRetry onRetry={onRetry} />
    </div>
  );
}

function PanelErrorRetry({ onRetry }) {
  const { t } = useLocalization();
  return (
    <button
      className="secondary-button"
      type="button"
      style={{ marginTop: 10 }}
      onClick={onRetry}
    >
      {t("shared.tryAgain")}
    </button>
  );
}

export function Header({ title, subtitle, onLogout, onLogoClick, nav, between, children }) {
  const { t } = useLocalization();
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
          aria-label={t("shared.action.reloadPage")}
          title={t("shared.action.reloadPage")}
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
            <button className="header-button header-logout" type="button" onClick={onLogout}>{
              t("shared.signOut")
            }</button>
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
  const { t } = useLocalization();
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

  const altText = photo.name || t("shared.requestProductPhoto");

  return (
    <>
      <button
        className={`custom-request-photo ${className}`.trim()}
        type="button"
        onClick={() => setViewerOpen(true)}
        title={t("shared.openPhoto")}
        aria-label={t("shared.media.openPhotoNamed", { name: altText })}
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
            aria-label={t("shared.closePhoto")}
            title={t("shared.action.close")}
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
  const { t } = useLocalization();
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
      setError(t("shared.theNewPasswordsDoNotMatch"));
      return;
    }
    setBusy(true);
    try {
      const result = await api.changePassword(form.currentPassword, form.newPassword);
      if (result.token) setApiToken(result.token);
      setMessage(result.message || t("shared.passwordChanged"));
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
      setMessage(result.message || t("shared.otherSessionsWereEnded"));
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
      setError(t("shared.thisDeviceOrBrowserDoesNot"));
      return;
    }
    setPasskeyBusy(true);
    try {
      const ceremony = await api.getPasskeyRegistrationOptions();
      const response = await startPasskeyRegistration(ceremony.options);
      const result = await api.verifyPasskeyRegistration(ceremony.ceremonyId, response);
      setMessage(result.message || t("shared.passkeyAdded"));
      await loadPasskeys();
    } catch (registrationError) {
      setError(errorDisplayMessage(registrationError, t, "shared.error.passkeyAddFailed"));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const removePasskey = async (credentialId) => {
    const ok = await appConfirm({
      title: t("shared.deleteThePasskey"),
      message: t("shared.deleteThisPasskeyPasswordSignIn"),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    setPasskeyBusy(true);
    setError("");
    try {
      await api.deletePasskey(credentialId);
      setMessage(t("shared.passkeyDeleted"));
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
          <p className="eyebrow">{t("shared.security")}</p>
          <h2>{allowPasswordChange ? t("shared.passwordAndDeviceSignIn") : t("shared.deviceSignIn")}</h2>
          <p>
            {allowPasswordChange
              ? t("shared.youCanSignInWithA")
              : passwordChangeHint ||
                t("shared.aManagerChangesThePasswordHere")}
          </p>
        </div>
      </div>

      {allowPasswordChange ? (
        <div className="security-block">
          <div className="security-block-head">
            <h3>{t("shared.changePassword3")}</h3>
            <p className="muted small">{t("shared.atLeast6CharactersAfterChanging")}</p>
          </div>
          <form className="security-password-form" onSubmit={submit}>
            <label className="field">{
              t("shared.currentPassword")
              }<input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
                required
              />
            </label>
            <label className="field">{
              t("auth.reset.title")
              }<input
                type="password"
                autoComplete="new-password"
                minLength="6"
                value={form.newPassword}
                onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
                required
              />
            </label>
            <label className="field">{
              t("auth.reset.confirm")
              }<input
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
                {busy ? t("shared.status.saving") : t("shared.changePassword")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="security-block">
        <div className="security-block-head">
          <h3>{t("shared.sessions")}</h3>
          <p className="muted small">{t("shared.endsSignInOnOtherDevices")}</p>
        </div>
        <div className="security-block-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={endOtherSessions}>{
            t("shared.endOtherSessions")
          }</button>
        </div>
      </div>

      <div className="security-block">
        <div className="security-block-head security-block-head-row">
          <div>
            <h3>{t("shared.faceIdFingerprint")}</h3>
            <p className="muted small">{
              t("shared.faceAndFingerprintDataStayOn")
            }</p>
          </div>
          <button className="secondary-button" type="button" disabled={passkeyBusy} onClick={addPasskey}>
            {passkeyBusy ? t("auth.login.wait") : passkeys.length ? t("shared.addAnotherDevice") : t("shared.enableDeviceSignIn")}
          </button>
        </div>
        <div className="passkey-list">
          {passkeys.map((item, index) => (
            <div className="passkey-row" key={item.id}>
              <div>
                <strong>{t("shared.passkey.accessKeyNumbered", { n: index + 1 })}</strong>
                <span>{item.backedUp ? t("shared.syncedWithTheDeviceAccount") : t("shared.savedOnThisDevice")}</span>
              </div>
              <button className="danger-button" type="button" disabled={passkeyBusy} onClick={() => removePasskey(item.id)}>{
                t("shared.action.delete")
              }</button>
            </div>
          ))}
          {!passkeys.length && <div className="empty-box">{t("shared.noPasskeysAddedYet")}</div>}
        </div>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}
    </section>
  );
}

export function PushSettings() {
  const { t } = useLocalization();
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
          setMessage(t("shared.theNotificationSubscriptionWasRestoredAfter"));
          const refreshed = await api.getPushStatus();
          setStatus(refreshed);
          if ("serviceWorker" in navigator && "PushManager" in window) {
            const registration = await navigator.serviceWorker.ready;
            const browserSubscription = await registration.pushManager.getSubscription();
            endpoint = browserSubscription?.endpoint || "";
            setCurrentEndpoint(endpoint);
          }
        } else {
          const hint = pushRestoreHintMessage({
            syncReason: sync.reason,
            browserEndpoint: endpoint,
            serverSubscriptions: result.subscriptions,
          });
          if (hint) setMessage(t("shared.push.restoreHint"));
        }
      }
    } catch (error) {
      setMessage(errorDisplayMessage(error, t));
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
      if (!status?.enabled) throw new Error(t("shared.pushWillBeAvailableAfterThe"));
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error(t("shared.thisBrowserDoesNotSupportPush"));
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(t("shared.notificationPermissionWasNotGranted"));
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.publicKey) });
      }
      await api.subscribePush(subscription.toJSON(), { orderEvents: true, promotions });
      setMessage(currentEndpoint ? t("shared.notificationSettingsSaved") : t("shared.notificationsAreEnabledOnThisDevice"));
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
      setMessage(t("shared.notificationsAreDisabledOnThisDevice"));
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
      <div className="panel-heading"><div><p className="eyebrow">{t("manager.notifications.title")}</p><h2>{t("shared.phoneNotifications")}</h2><p>{t("shared.onScreenPushAndWhereSupported")}</p></div></div>
      <label className="checkbox-line"><input type="checkbox" checked={promotions} onChange={(event) => setPromotions(event.target.checked)} />{ t("shared.receivePromosAndNewItems")}</label>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={enable}>{busy ? t("shared.status.saving") : subscribed ? t("shared.action.saveSettings") : t("shared.enableNotifications")}</button>
        {subscribed && <button className="secondary-button" type="button" disabled={busy} onClick={disable}>{t("shared.turnOffOnThisDevice")}</button>}
      </div>
      {!status?.enabled && <p className="muted small">{t("shared.theTechnicalPartIsReadyActual")}</p>}
      {status?.enabled && Notification.permission === "granted" && !subscribed && (
        <p className="muted small">{
          t("shared.permissionIsGrantedButTheSubscription")
        }</p>
      )}
      {status?.subscriptions?.length > 0 && !subscribed && Notification.permission !== "granted" && <p className="muted small">{t("shared.notificationsAreAlreadyOnForAnother")}</p>}
      {message && <div className="request-photo-status">{message}</div>}
    </section>
  );
}

/** Полноэкранная благодарность / успех (заказ, акт сверки и т.п.). */
export function OrderThankYouOverlay({
  open,
  onDone,
  title,
  message,
  confirmLabel,
}) {
  const { t } = useLocalization();
  const resolvedTitle = title ?? t("checkout.thanks");
  const resolvedMessage = message ?? t("shared.weHaveAlreadyStartedProcessingIt");
  const resolvedConfirm = confirmLabel ?? t("shared.toMyOrders");
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
          {resolvedTitle}
        </h2>
        <p className="order-thankyou-text">
          {resolvedMessage}
        </p>
        <button className="primary-button order-thankyou-button" type="button" onClick={() => onDoneRef.current?.()}>
          {resolvedConfirm}
        </button>
      </div>
    </div>,
    document.body
  );
}

