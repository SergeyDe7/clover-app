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

  const handleRemove = async (item) => {
    const ok = await appConfirm({
      title: "Убрать из журнала доступов?",
      message: `Пароль для «${item.companyName}» исчезнет из журнала. Аккаунт клиента не удалится.`,
      confirmLabel: "Убрать",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const result = await api.removeClientAccessVaultEntry(item.clientId);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (removeError) {
      await appAlert({
        title: "Ошибка",
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
      title: "Удалить клиента?",
      message: `Удалить «${item.companyName}» (${item.login || item.email || "без логина"})?\n\nБудут удалены аккаунт, матрица, журнал доступов и связанные заказы. Это необратимо.`,
      confirmLabel: "Удалить клиента",
      cancelLabel: "Отмена",
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
        title: "Клиент удалён",
        message: result.message || "Аккаунт клиента удалён.",
        tone: "success",
      });
    } catch (deleteError) {
      await appAlert({
        title: "Не удалось удалить",
        message: deleteError.message || "Ошибка удаления клиента.",
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
        title: "Короткий пароль",
        message: "Пароль должен быть не короче 6 символов.",
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
        message: saveError.message || "Ошибка сохранения пароля.",
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
          placeholder="Поиск по компании, логину, телефону"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Поиск доступов клиентов"
        />
        <div className="access-vault-stats">
          <span>{savedCount} с паролем</span>
          <span>{items.length} клиентов</span>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          {loading ? "Обновляем…" : "Обновить"}
        </button>
      </div>

      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Логины и пароли ЛК. Пишутся в журнал при создании клиента и при смене пароля.
        Старые пароли до появления журнала восстановить нельзя — задайте новый.
      </p>

      {error ? <div className="sync-error">{error}</div> : null}
      {loading && !items.length ? (
        <div className="access-vault-empty">Загружаем доступы…</div>
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
                        "Контакт не указан"}
                    </span>
                  </div>
                  <span className={item.hasPassword ? "badge green" : "badge yellow"}>
                    {item.hasPassword ? "Пароль сохранён" : "Нет пароля"}
                  </span>
                </div>

                <div className="access-vault-fields">
                  <div className="access-vault-field">
                    <span>Логин</span>
                    <code>{item.login || "—"}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!item.login}
                      onClick={() => handleCopy(loginKey, item.login)}
                    >
                      {copiedKey === loginKey ? "Скопировано" : "Копировать"}
                    </button>
                  </div>
                  <div className="access-vault-field">
                    <span>Пароль</span>
                    <code>
                      {item.hasPassword
                        ? showPassword
                          ? item.password
                          : "••••••••••"
                        : "не сохранён"}
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
                            {showPassword ? "Скрыть" : "Показать"}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleCopy(passKey, item.password)}
                          >
                            {copiedKey === passKey ? "Скопировано" : "Копировать"}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => openPasswordEditor(item)}
                          >
                            Сменить
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openPasswordEditor(item)}
                        >
                          Задать пароль
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {editing ? (
                  <div className="access-vault-password-editor">
                    <label className="field">
                      Новый пароль
                      <input
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
                      >
                        Сгенерировать
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={passwordBusy}
                        onClick={cancelPasswordEditor}
                      >
                        Отмена
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={passwordBusy}
                        onClick={() => savePassword(item)}
                      >
                        {passwordBusy ? "Сохраняем…" : "Сохранить пароль"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <footer className="access-vault-card-foot">
                  <small>
                    {item.updatedAt
                      ? `Обновлён ${formatDateTime(item.updatedAt)}`
                      : "Задайте пароль здесь или в карточке клиента"}
                    {item.updatedBy ? ` · ${item.updatedBy}` : ""}
                  </small>
                  <div className="access-vault-field-actions">
                    {item.hasPassword ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleRemove(item)}
                      >
                        Убрать из журнала
                      </button>
                    ) : null}
                    <button
                      className="secondary-button staff-edit-danger"
                      type="button"
                      onClick={() => handleDeleteClient(item)}
                    >
                      Удалить клиента
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="access-vault-empty">
          {search
            ? "Ничего не найдено по запросу."
            : "Пока нет клиентов. Создайте доступ в разделе «Клиенты»."}
        </div>
      )}
    </div>
  );
}

export function ManagerAccessVault({ authUser }) {
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
          <p className="eyebrow">Ещё</p>
          <h2 id="access-vault-title">Доступы</h2>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Клиенты — логины ЛК. Менеджеры — логины, пароли и права (только администратор).
          </p>
        </div>
      </header>

      <nav className="manager-more-nav" aria-label="Тип доступов" style={{ marginBottom: 16 }}>
        <button
          className={scope === "clients" ? "category-button active" : "category-button"}
          type="button"
          onClick={() => setScope("clients")}
        >
          Клиенты
        </button>
        {isAdmin ? (
          <button
            className={scope === "managers" ? "category-button active" : "category-button"}
            type="button"
            onClick={() => setScope("managers")}
          >
            Менеджеры
          </button>
        ) : null}
      </nav>

      {scope === "clients" ? <ClientAccessPanel /> : null}
      {scope === "managers" && isAdmin ? (
        <AdminRolePanel currentUser={authUser} />
      ) : null}
    </section>
  );
}
