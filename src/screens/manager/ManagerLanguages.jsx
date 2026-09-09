import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import {
  TRANSLATION_WORKSPACE_VIEWS,
} from "../../shared/i18n/localizationSettings.js";

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];

function formatStamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function ManagerLanguages() {
  const { t } = useLocalization();
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
  const [drafts, setDrafts] = useState({});

  const safeLanguage = TARGET_LOCALES.includes(language) ? language : "en";

  const languageLabels = {
    ru: t("admin.languages.label.ru"),
    en: t("admin.languages.label.en"),
    uz: t("admin.languages.label.uz"),
    ky: t("admin.languages.label.ky"),
    tg: t("admin.languages.label.tg"),
    zh: t("admin.languages.label.zh"),
    ar: t("admin.languages.label.ar"),
  };

  const viewTitles = {
    interface: t("admin.languages.view.interface"),
    categories: t("admin.languages.view.categories"),
    seo: t("admin.languages.view.seo"),
    glossary: t("admin.languages.view.glossary"),
    untranslated: t("admin.languages.view.untranslated"),
  };

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
      const nextRows = Array.isArray(workspace.rows) ? workspace.rows : [];
      setRows(nextRows);
      setDrafts((current) => {
        const next = { ...current };
        for (const row of nextRows) {
          const cell = row.languages?.[safeLanguage] || {};
          if (next[row.id] === undefined) next[row.id] = cell.value || "";
        }
        return next;
      });
      setMessage("");
    } catch (error) {
      setSettings({ enabledLanguages: ["ru"], catalogVersion: 0 });
      setCompleteness({});
      setRows([]);
      setMessage(error.message || t("admin.languages.loadFailed"));
    }
  }, [view, query, safeLanguage, untranslatedOnly, t]);

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
          title: t("admin.languages.enableBlockedTitle"),
          message: t("admin.languages.enableBlocked"),
          tone: "warn",
        });
      }
    } catch (error) {
      await appAlert({
        title: t("admin.languages.saveFailed"),
        message: error.message,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (row) => {
    setBusy(true);
    try {
      await api.saveLocalizationTranslation(row.id, safeLanguage, drafts[row.id] ?? "");
      setMessage(t("admin.languages.saved"));
      await load();
    } catch (error) {
      setMessage(error.message || t("admin.languages.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const resetRow = async (row) => {
    const confirmed = await appConfirm({
      title: t("admin.languages.resetAuto"),
      message: t("admin.languages.resetConfirm"),
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.resetLocalizationTranslation(row.id, safeLanguage);
      setMessage(t("admin.languages.resetDone"));
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (error) {
      setMessage(error.message || t("admin.languages.saveFailed"));
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
        <h2 id="manager-languages-title">{t("manager.nav.languages")}</h2>
        <p>{t("admin.languages.lead")}</p>
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
                <h3>{languageLabels[code] || code}</h3>
                <p>
                  {locked
                    ? t("admin.languages.sourceLocked")
                    : report.complete
                      ? t("admin.languages.ready")
                      : t("admin.languages.notReady")}
                </p>
              </div>
              <button
                className={on ? "toggle active" : "toggle"}
                type="button"
                disabled={busy || locked}
                aria-label={languageLabels[code] || code}
                aria-disabled={locked ? "true" : undefined}
                onClick={() => toggleLanguage(code, !on)}
              >
                <span />
              </button>
            </article>
          );
        })}
      </div>

      <nav className="manager-more-nav" aria-label={t("admin.languages.views")}>
        {TRANSLATION_WORKSPACE_VIEWS.map(([id]) => (
          <button
            key={id}
            className={view === id ? "category-button active" : "category-button"}
            type="button"
            onClick={() => setView(id)}
          >
            {viewTitles[id] || id}
          </button>
        ))}
      </nav>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <label className="field">
          {t("storefront.search.placeholder")}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={load}
            placeholder={t("admin.languages.searchPlaceholder")}
          />
        </label>
        <label className="field">
          {t("admin.languages.language")}
          <select value={safeLanguage} onChange={(event) => setLanguage(event.target.value)}>
            {TARGET_LOCALES.map((code) => (
              <option key={code} value={code}>
                {languageLabels[code]}
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
          {t("admin.languages.untranslatedOnly")}
        </label>
      </div>

      {message ? <p>{message}</p> : null}

      {rows.length === 0 ? (
        <p>{t("admin.languages.empty")}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table manager-languages-table">
            <thead>
              <tr>
                <th>{t("admin.languages.label.ru")}</th>
                <th>{languageLabels[safeLanguage]}</th>
                <th>{t("admin.languages.status")}</th>
                <th>{t("admin.languages.editor")}</th>
                <th>{t("admin.languages.updatedAt")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cell = row.languages?.[safeLanguage] || {};
                return (
                  <tr key={row.id || row.fieldKey}>
                    <td>{row.sourceRu || "—"}</td>
                    <td>
                      <textarea
                        className="manager-languages-target"
                        rows={2}
                        value={drafts[row.id] ?? cell.value ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      {cell.stale ? t("admin.languages.stale") : cell.state || "MISSING"}
                    </td>
                    <td>{cell.updatedBy || "—"}</td>
                    <td>{formatStamp(cell.updatedAt)}</td>
                    <td>
                      <div className="manager-languages-actions">
                        <button type="button" className="primary-button" disabled={busy} onClick={() => saveRow(row)}>
                          {t("admin.languages.save")}
                        </button>
                        <button type="button" className="secondary-button" disabled={busy} onClick={() => resetRow(row)}>
                          {t("admin.languages.resetAuto")}
                        </button>
                      </div>
                    </td>
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
