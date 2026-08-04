// Журнал доступов клиентов: логины и пароли для выдачи менеджером (раздел «Ещё» → «Доступы»).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { formatDateTime } from "../../shared/appHelpers";

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

export function ManagerAccessVault() {
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
    if (password.length < 8) {
      await appAlert({
        title: "Короткий пароль",
        message: "Пароль должен быть не короче 8 символов.",
        tone: "warn",
      });
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.setClientPassword(item.clientId, password);
      await load();
      setRevealed((current) => ({ ...current, [item.clientId]: true }));
      cancelPasswordEditor();
      await appAlert({
        title: "Пароль сохранён",
        message: `Логин: ${result.login || item.login || item.email}\nПароль: ${password}\n\nЗапись появилась в журнале доступов.`,
        tone: "success",
      });
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
    <section className="access-vault-page" aria-labelledby="access-vault-title">
      <header className="access-vault-head">
        <div>
          <p className="eyebrow">Ещё</p>
          <h2 id="access-vault-title">Доступы клиентов</h2>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Логины и пароли ЛК. Пишутся в журнал при создании клиента и при смене пароля.
            Старые пароли до появления журнала восстановить нельзя — задайте новый.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          {loading ? "Обновляем…" : "Обновить"}
        </button>
      </header>

      <div className="access-vault-toolbar">
        <input
          type="search"
          className="access-vault-search"
          placeholder="Поиск по компании, логину, телефону"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Поиск доступов"
        />
        <div className="access-vault-stats">
          <span>{savedCount} с паролем</span>
          <span>{items.length} клиентов</span>
        </div>
      </div>

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
                        minLength={8}
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
                  {item.hasPassword ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleRemove(item)}
                    >
                      Убрать из журнала
                    </button>
                  ) : null}
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
    </section>
  );
}
