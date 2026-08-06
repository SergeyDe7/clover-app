import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import cloverLogo from "./assets/clover-logo.png";
import { startPasskeyAuthentication } from "./utils/webauthn";
import {
  api,
  clearApiToken,
  getApiToken,
  setApiToken,
} from "./serverApi";
import { ClientScreen } from "./screens/client/ClientScreen";
import { ManagerScreen } from "./screens/manager/ManagerScreen";
import {
  writeManagerActiveTab,
  writeClientActiveTab,
  writeOpenManagerClientId,
  DEFAULT_PRODUCTS,
  RUSSIAN_PHONE_PREFIX,
  formatRussianPhone,
  STORAGE,
  DEFAULT_SETTINGS,
  EMPTY_PROFILE,
  EMPTY_LINK,
  normalizeOrderExchange,
  APP_STYLES,
  safeRead,
  makeId,
  makeOrderIdentifiers,
  normalizeProduct,
  inferProductCategory,
  makeOrderHistoryEvent,
  appendOrderHistory,
  UNIT_CONFIG,
} from "./shared/appHelpers";
import { clearAppBadge, syncAppBadge } from "./shared/appBadge";
import { appAlert, appConfirm } from "./shared/AppModal";
import { canTrashOrder } from "./shared/orderTrash";
import { SoftBanner, ListSkeleton } from "./shared/uxFeedback";
import { ManagerContact } from "./screens/client/ManagerContact";

function LoginView({ onAuth, authBusy, authError }) {
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get("verify") || "";
  const resetToken = params.get("reset") || "";
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: RUSSIAN_PHONE_PREFIX,
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const [developmentLink, setDevelopmentLink] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(Boolean(verifyToken));
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [managerContact, setManagerContact] = useState({
    managerFullName: "",
    managerPhone: "",
    managerMax: "",
    managerTelegram: "",
  });

  const passwordToggleIcon = showPassword ? (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
      />
      <path fill="currentColor" d="M3.3 3.3 20.7 20.7l-1.4 1.4L1.9 4.7z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
      />
    </svg>
  );

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicManagerContact()
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        setManagerContact({
          managerFullName: String(data.managerFullName || ""),
          managerPhone: String(data.managerPhone || ""),
          managerMax: String(data.managerMax || ""),
          managerTelegram: String(data.managerTelegram || ""),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!verifyToken) return;
    let cancelled = false;
    api.verifyEmail(verifyToken)
      .then((result) => {
        if (cancelled) return;
        setMessage(result.message || "Электронная почта подтверждена.");
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
      })
      .catch((error) => {
        if (!cancelled) setLocalError(error.message);
      })
      .finally(() => {
        if (!cancelled) setVerificationBusy(false);
      });
    return () => { cancelled = true; };
  }, [verifyToken]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setLocalError("");
    setDevelopmentLink("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setLocalError("");
    setMessage("");
    setDevelopmentLink("");
    try {
      if (mode === "forgot") {
        const result = await api.forgotPassword(form.email);
        setMessage(result.message);
        setDevelopmentLink(result.developmentLink || "");
        return;
      }
      if (mode === "reset") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Пароли не совпадают.");
        }
        const result = await api.resetPassword(resetToken, form.password);
        setMessage(result.message);
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }
      const result = await onAuth({
        mode,
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        password: form.password,
      });
      if (mode === "register" && result) {
        setMessage(result.message || "Регистрация создана.");
        setDevelopmentLink(result.developmentLink || "");
        setMode("login");
      }
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const resend = async () => {
    setLocalError("");
    try {
      const result = await api.resendVerification(form.email);
      setMessage(result.message);
      setDevelopmentLink(result.developmentLink || "");
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const loginWithPasskey = async () => {
    setLocalError("");
    setMessage("");
    if (!form.email.trim()) {
      setLocalError("Сначала укажите электронную почту.");
      return;
    }
    if (!("PublicKeyCredential" in window)) {
      setLocalError("Это устройство или браузер не поддерживает вход по Face ID или ключу доступа.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const ceremony = await api.getPasskeyAuthenticationOptions(form.email);
      const response = await startPasskeyAuthentication(ceremony.options);
      const result = await api.verifyPasskeyAuthentication(form.email, ceremony.ceremonyId, response);
      await onAuth({ mode: "passkey", result });
    } catch (error) {
      setLocalError(error.message || "Не удалось выполнить вход по ключу доступа.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  if (verificationBusy) {
    return (
      <main className="page">
        <section className="login-card">
          <img className="logo" src={cloverLogo} alt="Логотип Clover" width="280" height="189" />
          <h1>Подтверждаем почту</h1>
          <p className="subtitle">Проверяем ссылку регистрации…</p>
        </section>
      </main>
    );
  }

  const title = mode === "register"
    ? "Создание аккаунта"
    : mode === "forgot"
      ? "Восстановление пароля"
      : mode === "reset"
        ? "Новый пароль"
        : "Личный кабинет";

  return (
    <main className="page">
      <section className="login-card">
        <img className="logo" src={cloverLogo} alt="Логотип Clover" width="280" height="189" />
        <h1>{title}</h1>
        {mode !== "login" && (
          <p className="subtitle">
            {mode === "register"
              ? "Регистрация доступна только клиентам. Роль определится автоматически при входе."
              : mode === "forgot"
                ? "Укажите почту — мы отправим ссылку для установки нового пароля."
                : "Придумайте новый пароль длиной не менее 8 символов."}
          </p>
        )}

        <form className="login-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label htmlFor="companyName">Название организации</label>
              <input id="companyName" value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} required disabled={authBusy} />
              <label htmlFor="contactName">Контактное лицо</label>
              <input id="contactName" value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} required disabled={authBusy} />
              <label htmlFor="phone">Телефон</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength="18" value={form.phone} onChange={(event) => updateField("phone", formatRussianPhone(event.target.value))} required disabled={authBusy} />
            </>
          )}

          {mode !== "reset" && (
            <>
              <label htmlFor="email">Электронная почта</label>
              <input id="email" type="email" autoComplete={mode === "login" ? "username webauthn" : "email"} value={form.email} onChange={(event) => updateField("email", event.target.value)} required disabled={authBusy} />
            </>
          )}

          {!["forgot"].includes(mode) && (
            <>
              <label htmlFor="password">{mode === "reset" ? "Новый пароль" : "Пароль"}</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "login" ? 1 : 8}
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  required
                  disabled={authBusy}
                />
                <button
                  className="password-toggle"
                  type="button"
                  disabled={authBusy}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {passwordToggleIcon}
                </button>
              </div>
            </>
          )}

          {mode === "reset" && (
            <>
              <label htmlFor="confirmPassword">Повторите новый пароль</label>
              <div className="password-field">
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength="8"
                  value={form.confirmPassword}
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                  required
                  disabled={authBusy}
                />
                <button
                  className="password-toggle"
                  type="button"
                  disabled={authBusy}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {passwordToggleIcon}
                </button>
              </div>
            </>
          )}

          <button type="submit" disabled={authBusy}>
            {authBusy ? "Подождите…" : mode === "register" ? "Зарегистрироваться" : mode === "forgot" ? "Отправить ссылку" : mode === "reset" ? "Сохранить пароль" : "Войти"}
          </button>
        </form>

        {mode === "login" && (
          <button className="passkey-login-button" type="button" disabled={authBusy || passkeyBusy} onClick={loginWithPasskey}>
            {passkeyBusy ? "Подтверждаем…" : "Войти по Face ID / отпечатку"}
          </button>
        )}

        {(localError || authError) && <div className="auth-error">{localError || authError}</div>}
        {message && <div className="auth-success">{message}</div>}
        {developmentLink && (
          <div className="test-note">
            Тестовая ссылка для локальной настройки: <a href={developmentLink}>открыть</a>
          </div>
        )}

        <div className="registration auth-links">
          {mode === "login" && (
            <div className="login-manager-cta">
              <p className="login-manager-cta-text">
                Доступ в личный кабинет Вы можете получить у менеджера
              </p>
              <ManagerContact settings={managerContact} />
            </div>
          )}
          {mode !== "login" && mode !== "reset" && (
            <button type="button" onClick={() => switchMode("login")}>Вернуться ко входу</button>
          )}
        </div>
      </section>
    </main>
  );
}

