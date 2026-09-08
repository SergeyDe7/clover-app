import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";
const TRANSLATION_WORKSPACE_VIEWS = [
  ["interface", "Интерфейс"],
  ["categories", "Категории и подкатегории"],
  ["seo", "SEO / FAQ / страницы"],
  ["glossary", "Словарь номенклатуры"],
  ["untranslated", "Непереведённое"],
];

const LANGUAGE_LABELS = {
  ru: "Русский",
  en: "Английский",
  uz: "Узбекский",
  ky: "Киргизский",
  tg: "Таджикский",
  zh: "Китайский (упрощённый)",
  ar: "Арабский",
};

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];

function stateLabel(state) {
  if (state === "MANUAL") return "MANUAL";
  if (state === "AUTO") return "AUTO";
  if (state === "STALE") return "устарело";
  if (state === "FALLBACK_RU") return "FALLBACK_RU";
  return "MISSING";
}

export function ManagerLanguages() {
  const [settings, setSettings] = useState(null);
  const [completeness, setCompleteness] = useState({});
  const [locales, setLocales] = useState([]);
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("interface");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("en");
  const [untranslatedOnly, setUntranslatedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const safeLanguage = TARGET_LOCALES.includes(language) ? language : "en";

  const load = useCallback(async () => {
    try {
      const payload = await api.getLocalizationSettings();
      setSettings(payload.settings || null);
      setCompleteness(payload.completeness || {});
      setLocales(Array.isArray(payload.locales) ? payload.locales : []);
      const workspace = await api.getLocalizationTranslations({
        view,
        query,
        language: safeLanguage,
        untranslatedOnly,
      });
      setRows(Array.isArray(workspace.rows) ? workspace.rows : []);
      setMessage("");
    } catch (error) {
      setSettings({ enabledLanguages: ["ru"], catalogVersion: 0 });
      setCompleteness({});
      setRows([]);
      setMessage(error.message || "Не удалось загрузить переводы.");
    }
  }, [view, query, safeLanguage, untranslatedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const enabled = new Set(settings?.enabledLanguages || ["ru"]);

  const toggleLanguage = async (code, nextEnabled) => {
    if (code === "ru") return;
    const next = nextEnabled
      ? [...enabled, code]
      : [...enabled].filter((item) => item !== code);
    setBusy(true);
    try {
      const result = await api.saveLocalizationSettings({
        enabledLanguages: ["ru", ...next.filter((item) => item !== "ru")],
      });
      setSettings(result.settings || result);
      setCompleteness(result.completeness || completeness);
      if (Array.isArray(result.rejected) && result.rejected.includes(code)) {
        await appAlert({
          title: "Язык нельзя включить",
          message: "Критичные переводы для этого языка ещё не готовы.",
          tone: "warn",
        });
      }
    } catch (error) {
      await appAlert({
        title: "Не удалось сохранить языки",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const localeCards = useMemo(() => {
    const list = locales.length
      ? locales
      : ["ru", ...TARGET_LOCALES].map((publicCode) => ({
          publicCode,
          alwaysEnabled: publicCode === "ru",
        }));
    return list;
  }, [locales]);

  return (
    <section className="manager-languages" aria-labelledby="manager-languages-title">
      <header>
        <h2 id="manager-languages-title">Языки и переводы</h2>
        <p>Публично можно включить только готовый язык. Русский всегда включён.</p>
      </header>

      <div className="form-grid" style={{ marginBottom: 18 }}>
        {localeCards.map((locale) => {
          const code = locale.publicCode;
          const locked = code === "ru" || locale.alwaysEnabled;
          const on = locked || enabled.has(code);
          const report = completeness[code] || {};
          return (
            <article className="setting-card" key={code}>
              <div>
                <h3>{LANGUAGE_LABELS[code] || code}</h3>
                <p>
                  {locked
                    ? "Источник и запасной язык. Отключить нельзя."
                    : report.complete
                      ? "Критичные переводы готовы."
                      : "Не готов: не хватает критичных переводов."}
                </p>
              </div>
              <button
                className={on ? "toggle active" : "toggle"}
                type="button"
                disabled={busy || locked}
                aria-label={LANGUAGE_LABELS[code] || code}
                aria-disabled={locked ? "true" : undefined}
                onClick={() => toggleLanguage(code, !on)}
              >
                <span />
              </button>
            </article>
          );
        })}
      </div>

      <nav className="manager-more-nav" aria-label="Разделы переводов">
        {TRANSLATION_WORKSPACE_VIEWS.map(([id, title]) => (
          <button
            key={id}
            className={view === id ? "category-button active" : "category-button"}
            type="button"
            onClick={() => setView(id)}
          >
            {title}
          </button>
        ))}
      </nav>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <label className="field">
          Поиск
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={load}
            placeholder="Русский текст или ключ"
          />
        </label>
        <label className="field">
          Язык
          <select value={safeLanguage} onChange={(event) => setLanguage(event.target.value)}>
            {TARGET_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input
            type="checkbox"
            checked={untranslatedOnly}
            onChange={(event) => setUntranslatedOnly(event.target.checked)}
          />
          только непереведённые
        </label>
      </div>

      {message ? <p>{message}</p> : null}

      {rows.length === 0 ? (
        <p>Переводов пока нет. Русский интерфейс продолжает работать.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Русский</th>
                <th>{LANGUAGE_LABELS[safeLanguage]}</th>
                <th>Статус</th>
                <th>Редактор</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cell = row.languages?.[safeLanguage] || {};
                return (
                  <tr key={row.id || row.fieldKey}>
                    <td>{row.sourceRu || "—"}</td>
                    <td>{cell.value || "—"}</td>
                    <td>{stateLabel(cell.state)}</td>
                    <td>{cell.updatedBy || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
