import { useEffect, useMemo, useState } from "react";
import { api } from "../serverApi";
import { appAlert, appConfirm } from "../shared/AppModal";
import { STAFF_FEATURE_OPTIONS, STAFF_FEATURE_IDS } from "../shared/appHelpers";

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
      return;
    }
    setDraftPermissions(permissionsFromUser(expandedUser));
    setDraftPassword("");
  }, [expandedUser]);

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
      await api.createManager(nextEmail, nextPassword);
      const okMessage = `Менеджер ${nextEmail} создан. Можно сразу войти по этому email и паролю.`;
      setNotice(okMessage);
      setFormKey((value) => value + 1);
      await load();
      await appAlert({ title: "Менеджер создан", message: okMessage, tone: "success" });
    } catch (err) {
      const message = err.message || "Не удалось создать менеджера.";
      setError(message);
      await appAlert({ title: "Не создан", message, tone: "danger" });
    } finally {
      setCreating(false);
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
    const ok = await appConfirm({
      title: "Сменить пароль?",
      message: `Новый пароль для ${user.email}. Старые сессии будут завершены.`,
      confirmLabel: "Сменить пароль",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffPassword(user.id, draftPassword);
      setDraftPassword("");
      setNotice(result.message || "Пароль обновлён.");
      await appAlert({ title: "Пароль обновлён", message: result.message || "Готово.", tone: "success" });
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
          <p className="muted small">Пароль не короче 6 символов. После создания можно сразу войти.</p>
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
                type="password"
                name="managerPassword"
                autoComplete="new-password"
                required
                minLength={6}
                defaultValue=""
                placeholder="минимум 6 символов"
              />
            </label>
          </div>
          <div className="form-actions">
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

      <p className="muted small" style={{ marginTop: 18 }}>Администраторов сейчас: {adminCount}</p>

      <div className="exchange-actions" style={{ marginTop: 10 }}>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Обновить список
        </button>
      </div>

      <div className="stack" style={{ marginTop: 12, gap: 12 }}>
        {staff.map((user) => {
          const isSelf = String(user.id) === String(currentUser?.id);
          const isExpanded = String(expandedId) === String(user.id);
          return (
            <div key={user.id} className="manager-contact-settings staff-user-card" style={{ marginTop: 0 }}>
              <div className="staff-card-top">
                <div className="staff-card-identity">
                  <strong>{user.email}</strong>
                  <div className="staff-card-meta">
                    <span
                      className={
                        user.role === "admin" ? "staff-role-badge is-admin" : "staff-role-badge is-manager"
                      }
                    >
                      {user.role === "admin" ? "Админ" : "Менеджер"}
                    </span>
                    {isSelf ? <span className="staff-meta-chip">вы</span> : null}
                    {user.disabled ? <span className="staff-meta-chip is-warn">доступ закрыт</span> : null}
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
                  {canManageStaff && !isSelf && (
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

              {isExpanded && canManageStaff && !isSelf && draftPermissions && (
                <div className="staff-edit-panel">
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

                  <div className="staff-edit-section">
                    <div className="staff-edit-section-title">Пароль</div>
                    <div className="staff-edit-password">
                      <label className="field">
                        Новый пароль
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={6}
                          value={draftPassword}
                          onChange={(event) => setDraftPassword(event.target.value)}
                          placeholder="минимум 6 символов"
                        />
                      </label>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === user.id || draftPassword.length < 6}
                        onClick={() => void savePassword(user)}
                      >
                        Сменить пароль
                      </button>
                    </div>
                  </div>

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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