/** Интервал тихого обновления заказов без перезагрузки страницы. */
const LIVE_ORDERS_REFRESH_MS = 5000;

function orderLiveSignature(order) {
  const exchange = normalizeOrderExchange(order?.exchange);
  return [
    String(order?.id || ""),
    String(order?.status || ""),
    String(exchange.status || ""),
    String(exchange.sentAt || ""),
    String(exchange.receipt || ""),
    String(exchange.message || ""),
    String(order?.updatedAt || ""),
  ].join("|");
}

function ordersLiveSignature(orders) {
  return (Array.isArray(orders) ? orders : [])
    .map((order) => orderLiveSignature(order))
    .sort()
    .join(";");
}

/** Сигнатура цен/медиа каталога — чтобы онлайн-bootstrap обновлял витрину как статусы. */
function productPriceLiveSignature(product) {
  const typedKeys = product?.salePricesByType && typeof product.salePricesByType === "object"
    ? Object.keys(product.salePricesByType).sort().join(",")
    : "";
  const typedSample = typedKeys
    ? String(product.salePricesByType?.[typedKeys.split(",")[0]]?.piece ?? "")
    : "";
  return [
    String(product?.id || ""),
    String(product?.pricePiece ?? ""),
    String(product?.pricePack ?? ""),
    String(product?.priceBundle ?? ""),
    String(product?.priceBox ?? ""),
    String(product?.pricePair ?? ""),
    String(product?.priceRoll ?? ""),
    String(product?.clientPriceMode || ""),
    String(product?.markupPercent ?? ""),
    String(product?.oneCPriceTypeId || ""),
    String(product?.salePriceReceivedAt || ""),
    String(product?.imageUrl || ""),
    String(product?.imageUpdatedAt || ""),
    typedKeys,
    typedSample,
    String(product?.active !== false),
  ].join(":");
}

function productsPriceLiveSignature(products) {
  return (Array.isArray(products) ? products : [])
    .map((product) => productPriceLiveSignature(product))
    .join("|");
}

/**
 * Сервер — источник правды по составу списка, статусу и exchange.
 * Локальные комментарии менеджера сохраняем только если статус/обмен не менялись.
 */
function mergeOrdersFromServer(previous, incoming, { clientMode = false } = {}) {
  const prevList = Array.isArray(previous) ? previous : [];
  const nextList = Array.isArray(incoming) ? incoming : [];

  // Клиент не редактирует чужие поля заказа в списке — берём сервер как есть.
  if (clientMode) {
    if (ordersLiveSignature(prevList) === ordersLiveSignature(nextList)) {
      return prevList;
    }
    return nextList;
  }

  const prevById = new Map(prevList.map((order) => [String(order?.id || ""), order]));

  const merged = nextList.map((remote) => {
    const local = prevById.get(String(remote?.id || ""));
    if (!local) return remote;

    const sameStatus = local.status === remote.status;
    const sameExchange =
      JSON.stringify(normalizeOrderExchange(local.exchange)) ===
      JSON.stringify(normalizeOrderExchange(remote.exchange));

    const localTime = Date.parse(local.updatedAt || "") || 0;
    const remoteTime = Date.parse(remote.updatedAt || "") || 0;
    // Обмен всегда с сервера. Статус — по более свежему updatedAt,
    // иначе устаревший bootstrap откатывает только что сохранённый PATCH.
    if (!sameStatus || !sameExchange) {
      const preferLocalStatus = !sameStatus && localTime > remoteTime;
      return {
        ...remote,
        managerComment: local.managerComment,
        internalNote: local.internalNote,
        customItems: Array.isArray(local.customItems) ? local.customItems : remote.customItems,
        status: preferLocalStatus ? local.status : remote.status,
        history: preferLocalStatus && Array.isArray(local.history) ? local.history : remote.history,
        exchange: remote.exchange,
        updatedAt: preferLocalStatus
          ? local.updatedAt
          : remote.updatedAt || local.updatedAt,
      };
    }

    if (localTime <= remoteTime) return remote;

    return {
      ...remote,
      managerComment: local.managerComment,
      internalNote: local.internalNote,
      customItems: local.customItems,
      status: remote.status,
      exchange: remote.exchange,
    };
  });

  if (ordersLiveSignature(prevList) === ordersLiveSignature(merged)) {
    return prevList;
  }
  return merged;
}

