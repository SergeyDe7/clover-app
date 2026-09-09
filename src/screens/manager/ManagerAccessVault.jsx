import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел «Ещё» → «Доступы»: клиенты (все staff) и менеджеры (только admin).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { formatDateTime } from "../../shared/appHelpers";
import { AdminRolePanel } from "../../components/AdminRolePanel";

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

function ClientAccessPanel() {
  const { t } = useLocalization();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState({});
  const [copiedKey, setCopiedKey] = useState("");
  const [passwordClientId, setPasswordClientId] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getClientAccessVault();
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить доступы.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    const list = [...items].sort((a, b) => {
      if (a.hasPassword !== b.hasPassword) return a.hasPassword ? -1 : 1;
      return String(a.companyName || "").localeCompare(String(b.companyName || ""), "ru", {
        sensitivity: "base",
      });
    });
    if (!needle) return list;
    return list.filter((item) =>
      [item.companyName, item.contactName, item.login, item.email, item.phone]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(needle)
    );
  }, [items, search]);

  const savedCount = items.filter((item) => item.hasPassword).length;

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

  const handleRemove = async (item) => {
    const ok = await appConfirm({
      title: t("manager.removeFromTheAccessLog"),
      message: t("manager.access.removePasswordNamed", { name: item.companyName }),
      confirmLabel: t("shared.action.remove"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      const result = await api.removeClientAccessVaultEntry(item.clientId);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (removeError) {
      await appAlert({
        title: t("shared.status.error"),
        message: removeError.message,
        tone: "danger",
      });
    }
  };

  const handleDeleteClient = async (item) => {
    const registered = item.isRegistered !== false;
    if (!registered) {
      await handleRemove(item);
      return;
    }
    const ok = await appConfirm({
      title: t("manager.deleteTheClient"),
      message: t("manager.access.deleteNamedWithLogin", {
        name: item.companyName,
        login: item.login || item.email || t("manager.access.noLogin"),
      }),
      confirmLabel: t("manager.deleteClient"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      const result = await api.deleteClient(item.clientId);
      setItems(
        Array.isArray(result.items)
          ? result.items
          : (await api.getClientAccessVault()).items || []
      );
      await appAlert({
        title: t("manager.clientDeleted"),
        message: result.message || t("manager.theClientAccountHasBeenDeleted"),
        tone: "success",
      });
    } catch (deleteError) {
      await appAlert({
        title: "Не удалось удалить",
        message: deleteError.message || t("manager.failedToDeleteTheClient"),
        tone: "danger",
      });
    }
  };

  const openPasswordEditor = (item) => {
    setPasswordClientId(item.clientId);
    setPasswordDraft(generateAccessPassword());
  };

  const cancelPasswordEditor = () => {
    setPasswordClientId("");
    setPasswordDraft("");
  };

  const savePassword = async (item) => {
    const password = passwordDraft.trim();
    if (password.length < 6) {
      await appAlert({
        title: t("manager.passwordTooShort"),
        message: t("shared.passwordMustBeAtLeast6"),
        tone: "warn",
      });
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.setClientPassword(item.clientId, password);
      void result;
      await load();
      setRevealed((current) => ({ ...current, [item.clientId]: true }));
      cancelPasswordEditor();
    } catch (saveError) {
      await appAlert({
        title: "Не удалось сохранить",
        message: saveError.message || t("manager.passwordSaveError"),
        tone: "danger",
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="access-vault-scope">
      <div className="access-vault-toolbar">
        <input
          type="search"
          className="access-vault-search"
          placeholder={t("manager.searchByCompanyLoginOrPhone")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t("manager.searchClientAccess")}
        />
        <div className="access-vault-stats">
          <span>{t("manager.access.withPasswordCount", { count: savedCount })}</span>
          <span>{t("manager.access.clientsCount", { count: items.length })}</span>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          {loading ? t("manager.updating") : t("shared.action.refresh")}
        </button>
      </div>

      <p className="muted small" style={{ margin: "0 0 12px" }}>{
        t("manager.cabinetLoginsAndPasswordsWrittenTo")
      }</p>

      {error ? <div className="sync-error">{error}</div> : null}
      {loading && !items.length ? (
        <div className="access-vault-empty">{t("manager.loadingAccessRecords")}</div>
      ) : filtered.length ? (
        <div className="access-vault-list">
          {filtered.map((item) => {
            const showPassword = Boolean(revealed[item.clientId]);
            const loginKey = `${item.clientId}:login`;
            const passKey = `${item.clientId}:password`;
            const editing = String(passwordClientId) === String(item.clientId);
            return (
              <article className="access-vault-card" key={item.clientId}>
                <div className="access-vault-card-top">
                  <div className="access-vault-identity">
                    <strong>{item.companyName}</strong>
                    <span>
                      {[item.contactName, item.phone].filter(Boolean).join(" · ") ||
                        t("manager.noContactGiven")}
                    </span>
                  </div>
                  <span className={item.hasPassword ? "badge green" : "badge yellow"}>
                    {item.hasPassword ? t("shared.passwordSaved") : t("shared.noPassword")}
                  </span>
                </div>

                <div className="access-vault-fields">
                  <div className="access-vault-field">
                    <span>{t("auth.login.email")}</span>
                    <code>{item.login || "—"}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!item.login}
                      onClick={() => handleCopy(loginKey, item.login)}
                    >
                      {copiedKey === loginKey ? t("shared.action.copied") : t("shared.action.copy")}
                    </button>
                  </div>
                  <div className="access-vault-field">
                    <span>{t("auth.login.password")}</span>
                    <code>
                      {item.hasPassword
                        ? showPassword
                          ? item.password
                          : "••••••••••"
                        : t("shared.notSaved")}
                    </code>
                    <div className="access-vault-field-actions">
                      {item.hasPassword ? (
                        <>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setRevealed((current) => ({
                                ...current,
                                [item.clientId]: !current[item.clientId],
                              }))
                            }
                          >
                            {showPassword ? t("shared.action.hide") : t("shared.action.show")}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleCopy(passKey, item.password)}
                          >
                            {copiedKey === passKey ? t("shared.action.copied") : t("shared.action.copy")}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => openPasswordEditor(item)}
                          >{
                            t("manager.change")
                          }</button>
                        </>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openPasswordEditor(item)}
                        >{
                          t("manager.setPassword")
                        }</button>
                      )}
                    </div>
                  </div>
                </div>

                {editing ? (
                  <div className="access-vault-password-editor">
                    <label className="field">{
                      t("auth.reset.title")
                      }<input
                        type="text"
                        autoComplete="off"
                        minLength={6}
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        disabled={passwordBusy}
                      />
                    </label>
                    <div className="access-vault-field-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={passwordBusy}
                        onClick={() => setPasswordDraft(generateAccessPassword())}
                      >{
                        t("manager.generate")
                      }</button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={passwordBusy}
                        onClick={cancelPasswordEditor}
                      >{
                        t("shared.modal.cancel")
                      }</button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={passwordBusy}
                        onClick={() => savePassword(item)}
                      >
                        {passwordBusy ? t("shared.status.saving") : t("auth.reset.submit")}
                      </button>
                    </div>
                  </div>
                ) : null}

                <footer className="access-vault-card-foot">
                  <small>
                    {item.updatedAt
                      ? t("manager.access.updatedAt", { datetime: formatDateTime(item.updatedAt) })
                      : t("manager.setAPasswordHereOrIn")}
                    {item.updatedBy ? ` · ${item.updatedBy}` : ""}
                  </small>
                  <div className="access-vault-field-actions">
                    {item.hasPassword ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleRemove(item)}
                      >{
                        t("manager.removeFromTheLog")
                      }</button>
                    ) : null}
                    <button
                      className="secondary-button staff-edit-danger"
                      type="button"
                      onClick={() => handleDeleteClient(item)}
                    >{
                      t("manager.deleteClient")
                    }</button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="access-vault-empty">
          {search
            ? t("manager.nothingFoundForThisQuery")
            : t("manager.thereAreNoClientsYetCreate")}
        </div>
      )}
    </div>
  );
}

export function ManagerAccessVault({ authUser }) {
  const { t } = useLocalization();
  const isAdmin = authUser?.role === "admin";
  const [scope, setScope] = useState("clients");

  useEffect(() => {
    if (!isAdmin && scope === "managers") {
      setScope("clients");
    }
  }, [isAdmin, scope]);

  return (
    <section className="access-vault-page" aria-labelledby="access-vault-title">
      <header className="access-vault-head">
        <div>
          <p className="eyebrow">{t("manager.nav.more")}</p>
          <h2 id="access-vault-title">{t("manager.nav.access")}</h2>
          <p className="muted small" style={{ margin: "6px 0 0" }}>{
            t("manager.clientsCabinetLoginsManagersLoginsPasswords")
          }</p>
        </div>
      </header>

      <nav className="manager-more-nav" aria-label={t("manager.accessType")} style={{ marginBottom: 16 }}>
        <button
          className={scope === "clients" ? "category-button active" : "category-button"}
          type="button"
          onClick={() => setScope("clients")}
        >{
          t("manager.nav.clients")
        }</button>
        {isAdmin ? (
          <button
            className={scope === "managers" ? "category-button active" : "category-button"}
            type="button"
            onClick={() => setScope("managers")}
          >{
            t("manager.managers")
          }</button>
        ) : null}
      </nav>

      {scope === "clients" ? <ClientAccessPanel /> : null}
      {scope === "managers" && isAdmin ? (
        <AdminRolePanel currentUser={authUser} />
      ) : null}
    </section>
  );
}
