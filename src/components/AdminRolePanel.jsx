import { useEffect, useMemo, useState } from "react";
import { api } from "../serverApi";
import { appAlert, appConfirm } from "../shared/AppModal";
import { STAFF_FEATURE_OPTIONS, STAFF_FEATURE_IDS, formatDateTime } from "../shared/appHelpers";
import { useLocalization } from "../shared/i18n/LocalizationProvider";

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
  const { t } = useLocalization();

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
        setError(t("shared.theSessionExpiredSignOutAnd"));
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
        title: t("shared.notCopied"),
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
      setNotice(t("admin.staff.roleUpdated", { role }));
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
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
      const message = t("shared.enterTheManagerEmail");
      setError(message);
      await appAlert({ title: t("shared.notCreated"), message, tone: "danger" });
      return;
    }
    if (nextPassword.length < 6) {
      const message = t("shared.passwordMustBeAtLeast6");
      setError(message);
      await appAlert({ title: t("shared.notCreated"), message, tone: "danger" });
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      await api.createManager(nextEmail, nextPassword, contact);
      setNotice(t("admin.staff.managerCreated", { email: nextEmail }));
      setFormKey((value) => value + 1);
      await load();
    } catch (err) {
      const message = err.message || "Не удалось создать менеджера.";
      setError(message);
      await appAlert({ title: t("shared.notCreated"), message, tone: "danger" });
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
      setNotice(t("shared.managerContactsSaved"));
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const toggleAccess = async (user) => {
    const disable = !user.disabled;
    const ok = await appConfirm({
      title: disable ? t("shared.closeAccess2") : t("shared.openAccess2"),
      message: disable
        ? t("admin.staff.accessClosedNamed", { email: user.email })
        : t("admin.staff.accessOpenedNamed", { email: user.email }),
      confirmLabel: disable ? t("shared.closeAccess") : t("shared.action.open"),
      tone: disable ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffAccess(user.id, disable);
      setNotice(result.message || (disable ? t("shared.accessIsClosed") : t("shared.accessIsOpen")));
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const savePassword = async (user) => {
    if (draftPassword.length < 6) {
      const message = t("shared.passwordMustBeAtLeast6");
      setError(message);
      await appAlert({ title: t("auth.login.password"), message, tone: "danger" });
      return;
    }
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.setStaffPassword(user.id, draftPassword);
      setDraftPassword("");
      setRevealed((current) => ({ ...current, [user.id]: true }));
      await load();
      setNotice(result.message || t("shared.passwordUpdated"));
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
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
      setNotice(result.message || t("shared.permissionsUpdated"));
      await load();
      await appAlert({ title: t("shared.permissionsSaved"), message: result.message || t("shared.status.donePeriod"), tone: "success" });
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const removeManager = async (user) => {
    const ok = await appConfirm({
      title: t("shared.deleteTheManager"),
      message: t("admin.staff.deleteForeverNamed", { email: user.email }),
      confirmLabel: t("shared.action.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const result = await api.deleteStaffUser(user.id);
      if (String(expandedId) === String(user.id)) setExpandedId("");
      setNotice(result.message || t("shared.managerDeleted"));
      await load();
    } catch (err) {
      setError(err.message);
      await appAlert({ title: t("shared.status.error"), message: err.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("admin.accessManagers")}</p>
          <h3>{t("admin.managerAdministration")}</h3>
          <p>{
            t("admin.createAccountsRevokeAccessChangePasswords")
          }</p>
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
          <h3>{t("shared.createManager")}</h3>
          <p className="muted small">{t("admin.passwordMustBeAtLeast6")}</p>
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
            <label className="field">{
              t("auth.login.password")
              }<input
                type="text"
                name="managerPassword"
                autoComplete="new-password"
                required
                minLength={6}
                defaultValue=""
                placeholder={t("shared.atLeast6Characters")}
              />
            </label>
            <label className="field">{
              t("admin.fullName")
              }<input
                type="text"
                name="managerFullName"
                autoComplete="off"
                defaultValue=""
                placeholder="Иван Иванов"
              />
            </label>
            <label className="field">{
              t("auth.register.phone")
              }<input
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
                placeholder={t("shared.usernameOrLink")}
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
            >{
              t("manager.generatePassword")
            }</button>
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? t("shared.creating") : t("shared.createManager")}
            </button>
          </div>
        </form>
      )}

      {!canManageStaff && (
        <p className="muted" style={{ marginTop: 12 }}>{
          t("admin.youDoNotHaveRightsTo")
        }</p>
      )}

      <p className="muted small" style={{ marginTop: 18 }}>
        {t("admin.staff.adminsNowCount", { count: adminCount })}
        {canManageStaff ? t("admin.staff.passwordJournalCount", { count: savedPasswordCount }) : null}
      </p>

      <div className="exchange-actions" style={{ marginTop: 10 }}>
        <button className="secondary-button" type="button" onClick={() => void load()}>{
          t("admin.refreshList")
        }</button>
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
                      {user.role === "admin" ? t("shared.role.admin") : t("shared.role.manager")}
                    </span>
                    {isSelf ? <span className="staff-meta-chip">{t("admin.you")}</span> : null}
                    {user.disabled ? <span className="staff-meta-chip is-warn">{t("admin.accessClosed")}</span> : null}
                    {canManageStaff ? (
                      <span className={user.hasPassword ? "badge green" : "badge yellow"}>
                        {user.hasPassword ? t("shared.passwordSaved") : t("shared.noPassword")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="staff-card-actions">
                  {canManageRoles && (
                    <div className="staff-role-seg" role="group" aria-label={t("shared.field.role")}>
                      <button
                        className={user.role === "manager" ? "is-active" : ""}
                        type="button"
                        aria-pressed={user.role === "manager"}
                        disabled={busyId === user.id || user.role === "manager"}
                        onClick={() => changeRole(user.id, "manager")}
                      >{
                        t("shared.role.manager")
                      }</button>
                      <button
                        className={user.role === "admin" ? "is-active" : ""}
                        type="button"
                        aria-pressed={user.role === "admin"}
                        disabled={busyId === user.id || user.role === "admin"}
                        onClick={() => changeRole(user.id, "admin")}
                      >{
                        t("shared.role.admin")
                      }</button>
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
                      {isExpanded ? t("shared.action.collapse") : t("shared.management")}
                    </button>
                  )}
                </div>
              </div>

              {canManageStaff ? (
                <div className="access-vault-fields" style={{ marginTop: 12 }}>
                  <div className="access-vault-field">
                    <span>{t("auth.login.email")}</span>
                    <code>{user.login || user.email || "—"}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!user.login && !user.email}
                      onClick={() => void handleCopy(loginKey, user.login || user.email)}
                    >
                      {copiedKey === loginKey ? t("shared.action.copied") : t("shared.action.copy")}
                    </button>
                  </div>
                  <div className="access-vault-field">
                    <span>{t("auth.login.password")}</span>
                    <code>
                      {user.hasPassword
                        ? showPassword
                          ? user.password
                          : "••••••••••"
                        : t("shared.notSaved")}
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
                            {showPassword ? t("shared.action.hide") : t("shared.action.show")}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void handleCopy(passKey, user.password)}
                          >
                            {copiedKey === passKey ? t("shared.action.copied") : t("shared.action.copy")}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setExpandedId(String(user.id))}
                          >{
                            t("manager.change")
                          }</button>
                        </>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setExpandedId(String(user.id))}
                        >{
                          t("manager.setPassword")
                        }</button>
                      )}
                    </div>
                  </div>
                  {user.passwordUpdatedAt ? (
                    <small className="muted">
                      {user.passwordUpdatedBy
                        ? t("admin.staff.passwordUpdatedAtBy", {
                            stamp: formatDateTime(user.passwordUpdatedAt),
                            who: user.passwordUpdatedBy,
                          })
                        : t("admin.staff.passwordUpdatedAt", {
                            stamp: formatDateTime(user.passwordUpdatedAt),
                          })}
                    </small>
                  ) : (
                    <small className="muted">{
                      t("admin.passwordsFromBeforeThisLogCannot")
                    }</small>
                  )}
                </div>
              ) : null}

              {isExpanded && canManageStaff && (
                <div className="staff-edit-panel">
                  <div className="staff-edit-section">
                    <div className="staff-edit-section-title">{t("admin.contactsForClients")}</div>
                    <p className="muted small" style={{ marginTop: 0 }}>{
                      t("admin.theseDetailsFillTheContactManager")
                    }</p>
                    {draftContacts ? (
                      <div className="form-grid">
                        <label className="field">{
                          t("admin.fullName")
                          }<input
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
                        <label className="field">{
                          t("auth.register.phone")
                          }<input
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
                      >{
                        t("admin.saveContacts")
                      }</button>
                    </div>
                  </div>

                  {!isSelf ? (
                    <div className="staff-edit-section">
                      <div className="staff-edit-section-title">{t("admin.accountAccess")}</div>
                      <div className="staff-edit-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => void toggleAccess(user)}
                        >
                          {user.disabled ? t("shared.openAccess") : t("shared.closeAccess")}
                        </button>
                        <button
                          className="secondary-button staff-edit-danger"
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => void removeManager(user)}
                        >{
                          t("shared.action.delete")
                        }</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="staff-edit-section">
                    <div className="staff-edit-section-title">
                      {isSelf ? t("shared.yourPassword") : t("auth.login.password")}
                    </div>
                    {isSelf ? (
                      <p className="muted small">{
                        t("admin.setOrChangeTheAdministratorPassword")
                      }</p>
                    ) : null}
                    <div className="staff-edit-password">
                      <label className="field">
                        {user.hasPassword ? t("auth.reset.title") : t("auth.login.password")}
                        <input
                          type="text"
                          autoComplete="new-password"
                          minLength={6}
                          value={draftPassword}
                          onChange={(event) => setDraftPassword(event.target.value)}
                          placeholder={t("shared.atLeast6Characters")}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => setDraftPassword(generateAccessPassword())}
                      >{
                        t("manager.generate")
                      }</button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === user.id || draftPassword.length < 6}
                        onClick={() => void savePassword(user)}
                      >
                        {user.hasPassword ? t("shared.changePassword2") : t("auth.reset.submit")}
                      </button>
                    </div>
                  </div>

                  {!isSelf && draftPermissions ? (
                    <div className="staff-edit-section staff-feature-block">
                      <div className="staff-feature-head">
                        <div>
                          <div className="staff-edit-section-title">{t("client.cabinetSections")}</div>
                          {user.role !== "admin" ? (
                            <p className="muted small">{
                              t("admin.chooseWhatTheManagerSeesIn")
                            }</p>
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
                        <p className="muted small staff-feature-admin-note">{
                          t("admin.theAdministratorHasFullAccessTo")
                        }</p>
                      ) : (
                        <>
                          <div
                            className="staff-feature-list"
                            role="group"
                            aria-label={t("shared.allowedSections")}
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
                                <strong>{t("admin.allSections")}</strong>
                                <em>{t("admin.fullCabinetAccess")}</em>
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
                                    <span>{t(label)}</span>
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
                            >{
                              t("admin.savePermissions")
                            }</button>
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
