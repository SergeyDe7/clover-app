// Журнал доступов клиентов: логины и пароли для выдачи менеджером.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { formatDateTime } from "../../shared/appHelpers";

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

export function ManagerAccessVault({ open, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState({});
  const [copiedKey, setCopiedKey] = useState("");

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
    if (!open) return undefined;
    load();
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    if (!needle) return items;
    return items.filter((item) =>
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

  if (!open) return null;

  return (
    <div className="access-vault-overlay" role="presentation" onClick={onClose}>
      <section
        className="access-vault-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-vault-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="access-vault-head">
          <div>
            <p className="eyebrow">Менеджер</p>
            <h2 id="access-vault-title">Доступы клиентов</h2>
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              Логины и пароли ЛК. Сохраняются при создании доступа и смене пароля.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
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
        {loading ? (
          <div className="access-vault-empty">Загружаем доступы…</div>
        ) : filtered.length ? (
          <div className="access-vault-list">
            {filtered.map((item) => {
              const showPassword = Boolean(revealed[item.clientId]);
              const loginKey = `${item.clientId}:login`;
              const passKey = `${item.clientId}:password`;
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
                    <span
                      className={
                        item.hasPassword ? "badge green" : "badge yellow"
                      }
                    >
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
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <footer className="access-vault-card-foot">
                    <small>
                      {item.updatedAt
                        ? `Обновлён ${formatDateTime(item.updatedAt)}`
                        : "Пароль появится после выдачи в карточке клиента"}
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
    </div>
  );
}
