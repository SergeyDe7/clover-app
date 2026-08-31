import { useEffect, useMemo, useState } from "react";
import { api } from "../serverApi";
import { appAlert, appConfirm } from "../shared/AppModal";
import { STAFF_FEATURE_OPTIONS, STAFF_FEATURE_IDS, formatDateTime } from "../shared/appHelpers";

function generateAccessPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function permissionsFromUser(user) {
  const permissions = user?.permissions || {};
  if (user?.role === "admin" || permissions.fullAccess || !Array.isArray(permissions.tabs)) {
    return {
      fullAccess: true,
      tabs: [...STAFF_FEATURE_IDS],
      manageStaff: permissions.manageStaff !== false,
    };
  }
  return {
    fullAccess: false,
    tabs: permissions.tabs.filter((id) => STAFF_FEATURE_IDS.includes(id)),
    manageStaff: permissions.manageStaff !== false,
  };
}

/**
 * UI: создать менеджера, закрыть доступ, пароль, права, удаление, роли.
 */
export function AdminRolePanel({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [adminCount, setAdminCount] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [expandedId, setExpandedId] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftPermissions, setDraftPermissions] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [copiedKey, setCopiedKey] = useState("");
  const [draftContacts, setDraftContacts] = useState(null);

  const load = async () => {
    setError("");
    try {
      const result = await api.getStaffUsers();
      setStaff(Array.isArray(result.staff) ? result.staff : []);
      setCanManageRoles(Boolean(result.canManageRoles));
      setCanManageStaff(Boolean(result.canManageStaff ?? result.canManageRoles));
      setAdminCount(Number(result.adminCount) || 0);
    } catch (err) {
      setStaff([]);
      setCanManageRoles(false);
      setCanManageStaff(false);
      setAdminCount(0);
      if (err.status === 401) {
        setError("Сессия устарела. Выйдите и войдите снова, затем нажмите «Обновить список».");
      } else {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const expandedUser = useMemo(
    () => staff.find((item) => String(item.id) === String(expandedId)) || null,
    [staff, expandedId]
  );

  useEffect(() => {
    if (!expandedUser) {
      setDraftPermissions(null);
      setDraftPassword("");
      setDraftContacts(null);
      return;
    }
    setDraftPermissions(permissionsFromUser(expandedUser));
    setDraftPassword("");
    setDraftContacts({
      fullName: String(expandedUser.fullName || ""),
      phone: String(expandedUser.phone || ""),
      max: String(expandedUser.max || ""),
      telegram: String(expandedUser.telegram || ""),
    });
  }, [expandedUser]);

  const savedPasswordCount = useMemo(
    () => staff.filter((item) => item.hasPassword).length,
    [staff]
  );

  const handleCopy = async (key, value) => {
    const ok = await copyText(value);
    if (!ok) {
      await appAlert({
        title: "Не скопировано",
        message: "Не удалось скопировать в буфер обмена.",
        tone: "warn",
      });
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? "" : current));
    }, 1600);
  };

  const changeRole = async (userId, role) => {
    setBusyId(userId);
    setError("");
    setNotice("");
    try {
      await api.setUserRole(userId, role);
      setNotice(`Роль обновлена: ${role}`);
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const createManager = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextEmail = String(formData.get("managerEmail") || "").trim();
    const nextPassword = String(formData.get("managerPassword") || "");
    const contact = {
      fullName: String(formData.get("managerFullName") || "").trim(),
      phone: String(formData.get("managerPhone") || "").trim(),
      max: String(formData.get("managerMax") || "").trim(),
      telegram: String(formData.get("managerTelegram") || "").trim(),
    };

    if (!nextEmail) {
      const message = "Укажите email менеджера.";
      setError(message);
      await appAlert({ title: "Не создан", message, tone: "danger" });
      return;
    }
    if (nextPassword.length < 6) {
      const message = "Пароль должен быть не короче 6 символов.";
      setError(message);
      await appAlert({ title: "Не создан", message, tone: "danger" });
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      await api.createManager(nextEmail, nextPassword, contact);
      setNotice(`Менеджер ${nextEmail} создан. Пароль сохранён в журнале.`);
      setFormKey((value) => value + 1);
      await load();
    } catch (err) {
      const message = err.message || "Не удалось создать менеджера.";
      setError(message);
      await appAlert({ title: "Не создан", message, tone: "danger" });
    } finally {
      setCreating(false);
    }
  };

  const saveContacts = async (user) => {
    if (!draftContacts) return;
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      await api.setStaffContacts(user.id, draftContacts);
      setNotice("Контакты менеджера сохранены.");
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const toggleAccess = async (user) => {
    const disable = !user.disabled;
    const ok = await appConfirm({
      title: disable ? "Закрыть доступ?" : "Открыть доступ?",
      message: disable
        ? `${user.email} не сможет войти в кабинет, пока доступ закрыт.`
        : `${user.email} снова сможет войти.`,
      confirmLabel: disable ? "Закрыть доступ" : "Открыть",
      tone: disable ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffAccess(user.id, disable);
      setNotice(result.message || (disable ? "Доступ закрыт." : "Доступ открыт."));
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const savePassword = async (user) => {
    if (draftPassword.length < 6) {
      const message = "Пароль должен быть не короче 6 символов.";
      setError(message);
      await appAlert({ title: "Пароль", message, tone: "danger" });
      return;
    }
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffPassword(user.id, draftPassword);
      setDraftPassword("");
      setRevealed((current) => ({ ...current, [user.id]: true }));
      await load();
      setNotice(result.message || "Пароль обновлён.");
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const savePermissions = async (user) => {
    if (!draftPermissions) return;
    const payload = draftPermissions.fullAccess || user.role === "admin"
      ? { fullAccess: true, manageStaff: draftPermissions.manageStaff !== false }
      : {
          tabs: draftPermissions.tabs.length ? draftPermissions.tabs : [...STAFF_FEATURE_IDS],
          manageStaff: draftPermissions.manageStaff !== false,
        };
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffPermissions(user.id, payload);
      setNotice(result.message || "Права обновлены.");
      await load();
      await appAlert({ title: "Права сохранены", message: result.message || "Готово.", tone: "success" });
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const removeManager = async (user) => {
    const ok = await appConfirm({
      title: "Удалить менеджера?",
      message: `${user.email} будет удалён безвозвратно.`,
      confirmLabel: "Удалить",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.deleteStaffUser(user.id);
      if (String(expandedId) === String(user.id)) setExpandedId("");
      setNotice(result.message || "Менеджер удалён.");
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: "Ошибка", message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Доступы · Менеджеры</p>
          <h3>Управление менеджерами</h3>
          <p>
            Создание, закрытие доступа, смена пароля, права по разделам и удаление.
            Пароли менеджеров сохраняются в этом журнале (как у клиентов).
            Доступно только администратору.
          </p>
        </div>
      </div>

      {error && <div className="sync-error" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <p className="muted" style={{ marginTop: 12 }}>{notice}</p>}

      {canManageStaff && (
        <form
          key={formKey}
          className="manager-contact-settings"
          style={{ marginTop: 14 }}
          onSubmit={createManager}
        >
          <h3>Создать менеджера</h3>
          <p className="muted small">Пароль не короче 6 символов. После создания сохраняется в журнале ниже.</p>
          <div className="form-grid">
            <label className="field">
              Email
              <input
                type="email"
                name="managerEmail"
                autoComplete="off"
                required
                defaultValue=""
                placeholder="manager@example.ru"
              />
            </label>
            <label className="field">
              Пароль
              <input
                type="text"
                name="managerPassword"
                autoComplete="new-password"
                required
                minLength={6}
                defaultValue=""
                placeholder="минимум 6 символов"
              />
            </label>
            <label className="field">
              ФИО
              <input
                type="text"
                name="managerFullName"
                autoComplete="off"
                defaultValue=""
                placeholder="Иван Иванов"
              />
            </label>
            <label className="field">
              Телефон
              <input
                type="tel"
                name="managerPhone"
                autoComplete="off"
                defaultValue=""
                placeholder="+7 …"
              />
            </label>
            <label className="field">
              MAX
              <input
                type="text"
                name="managerMax"
                autoComplete="off"
                defaultValue=""
                placeholder="ник или ссылка"
              />
            </label>
            <label className="field">
              Telegram
              <input
                type="text"
                name="managerTelegram"
                autoComplete="off"
                defaultValue=""
                placeholder="@username"
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={creating}
              onClick={(event) => {
                const form = event.currentTarget.closest("form");
                const input = form?.querySelector('input[name="managerPassword"]');
                if (input) input.value = generateAccessPassword();
              }}
            >
              Сгенерировать пароль
            </button>
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? "Создание…" : "Создать менеджера"}
            </button>
          </div>
        </form>
      )}

      {!canManageStaff && (
        <p className="muted" style={{ marginTop: 12 }}>
          Недостаточно прав для управления менеджерами.
        </p>
      )}

      <p className="muted small" style={{ marginTop: 18 }}>
        Администраторов сейчас: {adminCount}
        {canManageStaff ? ` · ${savedPasswordCount} с паролем в журнале` : null}
      </p>

      <div className="exchange-actions" style={{ marginTop: 10 }}>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Обновить список
        </button>
      </div>

      <div className="stack" style={{ marginTop: 12, gap: 12 }}>
        {staff.map((user) => {
          const isSelf = String(user.id) === String(currentUser?.id);
          const isExpanded = String(expandedId) === String(user.id);
          const showPassword = Boolean(revealed[user.id]);
          const loginKey = `${user.id}:login`;
          const passKey = `${user.id}:password`;
          return (
            <div key={user.id} className="manager-contact-settings staff-user-card" style={{ marginTop: 0 }}>
              <div className="staff-card-top">
                <div className="staff-card-identity">
                  <strong>{user.fullName || user.email}</strong>
                  <div className="staff-card-meta">
                    {user.fullName ? <span className="staff-meta-chip">{user.email}</span> : null}
                    <span
                      className={
                        user.role === "admin" ? "staff-role-badge is-admin" : "staff-role-badge is-manager"
                      }
                    >
                      {user.role === "admin" ? "Админ" : "Менеджер"}
                    </span>
                    {isSelf ? <span className="staff-meta-chip">вы</span> : null}
                    {user.disabled ? <span className="staff-meta-chip is-warn">доступ закрыт</span> : null}
                    {canManageStaff ? (
                      <span className={user.hasPassword ? "badge green" : "badge yellow"}>
                        {user.hasPassword ? "Пароль сохранён" : "Нет пароля"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="staff-card-actions">
                  {canManageRoles && (
                    <div className="staff-role-seg" role="group" aria-label="Роль">
                      <button
                        className={user.role === "manager" ? "is-active" : ""}
                        type="button"
                        aria-pressed={user.role === "manager"}
                        disabled={busyId === user.id || user.role === "manager"}
                        onClick={() => changeRole(user.id, "manager")}
                      >
                        Менеджер
                      </button>
                      <button
                        className={user.role === "admin" ? "is-active" : ""}
                        type="button"
                        aria-pressed={user.role === "admin"}
                        disabled={busyId === user.id || user.role === "admin"}
                        onClick={() => changeRole(user.id, "admin")}
                      >
                        Админ
                      </button>
                    </div>
                  )}
                  {canManageStaff && (
                    <button
                      className={isExpanded ? "staff-manage-btn is-open" : "staff-manage-btn"}
                      type="button"
                      disabled={busyId === user.id}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? "" : user.id)}
                    >
                      {isExpanded ? "Свернуть" : "Управление"}
                    </button>
                  )}
                </div>
              </div>

              {canManageStaff ? (
                <div className="access-vault-fields" style={{ marginTop: 12 }}>
                  <div className="access-vault-field">
                    <span>Логин</span>
                    <code>{user.login || user.email || "—"}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!user.login && !user.email}
                      onClick={() => void handleCopy(loginKey, user.login || user.email)}
                    >
                      {copiedKey === loginKey ? "Скопировано" : "Копировать"}
                    </button>
                  </div>
                  <div className="access-vault-field">
                    <span>Пароль</span>
                    <code>
                      {user.hasPassword
                        ? showPassword
                          ? user.password
                          : "••••••••••"
                        : "не сохранён"}
                    </code>
                    <div className="access-vault-field-actions">
                      {user.hasPassword ? (
                        <>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setRevealed((current) => ({
                                ...current,
                                [user.id]: !current[user.id],
                              }))
                            }
                          >
                            {showPassword ? "Скрыть" : "Показать"}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void handleCopy(passKey, user.password)}
                          >
                            {copiedKey === passKey ? "Скопировано" : "Копировать"}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setExpandedId(String(user.id))}
                          >
                            Сменить
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setExpandedId(String(user.id))}
                        >
                          Задать пароль
                        </button>
                      )}
                    </div>
                  </div>
                  {user.passwordUpdatedAt ? (
                    <small className="muted">
                      Обновлён {formatDateTime(user.passwordUpdatedAt)}
                      {user.passwordUpdatedBy ? ` · ${user.passwordUpdatedBy}` : ""}
                    </small>
                  ) : (
                    <small className="muted">
                      Старые пароли до появления журнала восстановить нельзя — задайте новый.
                    </small>
                  )}
                </div>
              ) : null}

              {isExpanded && canManageStaff && (
                <div className="staff-edit-panel">
                  <div className="staff-edit-section">
                    <div className="staff-edit-section-title">Контакты для клиентов</div>
                    <p className="muted small" style={{ marginTop: 0 }}>
                      Эти данные подставляются в кнопку «Связаться с менеджером»,
                      если менеджер назначен клиенту как личный.
                    </p>
                    {draftContacts ? (
                      <div className="form-grid">
                        <label className="field">
                          ФИО
                          <input
                            type="text"
                            value={draftContacts.fullName}
                            onChange={(event) =>
                              setDraftContacts((current) => ({
                                ...current,
                                fullName: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          Телефон
                          <input
                            type="tel"
                            value={draftContacts.phone}
                            onChange={(event) =>
                              setDraftContacts((current) => ({
                                ...current,
                                phone: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          MAX
                          <input
                            type="text"
                            value={draftContacts.max}
                            onChange={(event) =>
                              setDraftContacts((current) => ({
                                ...current,
                                max: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          Telegram
                          <input
                            type="text"
                            value={draftContacts.telegram}
                            onChange={(event) =>
                              setDraftContacts((current) => ({
                                ...current,
                                telegram: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                    <div className="staff-edit-actions" style={{ marginTop: 10 }}>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === user.id || !draftContacts}
                        onClick={() => void saveContacts(user)}
                      >
                        Сохранить контакты
                      </button>
                    </div>
                  </div>

                  {!isSelf ? (
                    <div className="staff-edit-section">
                      <div className="staff-edit-section-title">Доступ к аккаунту</div>
                      <div className="staff-edit-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => void toggleAccess(user)}
                        >
                          {user.disabled ? "Открыть доступ" : "Закрыть доступ"}
                        </button>
                        <button
                          className="secondary-button staff-edit-danger"
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => void removeManager(user)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="staff-edit-section">
                    <div className="staff-edit-section-title">
                      {isSelf ? "Ваш пароль" : "Пароль"}
                    </div>
                    {isSelf ? (
                      <p className="muted small">
                        Задайте или смените пароль администратора здесь. В «Настройках» смена пароля недоступна.
                      </p>
                    ) : null}
                    <div className="staff-edit-password">
                      <label className="field">
                        {user.hasPassword ? "Новый пароль" : "Пароль"}
                        <input
                          type="text"
                          autoComplete="new-password"
                          minLength={6}
                          value={draftPassword}
                          onChange={(event) => setDraftPassword(event.target.value)}
                          placeholder="минимум 6 символов"
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => setDraftPassword(generateAccessPassword())}
                      >
                        Сгенерировать
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === user.id || draftPassword.length < 6}
                        onClick={() => void savePassword(user)}
                      >
                        {user.hasPassword ? "Сменить пароль" : "Сохранить пароль"}
                      </button>
                    </div>
                  </div>

                  {!isSelf && draftPermissions ? (
                    <div className="staff-edit-section staff-feature-block">
                      <div className="staff-feature-head">
                        <div>
                          <div className="staff-edit-section-title">Разделы кабинета</div>
                          {user.role !== "admin" ? (
                            <p className="muted small">
                              Выберите, что менеджер видит в кабинете.
                            </p>
                          ) : null}
                        </div>
                        {user.role !== "admin" ? (
                          <span className="staff-feature-count">
                            {draftPermissions.fullAccess
                              ? STAFF_FEATURE_IDS.length
                              : draftPermissions.tabs.length}
                            {" / "}
                            {STAFF_FEATURE_IDS.length}
                          </span>
                        ) : null}
                      </div>
                      {user.role === "admin" ? (
                        <p className="muted small staff-feature-admin-note">
                          У администратора полный доступ ко всем разделам.
                        </p>
                      ) : (
                        <>
                          <div
                            className="staff-feature-list"
                            role="group"
                            aria-label="Разрешённые разделы"
                          >
                            <label
                              className={`staff-feature-item is-all${
                                draftPermissions.fullAccess ||
                                draftPermissions.tabs.length === STAFF_FEATURE_IDS.length
                                  ? " is-checked"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  draftPermissions.fullAccess ||
                                  draftPermissions.tabs.length === STAFF_FEATURE_IDS.length
                                }
                                onChange={(event) => {
                                  const fullAccess = event.target.checked;
                                  setDraftPermissions({
                                    fullAccess,
                                    tabs: fullAccess ? [...STAFF_FEATURE_IDS] : [],
                                    manageStaff: false,
                                  });
                                }}
                              />
                              <span>
                                <strong>Все разделы</strong>
                                <em>полный доступ к кабинету</em>
                              </span>
                            </label>
                            <div className="staff-feature-grid">
                              {STAFF_FEATURE_OPTIONS.map(([id, label]) => {
                                const checked =
                                  draftPermissions.fullAccess ||
                                  draftPermissions.tabs.includes(id);
                                return (
                                  <label
                                    key={id}
                                    className={`staff-feature-item${checked ? " is-checked" : ""}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setDraftPermissions((current) => {
                                          const selected = new Set(
                                            current.fullAccess
                                              ? STAFF_FEATURE_IDS
                                              : current.tabs
                                          );
                                          if (selected.has(id)) selected.delete(id);
                                          else selected.add(id);
                                          const tabs = STAFF_FEATURE_IDS.filter((item) =>
                                            selected.has(item)
                                          );
                                          return {
                                            fullAccess:
                                              tabs.length === STAFF_FEATURE_IDS.length,
                                            tabs,
                                            manageStaff: false,
                                          };
                                        });
                                      }}
                                    />
                                    <span>{label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div className="form-actions staff-feature-actions">
                            <button
                              className="primary-button"
                              type="button"
                              disabled={
                                busyId === user.id ||
                                (!draftPermissions.fullAccess &&
                                  draftPermissions.tabs.length === 0)
                              }
                              onClick={() => void savePermissions(user)}
                            >
                              Сохранить права
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
