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
  makeOrderHistoryEvent,
  appendOrderHistory,
} from "./shared/appHelpers";
import { canTrashOrder } from "./shared/orderTrash";

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
          <img className="logo" src={cloverLogo} alt="Логотип Clover" width="230" height="155" />
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
        <img className="logo" src={cloverLogo} alt="Логотип Clover" width="230" height="155" />
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
              <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} value={form.password} onChange={(event) => updateField("password", event.target.value)} required disabled={authBusy} />
            </>
          )}

          {mode === "reset" && (
            <>
              <label htmlFor="confirmPassword">Повторите новый пароль</label>
              <input id="confirmPassword" type="password" autoComplete="new-password" minLength="8" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} required disabled={authBusy} />
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
            <>
              <button type="button" onClick={() => switchMode("register")}>Зарегистрироваться</button>
              <button type="button" onClick={() => switchMode("forgot")}>Забыли пароль?</button>
              <button type="button" disabled={!form.email} onClick={resend}>Повторить письмо</button>
            </>
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

    // Статус/обмен с сервера всегда побеждают.
    if (!sameStatus || !sameExchange) {
      return {
        ...remote,
        managerComment: local.managerComment,
        internalNote: local.internalNote,
        customItems: Array.isArray(local.customItems) ? local.customItems : remote.customItems,
        status: remote.status,
        exchange: remote.exchange,
        updatedAt: remote.updatedAt || local.updatedAt,
      };
    }

    const localTime = Date.parse(local.updatedAt || "") || 0;
    const remoteTime = Date.parse(remote.updatedAt || "") || 0;
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
  const [serverClients, setServerClients] = useState([]);
  const [reconciliationRequests, setReconciliationRequests] = useState([]);
  const [managerNotifications, setManagerNotifications] = useState([]);
  const [catalogSession, setCatalogSession] = useState(null);
  const [managerNotice, setManagerNotice] = useState(null);
  const skipNextOrdersSyncRef = useRef(false);
  const pendingDeletedOrderIdsRef = useRef(new Set());

  const applyManagerNotificationList = (items) => {
    const incomingNotifications = Array.isArray(items) ? items : [];
    const unreadNotifications = incomingNotifications.filter((item) => !item.readAt);
    setManagerNotifications(incomingNotifications);
    setManagerNotice(
      unreadNotifications[0]
        ? { ...unreadNotifications[0], pendingCount: unreadNotifications.length }
        : null
    );
  };

  const applyBootstrap = (data, { openClientOrderLanding = false } = {}) => {
    setAuthUser(data.user);
    setRole(data.user.role);
    setProducts(
      (data.products || DEFAULT_PRODUCTS).map(normalizeProduct)
    );
    setFullCatalogProducts(
      (
        data.fullCatalogProducts ||
        data.products ||
        DEFAULT_PRODUCTS
      ).map(normalizeProduct)
    );
    setCatalogPolicy({
      matrixMode: "pending",
      allowFullCatalog: false,
      matrixReady: false,
      matrixProductIds: [],
      ...(data.catalogPolicy || {}),
    });
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

        if (data.user?.role === "manager" || data.user?.role === "admin") {
          applyManagerNotificationList(data.managerNotifications);
          setTrashedOrders(Array.isArray(data.trashedOrders) ? data.trashedOrders : []);
          if (Array.isArray(data.reconciliationRequests)) {
            setReconciliationRequests(data.reconciliationRequests);
          }
          if (Array.isArray(data.clients)) {
            setServerClients(data.clients);
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
      alert("Сначала заполните профиль организации.");
      return false;
    }

    if (settings.requireAddress && !addresses.length) {
      alert("Сначала добавьте адрес доставки.");
      return false;
    }

    return true;
  };

  const openNew = (options = {}) => {
    const silent = Boolean(options?.silent);
    const forceNew = Boolean(options?.forceNew);

    if (forceNew) {
      if (!validateNewOrder()) return;
      setCatalogSession({ mode: "new" });
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
        setCatalogSession({ mode: "new" });
      }
      return;
    }

    if (validateNewOrder()) {
      setCatalogSession({ mode: "new" });
    }
  };

  const openEdit = (order) => {
    if (order.status !== "Новый") {
      return alert("Редактировать можно только новый заказ.");
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
      alert("Данные с сервера ещё не загружены. Обновите страницу и повторите заказ.");
      return;
    }

    const session = catalogSession || { mode: "new" };
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
        },
        ...orders,
      ];
    }

    setOrders(nextOrders);
    setCatalogSession(null);

    api
      .saveOrders(nextOrders)
      .then((result) => {
        if (Array.isArray(result?.orders)) {
          skipNextOrdersSyncRef.current = true;
          setOrders(result.orders);
        }
        setSyncError("");
      })
      .catch((error) => {
        const message = `${error.message}. Заказ виден у вас, но сервер его не сохранил — менеджер его не увидит.`;
        setSyncError(message);
        alert(message);
      });
  };

  const deleteClientOrder = (order) => {
    if (!settings.allowClientDelete) {
      return alert("Удаление заказов сейчас отключено.");
    }
    const gate = canTrashOrder(order, "client");
    if (!gate.ok) {
      return alert(gate.error);
    }

    if (
      !window.confirm(
        `Удалить заказ № ${order.number}?\n\nЗаказ исчезнет из вашего списка. Восстановить его сможет менеджер из корзины.`
      )
    ) {
      return;
    }

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
        alert(message);
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
          setSyncError(error.message);
          window.alert(error.message);
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
          if ((result.skipped || []).length || (result.errors || []).length) {
            const details = [
              ...(result.skipped || []).map(
                (item) => `${item.orderId}: ${item.error || item.code}`
              ),
              ...(result.errors || []).map(
                (item) => `${item.orderId}: ${item.error || item.code}`
              ),
            ];
            window.alert(
              `Обновлено: ${(result.updated || []).length}.\nНе изменено:\n${details.join("\n")}`
            );
          }
        } catch (error) {
          setSyncError(error.message);
          window.alert(error.message);
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

  const deleteManagerOrder = (order) => {
    if (!settings.managerCanDeleteOrders) {
      return alert("Удаление заказов менеджером сейчас отключено в настройках.");
    }

    const gate = canTrashOrder(order, "manager");
    if (!gate.ok) {
      return alert(gate.error);
    }

    if (
      !window.confirm(
        `Переместить заказ № ${order.number} в корзину?\n\nКлиент перестанет его видеть. Восстановить можно из корзины.`
      )
    ) {
      return;
    }

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
        alert(message);
        try {
          await loadBootstrap({ silent: true });
        } catch {
          /* ignore */
        }
      }
    })();
  };

  const restoreManagerOrder = (order) => {
    if (
      !window.confirm(`Восстановить заказ № ${order.number} из корзины?`)
    ) {
      return;
    }
    void (async () => {
      try {
        const result = await api.restoreOrder(order.id);
        skipNextOrdersSyncRef.current = true;
        if (Array.isArray(result?.orders)) setOrders(result.orders);
        if (Array.isArray(result?.trashedOrders)) setTrashedOrders(result.trashedOrders);
        setSyncError("");
      } catch (error) {
        alert(error.message);
      }
    })();
  };

  const purgeManagerOrder = (order) => {
    if (
      !window.confirm(
        `Удалить заказ № ${order.number} навсегда?\n\nВосстановить будет нельзя без резервной копии.`
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Подтвердите окончательное удаление заказа № ${order.number}.`
      )
    ) {
      return;
    }
    void (async () => {
      try {
        const result = await api.purgeOrder(order.id);
        skipNextOrdersSyncRef.current = true;
        if (Array.isArray(result?.orders)) setOrders(result.orders);
        if (Array.isArray(result?.trashedOrders)) setTrashedOrders(result.trashedOrders);
        setSyncError("");
      } catch (error) {
        alert(error.message);
      }
    })();
  };

  const createProductFromCustom = (order, customItem) => {
    if (
      !window.confirm(
        `Создать в каталоге товар «${customItem.name}»?`
      )
    ) {
      return;
    }

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
      category: "Новые товары",
      name: customItem.name,
      code: `CL-${String(id).padStart(4, "0")}`,
      oneCId: "",
      active: true,
      pieceSize: 1,
      packSize: 1,
      bundleSize: 1,
      pricePiece:
        saleUnit === "piece"
          ? Number(customItem.unitPrice) || 0
          : 0,
      pricePack:
        saleUnit === "pack"
          ? Number(customItem.unitPrice) || 0
          : 0,
      priceBundle:
        saleUnit === "bundle"
          ? Number(customItem.unitPrice) || 0
          : 0,
      saleUnits: [saleUnit],
    });

    setProducts((current) => [...current, newProduct]);

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

  const clearOrders = () => {
    if (window.confirm("Удалить все заказы?")) {
      setOrders([]);
    }
  };

  const resetAll = async () => {
    if (
      !window.confirm(
        "Сбросить серверные данные Clover? Аккаунт менеджера сохранится."
      )
    ) {
      return;
    }

    try {
      await api.resetAll();
      await loadBootstrap();
      alert("Серверные данные сброшены.");
    } catch (error) {
      alert(error.message);
    }
  };

  if (loading) {
    return (
      <>
        <style>{APP_STYLES}</style>
        <main className="loading-page">
          <section className="loading-card">
            <img
              className="loading-logo"
              src={cloverLogo}
              alt="Логотип Clover"
              width="190"
              height="128"
            />
            <h2>Подключаемся к серверу</h2>
            <p>
              Загружаем аккаунт, товары, адреса и заказы.
            </p>
          </section>
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
        matrixProducts={products}
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

  return (
    <>
      <style>{APP_STYLES}</style>
      {content}
      {syncError && (
        <div className="server-banner">{syncError}</div>
      )}
    </>
  );
}

export default App;