function App() {
  const [role, setRole] = useState("client");
  const [authUser, setAuthUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getApiToken()));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(Boolean(getApiToken()));
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineBannerHidden, setOfflineBannerHidden] = useState(false);

  const [products, setProducts] = useState(
    DEFAULT_PRODUCTS.map(normalizeProduct)
  );
  const [fullCatalogProducts, setFullCatalogProducts] = useState(
    DEFAULT_PRODUCTS.map(normalizeProduct)
  );
  const [catalogPolicy, setCatalogPolicy] = useState({
    matrixMode: "pending",
    allowFullCatalog: false,
    matrixReady: false,
    matrixProductIds: [],
  });
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [orders, setOrders] = useState([]);
  const [trashedOrders, setTrashedOrders] = useState([]);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [addresses, setAddresses] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [clientLinks, setClientLinks] = useState({});
  const [oneCPriceTypes, setOneCPriceTypes] = useState([]);
  const [serverClients, setServerClients] = useState([]);
  const [reconciliationRequests, setReconciliationRequests] = useState([]);
  const [managerNotifications, setManagerNotifications] = useState([]);
  const [catalogSession, setCatalogSession] = useState(null);
  const [managerNotice, setManagerNotice] = useState(null);
  const skipNextOrdersSyncRef = useRef(false);
  const pendingDeletedOrderIdsRef = useRef(new Set());
  // Несохранённые правки матрицы у менеджера — live-bootstrap их не затирает.
  const dirtyClientLinkIdsRef = useRef(new Set());
  const catalogPricesVersionRef = useRef("");

  const applyManagerNotificationList = (items) => {
    const incomingNotifications = Array.isArray(items) ? items : [];
    const unreadNotifications = incomingNotifications.filter((item) => !item.readAt);
    setManagerNotifications(incomingNotifications);
    setManagerNotice(
      unreadNotifications[0]
        ? { ...unreadNotifications[0], pendingCount: unreadNotifications.length }
        : null
    );
    syncAppBadge(unreadNotifications.length);
  };

  const applyBootstrap = (data, { openClientOrderLanding = false } = {}) => {
    setAuthUser(data.user);
    setRole(data.user.role);
    setProducts(
      (Array.isArray(data.products) ? data.products : []).map(normalizeProduct)
    );
    setFullCatalogProducts(
      (
        Array.isArray(data.fullCatalogProducts)
          ? data.fullCatalogProducts
          : Array.isArray(data.products)
            ? data.products
            : []
      ).map(normalizeProduct)
    );
    setCatalogPolicy({
      matrixMode: "pending",
      allowFullCatalog: false,
      matrixReady: false,
      matrixProductIds: [],
      ...(data.catalogPolicy || {}),
    });
    if (data.catalogPricesVersion != null) {
      catalogPricesVersionRef.current = String(data.catalogPricesVersion || "");
    }
    if (!data.catalogPolicy?.allowFullCatalog) {
      setShowFullCatalog(false);
    }

    const incomingOrders = Array.isArray(data.orders) ? data.orders : [];

    if (data.user.role === "manager" || data.user.role === "admin") {
      applyManagerNotificationList(data.managerNotifications);
      setTrashedOrders(Array.isArray(data.trashedOrders) ? data.trashedOrders : []);
    } else {
      setManagerNotifications([]);
      setManagerNotice(null);
      setTrashedOrders([]);
      clearAppBadge();
    }

    setOrders(incomingOrders);
    setProfile({
      ...EMPTY_PROFILE,
      ...(data.profile || EMPTY_PROFILE),
    });
    setAddresses(
      Array.isArray(data.addresses) ? data.addresses : []
    );
    setFavorites(
      Array.isArray(data.favorites) ? data.favorites : []
    );
    setSettings({
      ...DEFAULT_SETTINGS,
      ...(data.settings || DEFAULT_SETTINGS),
    });
    setClientLinks(data.clientLinks || {});
    setOneCPriceTypes(
      Array.isArray(data.oneCPriceTypes) ? data.oneCPriceTypes : []
    );
    setServerClients(
      Array.isArray(data.clients) ? data.clients : []
    );
    setReconciliationRequests(
      Array.isArray(data.reconciliationRequests) ? data.reconciliationRequests : []
    );

    // Клиент при входе/открытии приложения — сразу на странице нового заказа.
    if (
      openClientOrderLanding &&
      data.user.role === "client"
    ) {
      writeClientActiveTab("home");
      setCatalogSession({ mode: "new" });
    }

    setHydrated(true);
  };

  const loadBootstrap = async ({ silent = false } = {}) => {
    // Показываем полноэкранную загрузку только при первом запуске/входе.
    // После загрузки кабинета фоновые обновления не должны заменять экран.
    const shouldBlockScreen = !silent && !hydrated;
    if (shouldBlockScreen) {
      setLoading(true);
    }

    try {
      const data = await api.bootstrap();
      applyBootstrap(data, { openClientOrderLanding: !silent });
      setIsLoggedIn(true);
      setSyncError("");
    } catch (error) {
      if (error.status === 401) {
        clearApiToken();
        setAuthUser(null);
        setIsLoggedIn(false);
        setHydrated(false);
        setRole("client");
      } else {
        setSyncError(error.message);
        // Без успешного bootstrap не показываем кабинет на локальных дефолтах:
        // иначе manager-токен может открыть client UI и затереть заказы.
        if (!hydrated) {
          setIsLoggedIn(false);
          setAuthUser(null);
          setRole("client");
        }
      }
    } finally {
      if (shouldBlockScreen) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!getApiToken()) {
      setLoading(false);
      return;
    }

    loadBootstrap();
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      setOfflineBannerHidden(false);
    };
    const onOffline = () => {
      setIsOffline(true);
      setOfflineBannerHidden(false);
    };
    const onUpdateAvailable = () => setUpdateAvailable(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("clover:update-available", onUpdateAvailable);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("clover:update-available", onUpdateAvailable);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !hydrated || !authUser) {
      return undefined;
    }

    let active = true;
    let requestInProgress = false;

    const refreshLiveOrders = async () => {
      if (requestInProgress) return;
      if (typeof document !== "undefined" && document.hidden) return;
      requestInProgress = true;

      try {
        const data = await api.bootstrap();
        if (!active) return;

        const incomingOrders = Array.isArray(data.orders) ? data.orders : [];
        const clientMode = data.user?.role === "client";
        const pendingDeleted = pendingDeletedOrderIdsRef.current;
        if (clientMode && pendingDeleted.size) {
          for (const id of [...pendingDeleted]) {
            if (!incomingOrders.some((order) => String(order.id) === id)) {
              pendingDeleted.delete(id);
            }
          }
        }
        const filteredIncoming = clientMode && pendingDeleted.size
          ? incomingOrders.filter((order) => !pendingDeleted.has(String(order.id)))
          : incomingOrders;
        setOrders((prev) => {
          const next = mergeOrdersFromServer(prev, filteredIncoming, { clientMode });
          if (next !== prev) {
            skipNextOrdersSyncRef.current = true;
          }
          return next;
        });

        // Онлайн как со статусами заказов: акты сверки подтягиваем и клиенту, и менеджеру.
        if (Array.isArray(data.reconciliationRequests)) {
          setReconciliationRequests(data.reconciliationRequests);
        }

        // Онлайн-цены каталога (вид цен 1С / матрица) — тот же тихий bootstrap, что и статусы.
        const nextPricesVersion = String(data.catalogPricesVersion || "");
        const pricesVersionChanged =
          nextPricesVersion !== "" &&
          nextPricesVersion !== catalogPricesVersionRef.current;
        if (pricesVersionChanged) {
          catalogPricesVersionRef.current = nextPricesVersion;
        }
        if (Array.isArray(data.products)) {
          setProducts((prev) => {
            const next = data.products.map(normalizeProduct);
            // При новой версии цен всегда подменяем каталог (даже если сигнатура совпала по ошибке).
            if (pricesVersionChanged) return next;
            return productsPriceLiveSignature(prev) === productsPriceLiveSignature(next)
              ? prev
              : next;
          });
        } else if (pricesVersionChanged && data.user?.role === "client") {
          // Пустой список тоже фиксируем — иначе остаются старые нулевые цены.
          setProducts([]);
        }
        if (Array.isArray(data.fullCatalogProducts)) {
          setFullCatalogProducts((prev) => {
            const next = data.fullCatalogProducts.map(normalizeProduct);
            if (pricesVersionChanged) return next;
            return productsPriceLiveSignature(prev) === productsPriceLiveSignature(next)
              ? prev
              : next;
          });
        } else if (data.user?.role === "client" && data.catalogPolicy) {
          // Если полный каталог больше не отдаётся — не держим устаревшие цены.
          if (!data.catalogPolicy.allowFullCatalog || data.catalogPolicy.matrixMode === "all") {
            setFullCatalogProducts([]);
          }
        }
        if (data.catalogPolicy) {
          setCatalogPolicy((current) => ({
            ...current,
            ...data.catalogPolicy,
          }));
        }

        if (data.user?.role === "manager" || data.user?.role === "admin") {
          applyManagerNotificationList(data.managerNotifications);
          setTrashedOrders(Array.isArray(data.trashedOrders) ? data.trashedOrders : []);
          if (Array.isArray(data.clients)) {
            setServerClients(data.clients);
          }
          if (Array.isArray(data.oneCPriceTypes)) {
            setOneCPriceTypes(data.oneCPriceTypes);
          }
          if (data.clientLinks && typeof data.clientLinks === "object") {
            setClientLinks((prev) => {
              const dirty = dirtyClientLinkIdsRef.current;
              if (!dirty.size) return data.clientLinks;
              const merged = { ...data.clientLinks };
              for (const clientId of dirty) {
                if (prev[clientId]) merged[clientId] = prev[clientId];
              }
              return merged;
            });
          }
        }

        setSyncError("");
      } catch (error) {
        if (!active) return;
        if (error.status === 401) {
          clearApiToken();
          setAuthUser(null);
          setIsLoggedIn(false);
          setHydrated(false);
        } else {
          setSyncError(error.message);
        }
      } finally {
        requestInProgress = false;
      }
    };

    // Онлайн-статусы: тихий bootstrap по таймеру и при возврате во вкладку/приложение.
    const intervalId = window.setInterval(refreshLiveOrders, LIVE_ORDERS_REFRESH_MS);
    const handleFocus = () => {
      refreshLiveOrders();
    };
    const handleVisibility = () => {
      if (!document.hidden) refreshLiveOrders();
    };
    const handlePageShow = () => {
      refreshLiveOrders();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    refreshLiveOrders();

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [isLoggedIn, hydrated, authUser?.id, authUser?.role]);

  const scheduleSync = (callback, delay = 650) => {
    const timeoutId = window.setTimeout(async () => {
      try {
        await callback();
        setSyncError("");
      } catch (error) {
        setSyncError(
          `${error.message}. Данные останутся на экране, но сервер пока их не сохранил.`
        );
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  };

  useEffect(() => {
    if (!hydrated || !authUser) return undefined;
    if (skipNextOrdersSyncRef.current) {
      skipNextOrdersSyncRef.current = false;
      return undefined;
    }
    const isStaff = authUser.role === "manager" || authUser.role === "admin";
    return scheduleSync(async () => {
      if (!isStaff) {
        const result = await api.saveOrders(orders);
        // Сервер мог поправить статус (1С/менеджер) — принимаем ответ в UI.
        if (Array.isArray(result?.orders)) {
          skipNextOrdersSyncRef.current = true;
          setOrders(result.orders);
        }
        return;
      }

      // Перед PUT менеджера подмешиваем серверные заказы,
      // чтобы устаревший локальный список не стёр новый заказ клиента.
      const data = await api.bootstrap();
      const serverOrders = Array.isArray(data.orders) ? data.orders : [];
      const localById = new Map((orders || []).map((order) => [String(order.id), order]));
      const localIds = new Set(localById.keys());
      const serverIds = new Set(serverOrders.map((order) => String(order.id)));
      const missingOnLocal = serverOrders.filter((order) => !localIds.has(String(order.id)));
      const removedLocally = [...serverIds].filter((id) => !localIds.has(id));
      const isIntentionalDelete =
        removedLocally.length > 0 &&
        (orders || []).length === serverOrders.length - removedLocally.length &&
        (orders || []).every((order) => serverIds.has(String(order.id)));

      let payload = orders;
      if (!isIntentionalDelete) {
        payload = serverOrders.map((remote) => {
          const local = localById.get(String(remote.id));
          if (!local) return remote;
          const localTime = Date.parse(local.updatedAt || "") || 0;
          const remoteTime = Date.parse(remote.updatedAt || "") || 0;
          if (localTime >= remoteTime) {
            return {
              ...remote,
              ...local,
              exchange: remote.exchange,
            };
          }
          return remote;
        });
        for (const local of orders || []) {
          if (!serverIds.has(String(local.id))) payload.push(local);
        }
        if (missingOnLocal.length) {
          skipNextOrdersSyncRef.current = true;
          setOrders(payload);
        }
      }

      await api.saveOrders(payload);
    });
  }, [orders, hydrated, authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveProfile(profile));
  }, [profile, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveAddresses(addresses));
  }, [addresses, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveFavorites(favorites));
  }, [favorites, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || (authUser?.role !== "manager" && authUser?.role !== "admin")) {
      return undefined;
    }

    return scheduleSync(() => api.saveProducts(products));
  }, [products, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || (authUser?.role !== "manager" && authUser?.role !== "admin")) {
      return undefined;
    }

    return scheduleSync(() => api.saveSettings(settings));
  }, [settings, hydrated, authUser?.role]);

  const handleAuth = async (form) => {
    setAuthBusy(true);
    setAuthError("");

    try {
      const result =
        form.mode === "passkey"
          ? form.result
          : form.mode === "register"
            ? await api.register({
                companyName: form.companyName,
                contactName: form.contactName,
                phone: form.phone,
                email: form.email,
                password: form.password,
              })
            : await api.login({
                email: form.email,
                password: form.password,
              });

      if (form.mode === "register" || !result.token) {
        return result;
      }

      setManagerNotice(null);
      setManagerNotifications([]);

      setApiToken(result.token);
      setAuthUser(result.user);
      setRole(result.user.role);
      setIsLoggedIn(true);
      setLoading(true);

      const oldProfile = safeRead(STORAGE.profile, EMPTY_PROFILE);
      const oldAddresses = safeRead(STORAGE.addresses, []);
      const oldFavorites = safeRead(STORAGE.favorites, []);
      const oldOrders = safeRead(STORAGE.orders, []);
      const oldProducts = safeRead(STORAGE.products, []);
      const oldSettings = safeRead(STORAGE.settings, null);
      const oldClientLinks = safeRead(STORAGE.clientLinks, null);

      if (
        result.user.role === "client" &&
        !localStorage.getItem(
          `clover-server-migrated-client-${result.user.id}`
        ) &&
        (
          Object.values(oldProfile).some(Boolean) ||
          oldAddresses.length ||
          oldOrders.length
        )
      ) {
        await api.migrateClient({
          profile: oldProfile,
          addresses: oldAddresses,
          favorites: oldFavorites,
          orders: oldOrders,
        });

        localStorage.setItem(
          `clover-server-migrated-client-${result.user.id}`,
          "1"
        );
      }

      if (
        (result.user.role === "manager" || result.user.role === "admin") &&
        !localStorage.getItem("clover-server-migrated-manager") &&
        (
          oldProducts.length ||
          oldSettings ||
          oldClientLinks
        )
      ) {
        await api.migrateManager({
          products: oldProducts,
          settings: oldSettings,
          clientLinks: oldClientLinks,
        });

        localStorage.setItem(
          "clover-server-migrated-manager",
          "1"
        );
      }

      await loadBootstrap();
      return result;
    } catch (error) {
      clearApiToken();
      setIsLoggedIn(false);
      setHydrated(false);
      setAuthError(error.message);
      setLoading(false);
      throw error;
    } finally {
      setAuthBusy(false);
    }
  };

  const clientId = authUser?.id || "";
  const profileComplete = Object.values(profile).every((value) =>
    String(value || "").trim()
  );

  const link = {
    ...EMPTY_LINK,
    ...(clientLinks[clientId] || {}),
  };

  const catalogProducts = useMemo(() => {
    const source =
      showFullCatalog && catalogPolicy.allowFullCatalog
        ? fullCatalogProducts
        : products;

    return source.filter((product) => product.active);
  }, [
    products,
    fullCatalogProducts,
    showFullCatalog,
    catalogPolicy.allowFullCatalog,
  ]);

  const clientOrders = orders.filter(
    (order) => order.clientId === clientId
  );

  const readManagerNotification = async (notificationOrId) => {
    const notificationId = typeof notificationOrId === "string"
      ? notificationOrId
      : notificationOrId?.id;
    if (!notificationId) return;
    try {
      await api.readManagerNotification(notificationId);
      await loadBootstrap({ silent: true });
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const dismissManagerNotice = async () => {
    if (!managerNotice?.id) {
      setManagerNotice(null);
      return;
    }
    await readManagerNotification(managerNotice.id);
  };

  const readAllManagerNotifications = async () => {
    try {
      await api.readAllManagerNotifications();
      await loadBootstrap({ silent: true });
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const logout = () => {
    clearApiToken();
    writeManagerActiveTab("orders");
    writeOpenManagerClientId("");
    setManagerNotice(null);
    setManagerNotifications([]);
    setTrashedOrders([]);
    clearAppBadge();
    setCatalogSession(null);
    setAuthUser(null);
    setRole("client");
    setIsLoggedIn(false);
    setHydrated(false);
    setProducts(DEFAULT_PRODUCTS.map(normalizeProduct));
    setFullCatalogProducts(
      DEFAULT_PRODUCTS.map(normalizeProduct)
    );
    setCatalogPolicy({
      matrixMode: "pending",
      allowFullCatalog: false,
      matrixReady: false,
      matrixProductIds: [],
    });
    setShowFullCatalog(false);
    setOrders([]);
    setProfile(EMPTY_PROFILE);
    setAddresses([]);
    setFavorites([]);
    setSettings(DEFAULT_SETTINGS);
    setClientLinks({});
    setServerClients([]);
    setReconciliationRequests([]);
    setManagerNotifications([]);
  };

  const validateNewOrder = () => {
    if (settings.requireProfile && !profileComplete) {
      void appAlert({
        title: "Профиль не заполнен",
        message: "Сначала заполните профиль организации.",
        tone: "warn",
      });
      return false;
    }

    if (settings.requireAddress && !addresses.length) {
      void appAlert({
        title: "Нет адреса",
        message: "Сначала добавьте адрес доставки.",
        tone: "warn",
      });
      return false;
    }

    return true;
  };

  const createFreshNewOrderSession = () => {
    try {
      localStorage.removeItem(STORAGE.draft);
    } catch {
      // ignore storage errors
    }
    return {
      mode: "new",
      instanceId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  };

  const openNew = (options = {}) => {
    const silent = Boolean(options?.silent);
    const forceNew = Boolean(options?.forceNew);

    if (forceNew) {
      if (!validateNewOrder()) return;
      // Новый instanceId → remount OrderEditor с пустой корзиной (не из прошлого заказа).
      setCatalogSession(createFreshNewOrderSession());
      return;
    }

    if (silent) {
      if (
        (settings.requireProfile && !profileComplete) ||
        (settings.requireAddress && !addresses.length)
      ) {
        return;
      }
      if (!catalogSession || catalogSession.mode === "new") {
        // Не трогаем instanceId: иначе сбросится корзина при каждом заходе на «Главная».
        if (!catalogSession) {
          setCatalogSession({ mode: "new" });
        }
      }
      return;
    }

    if (validateNewOrder()) {
      setCatalogSession(createFreshNewOrderSession());
    }
  };

  const openEdit = (order) => {
    if (order.status !== "Новый") {
      void appAlert({
        title: "Редактирование недоступно",
        message: "Редактировать можно только новый заказ.",
        tone: "warn",
      });
      return;
    }

    setCatalogSession({ mode: "edit", order });
  };

  const openRepeat = (order) => {
    if (validateNewOrder()) {
      setCatalogSession({ mode: "repeat", order });
    }
  };

  const saveOrder = (payload) => {
    if (!hydrated || !authUser) {
      void appAlert({
        title: "Данные не загружены",
        message: "Данные с сервера ещё не загружены. Обновите страницу и повторите заказ.",
        tone: "warn",
      });
      return Promise.reject(new Error("not_hydrated"));
    }

    const session = catalogSession || { mode: "new" };
    const previousOrders = orders;
    let nextOrders = orders;

    if (session.mode === "edit") {
      nextOrders = orders.map((order) => {
        if (order.id !== session.order.id) return order;

        const updatedAt = new Date().toISOString();
        const history = appendOrderHistory(
          order,
          makeOrderHistoryEvent(
            "client.edit",
            "Клиент изменил состав или условия заказа",
            profile.contactName || "Клиент"
          )
        );

        return {
          ...order,
          ...payload,
          history,
          updatedAt,
        };
      });
    } else {
      const timestamp = Date.now();
      const identifiers = makeOrderIdentifiers(timestamp);
      const createdAt = new Date().toISOString();
      const orderId = makeId("order");

      nextOrders = [
        {
          id: orderId,
          externalId: identifiers.externalId,
          number: identifiers.number,
          exchange: normalizeOrderExchange(),
          createdAt,
          updatedAt: createdAt,
          status: "Новый",
          clientId,
          customerName:
            profile.companyName ||
            profile.contactName ||
            "Клиент",
          customerContact: profile.contactName,
          customerPhone: profile.phone,
          customerEmail: profile.email,
          managerComment: "",
          internalNote: "",
          clientComment: String(payload.clientComment || "").trim(),
          history: [
            {
              ...makeOrderHistoryEvent(
                "order.created",
                "Заказ создан",
                profile.contactName || "Клиент"
              ),
              createdAt,
            },
          ],
          ...payload,
          clientComment: String(payload.clientComment || "").trim(),
        },
        ...orders,
      ];
    }

    setOrders(nextOrders);
    // Сессию не сбрасываем до успеха API — при ошибке корзина остаётся для повтора.

    return api
      .saveOrders(nextOrders)
      .then((result) => {
        if (Array.isArray(result?.orders)) {
          skipNextOrdersSyncRef.current = true;
          setOrders(result.orders);
        }
        setSyncError("");
        // Пустой новый заказ: иначе OrderEditor с ключом new-new сохраняет старую корзину в памяти.
        setCatalogSession(createFreshNewOrderSession());
        return result;
      })
      .catch(async (error) => {
        skipNextOrdersSyncRef.current = true;
        setOrders(previousOrders);
        if (error?.code === "MATRIX_PRODUCT_FORBIDDEN") {
          try {
            const data = await api.bootstrap();
            skipNextOrdersSyncRef.current = true;
            if (Array.isArray(data.orders)) {
              setOrders(data.orders);
            }
            if (Array.isArray(data.products)) {
              setProducts(data.products.map(normalizeProduct));
            }
            if (Array.isArray(data.fullCatalogProducts)) {
              setFullCatalogProducts(data.fullCatalogProducts.map(normalizeProduct));
            } else if (Array.isArray(data.products)) {
              setFullCatalogProducts(data.products.map(normalizeProduct));
            }
            if (data.catalogPolicy) {
              setCatalogPolicy({
                matrixMode: "pending",
                allowFullCatalog: false,
                matrixReady: false,
                matrixProductIds: [],
                ...data.catalogPolicy,
              });
            }
          } catch {
            // оставляем откат к previousOrders
          }
        }
        const message = `${error.message} Заказ не сохранён на сервере — менеджер его не увидит.`;
        setSyncError(message);
        void appAlert({ title: "Заказ не сохранён", message, tone: "danger" });
        throw error;
      });
  };

  const deleteClientOrder = async (order) => {
    if (!settings.allowClientDelete) {
      await appAlert({
        title: "Удаление недоступно",
        message: "Удаление заказов сейчас отключено.",
        tone: "warn",
      });
      return;
    }
    const gate = canTrashOrder(order, "client");
    if (!gate.ok) {
      await appAlert({ title: "Нельзя удалить", message: gate.error, tone: "warn" });
      return;
    }

    const itemLines = [
      ...(Array.isArray(order.items) ? order.items : []).map((item) => {
        const unit = UNIT_CONFIG[item.unit]?.shortLabel || item.unit || "";
        return `${item.name} — ${item.quantity} ${unit}`.trim();
      }),
      ...(Array.isArray(order.customItems) ? order.customItems : []).map((item) => {
        const unit = item.unit || "";
        return `${item.name} — ${item.quantity} ${unit}`.trim();
      }),
    ].filter(Boolean);

    const ok = await appConfirm({
      title: `Вы уверены, что хотите удалить Заказ № ${order.number}?`,
      message: "",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
      expandable: itemLines.length
        ? {
            summary: `Состав заказа (${itemLines.length})`,
            lines: itemLines,
          }
        : null,
    });
    if (!ok) return;

    const orderId = String(order.id);
    pendingDeletedOrderIdsRef.current.add(orderId);
    skipNextOrdersSyncRef.current = true;
    setOrders((current) => current.filter((item) => String(item.id) !== orderId));

    void (async () => {
      try {
        const result = await api.trashOrder(orderId);
        pendingDeletedOrderIdsRef.current.delete(orderId);
        skipNextOrdersSyncRef.current = true;
        if (Array.isArray(result?.orders)) {
          setOrders(result.orders);
        }
        setSyncError("");
      } catch (error) {
        pendingDeletedOrderIdsRef.current.delete(orderId);
        const message = `${error.message}. Заказ не удалён на сервере.`;
        setSyncError(message);
        void appAlert({ title: "Удаление не выполнено", message, tone: "danger" });
        try {
          const data = await api.bootstrap();
          skipNextOrdersSyncRef.current = true;
          setOrders(Array.isArray(data.orders) ? data.orders : orders);
        } catch {
          skipNextOrdersSyncRef.current = true;
          setOrders(orders);
        }
      }
    })();
  };

  const updateOrder = (id, patch) => {
    const patchKeys = Object.keys(patch || {}).filter((key) => key !== "updatedAt");
    const isStatusOnly = patchKeys.length === 1 && patchKeys[0] === "status";
    if (isStatusOnly && (role === "manager" || role === "admin")) {
      const previous = orders.find((order) => String(order.id) === String(id));
      const optimisticUpdatedAt = new Date().toISOString();
      if (previous) {
        skipNextOrdersSyncRef.current = true;
        setOrders((current) =>
          current.map((order) =>
            String(order.id) === String(id)
              ? { ...order, status: patch.status, updatedAt: optimisticUpdatedAt }
              : order
          )
        );
      }
      void (async () => {
        try {
          const result = await api.patchOrderStatus(id, patch.status);
          skipNextOrdersSyncRef.current = true;
          setOrders((current) =>
            current.map((order) =>
              String(order.id) === String(id)
                ? result.order || { ...order, status: patch.status }
                : order
            )
          );
          setSyncError("");
        } catch (error) {
          if (previous) {
            skipNextOrdersSyncRef.current = true;
            setOrders((current) =>
              current.map((order) =>
                String(order.id) === String(id) ? previous : order
              )
            );
          }
          setSyncError(error.message);
          void appAlert({ title: "Ошибка обновления", message: error.message, tone: "danger" });
        }
      })();
      return;
    }

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;

        let history = Array.isArray(order.history) ? order.history : [];

        if (patch.status && patch.status !== order.status) {
          history = appendOrderHistory(
            order,
            makeOrderHistoryEvent(
              "status.changed",
              `Статус изменён: ${order.status || "—"} → ${patch.status}`,
              role === "manager" || role === "admin" ? "Менеджер" : profile.contactName || "Клиент"
            )
          );
        }

        return {
          ...order,
          ...patch,
          history,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const bulkUpdateOrders = (ids, patch) => {
    const selected = new Set(ids || []);
    const patchKeys = Object.keys(patch || {}).filter((key) => key !== "updatedAt");
    const isStatusOnly = patchKeys.length === 1 && patchKeys[0] === "status";

    if (isStatusOnly && (role === "manager" || role === "admin")) {
      void (async () => {
        try {
          const result = await api.bulkPatchOrderStatus([...selected], patch.status);
          const byId = new Map(
            (result.updated || []).map((order) => [String(order.id), order])
          );
          skipNextOrdersSyncRef.current = true;
          setOrders((current) =>
            current.map((order) => byId.get(String(order.id)) || order)
          );
          setSyncError("");
          const updatedCount = (result.updated || []).length;
          const unchanged = (result.skipped || []).filter(
            (item) => item.code === "ORDER_STATUS_UNCHANGED"
          );
          const blocked = (result.skipped || []).filter(
            (item) => item.code !== "ORDER_STATUS_UNCHANGED"
          );
          const failed = result.errors || [];
          if (!blocked.length && !failed.length) {
            if (!updatedCount && unchanged.length) {
              void appAlert({
                title: "Без изменений",
                message: `Все выбранные заказы уже в статусе «${patch.status}».`,
              });
            }
            return;
          }
          const details = [
            ...blocked.map((item) => `${item.orderId}: ${item.error || item.code}`),
            ...failed.map((item) => `${item.orderId}: ${item.error || item.code}`),
          ];
          void appAlert({
            title: "Статус обновлён частично",
            message: [
              `Обновлено: ${updatedCount}.`,
              unchanged.length ? `Уже в этом статусе: ${unchanged.length}.` : "",
              `Нельзя сменить: ${details.length}.`,
            ]
              .filter(Boolean)
              .join(" "),
            tone: "warn",
            expandable: details.length
              ? { summary: `Подробности (${details.length})`, lines: details }
              : null,
          });
        } catch (error) {
          setSyncError(error.message);
          void appAlert({ title: "Ошибка обновления", message: error.message, tone: "danger" });
        }
      })();
      return;
    }

    setOrders((current) =>
      current.map((order) => {
        if (!selected.has(order.id)) return order;

        let history = Array.isArray(order.history) ? order.history : [];

        if (patch.status && patch.status !== order.status) {
          history = appendOrderHistory(
            order,
            makeOrderHistoryEvent(
              "status.bulk",
              `Статус массово изменён: ${order.status || "—"} → ${patch.status}`,
              "Менеджер"
            )
          );
        }

        return {
          ...order,
          ...patch,
          history,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const deleteManagerOrder = async (order) => {
    if (!settings.managerCanDeleteOrders) {
      await appAlert({
        title: "Корзина отключена",
        message: "Удаление заказов менеджером сейчас отключено в настройках.",
        tone: "warn",
      });
      return;
    }

    const gate = canTrashOrder(order, "manager");
    if (!gate.ok) {
      await appAlert({ title: "Нельзя переместить", message: gate.error, tone: "warn" });
      return;
    }

    const ok = await appConfirm({
      title: `Вы уверены, что хотите перенести Заказ № ${order.number} в корзину?`,
      message: "Клиент перестанет его видеть. Восстановить можно из корзины.",
      confirmLabel: "В корзину",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;

    const orderId = String(order.id);
    skipNextOrdersSyncRef.current = true;
    setOrders((current) => current.filter((item) => String(item.id) !== orderId));

    void (async () => {
      try {
        const result = await api.trashOrder(orderId);
        skipNextOrdersSyncRef.current = true;
        if (Array.isArray(result?.orders)) setOrders(result.orders);
        if (Array.isArray(result?.trashedOrders)) setTrashedOrders(result.trashedOrders);
        setSyncError("");
      } catch (error) {
        const message = `${error.message}. Заказ не перемещён в корзину.`;
        setSyncError(message);
        void appAlert({ title: "Корзина", message, tone: "danger" });
        try {
          await loadBootstrap({ silent: true });
        } catch {
          /* ignore */
        }
      }
    })();
  };

  const restoreManagerOrder = async (order) => {
    const ok = await appConfirm({
      title: `Восстановить заказ № ${order.number}?`,
      message: "Заказ снова появится в списке активных и станет виден клиенту.",
      confirmLabel: "Восстановить",
      cancelLabel: "Отмена",
    });
    if (!ok) return;
    try {
      const result = await api.restoreOrder(order.id);
      skipNextOrdersSyncRef.current = true;
      if (Array.isArray(result?.orders)) setOrders(result.orders);
      if (Array.isArray(result?.trashedOrders)) setTrashedOrders(result.trashedOrders);
      setSyncError("");
    } catch (error) {
      await appAlert({ title: "Не удалось восстановить", message: error.message, tone: "danger" });
    }
  };

  const purgeManagerOrder = async (order) => {
    const ok = await appConfirm({
      title: `Удалить заказ № ${order.number} навсегда?`,
      message: "Восстановить будет нельзя без резервной копии. Это действие необратимо.",
      confirmLabel: "Удалить навсегда",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const result = await api.purgeOrder(order.id);
      skipNextOrdersSyncRef.current = true;
      if (Array.isArray(result?.orders)) setOrders(result.orders);
      if (Array.isArray(result?.trashedOrders)) setTrashedOrders(result.trashedOrders);
      setSyncError("");
    } catch (error) {
      await appAlert({ title: "Не удалось удалить", message: error.message, tone: "danger" });
    }
  };

  const createProductFromCustom = async (order, customItem) => {
    const ok = await appConfirm({
      title: "Создать товар в каталоге?",
      message: `Товар «${customItem.name}» будет добавлен в каталог Clover.`,
      confirmLabel: "Создать",
      cancelLabel: "Отмена",
    });
    if (!ok) return;

    const id =
      Math.max(
        0,
        ...products.map((item) => Number(item.id) || 0)
      ) + 1;

    const unitMap = {
      "шт.": "piece",
      "уп.": "pack",
      "пач.": "bundle",
    };

    const saleUnit = unitMap[customItem.unit] || "piece";

    const newProduct = normalizeProduct({
      id,
      category: inferProductCategory(customItem.name, products),
      name: customItem.name,
      code: `CL-${String(id).padStart(4, "0")}`,
      oneCId: "",
      active: true,
      pieceSize: 1,
      packSize: 1,
      bundleSize: 1,
      boxSize: 1,
      pairSize: 1,
      rollSize: 1,
      pricePiece: saleUnit === "piece" ? Number(customItem.unitPrice) || 0 : 0,
      pricePack: saleUnit === "pack" ? Number(customItem.unitPrice) || 0 : 0,
      priceBundle: saleUnit === "bundle" ? Number(customItem.unitPrice) || 0 : 0,
      priceBox: saleUnit === "box" ? Number(customItem.unitPrice) || 0 : 0,
      pricePair: saleUnit === "pair" ? Number(customItem.unitPrice) || 0 : 0,
      priceRoll: saleUnit === "roll" ? Number(customItem.unitPrice) || 0 : 0,
      saleUnits: [saleUnit],
    });

    setProducts((current) => [newProduct, ...current]);

    updateOrder(order.id, {
      customItems: (order.customItems || []).map((item) =>
        item.id === customItem.id
          ? {
              ...item,
              requestStatus: "Добавлен в каталог",
              matchedProductId: id,
            }
          : item
      ),
    });
  };

  const importBackup = (backup) => {
    if (Array.isArray(backup.products)) {
      setProducts(backup.products.map(normalizeProduct));
    }

    if (Array.isArray(backup.orders)) {
      setOrders(backup.orders);
    }

    if (backup.profile) {
      setProfile({
        ...EMPTY_PROFILE,
        ...backup.profile,
      });
    }

    if (Array.isArray(backup.addresses)) {
      setAddresses(backup.addresses);
    }

    if (backup.settings) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...backup.settings,
      });
    }

    if (backup.clientLinks) {
      setClientLinks(backup.clientLinks);
    }
  };

  const clearOrders = async () => {
    const ok = await appConfirm({
      title: "Удалить все заказы?",
      message: "Все заказы будут удалены. Это действие нельзя отменить из этого окна.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (ok) {
      setOrders([]);
    }
  };

  const resetAll = async () => {
    const ok = await appConfirm({
      title: "Сбросить серверные данные?",
      message: "Сбросить серверные данные Clover? Аккаунт менеджера сохранится.",
      confirmLabel: "Сбросить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) {
      return;
    }

    try {
      await api.resetAll();
      await loadBootstrap();
      await appAlert({
        title: "Готово",
        message: "Серверные данные сброшены.",
        tone: "success",
      });
    } catch (error) {
      await appAlert({ title: "Ошибка сброса", message: error.message, tone: "danger" });
    }
  };

  if (loading) {
    return (
      <>
        <style>{APP_STYLES}</style>
        <main className="loading-page loading-page-quiet clover-app" aria-busy="true" aria-label="Загрузка">
          <div className="loading-quiet-bar" aria-hidden="true" />
          {getApiToken() ? <ListSkeleton rows={5} variant="orders" /> : null}
        </main>
      </>
    );
  }

  let content;

  if (!isLoggedIn) {
    content = (
      <LoginView
        onAuth={handleAuth}
        authBusy={authBusy}
        authError={authError}
      />
    );
  } else if (authUser?.role === "manager" || authUser?.role === "admin") {
    content = (
      <ManagerScreen
        authUser={authUser}
        orders={orders}
        trashedOrders={trashedOrders}
        products={products}
        setProducts={setProducts}
        profile={profile}
        addresses={addresses}
        serverClients={serverClients}
        reconciliationRequests={reconciliationRequests}
        managerNotifications={managerNotifications}
        settings={settings}
        setSettings={setSettings}
        clientLinks={clientLinks}
        setClientLinks={setClientLinks}
        dirtyClientLinkIdsRef={dirtyClientLinkIdsRef}
        oneCPriceTypes={oneCPriceTypes}
        managerNotice={managerNotice}
        onDismissNotice={dismissManagerNotice}
        onReadNotification={readManagerNotification}
        onReadAllNotifications={readAllManagerNotifications}
        onUpdateOrder={updateOrder}
        onBulkUpdateOrders={bulkUpdateOrders}
        onDeleteOrder={deleteManagerOrder}
        onRestoreOrder={restoreManagerOrder}
        onPurgeOrder={purgeManagerOrder}
        onCreateProductFromCustom={createProductFromCustom}
        onImport={importBackup}
        onClearOrders={clearOrders}
        onResetAll={resetAll}
        onReload={() => loadBootstrap({ silent: true })}
        onApplyManagerNotifications={applyManagerNotificationList}
        onLogout={logout}
      />
    );
  } else {
    const canCreateOrder =
      !(settings.requireProfile && !profileComplete) &&
      !(settings.requireAddress && !addresses.length);

    content = (
      <ClientScreen
        profile={profile}
        setProfile={setProfile}
        addresses={addresses}
        setAddresses={setAddresses}
        orders={clientOrders}
        settings={settings}
        catalogPolicy={catalogPolicy}
        matrixProductCount={products.length}
        fullCatalogCount={fullCatalogProducts.length}
        reconciliationRequests={reconciliationRequests}
        onReload={() => loadBootstrap({ silent: true })}
        onNew={openNew}
        onEdit={openEdit}
        onRepeat={openRepeat}
        onDelete={deleteClientOrder}
        onLogout={logout}
        catalogSession={catalogSession}
        products={catalogProducts}
        favorites={favorites}
        setFavorites={setFavorites}
        showFullCatalog={showFullCatalog}
        setShowFullCatalog={setShowFullCatalog}
        onSaveOrder={saveOrder}
        onCloseCatalog={() => setCatalogSession(null)}
        canCreateOrder={canCreateOrder}
        profileComplete={profileComplete}
      />
    );
  }

  // Один компактный баннер сверху: offline > syncError > update (без стопки снизу).
  const systemBanner = isOffline && !offlineBannerHidden
    ? {
        tone: "warn",
        title: "Нет связи",
        message: "Можно смотреть уже загруженные данные.",
        actionLabel: null,
        onAction: null,
        onDismiss: () => setOfflineBannerHidden(true),
      }
    : !isOffline && syncError
      ? {
          tone: "danger",
          title: "Проблема связи",
          message: syncError,
          actionLabel: "Повторить",
          onAction: () => loadBootstrap(),
          onDismiss: () => setSyncError(""),
        }
      : !isOffline && updateAvailable
        ? {
            tone: "info",
            title: "Доступна новая версия",
            message: "Обновите страницу, чтобы получить изменения.",
            actionLabel: "Обновить",
            onAction: () => window.location.reload(),
            onDismiss: null,
          }
        : null;

  return (
    <>
      <style>{APP_STYLES}</style>
      {content}
      {systemBanner && (
        <div className="ux-banner-stack" aria-live="polite">
          <SoftBanner
            compact
            tone={systemBanner.tone}
            title={systemBanner.title}
            message={systemBanner.message}
            actionLabel={systemBanner.actionLabel}
            onAction={systemBanner.onAction || undefined}
            onDismiss={systemBanner.onDismiss || undefined}
          />
        </div>
      )}
    </>
  );
}

export default App;
